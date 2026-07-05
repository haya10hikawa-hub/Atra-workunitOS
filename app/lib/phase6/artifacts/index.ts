/**
 * Phase 6 artifact module public surface.
 *
 * P6-I0: types and validators (types.ts, validation.ts, validators.ts).
 * P6-I1: pure artifact constructors and construction-result helpers
 * (construction.ts, constructors.ts).
 *
 * No storage, no pipeline, no I/O. Validation pass is not approval and not
 * execution permission. Construction success is not approval, not execution
 * permission, not Formal WorkUnit promotion, and not pipeline execution.
 */

export * from "./types.ts"
export * from "./validation.ts"
export * from "./validators.ts"
export * from "./construction.ts"
export * from "./constructors.ts"
