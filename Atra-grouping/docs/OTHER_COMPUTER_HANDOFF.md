# Other-computer handoff

This branch includes the Atra Gold Set platform source and the two pinned primary
Hugging Face model snapshots. Large model and tokenizer files are stored with Git
LFS. Do not download the repository as a GitHub ZIP because ZIP archives do not
reliably provide the LFS objects.

## Clone and restore

```sh
brew install git-lfs
git lfs install
git clone https://github.com/haya10hikawa-hub/Atra-workunitOS.git
cd Atra-workunitOS
git switch codex/atra-goldset-handoff-2026-08-23
git lfs pull
cd Atra-grouping
```

Create fresh dependencies on the destination machine. The checked-in virtual
environment and `node_modules` are intentionally excluded because they contain
machine- and Python-version-specific binaries.

```sh
npm ci
python3 -m venv .venv-inference
.venv-inference/bin/python -m pip install -r inference/requirements.txt
```

Verify that the LFS files are complete, their SHA-256 values match the registry,
and both custom-architecture models load with network access disabled:

```sh
HF_HUB_OFFLINE=1 TRANSFORMERS_OFFLINE=1 \
  .venv-inference/bin/python inference/verify_local_models.py
npm run verify
```

Expected model verification output begins with `LOCAL_MODELS_OK` and reports an
embedding hidden size of 768 and one reranker label.

## Included pinned models

- `Alibaba-NLP/gte-multilingual-base`
  - revision `9bbca17d9273fd0d03d5725c7a4b0f6b45142062`
  - local path `models/huggingface/gte-multilingual-base`
- `Alibaba-NLP/gte-multilingual-reranker-base`
  - revision `8215cf04918ba6f7b6a62bb44238ce2953d8831c`
  - local path `models/huggingface/gte-multilingual-reranker-base`
- `Alibaba-NLP/new-impl`
  - revision `40ced75c3017eb27626c9d4ea981bde21a2662f4`
  - the custom architecture source is copied into both primary model directories
    so they can load offline.

Comparative BGE models remain registry-pinned but are not bundled in this branch.
