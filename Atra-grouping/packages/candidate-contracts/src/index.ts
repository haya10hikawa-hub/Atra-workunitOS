import { z } from "zod";
import { deterministicId } from "@atra/source-contracts";

export function candidatePairId(
  firstChunkId: string,
  secondChunkId: string,
): string {
  const orderedChunkIds = [firstChunkId, secondChunkId].sort();
  return deterministicId("cp", orderedChunkIds);
}

const RequiredString = z.string().min(1);

export const CandidatePairSchema = z
  .object({
    candidate_pair_id: RequiredString,
    anchor_chunk_id: RequiredString,
    candidate_chunk_id: RequiredString,
    retrieval_model: RequiredString,
    retrieval_model_version: RequiredString,
    retrieval_score: z.number().finite(),
    reranker_model: RequiredString,
    reranker_version: RequiredString,
    reranker_score: z.number().finite(),
    sampling_bucket: RequiredString,
    sampling_reason: RequiredString,
    policy_version: RequiredString,
    created_at: z.iso.datetime({ offset: true }),
  })
  .strict()
  .superRefine((pair, context) => {
    if (pair.anchor_chunk_id === pair.candidate_chunk_id) {
      context.addIssue({ code: "custom", message: "candidate pairs cannot be self-pairs" });
    }
    if (
      pair.candidate_pair_id !== candidatePairId(pair.anchor_chunk_id, pair.candidate_chunk_id)
    ) {
      context.addIssue({
        code: "custom",
        path: ["candidate_pair_id"],
        message: "candidate_pair_id must match the order-stable chunk pair identity",
      });
    }
  })
  .readonly();

export type CandidatePair = z.infer<typeof CandidatePairSchema>;
