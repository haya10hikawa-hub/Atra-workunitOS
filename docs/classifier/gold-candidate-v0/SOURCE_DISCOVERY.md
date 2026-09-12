# Source acquisition findings — 2026-09-12

Discovery is not acquisition, and acquisition is not Gold acceptance. Only exact acquired snapshots enter the manifest. The family targets remain unchanged.

| Family | Target | Evidence / status | Next necessary action |
|---|---:|---|---|
| Jira | 200 | [Public Jira dataset paper](https://arxiv.org/abs/2201.08368); [TAWOS publisher repository](https://github.com/SOLAR-group/TAWOS) is an alternative public Jira source | Release [15719919](https://zenodo.org/records/15719919) and CC BY 4.0 metadata pinned; ZIP directory acquired by 128KB range; actual Jira issue extraction remains unfinished |
| SmartSHARK | 180 | [Official releases](https://smartshark.github.io/dbreleases/) retrieved with SHA-256 receipt; release 2.1 small backup is listed as 11 GB | Choose a bounded project/collection extraction route; no bulk dump downloaded yet |
| Slack | 120 | [Publisher repository](https://github.com/preethac/Software-related-Slack-Chats-with-Disentangled-Conversations), [Zenodo v1.0.0](https://zenodo.org/records/3627124); API metadata says `other-open`, archive 25,837,557 bytes | Archive acquired and XML adapter verified; 120 sanitized raw neighborhoods selected, one model draft awaiting tag repair; no full-text redistribution grant inferred |
| DISCO | 80 | [Zenodo v2.0.0](https://zenodo.org/records/5909202); API metadata says `other-open`, archive 102,955,559 bytes | Archive acquired and XML adapter verified; 80 sanitized chronological neighborhoods selected; they are not asserted threads or accepted candidates |
| Wikimedia | 120 | Planned family; no corpus acquired | Pin en/ja revision/discussion snapshots, attribution and license evidence; implement revision adapter |
| Japanese OSS | 160 | VOICEVOX public API: three neighborhoods, 61 normalized records, one unreviewed draft | One VOICEVOX candidate accepted after three critic/repair passes; public issue headers acquired from four more repositories, comment import still pending |
| Figma/public design | 60 | [Official licensing documentation](https://help.figma.com/hc/en-us/articles/360042296374-Figma-Community-copyright-and-licensing) states free files use CC BY 4.0; plugins use a different policy | Select actual free design artifacts with creator/version attribution; acquire observable hierarchy only |
| Apache mail | 80 | Planned family; no archive content acquired | Select proposal/vote threads, record archive terms and message references, pseudonymize before annotation |

The `other-open` metadata label does not establish a specific license grant for redistribution. No blanket license is inferred. Figma's free-file policy is not a blanket permission for paid files or plugins.

Cross-family ecosystem accounting needs care: SmartSHARK contains many Apache projects, so combining it with Jira/Apache mail can breach the 25% ecosystem cap. Japanese and naturally mixed language quotas must be sampled jointly, without relabeling English identifiers as mixed language or translating to pad counts.

Full byte receipts are in the Git-ignored sandbox. Compact source discovery should not contain raw conversation text or credentials.
