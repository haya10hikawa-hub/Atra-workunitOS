/**
 * Minimal private, atomic JSON state persistence for the Run-3 acquisition
 * controller. Not a database: one file, one record, atomic replace.
 *
 * Deliberately synchronous — controller transitions are already
 * single-threaded and rare (one per acquisition), so there is no throughput
 * reason to add async/fsync-queue complexity that would only make the
 * crash-safety argument harder to audit.
 */

import { existsSync, mkdirSync, chmodSync, openSync, writeSync, fsyncSync, closeSync, readFileSync, renameSync, unlinkSync } from 'node:fs';
import { dirname } from 'node:path';
import { randomBytes } from 'node:crypto';

const DIR_MODE = 0o700;
const FILE_MODE = 0o600;

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
    mkdirSync(dir, { recursive: true, mode: DIR_MODE });
    try {
      chmodSync(dir, DIR_MODE);
    } catch {
      // best-effort: directory may be owned by a different process/user in
      // some test environments, but the private state file's own mode below
      // is the property this WorkUnit actually depends on.
    }

    const tmpPath = `${this.filePath}.tmp-${process.pid}-${randomBytes(6).toString('hex')}`;
    const serialized = JSON.stringify(state, null, 2);
    const fd = openSync(tmpPath, 'w', FILE_MODE);
    try {
      writeSync(fd, serialized);
      fsyncSync(fd);
    } finally {
      closeSync(fd);
    }
    // openSync's mode is masked by umask; force the exact private mode.
    chmodSync(tmpPath, FILE_MODE);

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
    chmodSync(this.filePath, FILE_MODE);

    // fsync the parent directory so the rename itself is durable, not just
    // the file's own bytes.
    const dirFd = openSync(dir, 'r');
    try {
      fsyncSync(dirFd);
    } finally {
      closeSync(dirFd);
    }
  }
}
