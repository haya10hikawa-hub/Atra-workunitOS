/**
 * Single source of truth for the ratified Run-3 protocol contract.
 *
 * AUDIT-ONLY UTILITY. Not part of the Atra runtime.
 *
 * Every number/hash here is ratified out of band (see `RUN3_PREREGISTRATION.md`)
 * and must never be re-declared as a separate literal anywhere else on the
 * Run-3 operator or controller paths — both `Run3AcquisitionController`
 * (`controller.mjs`) and the canonical operator preflight
 * (`p1-2-run3-controller/cli.mjs` -> `preflight.mjs` -> `planAuthority.mjs`)
 * import from this module so the two paths cannot silently drift apart.
 *
 * `EXPECTED_GITHUB_REUSE` is not re-declared here either: it is the exact
 * same pinned value as `EXPECTED_RUN2_GITHUB_REUSE_COUNT` in
 * `p1-2-gmail-raw-transport/preflight.mjs` (that module's own established
 * single source for the Run-2 GitHub reuse count), re-exported under the
 * protocol-contract name used by the controller.
 *
 * @module p1-2-run3-controller/protocolConstants
 */

import { PLAN_AUTHORITY_BYTE_LENGTH, PLAN_AUTHORITY_SHA256 } from './planAuthority.mjs';
import { EXPECTED_RUN2_GITHUB_REUSE_COUNT } from '../p1-2-gmail-raw-transport/preflight.mjs';

export { PLAN_AUTHORITY_SHA256, PLAN_AUTHORITY_BYTE_LENGTH };

/** Ratified GitHub-reuse count for Run-3 (see `RUN3_PREREGISTRATION.md` §2). */
export const EXPECTED_GITHUB_REUSE = EXPECTED_RUN2_GITHUB_REUSE_COUNT;

/** Ratified count of newly-acquired Gmail RAW messages for Run-3. */
export const EXPECTED_GMAIL_NEW = 26;

/** Ratified total dataset size for Run-3 (reused GitHub + new Gmail). */
export const EXPECTED_TOTAL = EXPECTED_GITHUB_REUSE + EXPECTED_GMAIL_NEW;

/** Ratified acquisition window length, in hours, from T0. */
export const ACQUISITION_DURATION_HOURS = 4;
