import type { Relation } from "@atra/gold-contracts";
import type { FrozenFixtureRelease, ReleaseLabel } from "@atra/gold";

const relationOrder: readonly Relation[] = ["SAME_WORK", "RELATED", "DIFFERENT_WORK", "UNKNOWN"];

export interface EvaluationReport {
  readonly release_id: string;
  readonly relation: {
    readonly macro_f1: number;
    readonly per_class: Readonly<Record<Relation, { readonly precision: number; readonly recall: number; readonly f1: number }>>;
  };
}

export function evaluateFrozenRelease(
  release: FrozenFixtureRelease,
  predictions: readonly ReleaseLabel[],
): EvaluationReport {
  if (!Object.isFrozen(release)) throw new Error("evaluation requires a frozen release");
  if (release.release.manifest_hash.length !== 64) throw new Error("evaluation requires a valid manifest hash");
  const expected = new Map(release.labels.map((label) => [label.candidate_pair_id, label]));
  const received = new Map(predictions.map((label) => [label.candidate_pair_id, label]));
  if (expected.size !== received.size || [...expected.keys()].some((id) => !received.has(id))) {
    throw new Error("predictions must cover exactly the frozen release pairs");
  }
  const per_class = Object.fromEntries(
    relationOrder.map((relation) => {
      let truePositive = 0;
      let falsePositive = 0;
      let falseNegative = 0;
      for (const [pairId, gold] of expected) {
        const prediction = received.get(pairId);
        if (!prediction) throw new Error(`missing prediction for ${pairId}`);
        if (prediction.relation === relation && gold.relation === relation) truePositive += 1;
        if (prediction.relation === relation && gold.relation !== relation) falsePositive += 1;
        if (prediction.relation !== relation && gold.relation === relation) falseNegative += 1;
      }
      const precision = truePositive + falsePositive === 0 ? 1 : truePositive / (truePositive + falsePositive);
      const recall = truePositive + falseNegative === 0 ? 1 : truePositive / (truePositive + falseNegative);
      return [relation, { precision, recall, f1: precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall) }];
    }),
  ) as EvaluationReport["relation"]["per_class"];
  return Object.freeze({
    release_id: release.release.release_id,
    relation: Object.freeze({
      macro_f1: relationOrder.reduce((total, relation) => total + per_class[relation].f1, 0) / relationOrder.length,
      per_class: Object.freeze(per_class),
    }),
  });
}
