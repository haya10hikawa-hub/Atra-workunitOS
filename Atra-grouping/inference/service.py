"""Offline-safe inference contract; production adapters load only immutable registry revisions."""
from __future__ import annotations

import hashlib
import json
import math
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Sequence
from urllib.request import urlopen


@dataclass(frozen=True)
class ModelRegistry:
    models: tuple[dict[str, Any], ...]

    @classmethod
    def load(cls, path: Path) -> "ModelRegistry":
        data = json.loads(path.read_text(encoding="utf-8"))
        models = data.get("models")
        if not isinstance(models, list):
            raise ValueError("model registry requires models")
        for model in models:
            if not isinstance(model, dict) or len(str(model.get("revision", ""))) != 40:
                raise ValueError("model registry requires immutable 40-character revisions")
        return cls(tuple(models))

    def for_role(self, role: str) -> dict[str, Any]:
        for model in self.models:
            if model.get("role") == role:
                return model
        raise KeyError(role)


def health_payload() -> dict[str, Any]:
    """Health is process-local; readiness requires an activated real model adapter."""
    return {"status": "ok", "ready": False, "adapter_kind": "not-activated"}


def real_adapter_status() -> dict[str, str]:
    try:
        import torch  # noqa: F401
        import transformers  # noqa: F401
    except ImportError:
        return {"state": "dependencies-missing"}
    return {"state": "not-loaded"}


def deterministic_test_embed(texts: Sequence[str], dimension: int = 16) -> dict[str, Any]:
    if dimension < 1:
        raise ValueError("dimension must be positive")
    vectors, lineage = [], []
    for text in texts:
        digest = hashlib.sha256(text.encode("utf-8")).digest()
        raw = [float(digest[index % len(digest)]) / 255.0 for index in range(dimension)]
        norm = math.sqrt(sum(value * value for value in raw))
        vector = [value / norm for value in raw]
        output_hash = hashlib.sha256(json.dumps(vector, separators=(",", ":")).encode("utf-8")).hexdigest()
        vectors.append(vector)
        lineage.append({"input_hash": hashlib.sha256(text.encode("utf-8")).hexdigest(), "output_hash": output_hash})
    return {"adapter_kind": "deterministic-test-double", "vectors": vectors, "lineage": lineage}


def deterministic_test_rerank(pairs: Sequence[tuple[str, str]]) -> dict[str, Any]:
    scores, lineage = [], []
    for left, right in pairs:
        left_tokens = set(left.lower().split())
        right_tokens = set(right.lower().split())
        union = left_tokens | right_tokens
        score = 0.0 if not union else len(left_tokens & right_tokens) / len(union)
        payload = json.dumps({"left": left, "right": right}, separators=(",", ":"))
        scores.append(score)
        lineage.append({
            "input_hash": hashlib.sha256(payload.encode("utf-8")).hexdigest(),
            "output_hash": hashlib.sha256(str(score).encode("utf-8")).hexdigest(),
        })
    return {"adapter_kind": "deterministic-test-double", "scores": scores, "lineage": lineage}


def deterministic_test_classify_and_fill(chunk_id: str, text: str) -> dict[str, Any]:
    lowered = text.lower()
    if any(token in lowered for token in ("fix", "implement", "add", "update", "draft")):
        signal_class = "WORK_ACTION"
        work_type = "TASK"
    elif any(token in lowered for token in ("decision", "decided", "approved")):
        signal_class = "WORK_DECISION"
        work_type = "TASK"
    elif any(token in lowered for token in ("status", "done", "blocked")):
        signal_class = "WORK_STATUS_UPDATE"
        work_type = "TASK"
    else:
        signal_class = "UNKNOWN"
        work_type = "UNKNOWN"
    slots: list[dict[str, Any]] = []
    for marker, slot_name in (("owner:", "owner"), ("acceptance:", "acceptance_criterion"), ("due:", "due_date")):
        start = lowered.find(marker)
        if start >= 0:
            value_start = start + len(marker)
            line_end = text.find("\n", value_start)
            end = len(text) if line_end < 0 else line_end
            value = text[value_start:end].strip()
            if value:
                slots.append({
                    "slot_name": slot_name,
                    "value": value,
                    "normalized_value": value,
                    "evidence_span": {"chunk_id": chunk_id, "start_offset": value_start, "end_offset": end},
                    "confidence": 0.7,
                })
    payload = json.dumps({"chunk_id": chunk_id, "text": text}, separators=(",", ":"))
    return {
        "adapter_kind": "deterministic-test-double",
        "signal": {
            "chunk_id": chunk_id,
            "signal_class": signal_class,
            "work_type": work_type,
            "slots": slots,
            "confidence": 0.65 if signal_class == "UNKNOWN" else 0.8,
        },
        "lineage": {
            "input_hash": hashlib.sha256(payload.encode("utf-8")).hexdigest(),
            "output_hash": hashlib.sha256(json.dumps(slots, separators=(",", ":")).encode("utf-8")).hexdigest(),
        },
    }


def huggingface_revision_metadata(model_id: str, revision: str, timeout_seconds: int = 10) -> dict[str, Any]:
    url = f"https://huggingface.co/api/models/{model_id}/revision/{revision}"
    with urlopen(url, timeout=timeout_seconds) as response:
        payload = json.loads(response.read().decode("utf-8"))
    if payload.get("sha") != revision:
        raise ValueError("Hugging Face revision response did not match the pinned revision")
    return {
        "model_id": payload.get("modelId"),
        "sha": payload.get("sha"),
        "sibling_count": len(payload.get("siblings", [])),
    }
