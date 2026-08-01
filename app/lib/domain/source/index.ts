/**
 * WU-01B public surface: the SourceRecordV1 contract and its sole validator.
 *
 * Nothing else is exported. The only runtime edge is to this module's own
 * validator; no value outside `app/lib/domain/source/` is imported.
 */

export type {
  SourceRecordFailureCode,
  SourceRecordV1,
  SourceRecordValidationFailure,
  SourceRecordValidationResult,
  SourceRecordValidationSuccess,
  SourceRecordVersion,
} from "./types.ts"
export { SOURCE_RECORD_VERSION } from "./types.ts"
export { validateSourceRecordV1 } from "./validateSourceRecord.ts"
