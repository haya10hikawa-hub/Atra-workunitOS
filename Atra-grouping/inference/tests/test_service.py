import json
import unittest
from pathlib import Path

from inference.service import ModelRegistry, deterministic_test_classify_and_fill, deterministic_test_embed, deterministic_test_rerank, health_payload, real_adapter_status


class InferenceContractTests(unittest.TestCase):
    def test_registry_has_pinned_primary_embedding(self) -> None:
        registry = ModelRegistry.load(Path("inference/config/production-models.json"))
        primary = registry.for_role("embedding-primary")
        self.assertEqual(primary["model_id"], "Alibaba-NLP/gte-multilingual-base")
        self.assertEqual(len(primary["revision"]), 40)

    def test_deterministic_test_double_is_normalized_and_lineaged(self) -> None:
        response = deterministic_test_embed(["same completion unit"], dimension=4)
        self.assertEqual(response["adapter_kind"], "deterministic-test-double")
        self.assertEqual(len(response["vectors"][0]), 4)
        self.assertEqual(len(response["lineage"][0]["input_hash"]), 64)

    def test_health_payload_is_not_ready_without_a_real_model_adapter(self) -> None:
        self.assertEqual(health_payload()["status"], "ok")
        self.assertFalse(health_payload()["ready"])

    def test_real_adapter_status_reports_dependency_or_activation_state(self) -> None:
        status = real_adapter_status()
        self.assertIn(status["state"], {"dependencies-missing", "not-loaded", "ready"})

    def test_deterministic_rerank_contract_returns_scores_and_lineage(self) -> None:
        response = deterministic_test_rerank([("same completion unit", "same completion unit"), ("alpha", "beta")])
        self.assertEqual(response["adapter_kind"], "deterministic-test-double")
        self.assertEqual(response["scores"], [1.0, 0.0])
        self.assertEqual(len(response["lineage"][0]["input_hash"]), 64)

    def test_deterministic_classification_and_slot_filling_contract(self) -> None:
        response = deterministic_test_classify_and_fill("ch-1", "Implement retry logic\nOwner: Alex\nAcceptance: retry once")
        signal = response["signal"]
        self.assertEqual(response["adapter_kind"], "deterministic-test-double")
        self.assertEqual(signal["signal_class"], "WORK_ACTION")
        self.assertEqual(signal["work_type"], "TASK")
        self.assertEqual([slot["slot_name"] for slot in signal["slots"]], ["owner", "acceptance_criterion"])
        self.assertEqual(len(response["lineage"]["input_hash"]), 64)


if __name__ == "__main__":
    unittest.main()
