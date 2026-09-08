/**
 * Canonical Run-3 metadata-selection composition — the single production
 * path that turns "PM has authorized run <run-id>" into a durable
 * `METADATA_SELECTION_RESOLVED` controller state.
 *
 * AUDIT-ONLY UTILITY. Not part of the Atra runtime.
 *
 * COMPOSITION ONLY. This module implements no protocol rule of its own: it
 * owns argument-independent sequencing and a content-free output
 * projection, and delegates every decision that carries experiment
 * authority to the already-reviewed merged components:
 *
 *   - pinned protocol contract      -> `protocolConstants.mjs`
 *   - PM authorization / state machine -> `Run3AcquisitionController`
 *   - durable state persistence     -> `ControllerStateStore`
 *   - full mailbox enumeration      -> `enumerateGmailMetadata`
 *   - eligibility / scoring / sort / sample / canary / commitment
 *                                   -> `selection.mjs` (via the controller)
 *   - fixed V1 observation window   -> `V1_WINDOW_START_MS/END_MS`
 *
 * Nothing here re-derives a count, a hash, a window bound, a sort order or a
 * commitment. `runId` is the ONLY caller-supplied value that reaches the
 * controller; every other config/authorization field is imported from the
 * pinned constants, so no caller — CLI, test, or otherwise — can move Run-3
 * off its ratified contract by passing an argument.
 *
 * STOPS BEFORE T0. This module never calls `recordT0`, `runCanary`,
 * `acquireNext`, or the Gmail RAW transport, and never imports them. Gmail
 * access is METADATA-ONLY: `{message_id, internalDate}`, never RAW bytes.
 *
 * @module p1-2-run3-controller/selectOperator
 */

import fs from 'node:fs';
import path from 'node:path';

import { ControllerError, Run3AcquisitionController, STATES } from './controller.mjs';
import { enumerateGmailMetadata, MetadataEnumeratorError } from './metadataEnumerator.mjs';
import {
  ACQUISITION_DURATION_HOURS,
  EXPECTED_GITHUB_REUSE,
  EXPECTED_GMAIL_NEW,
  EXPECTED_TOTAL,
  PLAN_AUTHORITY_SHA256,
} from './protocolConstants.mjs';
import { SelectionError, V1_WINDOW_END_MS, V1_WINDOW_START_MS } from './selection.mjs';
import { ControllerStateStore } from './stateStore.mjs';

/** Status token for a selection this invocation resolved. */
export const STATUS_RESOLVED = 'P1_2_RUN3_METADATA_SELECTION_RESOLVED';
/** Status token for a selection an EARLIER invocation already resolved (no re-enumeration). */
export const STATUS_ALREADY_RESOLVED = 'P1_2_RUN3_METADATA_SELECTION_ALREADY_RESOLVED';

/**
 * Bounded, non-secret run identifier. Deliberately narrow: no path
 * separators (so a run-id can never influence a filesystem location), no
 * whitespace, no control characters, no unbounded length. Run-id is a label
 * only — protocol authority is NEVER derived from it.
 */
export const RUN_ID_PATTERN = /^[A-Za-z0-9._-]{1,64}$/;

/** Required mode of the canonical private state root: owner-only rwx, nothing else. */
const REQUIRED_STATE_ROOT_MODE = 0o700;

export class SelectOperatorError extends Error {
  constructor(code) {
    super(code);
    this.name = 'SelectOperatorError';
    this.code = code;
  }
}

/**
 * @param {unknown} runId
 * @returns {string}
 */
export function validateRunId(runId) {
  if (typeof runId !== 'string' || !RUN_ID_PATTERN.test(runId)) {
    throw new SelectOperatorError('run_id_invalid');
  }
  return runId;
}

/**
 * The canonical private state root must ALREADY exist as a real directory
 * with mode exactly 0700. This gate never creates, chmods, or repairs it —
 * provisioning is a separately-authorized bootstrap step that has already
 * been performed.
 *
 * Deliberately stricter than the read-only `run3-preflight` gate
 * (`preflight.mjs` `checkPrivateStateRootValid`, which only requires no
 * group/other access): this command MUTATES durable Run-3 state, so it
 * additionally
 *   - requires the exact ratified 0700 mode rather than any owner-bit set, and
 *   - uses `lstat`, refusing a symlink even when its target would qualify,
 *     because a symlinked root could silently redirect the single Run-3
 *     state authority somewhere else.
 * Strictness only ever adds FAILs relative to preflight, never PASSes, so
 * `run3-preflight` semantics are untouched.
 *
 * `ControllerStateStore.save()` would happily `mkdir -p` this tree on first
 * write; production state must never be provisioned that way, which is
 * exactly why this runs first.
 *
 * @param {string} statePath
 */
export function assertPrivateStateRoot(statePath) {
  const dir = path.dirname(statePath);
  let stat;
  try {
    stat = fs.lstatSync(dir);
  } catch {
    throw new SelectOperatorError('state_root_absent');
  }
  if (stat.isSymbolicLink()) throw new SelectOperatorError('state_root_not_directory');
  if (!stat.isDirectory()) throw new SelectOperatorError('state_root_not_directory');
  if ((stat.mode & 0o7777) !== REQUIRED_STATE_ROOT_MODE) throw new SelectOperatorError('state_root_not_private');
}

/**
 * The controller `config` for this run, built ENTIRELY from pinned
 * constants except `runId`.
 *
 * @param {string} runId
 */
export function buildPinnedConfig(runId) {
  return Object.freeze({
    runId,
    planSha256: PLAN_AUTHORITY_SHA256,
    expectedGithubReuse: EXPECTED_GITHUB_REUSE,
    expectedGmailNew: EXPECTED_GMAIL_NEW,
    expectedTotal: EXPECTED_TOTAL,
    acquisitionDurationHours: ACQUISITION_DURATION_HOURS,
  });
}

/**
 * The durable PM-authorization record, built ENTIRELY from pinned constants
 * except `run_id`. No caller-supplied JSON authorization record is ever
 * accepted anywhere on this path.
 *
 * @param {string} runId
 */
export function buildPinnedAuthorizationRecord(runId) {
  return Object.freeze({
    run_id: runId,
    plan_sha256: PLAN_AUTHORITY_SHA256,
    expected_github_reuse: EXPECTED_GITHUB_REUSE,
    expected_gmail_new: EXPECTED_GMAIL_NEW,
    expected_total: EXPECTED_TOTAL,
    acquisition_duration_hours: ACQUISITION_DURATION_HOURS,
  });
}

const AUTH_RECORD_KEYS = Object.freeze([
  'run_id',
  'plan_sha256',
  'expected_github_reuse',
  'expected_gmail_new',
  'expected_total',
  'acquisition_duration_hours',
]);

/** Exact match, both directions — an extra persisted field is a mismatch, not a pass. */
function authRecordEquals(persisted, expected) {
  if (!persisted || typeof persisted !== 'object') return false;
  if (Object.keys(persisted).length !== AUTH_RECORD_KEYS.length) return false;
  return AUTH_RECORD_KEYS.every((key) => persisted[key] === expected[key]);
}

/** Entry decisions this command supports. Everything else fails closed. */
const ENTRY = Object.freeze({
  FRESH: 'FRESH',
  RESUME_PM_AUTHORIZED: 'RESUME_PM_AUTHORIZED',
  ALREADY_RESOLVED: 'ALREADY_RESOLVED',
});

/**
 * Classifies persisted state BEFORE a `Run3AcquisitionController` is ever
 * constructed.
 *
 * This ordering is load-bearing, not stylistic. `Run3AcquisitionController`
 * fails closed on restore by transitioning to VOID *and persisting it* when
 * the restored PM authorization does not match the config. VOID is terminal.
 * If this command constructed a controller first and asked questions later,
 * a single mistyped `--run-id` against a live authorized run would
 * permanently VOID that run — an unrecoverable, irreversible outcome caused
 * by a typo. Classifying from a plain `stateStore.load()` first means a
 * wrong run-id is rejected as a stable error with the run left exactly as it
 * was.
 *
 * @param {unknown} persisted
 * @param {{run_id: string}} expectedAuthRecord
 * @returns {{entry: string, persisted: object|null}}
 */
export function classifyPersistedState(persisted, expectedAuthRecord) {
  if (persisted === null || persisted === undefined) return { entry: ENTRY.FRESH, persisted: null };
  if (typeof persisted !== 'object' || typeof persisted.state !== 'string') {
    throw new SelectOperatorError('state_unrecognized');
  }

  // A durable in-flight acquisition marker means a content-bearing
  // acquisition's outcome is unprovable. The controller would VOID on
  // restore; refuse before that becomes a persisted fact.
  if (persisted.acquisitionInFlight !== null && persisted.acquisitionInFlight !== undefined) {
    throw new SelectOperatorError('state_not_resumable');
  }

  if (persisted.state === STATES.PRE_T0) {
    // PRE_T0 is only a legitimate starting point while genuinely
    // unauthorized. A PRE_T0 record carrying an authorization is a shape the
    // controller never writes.
    if (persisted.pmAuthorization !== null && persisted.pmAuthorization !== undefined) {
      throw new SelectOperatorError('state_unrecognized');
    }
    return { entry: ENTRY.FRESH, persisted };
  }

  if (persisted.state === STATES.PM_AUTHORIZED || persisted.state === STATES.METADATA_SELECTION_RESOLVED) {
    if (!authRecordEquals(persisted.pmAuthorization, expectedAuthRecord)) {
      throw new SelectOperatorError('state_authorization_mismatch');
    }
    if (persisted.state === STATES.PM_AUTHORIZED) {
      // Resume is safe here and only here: no selection was ever committed,
      // T0 has not started, and re-running enumeration cannot invalidate
      // anything that already exists.
      if (persisted.selection !== null && persisted.selection !== undefined) {
        throw new SelectOperatorError('state_unrecognized');
      }
      return { entry: ENTRY.RESUME_PM_AUTHORIZED, persisted };
    }
    const selection = persisted.selection;
    if (
      !selection ||
      typeof selection.ruleId !== 'string' ||
      typeof selection.commitment !== 'string' ||
      !Number.isInteger(selection.eligibleCount) ||
      !Array.isArray(selection.selected) ||
      !Array.isArray(selection.remaining) ||
      !selection.canary
    ) {
      throw new SelectOperatorError('state_unrecognized');
    }
    return { entry: ENTRY.ALREADY_RESOLVED, persisted };
  }

  // T0_RECORDED / CANARY_* / GMAIL_ACQUIRING / ACQUISITION_COMPLETE /
  // VALIDATION_PENDING / VOID / anything unknown. No reset, no deletion, no
  // reselection, no overwrite.
  throw new SelectOperatorError('state_not_resumable');
}

/**
 * The ONLY thing this command prints on success. Built field-by-field from
 * counts and the commitment digest — `controller.getState()` is never
 * serialized, because its `selection` carries private Gmail message
 * identities (selected set, canary, remaining set) that must never leave the
 * private state file.
 *
 * @param {string} status
 * @param {{state: string, selection: object}} snapshot
 */
export function contentFreeProjection(status, snapshot) {
  const selection = snapshot.selection;
  return Object.freeze({
    status,
    state: snapshot.state,
    rule_id: selection.ruleId,
    eligible_count: selection.eligibleCount,
    selected_count: selection.selected.length,
    canary_count: selection.canary ? 1 : 0,
    remaining_count: selection.remaining.length,
    selection_commitment: selection.commitment,
  });
}

/**
 * Maps any throwable from this path to a stable, content-free error code.
 * Only codes minted by the four known audit error types are passed through;
 * anything else (including Node `fs`/`fetch` errors, which can carry paths
 * or hostnames) collapses to `internal_error`.
 *
 * @param {unknown} error
 * @returns {string}
 */
export function toStableErrorCode(error) {
  const known =
    error instanceof SelectOperatorError ||
    error instanceof ControllerError ||
    error instanceof SelectionError ||
    error instanceof MetadataEnumeratorError;
  if (known && typeof error.code === 'string' && error.code.length > 0) return error.code;
  return 'internal_error';
}

/**
 * Canonical `run3-select` production flow.
 *
 *   require explicit PM acknowledgement
 *     -> validate run-id
 *     -> validate canonical private state root
 *     -> pinned protocol config + pinned PM authorization record
 *     -> ControllerStateStore
 *     -> classify persisted state (pre-construction, fail-closed)
 *     -> [ALREADY_RESOLVED: project persisted commitment, STOP — no Gmail]
 *     -> Run3AcquisitionController
 *     -> authorizePM (FRESH only; skipped on resume)
 *     -> enumerateGmailMetadata (full mailbox, metadata-only)
 *     -> controller.resolveSelection(candidates, fixed V1 window)
 *     -> content-free projection
 *     -> STOP at METADATA_SELECTION_RESOLVED
 *
 * `pmAcknowledged` MUST be `true`. This duplicates the CLI's `--authorize-pm`
 * check on purpose: the acknowledgement is a precondition of the STATE
 * MUTATION, not of argument parsing, so it belongs on the layer that
 * actually mutates. A single check living only in the parser would mean any
 * other caller — a future command, a script, or a parser regression —
 * reaches `authorizePM` and writes durable Run-3 state with no operator
 * intent recorded anywhere. Checked before the state root is read and before
 * Gmail is contacted.
 *
 * @param {{
 *   env: Record<string, string | undefined>,
 *   statePath: string,
 *   runId: string,
 *   pmAcknowledged: boolean,
 *   enumerate?: typeof enumerateGmailMetadata,
 *   stateStoreFactory?: (filePath: string) => ControllerStateStore,
 *   controllerFactory?: (config: object, stateStore: object, clock: {now: () => number}) => Run3AcquisitionController,
 *   clock?: {now: () => number},
 * }} input
 *
 * `enumerate`, `stateStoreFactory`, `controllerFactory` and `clock` are
 * internal test seams with production defaults. They carry no protocol
 * authority: none of them can change a pinned constant, the observation
 * window, the selection rule, or the state machine. The production CLI
 * supplies none of them.
 */
export async function runRun3Select({
  env,
  statePath,
  runId,
  pmAcknowledged,
  enumerate = enumerateGmailMetadata,
  stateStoreFactory = (filePath) => new ControllerStateStore(filePath),
  controllerFactory = (config, stateStore, clock) => new Run3AcquisitionController(config, stateStore, clock),
  clock = { now: () => Date.now() },
}) {
  // Explicit operator intent, before anything else. Strict `!== true` so a
  // truthy-but-unintended value can never satisfy it.
  if (pmAcknowledged !== true) throw new SelectOperatorError('pm_authorization_required');

  const validatedRunId = validateRunId(runId);

  // Before Gmail is contacted and before anything can be persisted.
  assertPrivateStateRoot(statePath);

  const config = buildPinnedConfig(validatedRunId);
  const authRecord = buildPinnedAuthorizationRecord(validatedRunId);
  const stateStore = stateStoreFactory(statePath);

  let persisted;
  try {
    persisted = stateStore.load();
  } catch {
    // Unparseable/unreadable existing state: never overwrite it.
    throw new SelectOperatorError('state_unreadable');
  }

  const { entry } = classifyPersistedState(persisted, authRecord);

  if (entry === ENTRY.ALREADY_RESOLVED) {
    // Stable, idempotent re-report. No controller construction, no Gmail
    // access, no write of any kind.
    return contentFreeProjection(STATUS_ALREADY_RESOLVED, {
      state: persisted.state,
      selection: persisted.selection,
    });
  }

  const controller = controllerFactory(config, stateStore, clock);

  if (entry === ENTRY.FRESH) {
    controller.authorizePM(authRecord);
  }
  // RESUME_PM_AUTHORIZED: authorizePM is deliberately NOT called again. The
  // persisted record was already proven byte-equal to the pinned record
  // above, and the controller's own `_guardState(PRE_T0)` would reject a
  // second call anyway.

  // Full-mailbox, metadata-only enumeration. No query, no page size, no
  // window override is passed: the enumerator's own defaults ARE the
  // ratified universe (`includeSpamTrash=true`, full pagination,
  // `id`/`internalDate` only, fixed V1 window).
  const enumeration = await enumerate({ env });

  // The complete enumerated universe is handed to the controller; the
  // ratified rule inside `selection.mjs` decides eligibility itself. The
  // window is passed from the imported V1 constants, never parsed from argv.
  controller.resolveSelection(enumeration.candidates, {
    windowStartMs: V1_WINDOW_START_MS,
    windowEndMs: V1_WINDOW_END_MS,
  });

  return contentFreeProjection(STATUS_RESOLVED, controller.getState());
}
