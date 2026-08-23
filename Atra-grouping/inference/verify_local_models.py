"""Verify vendored primary model files and load them without network access."""
from __future__ import annotations

import hashlib
import json
from pathlib import Path

from transformers import AutoModel, AutoModelForSequenceClassification, AutoTokenizer


ROOT = Path(__file__).resolve().parents[1]
REGISTRY_PATH = ROOT / "inference/config/production-models.json"


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for block in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def verify_files(model: dict[str, object]) -> Path:
    local_path = ROOT / str(model["local_path"])
    expected = model["model_file_hashes"]
    if not isinstance(expected, dict):
        raise ValueError(f"missing file hashes for {model['role']}")
    for relative_path, expected_hash in expected.items():
        actual_hash = sha256(local_path / relative_path)
        if actual_hash != expected_hash:
            raise ValueError(f"hash mismatch: {local_path / relative_path}")
    return local_path


def main() -> None:
    registry = json.loads(REGISTRY_PATH.read_text(encoding="utf-8"))
    models = {model["role"]: model for model in registry["models"]}

    embedding_path = verify_files(models["embedding-primary"])
    embedding_tokenizer = AutoTokenizer.from_pretrained(
        embedding_path, trust_remote_code=True, local_files_only=True
    )
    embedding_model = AutoModel.from_pretrained(
        embedding_path, trust_remote_code=True, local_files_only=True
    )
    if embedding_model.config.hidden_size != 768:
        raise ValueError("primary embedding hidden_size must be 768")

    reranker_path = verify_files(models["reranker-primary"])
    reranker_tokenizer = AutoTokenizer.from_pretrained(
        reranker_path, trust_remote_code=True, local_files_only=True
    )
    reranker_model = AutoModelForSequenceClassification.from_pretrained(
        reranker_path, trust_remote_code=True, local_files_only=True
    )
    if reranker_model.config.num_labels != 1:
        raise ValueError("primary reranker num_labels must be 1")

    print("LOCAL_MODELS_OK")
    print("embedding_tokenizer:", type(embedding_tokenizer).__name__)
    print("embedding_model:", type(embedding_model).__name__)
    print("embedding_hidden_size:", embedding_model.config.hidden_size)
    print("reranker_tokenizer:", type(reranker_tokenizer).__name__)
    print("reranker_model:", type(reranker_model).__name__)
    print("reranker_num_labels:", reranker_model.config.num_labels)


if __name__ == "__main__":
    main()
