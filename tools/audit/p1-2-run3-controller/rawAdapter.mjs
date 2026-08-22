/**
 * Run-3 `acquireRaw` adapter — the narrow bridge the acquisition controller
 * calls between its sequencing/fidelity authority and the actual Gmail RAW
 * byte-preserving transport (`gmailRaw.mjs`).
 *
 * AUDIT-ONLY UTILITY. Not part of the Atra runtime.
 *
 * The controller's contract (see `controller.mjs`) is narrow on purpose:
 * `acquireRaw(identity, destination) -> {message_id, byte_length,
 * provider_sha256, persisted_sha256, byte_equal}`. This module is the only
 * thing that turns that contract into a real transport call. It:
 *   - invokes `acquireGmailRawMessage` exactly once per call, with no
 *     internal retry (retrying belongs to the controller's ambiguous-outcome
 *     policy — VOID on throw — never to this adapter);
 *   - returns the transport's existing content-free evidence object
 *     unmodified — it never adds, drops, or renames a field;
 *   - never reads, logs, or inspects the RAW bytes the transport persists;
 *     it only forwards `identity.message_id` and `destination` in, and
 *     forwards the transport's frozen result out.
 *
 * @module p1-2-run3-controller/rawAdapter
 */

import { acquireGmailRawMessage } from '../p1-2-gmail-raw-transport/gmailRaw.mjs';

export class RawAdapterError extends Error {
  constructor(code) {
    super(code);
    this.name = 'RawAdapterError';
    this.code = code;
  }
}

/**
 * Builds the `acquireRaw` function the controller expects.
 *
 * @param {{root: string, env: Record<string, string | undefined>, acquire?: typeof acquireGmailRawMessage}} config
 * @returns {(identity: {message_id: string}, destination: string) => Promise<Readonly<{
 *   message_id: string, byte_length: number, provider_sha256: string,
 *   persisted_sha256: string, byte_equal: boolean,
 * }>>}
 */
export function createGmailRawAdapter({ root, env, acquire = acquireGmailRawMessage }) {
  if (typeof root !== 'string' || root.length === 0) throw new RawAdapterError('raw_adapter_root_invalid');

  return async function acquireRaw(identity, destination) {
    if (!identity || typeof identity.message_id !== 'string' || identity.message_id.length === 0) {
      throw new RawAdapterError('raw_adapter_identity_invalid');
    }
    if (typeof destination !== 'string' || destination.length === 0) {
      throw new RawAdapterError('raw_adapter_destination_invalid');
    }

    // Exactly one transport call. No catch-and-retry here: any rejection
    // propagates to the controller unchanged, which is the sole authority on
    // what an acquisition failure means (VOID on throw, never a retry).
    return acquire({ messageId: identity.message_id, destPath: destination, root, env });
  };
}
