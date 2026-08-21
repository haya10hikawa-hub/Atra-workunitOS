/**
 * P1_2_RUN3_GMAIL_METADATA_SELECTION_V1 — pure deterministic Gmail
 * metadata-only sample selection and canary designation.
 *
 * Reads only {message_id, internalDate}. Never reads subject, from, to, cc,
 * bcc, snippet, headers, body, RAW MIME, attachments, or any semantic field.
 * Callers must not pass those fields in; this module does not defend against
 * a caller who ignores that contract beyond simply never touching such keys.
 */

import { createHash } from 'node:crypto';

export const RULE_ID = 'P1_2_RUN3_GMAIL_METADATA_SELECTION_V1';
export const SAMPLE_SIZE = 26;

export class SelectionError extends Error {
  constructor(code) {
    super(code);
    this.code = code;
  }
}

function selectionScore(messageId) {
  return createHash('sha256').update(`${RULE_ID}\n${messageId}`, 'utf8').digest('hex');
}

/**
 * @param {{message_id: string, internalDate: string | number}} candidate
 * @param {number} windowStartMs
 * @param {number} windowEndMs
 */
function isEligible(candidate, windowStartMs, windowEndMs) {
  const internalDateMs = Number(candidate.internalDate);
  return internalDateMs >= windowStartMs && internalDateMs <= windowEndMs;
}

/**
 * Deterministic selection: eligibility filter -> score -> canonical sort ->
 * take first SAMPLE_SIZE. Sorting by input array order never matters because
 * the sort key (selection score, then message_id) depends only on each
 * candidate's own fields.
 *
 * @param {{message_id: string, internalDate: string | number}[]} candidates
 * @param {{windowStartMs: number, windowEndMs: number}} window
 * @returns {Readonly<{
 *   ruleId: string,
 *   eligibleCount: number,
 *   selected: ReadonlyArray<Readonly<{message_id: string, internalDate: string | number, selection_score: string}>>,
 *   canary: Readonly<{message_id: string, internalDate: string | number, selection_score: string}>,
 *   remaining: ReadonlyArray<Readonly<{message_id: string, internalDate: string | number, selection_score: string}>>,
 * }>}
 */
export function resolveGmailSelection(candidates, window) {
  const eligible = candidates
    .filter((c) => isEligible(c, window.windowStartMs, window.windowEndMs))
    .map((c) => ({
      message_id: c.message_id,
      internalDate: c.internalDate,
      selection_score: selectionScore(c.message_id),
    }));

  if (eligible.length < SAMPLE_SIZE) {
    throw new SelectionError('P1_2_RUN3_GMAIL_ELIGIBLE_UNIVERSE_TOO_SMALL');
  }

  eligible.sort((a, b) => {
    if (a.selection_score < b.selection_score) return -1;
    if (a.selection_score > b.selection_score) return 1;
    if (a.message_id < b.message_id) return -1;
    if (a.message_id > b.message_id) return 1;
    return 0;
  });

  const selected = Object.freeze(eligible.slice(0, SAMPLE_SIZE).map((c) => Object.freeze({ ...c })));
  const canary = selected[0];
  const remaining = Object.freeze(selected.slice(1));

  return Object.freeze({
    ruleId: RULE_ID,
    eligibleCount: eligible.length,
    selected,
    canary,
    remaining,
  });
}

/**
 * Deterministic commitment over a resolved selection, used to prove the
 * selected set has not changed between resolution and T0 (and across a
 * controller restart). Deliberately excludes internalDate/selection_score so
 * the commitment is stable even if callers vary metadata representation.
 *
 * @param {{ruleId: string, selected: ReadonlyArray<{message_id: string}>}} resolution
 */
export function selectionCommitment(resolution) {
  const canonical = JSON.stringify({
    rule_id: resolution.ruleId,
    selected_message_ids: resolution.selected.map((s) => s.message_id),
  });
  return createHash('sha256').update(canonical, 'utf8').digest('hex');
}
