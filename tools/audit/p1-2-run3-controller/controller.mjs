/**
 * Run-3 Gmail acquisition control plane.
 *
 * This is experiment-integrity authority, not an acquisition executor: it
 * never touches OAuth, Google's SDK, or fetch() itself. The controller is
 * handed a narrow `acquireRaw(identity, destination) ->
 * {message_id, byte_length, provider_sha256, persisted_sha256, byte_equal}`
 * capability by its caller and enforces the pre-registered Run-3 sequencing
 * and fidelity invariants around every call to it.
 *
 * State machine (VOID is terminal and reachable from any non-terminal state):
 *
 *   PRE_T0
 *     -> PM_AUTHORIZED               (authorizePM)
 *     -> METADATA_SELECTION_RESOLVED (resolveSelection)
 *     -> T0_RECORDED                 (recordT0)
 *     -> CANARY_PENDING              (automatic, on T0)
 *     -> CANARY_PASSED               (runCanary, success)
 *     -> GMAIL_ACQUIRING             (automatic, on first remaining success)
 *     -> ACQUISITION_COMPLETE        (automatic, on 26/26)
 *     -> VALIDATION_PENDING          (completeToValidationPending)
 *
 * Selection is resolved *before* T0 in this controller, per the Run-3
 * pre-registration amendment (PM decision token
 * ATRA_PM_P1_2_RUN3_GMAIL_SELECTION_RULE_V1_RATIFIED): metadata-only
 * enumeration and deterministic selection are not content-bearing
 * acquisition and do not themselves start T0, but T0 cannot be recorded
 * until a selection commitment exists.
 */

import { resolveGmailSelection, selectionCommitment } from './selection.mjs';

export const STATES = Object.freeze({
  PRE_T0: 'PRE_T0',
  PM_AUTHORIZED: 'PM_AUTHORIZED',
  METADATA_SELECTION_RESOLVED: 'METADATA_SELECTION_RESOLVED',
  T0_RECORDED: 'T0_RECORDED',
  CANARY_PENDING: 'CANARY_PENDING',
  CANARY_PASSED: 'CANARY_PASSED',
  GMAIL_ACQUIRING: 'GMAIL_ACQUIRING',
  ACQUISITION_COMPLETE: 'ACQUISITION_COMPLETE',
  VALIDATION_PENDING: 'VALIDATION_PENDING',
  VOID: 'VOID',
});

const ACQUISITION_DURATION_MS = 4 * 60 * 60 * 1000;
const TOTAL_GMAIL = 26;

export class ControllerError extends Error {
  constructor(code) {
    super(code);
    this.code = code;
  }
}

export class VoidTerminalError extends ControllerError {
  constructor(reason) {
    super('P1_2_RUN3_VOID_TERMINAL');
    this.voidReason = reason;
  }
}

function requiredResultFields(result) {
  return (
    result &&
    typeof result.message_id === 'string' &&
    result.message_id.length > 0 &&
    Number.isInteger(result.byte_length) &&
    result.byte_length > 0 &&
    typeof result.provider_sha256 === 'string' &&
    result.provider_sha256.length > 0 &&
    typeof result.persisted_sha256 === 'string' &&
    result.persisted_sha256.length > 0 &&
    typeof result.byte_equal === 'boolean'
  );
}

export class Run3AcquisitionController {
  /**
   * @param {{runId: string, planSha256: string, expectedGithubReuse: number, expectedGmailNew: number, expectedTotal: number, acquisitionDurationHours: number}} config
   * @param {import('./stateStore.mjs').ControllerStateStore} stateStore
   * @param {{now: () => number}} clock
   */
  constructor(config, stateStore, clock) {
    this.config = config;
    this.stateStore = stateStore;
    this.clock = clock;

    const persisted = stateStore.load();
    if (persisted) {
      this._restore(persisted);
    } else {
      this.state = STATES.PRE_T0;
      this.pmAuthorization = null;
      this.selection = null;
      this.t0 = null;
      this.deadline = null;
      this.completed = [];
      this.destinationsUsed = [];
      this.voidReason = null;
      this.validation = null;
    }
  }

  _restore(persisted) {
    this.state = persisted.state;
    this.pmAuthorization = persisted.pmAuthorization;
    this.selection = persisted.selection;
    this.t0 = persisted.t0;
    this.deadline = persisted.deadline;
    this.completed = persisted.completed ?? [];
    this.destinationsUsed = persisted.destinationsUsed ?? [];
    this.voidReason = persisted.voidReason ?? null;
    this.validation = persisted.validation ?? null;
  }

  _persist() {
    this.stateStore.save({
      state: this.state,
      pmAuthorization: this.pmAuthorization,
      selection: this.selection,
      t0: this.t0,
      deadline: this.deadline,
      completed: this.completed,
      destinationsUsed: this.destinationsUsed,
      voidReason: this.voidReason,
      validation: this.validation,
    });
  }

  _void(reason) {
    if (this.state === STATES.VOID) return;
    this.state = STATES.VOID;
    this.voidReason = reason;
    this._persist();
  }

  _guardNotVoid() {
    if (this.state === STATES.VOID) {
      throw new VoidTerminalError(this.voidReason);
    }
  }

  _guardState(expected) {
    this._guardNotVoid();
    if (this.state !== expected) {
      throw new ControllerError(`P1_2_RUN3_ILLEGAL_STATE_TRANSITION:expected=${expected}:actual=${this.state}`);
    }
  }

  _pastDeadline() {
    return this.deadline !== null && this.clock.now() > this.deadline;
  }

  /** Read-only snapshot. Safe in any state, including VOID, and after restart. */
  getState() {
    return Object.freeze({
      state: this.state,
      pmAuthorization: this.pmAuthorization,
      selection: this.selection,
      t0: this.t0,
      deadline: this.deadline,
      completed: [...this.completed],
      voidReason: this.voidReason,
      validation: this.validation,
    });
  }

  /**
   * @param {{run_id: string, plan_sha256: string, expected_github_reuse: number, expected_gmail_new: number, expected_total: number, acquisition_duration_hours: number}} authRecord
   */
  authorizePM(authRecord) {
    this._guardState(STATES.PRE_T0);
    const c = this.config;
    const matches =
      authRecord &&
      authRecord.run_id === c.runId &&
      authRecord.plan_sha256 === c.planSha256 &&
      authRecord.expected_github_reuse === c.expectedGithubReuse &&
      authRecord.expected_gmail_new === c.expectedGmailNew &&
      authRecord.expected_total === c.expectedTotal &&
      authRecord.acquisition_duration_hours === c.acquisitionDurationHours;

    if (!matches) {
      throw new ControllerError('P1_2_RUN3_PM_AUTHORIZATION_INVALID');
    }

    this.pmAuthorization = { ...authRecord };
    this.state = STATES.PM_AUTHORIZED;
    this._persist();
  }

  /**
   * @param {ReadonlyArray<{message_id: string, internalDate: string | number}>} candidates
   * @param {{windowStartMs: number, windowEndMs: number}} window
   */
  resolveSelection(candidates, window) {
    this._guardState(STATES.PM_AUTHORIZED);
    // Throws SelectionError (e.g. eligible universe too small) without
    // mutating state — this is a pre-T0 setup failure, not an
    // experiment-integrity violation, so it is not terminal.
    const resolution = resolveGmailSelection(candidates, window);
    const commitment = selectionCommitment(resolution);

    this.selection = {
      ruleId: resolution.ruleId,
      eligibleCount: resolution.eligibleCount,
      selected: resolution.selected,
      canary: resolution.canary,
      remaining: resolution.remaining,
      commitment,
    };
    this.state = STATES.METADATA_SELECTION_RESOLVED;
    this._persist();
  }

  recordT0() {
    this._guardState(STATES.METADATA_SELECTION_RESOLVED);
    if (!this.selection) {
      throw new ControllerError('P1_2_RUN3_NO_SELECTION_RESOLUTION');
    }
    // Re-verify the selection commitment has not drifted since resolution.
    const recomputed = selectionCommitment({ ruleId: this.selection.ruleId, selected: this.selection.selected });
    if (recomputed !== this.selection.commitment) {
      throw new ControllerError('P1_2_RUN3_SELECTION_COMMITMENT_MISMATCH');
    }
    if (this.t0 !== null) {
      throw new ControllerError('P1_2_RUN3_T0_ALREADY_RECORDED');
    }

    this.t0 = this.clock.now();
    this.deadline = this.t0 + ACQUISITION_DURATION_MS;
    this.state = STATES.CANARY_PENDING;
    this._persist();
  }

  /**
   * @param {(identity: {message_id: string}, destination: string) => Promise<object>} acquireRaw
   * @param {(identity: {message_id: string}) => string} destinationFor
   */
  async runCanary(acquireRaw, destinationFor) {
    this._guardState(STATES.CANARY_PENDING);

    if (this._pastDeadline()) {
      this._void('P1_2_RUN3_DEADLINE_EXCEEDED');
      throw new VoidTerminalError(this.voidReason);
    }

    const canary = this.selection.canary;
    const destination = destinationFor(canary);
    if (this.destinationsUsed.includes(destination)) {
      throw new ControllerError('P1_2_RUN3_DESTINATION_ALREADY_EXISTS');
    }

    let result;
    try {
      result = await acquireRaw(canary, destination);
    } catch {
      this._void('P1_2_RUN3_CANARY_ACQUISITION_AMBIGUOUS');
      throw new VoidTerminalError(this.voidReason);
    }

    if (!requiredResultFields(result) || result.message_id !== canary.message_id || result.byte_equal !== true) {
      this._void('P1_2_RUN3_CANARY_BYTE_FIDELITY_FAILURE');
      throw new VoidTerminalError(this.voidReason);
    }

    this.completed.push({
      message_id: result.message_id,
      byte_length: result.byte_length,
      provider_sha256: result.provider_sha256,
      persisted_sha256: result.persisted_sha256,
      is_canary: true,
      completed_at: this.clock.now(),
    });
    this.destinationsUsed.push(destination);
    this.state = STATES.CANARY_PASSED;
    this._persist();
  }

  /**
   * @param {string} messageId
   * @param {(identity: {message_id: string}, destination: string) => Promise<object>} acquireRaw
   * @param {(identity: {message_id: string}) => string} destinationFor
   */
  async acquireNext(messageId, acquireRaw, destinationFor) {
    this._guardNotVoid();
    if (this.state !== STATES.CANARY_PASSED && this.state !== STATES.GMAIL_ACQUIRING) {
      throw new ControllerError(`P1_2_RUN3_ILLEGAL_STATE_TRANSITION:expected=CANARY_PASSED|GMAIL_ACQUIRING:actual=${this.state}`);
    }

    if (this._pastDeadline()) {
      this._void('P1_2_RUN3_DEADLINE_EXCEEDED');
      throw new VoidTerminalError(this.voidReason);
    }

    const alreadyCompleted = this.completed.some((c) => c.message_id === messageId);
    if (alreadyCompleted) {
      throw new ControllerError('P1_2_RUN3_DUPLICATE_IDENTITY');
    }
    const identity = this.selection.remaining.find((r) => r.message_id === messageId);
    if (!identity) {
      throw new ControllerError('P1_2_RUN3_UNKNOWN_IDENTITY');
    }

    const destination = destinationFor(identity);
    if (this.destinationsUsed.includes(destination)) {
      throw new ControllerError('P1_2_RUN3_DESTINATION_ALREADY_EXISTS');
    }

    let result;
    try {
      result = await acquireRaw(identity, destination);
    } catch {
      this._void('P1_2_RUN3_GMAIL_ACQUISITION_AMBIGUOUS');
      throw new VoidTerminalError(this.voidReason);
    }

    if (!requiredResultFields(result) || result.message_id !== identity.message_id || result.byte_equal !== true) {
      this._void('P1_2_RUN3_GMAIL_BYTE_FIDELITY_FAILURE');
      throw new VoidTerminalError(this.voidReason);
    }

    this.completed.push({
      message_id: result.message_id,
      byte_length: result.byte_length,
      provider_sha256: result.provider_sha256,
      persisted_sha256: result.persisted_sha256,
      is_canary: false,
      completed_at: this.clock.now(),
    });
    this.destinationsUsed.push(destination);
    this.state = this.completed.length === TOTAL_GMAIL ? STATES.ACQUISITION_COMPLETE : STATES.GMAIL_ACQUIRING;
    this._persist();
  }

  completeToValidationPending() {
    this._guardState(STATES.ACQUISITION_COMPLETE);
    if (this.completed.length !== TOTAL_GMAIL) {
      throw new ControllerError('P1_2_RUN3_ACQUISITION_INCOMPLETE');
    }
    this.validation = {
      github_reuse_expected: this.config.expectedGithubReuse,
      gmail_acquired: TOTAL_GMAIL,
      total_expected: this.config.expectedTotal,
    };
    this.state = STATES.VALIDATION_PENDING;
    this._persist();
  }
}
