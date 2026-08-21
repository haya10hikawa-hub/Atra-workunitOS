/**
 * Minimal private, atomic JSON state persistence for the Run-3 acquisition
 * controller. Not a database: one file, one record, atomic replace.
 *
 * Deliberately synchronous — controller transitions are already
 * single-threaded and rare (one per acquisition), so there is no throughput
 * reason to add async/fsync-queue complexity that would only make the
 * crash-safety argument harder to audit.
 */

import { existsSync, mkdirSync, openSync, writeSync, fsyncSync, closeSync, readFileSync, renameSync, unlinkSync } from 'node:fs';
import { dirname } from 'node:path';
import { randomBytes } from 'node:crypto';

export class StateStoreError extends Error {
  constructor(code) {
    super(code);
    this.code = code;
  }
}

export class ControllerStateStore {
  /** @param {string} filePath */
  constructor(filePath) {
    this.filePath = filePath;
  }

  /** @returns {object | null} */
  load() {
    if (!existsSync(this.filePath)) return null;
    const raw = readFileSync(this.filePath, 'utf8');
    if (raw.length === 0) return null;
    return JSON.parse(raw);
  }

  /** @param {object} state */
  save(state) {
    const dir = dirname(this.filePath);
    mkdirSync(dir, { recursive: true });
    const tmpPath = `${this.filePath}.tmp-${process.pid}-${randomBytes(6).toString('hex')}`;
    const serialized = JSON.stringify(state, null, 2);
    const fd = openSync(tmpPath, 'w');
    try {
      writeSync(fd, serialized);
      fsyncSync(fd);
    } finally {
      closeSync(fd);
    }
    try {
      renameSync(tmpPath, this.filePath);
    } catch (err) {
      try {
        unlinkSync(tmpPath);
      } catch {
        // best-effort cleanup of the temp file; the rename error is the one that matters
      }
      throw err;
    }
  }
}
