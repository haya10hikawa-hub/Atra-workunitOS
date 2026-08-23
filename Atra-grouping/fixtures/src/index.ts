import { CandidatePairSchema, candidatePairId } from "@atra/candidate-contracts";
import {
  AnnotationSchema,
  type ReasonCode,
  type Relation,
  type WorkType,
} from "@atra/gold-contracts";
import {
  ChunkSchema,
  SourceRecordSchema,
  chunkId,
  contentHash,
  deterministicId,
  sourceRecordId,
} from "@atra/source-contracts";

const fixtureTimestamp = "2026-08-21T10:00:00.000Z";

interface SideDefinition {
  readonly provider: string;
  readonly recordType: string;
  readonly title: string;
  readonly body: string;
}

interface CaseDefinition {
  readonly caseId: string;
  readonly anchor: SideDefinition;
  readonly candidate: SideDefinition;
  readonly relation: Relation;
  readonly anchorWorkType: WorkType;
  readonly candidateWorkType: WorkType;
  readonly reasonCode: ReasonCode;
  readonly samplingBucket: string;
  readonly score: number;
}

function makeSource(side: SideDefinition, nativeId: string) {
  const id = sourceRecordId(side.provider, "synthetic-calibration-v1", nativeId, "ingest-v1");
  return SourceRecordSchema.parse({
    source_record_id: id,
    provider: side.provider,
    dataset: "synthetic-calibration-v1",
    native_id: nativeId,
    record_type: side.recordType,
    title: side.title,
    body: side.body,
    author_refs: [],
    participant_refs: [],
    created_at: fixtureTimestamp,
    updated_at: null,
    parent_ref: null,
    external_refs: [],
    source_uri: `fixture://${side.provider}/${nativeId}`,
    content_hash: contentHash(side.body),
    license: "synthetic-test-fixture",
    source_classification: "SYNTHETIC",
    source_policy_version: "source-policy-v1",
    ingestion_version: "ingest-v1",
    raw_payload_ref: `fixture://raw/${nativeId}.json`,
  });
}

function makeChunk(source: ReturnType<typeof makeSource>) {
  const hash = contentHash(source.body);
  return ChunkSchema.parse({
    chunk_id: chunkId(source.source_record_id, 0, "whole-record-v1", hash),
    source_record_id: source.source_record_id,
    ordinal: 0,
    text: source.body,
    start_offset: 0,
    end_offset: source.body.length,
    speaker: null,
    timestamp: null,
    chunker_version: "whole-record-v1",
    content_hash: hash,
  });
}

function makeCase(definition: CaseDefinition) {
  const anchorSource = makeSource(definition.anchor, `${definition.caseId}-anchor`);
  const candidateSource = makeSource(definition.candidate, `${definition.caseId}-candidate`);
  const anchorChunk = makeChunk(anchorSource);
  const candidateChunk = makeChunk(candidateSource);
  const pairId = candidatePairId(anchorChunk.chunk_id, candidateChunk.chunk_id);
  const candidatePair = CandidatePairSchema.parse({
    candidate_pair_id: pairId,
    anchor_chunk_id: anchorChunk.chunk_id,
    candidate_chunk_id: candidateChunk.chunk_id,
    retrieval_model: "synthetic-gte",
    retrieval_model_version: "fixture-revision-1",
    retrieval_score: definition.score,
    reranker_model: "synthetic-ettin",
    reranker_version: "fixture-revision-1",
    reranker_score: definition.score,
    sampling_bucket: definition.samplingBucket,
    sampling_reason: `Synthetic calibration case: ${definition.caseId}`,
    policy_version: "fixture-policy-v1",
    created_at: fixtureTimestamp,
  });
  const evidenceSpans =
    definition.relation === "SAME_WORK"
      ? [{ chunk_id: anchorChunk.chunk_id, start_offset: 0, end_offset: anchorChunk.text.length }]
      : [];
  const expectedAnnotation = AnnotationSchema.parse({
    annotation_id: deterministicId("ann", [pairId, "fixture-annotator", "1"]),
    candidate_pair_id: pairId,
    annotator_id: "fixture-annotator",
    assignment_round: 1,
    relation: definition.relation,
    anchor_work_type: definition.anchorWorkType,
    candidate_work_type: definition.candidateWorkType,
    evidence_spans: evidenceSpans,
    reason_codes: [definition.reasonCode],
    confidence: definition.relation === "UNKNOWN" ? 0.2 : 0.9,
    notes: "Synthetic expected judgment for schema and calibration tests only.",
    guideline_version: "1.0.0",
    created_at: fixtureTimestamp,
  });

  return Object.freeze({
    case_id: definition.caseId,
    source_records: Object.freeze([anchorSource, candidateSource]),
    chunks: Object.freeze([anchorChunk, candidateChunk]),
    candidate_pair: candidatePair,
    expected_annotation: expectedAnnotation,
  });
}

export const syntheticCases = Object.freeze([
  makeCase({
    caseId: "same-work-without-shared-id",
    anchor: {
      provider: "jira",
      recordType: "issue",
      title: "Repair callback token refresh",
      body: "Repair the OAuth callback token refresh so login no longer returns HTTP 500.",
    },
    candidate: {
      provider: "google-docs",
      recordType: "meeting_action",
      title: "Authentication meeting action",
      body: "Alex will repair the callback token refresh that causes the HTTP 500 login failure.",
    },
    relation: "SAME_WORK",
    anchorWorkType: "TASK",
    candidateWorkType: "TASK",
    reasonCode: "same_completion_unit",
    samplingBucket: "no_identifier_same_work",
    score: 0.25,
  }),
  makeCase({
    caseId: "project-task-related",
    anchor: {
      provider: "jira",
      recordType: "epic",
      title: "Authentication reliability project",
      body: "Coordinate callback, session, and account-recovery reliability work.",
    },
    candidate: {
      provider: "github",
      recordType: "issue",
      title: "Retry callback token exchange",
      body: "Add one bounded retry to the callback token exchange.",
    },
    relation: "RELATED",
    anchorWorkType: "PROJECT",
    candidateWorkType: "TASK",
    reasonCode: "parent_child",
    samplingBucket: "parent_child_related",
    score: 0.81,
  }),
  makeCase({
    caseId: "task-subtask-related",
    anchor: {
      provider: "github",
      recordType: "issue",
      title: "Add callback retries",
      body: "Implement and release callback retry handling.",
    },
    candidate: {
      provider: "jira",
      recordType: "subtask",
      title: "Write callback retry tests",
      body: "Add integration tests for callback retry exhaustion.",
    },
    relation: "RELATED",
    anchorWorkType: "TASK",
    candidateWorkType: "SUBTASK",
    reasonCode: "parent_child",
    samplingBucket: "parent_child_related",
    score: 0.88,
  }),
  makeCase({
    caseId: "milestone-task-related",
    anchor: {
      provider: "jira",
      recordType: "milestone",
      title: "Authentication release candidate",
      body: "Release candidate approval checkpoint for authentication reliability.",
    },
    candidate: {
      provider: "github",
      recordType: "pull_request",
      title: "Prevent duplicate callback exchange",
      body: "Prevent a callback code from being exchanged twice.",
    },
    relation: "RELATED",
    anchorWorkType: "MILESTONE",
    candidateWorkType: "TASK",
    reasonCode: "parent_child",
    samplingBucket: "milestone_task_related",
    score: 0.69,
  }),
  makeCase({
    caseId: "not-work-different",
    anchor: {
      provider: "ami",
      recordType: "meeting_turn",
      title: "Meeting context",
      body: "The team greeted the new observer and paused for lunch.",
    },
    candidate: {
      provider: "jira",
      recordType: "issue",
      title: "Rotate callback signing key",
      body: "Rotate the callback signing key and verify the new key in staging.",
    },
    relation: "DIFFERENT_WORK",
    anchorWorkType: "NOT_WORK",
    candidateWorkType: "TASK",
    reasonCode: "not_work_content",
    samplingBucket: "easy_negative_control",
    score: 0.05,
  }),
  makeCase({
    caseId: "ambiguous-unknown",
    anchor: {
      provider: "google-docs",
      recordType: "restricted_reference",
      title: "Restricted planning note",
      body: "A follow-up may be required; the referenced private context is unavailable.",
    },
    candidate: {
      provider: "github",
      recordType: "issue",
      title: "Follow-up",
      body: "Investigate the item discussed in the unavailable planning note.",
    },
    relation: "UNKNOWN",
    anchorWorkType: "UNKNOWN",
    candidateWorkType: "UNKNOWN",
    reasonCode: "insufficient_context",
    samplingBucket: "sparse_unknown",
    score: 0.5,
  }),
  makeCase({
    caseId: "initiative-project-related",
    anchor: {
      provider: "jira",
      recordType: "initiative",
      title: "Trusted identity initiative",
      body: "Improve identity assurance across authentication, recovery, and access projects.",
    },
    candidate: {
      provider: "google-docs",
      recordType: "project_brief",
      title: "Authentication reliability project",
      body: "Coordinate several tasks that improve authentication callback reliability.",
    },
    relation: "RELATED",
    anchorWorkType: "INITIATIVE",
    candidateWorkType: "PROJECT",
    reasonCode: "parent_child",
    samplingBucket: "parent_child_related",
    score: 0.73,
  }),
  makeCase({
    caseId: "same-topic-different-work",
    anchor: {
      provider: "github",
      recordType: "issue",
      title: "Retry callback exchange",
      body: "Retry transient callback exchange failures once.",
    },
    candidate: {
      provider: "jira",
      recordType: "issue",
      title: "Add callback audit event",
      body: "Emit an audit event after every callback exchange attempt.",
    },
    relation: "DIFFERENT_WORK",
    anchorWorkType: "TASK",
    candidateWorkType: "TASK",
    reasonCode: "different_acceptance_criteria",
    samplingBucket: "same_topic_different_acceptance",
    score: 0.94,
  }),
  makeCase({
    caseId: "same-identifier-different-work",
    anchor: {
      provider: "jira",
      recordType: "issue_comment",
      title: "Historic issue reference",
      body: "AUTH-42 fixed the callback outage; this task rotates the production signing key.",
    },
    candidate: {
      provider: "github",
      recordType: "issue",
      title: "Document AUTH-42 incident",
      body: "Write the incident retrospective for AUTH-42 without changing authentication code.",
    },
    relation: "DIFFERENT_WORK",
    anchorWorkType: "TASK",
    candidateWorkType: "TASK",
    reasonCode: "shared_identifier_not_identity",
    samplingBucket: "same_identifier_different_work",
    score: 0.84,
  }),
  makeCase({
    caseId: "same-people-time-different-work",
    anchor: {
      provider: "github",
      recordType: "issue",
      title: "Alex rotates staging callback secret",
      body: "Alex will rotate the staging callback secret before noon on Friday.",
    },
    candidate: {
      provider: "google-docs",
      recordType: "meeting_action",
      title: "Alex updates on-call guide",
      body: "Alex will update the authentication on-call guide before noon on Friday.",
    },
    relation: "DIFFERENT_WORK",
    anchorWorkType: "TASK",
    candidateWorkType: "TASK",
    reasonCode: "different_acceptance_criteria",
    samplingBucket: "same_people_time_different_work",
    score: 0.86,
  }),
  makeCase({
    caseId: "paraphrase-related-not-same",
    anchor: {
      provider: "jira",
      recordType: "issue",
      title: "Improve callback resilience",
      body: "Make callback handling resilient to intermittent provider failures.",
    },
    candidate: {
      provider: "github",
      recordType: "issue",
      title: "Add retry telemetry",
      body: "Measure retry attempts so callback resilience work can be monitored.",
    },
    relation: "RELATED",
    anchorWorkType: "TASK",
    candidateWorkType: "TASK",
    reasonCode: "shared_topic_only",
    samplingBucket: "paraphrase_related_not_same",
    score: 0.9,
  }),
  makeCase({
    caseId: "high-score-not-same",
    anchor: {
      provider: "github",
      recordType: "issue",
      title: "Retry OAuth callback request",
      body: "Retry the OAuth callback request once after a transient network failure.",
    },
    candidate: {
      provider: "jira",
      recordType: "issue",
      title: "Audit OAuth callback request",
      body: "Record an immutable audit event for every OAuth callback request.",
    },
    relation: "DIFFERENT_WORK",
    anchorWorkType: "TASK",
    candidateWorkType: "TASK",
    reasonCode: "different_acceptance_criteria",
    samplingBucket: "high_score_not_same",
    score: 0.98,
  }),
  makeCase({
    caseId: "low-score-same",
    anchor: {
      provider: "jira",
      recordType: "issue",
      title: "Recover authorization exchange",
      body: "Repair the authorization-code exchange failure during login.",
    },
    candidate: {
      provider: "google-docs",
      recordType: "meeting_action",
      title: "Login redirection action",
      body: "Resolve the broken handoff that prevents people from entering the service.",
    },
    relation: "SAME_WORK",
    anchorWorkType: "TASK",
    candidateWorkType: "TASK",
    reasonCode: "same_completion_unit",
    samplingBucket: "low_score_same",
    score: 0.1,
  }),
  makeCase({
    caseId: "contradictory-unknown",
    anchor: {
      provider: "google-docs",
      recordType: "meeting_note",
      title: "Conflicting callback decision",
      body: "One note says retry handling was accepted; another says it was deferred with no linked evidence.",
    },
    candidate: {
      provider: "github",
      recordType: "issue",
      title: "Callback retry follow-up",
      body: "Investigate the callback retry follow-up referenced by the planning notes.",
    },
    relation: "UNKNOWN",
    anchorWorkType: "UNKNOWN",
    candidateWorkType: "UNKNOWN",
    reasonCode: "contradictory_evidence",
    samplingBucket: "contradictory_unknown",
    score: 0.5,
  }),
  makeCase({
    caseId: "easy-positive-control",
    anchor: {
      provider: "jira",
      recordType: "issue",
      title: "Disable duplicate callback exchange",
      body: "Reject reuse of an authorization callback code after its first successful exchange.",
    },
    candidate: {
      provider: "github",
      recordType: "pull_request",
      title: "Reject reused authorization callback codes",
      body: "This change rejects reuse of an authorization callback code after its first successful exchange.",
    },
    relation: "SAME_WORK",
    anchorWorkType: "TASK",
    candidateWorkType: "TASK",
    reasonCode: "explicit_cross_reference",
    samplingBucket: "easy_positive_control",
    score: 0.97,
  }),
]);
