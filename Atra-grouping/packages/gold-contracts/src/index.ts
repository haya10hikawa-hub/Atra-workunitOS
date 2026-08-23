import { z } from "zod";

export const RelationSchema = z.enum(["SAME_WORK", "RELATED", "DIFFERENT_WORK", "UNKNOWN"]);
export type Relation = z.infer<typeof RelationSchema>;

export const WorkTypeSchema = z.enum([
  "INITIATIVE",
  "PROJECT",
  "TASK",
  "SUBTASK",
  "MILESTONE",
  "NOT_WORK",
  "UNKNOWN",
]);
export type WorkType = z.infer<typeof WorkTypeSchema>;

export const ReasonCodeSchema = z.enum([
  "same_completion_unit",
  "shared_acceptance_criteria",
  "explicit_cross_reference",
  "parent_child",
  "dependency",
  "follow_up",
  "shared_topic_only",
  "shared_identifier_not_identity",
  "different_acceptance_criteria",
  "insufficient_context",
  "contradictory_evidence",
  "not_work_content",
]);
export type ReasonCode = z.infer<typeof ReasonCodeSchema>;

export const WorkSignalClassSchema = z.enum([
  "WORK_ACTION",
  "WORK_DECISION",
  "WORK_STATUS_UPDATE",
  "WORK_REFERENCE",
  "NOT_WORK",
  "UNKNOWN",
]);
export type WorkSignalClass = z.infer<typeof WorkSignalClassSchema>;

export const WorkSlotNameSchema = z.enum([
  "work_identifier",
  "owner",
  "participant",
  "due_date",
  "status",
  "acceptance_criterion",
  "source_reference",
  "action_object",
  "blocker",
  "dependency",
  "amount",
  "time_window",
]);
export type WorkSlotName = z.infer<typeof WorkSlotNameSchema>;

const RequiredString = z.string().min(1);
const Timestamp = z.iso.datetime({ offset: true });
const UniqueStrings = z
  .array(RequiredString)
  .superRefine((items, context) => {
    if (new Set(items).size !== items.length) {
      context.addIssue({ code: "custom", message: "IDs must be unique" });
    }
  })
  .readonly();

export const EvidenceSpanSchema = z
  .object({
    chunk_id: RequiredString,
    start_offset: z.number().int().nonnegative(),
    end_offset: z.number().int().positive(),
  })
  .strict()
  .superRefine((span, context) => {
    if (span.end_offset <= span.start_offset) {
      context.addIssue({ code: "custom", message: "evidence span must be non-empty" });
    }
  })
  .readonly();
export type EvidenceSpan = z.infer<typeof EvidenceSpanSchema>;

export const WorkSlotSchema = z
  .object({
    slot_name: WorkSlotNameSchema,
    value: RequiredString,
    normalized_value: z.string().nullable(),
    evidence_span: EvidenceSpanSchema,
    confidence: z.number().finite().min(0).max(1),
  })
  .strict()
  .readonly();
export type WorkSlot = z.infer<typeof WorkSlotSchema>;

export const StructuredSignalSchema = z
  .object({
    structured_signal_id: RequiredString,
    chunk_id: RequiredString,
    signal_class: WorkSignalClassSchema,
    work_type: WorkTypeSchema,
    slots: z.array(WorkSlotSchema).readonly(),
    classifier_model: RequiredString,
    classifier_model_version: RequiredString,
    slot_model: RequiredString,
    slot_model_version: RequiredString,
    confidence: z.number().finite().min(0).max(1),
    guideline_version: RequiredString,
    created_at: Timestamp,
  })
  .strict()
  .superRefine((signal, context) => {
    if (signal.signal_class === "NOT_WORK" && signal.slots.length > 0) {
      context.addIssue({
        code: "custom",
        path: ["slots"],
        message: "NOT_WORK signals cannot carry work slots",
      });
    }
    if (signal.signal_class !== "NOT_WORK" && signal.work_type === "NOT_WORK") {
      context.addIssue({
        code: "custom",
        path: ["work_type"],
        message: "work_type NOT_WORK is only valid when signal_class is NOT_WORK",
      });
    }
  })
  .readonly();
export type StructuredSignal = z.infer<typeof StructuredSignalSchema>;

export const AnnotationSchema = z
  .object({
    annotation_id: RequiredString,
    candidate_pair_id: RequiredString,
    annotator_id: RequiredString,
    assignment_round: z.number().int().positive(),
    relation: RelationSchema,
    anchor_work_type: WorkTypeSchema,
    candidate_work_type: WorkTypeSchema,
    evidence_spans: z.array(EvidenceSpanSchema).readonly(),
    reason_codes: z.array(ReasonCodeSchema).min(1).readonly(),
    confidence: z.number().finite(),
    notes: z.string().nullable(),
    guideline_version: RequiredString,
    created_at: Timestamp,
  })
  .strict()
  .superRefine((annotation, context) => {
    if (annotation.relation === "SAME_WORK" && annotation.evidence_spans.length === 0) {
      context.addIssue({
        code: "custom",
        path: ["evidence_spans"],
        message: "SAME_WORK requires at least one evidence span",
      });
    }
  })
  .readonly();
export type Annotation = z.infer<typeof AnnotationSchema>;

export const AdjudicationSchema = z
  .object({
    adjudication_id: RequiredString,
    candidate_pair_id: RequiredString,
    input_annotation_ids: UniqueStrings.refine((ids) => ids.length >= 2, {
      message: "adjudication requires at least two input annotations",
    }),
    relation: RelationSchema,
    anchor_work_type: WorkTypeSchema,
    candidate_work_type: WorkTypeSchema,
    decision_reason: RequiredString,
    adjudicator_id: RequiredString,
    guideline_version: RequiredString,
    created_at: Timestamp,
  })
  .strict()
  .readonly();
export type Adjudication = z.infer<typeof AdjudicationSchema>;

export const GoldReleaseSchema = z
  .object({
    release_id: RequiredString,
    semantic_version: z.string().regex(/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/),
    dataset_split: RequiredString,
    pair_ids: UniqueStrings.refine((ids) => ids.length > 0, { message: "release must contain pairs" }),
    schema_version: RequiredString,
    guideline_version: RequiredString,
    sampling_policy_version: RequiredString,
    source_snapshot_ids: UniqueStrings.refine((ids) => ids.length > 0, {
      message: "release must pin source snapshots",
    }),
    frozen_at: Timestamp,
    manifest_hash: z.string().regex(/^[a-f0-9]{64}$/),
    supersedes: RequiredString.nullable(),
  })
  .strict()
  .readonly();
export type GoldRelease = z.infer<typeof GoldReleaseSchema>;
