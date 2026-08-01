# Third-Party Notices

Atra-authored code is made available under Elastic-2.0.

Third-party components remain under their respective licenses. Nothing in this
file places a third-party component under the Elastic License 2.0, and nothing
in this file removes or modifies a third-party copyright, attribution, or
license obligation.

This inventory was generated from the live repository state: the declared
`package.json`, the resolved `package-lock.json` (lockfile version 3), the
installed `node_modules` tree, and the tracked non-code assets under `public/`
and `app/`.

## Distribution classification

| Class | Meaning |
| --- | --- |
| `runtime-distributed` | Resolved as a production dependency; may be shipped in a deployed artifact. |
| `platform-specific optional dependency` | Production-optional native binary; only the matching host platform is installed. |
| `build-time` | Used to produce the build output; not itself shipped. |
| `development-only` | Development, test, lint, or type tooling; not shipped. |
| `not distributed` | Present in the tree but excluded from any distributed artifact. |
| `unresolved` | License, provenance, or redistribution basis not verified. |

Classification is taken from the `dev` and `optional` flags npm records in
`package-lock.json`, not inferred by hand.

## Summary

- Lockfile entries inventoried: **776**
- Runtime-distributed (production, non-optional): **20**
- Production-optional platform binaries: **8**
- Development-only / development-optional: **748**
- Packages with an unresolved or missing license identifier: **0**
- Copyleft components in the runtime-distributed set: **0**
- Attribution-required components in the runtime-distributed set: **1**
  (`caniuse-lite`, CC-BY-4.0)

## 1. Direct dependencies

### 1.1 Runtime dependencies (`dependencies`)

| Component | Version | License | Class | License text |
| --- | --- | --- | --- | --- |
| `next` | 16.2.9 | MIT | runtime-distributed | `node_modules/next/license.md` |
| `react` | 19.2.3 | MIT | runtime-distributed | `node_modules/react/LICENSE` |
| `react-dom` | 19.2.3 | MIT | runtime-distributed | `node_modules/react-dom/LICENSE` |
| `react-icons` | 5.6.0 | MIT | runtime-distributed | `node_modules/react-icons/LICENSE` |

Required copyright notices:

- `next` — Copyright (c) 2025 Vercel, Inc.
- `react`, `react-dom` — Copyright (c) Meta Platforms, Inc. and affiliates.
- `react-icons` — Copyright 2018 kamijin_fanta <kamijin@live.jp>

### 1.2 Development dependencies (`devDependencies`)

| Component | Version | License | Class | License text |
| --- | --- | --- | --- | --- |
| `@opennextjs/cloudflare` | 1.19.11 | MIT | build-time | `node_modules/@opennextjs/cloudflare/LICENSE` |
| `@tailwindcss/postcss` | 4.2.1 | MIT | build-time | `node_modules/@tailwindcss/postcss/LICENSE` |
| `@types/node` | 20.19.37 | MIT | development-only | `node_modules/@types/node/LICENSE` |
| `@types/react` | 19.2.14 | MIT | development-only | `node_modules/@types/react/LICENSE` |
| `@types/react-dom` | 19.2.3 | MIT | development-only | `node_modules/@types/react-dom/LICENSE` |
| `dotenv` | 16.6.1 | BSD-2-Clause | development-only | `node_modules/dotenv/LICENSE` |
| `eslint` | 9.39.4 | MIT | development-only | `node_modules/eslint/LICENSE` |
| `eslint-config-next` | 16.2.9 | MIT | development-only | **not shipped in package** — upstream `vercel/next.js` |
| `tailwindcss` | 4.2.1 | MIT | build-time | `node_modules/tailwindcss/LICENSE` |
| `typescript` | 5.9.3 | Apache-2.0 | development-only | `node_modules/typescript/LICENSE.txt` |
| `wrangler` | 4.99.0 | MIT OR Apache-2.0 | development-only | **not shipped in package** — upstream `cloudflare/workers-sdk` |

Two direct dependencies ship no license file inside the published package:

- `eslint-config-next@16.2.9` — declared MIT; license text must be taken from
  the upstream `vercel/next.js` repository.
- `wrangler@4.99.0` — declared as the disjunction `MIT OR Apache-2.0`; the
  licensee chooses one. Atra has not recorded a choice, and none is required
  while the package remains development-only.

Neither is distributed, so neither creates a redistribution attribution
obligation for Atra today. Both would require attention if either were ever
bundled.

## 2. Complete runtime-distributed set

The full production closure resolved by the lockfile. These are the only
components that may appear in a deployed artifact.

| Component | Version | License | Class |
| --- | --- | --- | --- |
| `@img/colour` | 1.1.0 | MIT | runtime-distributed |
| `@next/env` | 16.2.9 | MIT | runtime-distributed |
| `@swc/helpers` | 0.5.15 | Apache-2.0 | runtime-distributed |
| `baseline-browser-mapping` | 2.10.8 | Apache-2.0 | runtime-distributed |
| `caniuse-lite` | 1.0.30001779 | **CC-BY-4.0** | runtime-distributed |
| `client-only` | 0.0.1 | MIT | runtime-distributed |
| `detect-libc` | 2.1.2 | Apache-2.0 | runtime-distributed |
| `nanoid` | 3.3.11 | MIT | runtime-distributed |
| `next` | 16.2.9 | MIT | runtime-distributed |
| `picocolors` | 1.1.1 | ISC | runtime-distributed |
| `postcss` | 8.4.31 | MIT | runtime-distributed |
| `react` | 19.2.3 | MIT | runtime-distributed |
| `react-dom` | 19.2.3 | MIT | runtime-distributed |
| `react-icons` | 5.6.0 | MIT | runtime-distributed |
| `scheduler` | 0.27.0 | MIT | runtime-distributed |
| `semver` | 7.7.4 | ISC | runtime-distributed |
| `sharp` | 0.34.5 | Apache-2.0 | runtime-distributed |
| `source-map-js` | 1.2.1 | BSD-3-Clause | runtime-distributed |
| `styled-jsx` | 5.1.6 | MIT | runtime-distributed |
| `tslib` | 2.8.1 | 0BSD | runtime-distributed |
| `@next/swc-darwin-arm64` | 16.2.9 | MIT | platform-specific optional dependency |
| `@next/swc-darwin-x64` | 16.2.9 | MIT | platform-specific optional dependency |
| `@next/swc-linux-arm64-gnu` | 16.2.9 | MIT | platform-specific optional dependency |
| `@next/swc-linux-arm64-musl` | 16.2.9 | MIT | platform-specific optional dependency |
| `@next/swc-linux-x64-gnu` | 16.2.9 | MIT | platform-specific optional dependency |
| `@next/swc-linux-x64-musl` | 16.2.9 | MIT | platform-specific optional dependency |
| `@next/swc-win32-arm64-msvc` | 16.2.9 | MIT | platform-specific optional dependency |
| `@next/swc-win32-x64-msvc` | 16.2.9 | MIT | platform-specific optional dependency |

Additional required copyright notices for this set:

- `@swc/helpers`, `tslib` — Copyright (c) Microsoft Corporation.
- `source-map-js` — Copyright (c) 2009-2011, Mozilla Foundation and contributors.

## 3. Copyleft and attribution obligations

Every copyleft component in this tree is development-only or
development-optional. **No copyleft component is runtime-distributed.**

### 3.1 CC-BY-4.0 — attribution required, and distributed

| Component | Version | Class |
| --- | --- | --- |
| `caniuse-lite` | 1.0.30001779 | runtime-distributed |

`caniuse-lite` is a transitive production dependency of `next`. It is licensed
under Creative Commons Attribution 4.0 International
(`node_modules/caniuse-lite/LICENSE`). CC-BY-4.0 requires attribution on
redistribution. This entry is that attribution: the caniuse database is the
work of Alexis Deveria and the caniuse contributors, distributed under
CC-BY-4.0. Attribution is not waived because the dependency is transitive.

### 3.2 LGPL-3.0-or-later — not distributed

| Component | Version | Class |
| --- | --- | --- |
| `@img/sharp-libvips-darwin-arm64` | 1.2.4 | development-optional |
| `@img/sharp-libvips-darwin-x64` | 1.2.4 | development-optional |
| `@img/sharp-libvips-linux-arm` | 1.2.4 | development-optional |
| `@img/sharp-libvips-linux-arm64` | 1.2.4 | development-optional |
| `@img/sharp-libvips-linux-ppc64` | 1.2.4 | development-optional |
| `@img/sharp-libvips-linux-riscv64` | 1.2.4 | development-optional |
| `@img/sharp-libvips-linux-s390x` | 1.2.4 | development-optional |
| `@img/sharp-libvips-linux-x64` | 1.2.4 | development-optional |
| `@img/sharp-libvips-linuxmusl-arm64` | 1.2.4 | development-optional |
| `@img/sharp-libvips-linuxmusl-x64` | 1.2.4 | development-optional |
| `@img/sharp-win32-arm64` | 0.34.5 | development-optional (`Apache-2.0 AND LGPL-3.0-or-later`) |
| `@img/sharp-win32-ia32` | 0.34.5 | development-optional (`Apache-2.0 AND LGPL-3.0-or-later`) |
| `@img/sharp-win32-x64` | 0.34.5 | development-optional (`Apache-2.0 AND LGPL-3.0-or-later`) |
| `@img/sharp-wasm32` | 0.34.5 | development-optional (`Apache-2.0 AND LGPL-3.0-or-later AND MIT`) |

These are prebuilt libvips binaries reached through `sharp`. The `sharp`
JavaScript package itself is Apache-2.0 and **is** runtime-distributed; the
LGPL native binaries are marked `dev` and `optional` in `package-lock.json` and
are not part of the production closure.

The deployment target is Cloudflare Workers via OpenNext, which does not
execute these native binaries. If a Node self-hosted deployment is ever
adopted, the LGPL-3.0-or-later obligations for the matching platform binary
must be reassessed before distribution.

### 3.3 MPL-2.0 — not distributed

`axe-core@4.11.1` and `lightningcss@1.31.1` plus 11 `lightningcss-*` platform
binaries are MPL-2.0. All are development or development-optional. MPL-2.0 is
file-level copyleft and imposes obligations only on distribution of the covered
files; none are distributed.

### 3.4 Other non-MIT-family licenses — not distributed

| Component | Version | License | Class |
| --- | --- | --- | --- |
| `@speed-highlight/core` | 1.2.16 | CC0-1.0 | development-only |
| `language-subtag-registry` | 0.3.23 | CC0-1.0 | development-only |
| `argparse` | 2.0.1 | Python-2.0 | development-only |

## 4. License rollup (all 776 lockfile entries)

| License | Entries |
| --- | --- |
| MIT | 551 |
| Apache-2.0 | 127 |
| ISC | 35 |
| MPL-2.0 | 13 |
| BlueOak-1.0.0 | 12 |
| BSD-2-Clause | 11 |
| LGPL-3.0-or-later | 10 |
| BSD-3-Clause | 5 |
| MIT OR Apache-2.0 | 3 |
| Apache-2.0 AND LGPL-3.0-or-later | 3 |
| CC0-1.0 | 2 |
| Apache-2.0 AND LGPL-3.0-or-later AND MIT | 1 |
| Python-2.0 | 1 |
| CC-BY-4.0 | 1 |
| 0BSD | 1 |

No entry reported `UNKNOWN`, `UNLICENSED`, `SEE LICENSE IN`, or a missing
license identifier.

## 5. Bundled non-code assets

Everything under `public/` is copied verbatim into the Next.js build output and
is therefore distributed regardless of whether application code references it.

### 5.1 Simple Icons — source and license verified

`public/workunit-source-icons/*.svg` (15 files: `figma`, `github`, `gmail`,
`google-calendar`, `google-chat`, `google-docs`, `google-drive`,
`google-meet`, `google-sheets`, `google-slides`, `jira`, `linear`, `notion`,
`salesforce`, `slack`).

- Source: the Simple Icons project (<https://simpleicons.org/>), vendored
  locally as recorded in `public/workunit-source-icons/SOURCES.md`.
- License: CC0-1.0 (public domain dedication) for the icon files.
- Verification: the SVG path data of all 15 files was compared against the
  Simple Icons dataset redistributed in `node_modules/react-icons/si`.
  **15 of 15 matched exactly.** The claimed provenance is confirmed, not
  assumed.
- Class: runtime-distributed.
- Attribution: CC0-1.0 waives copyright and does not require attribution.

`react-icons/si` (Simple Icons) is also imported directly by application code
in `app/components/workunit-os/launcher/SourceAppIcon.tsx` and related
components. The `react-icons` package is MIT; the icon sets it redistributes
carry their own terms, including CC-BY-4.0 (Font Awesome), MPL-2.0 (Circum),
Apache-2.0 (Material Design), ISC (Lucide), MIT (Feather) and CC0-1.0 (Simple
Icons). Application code currently imports only the `fi` (Feather, MIT), `lu`
(Lucide, ISC) and `si` (Simple Icons, CC0-1.0) sets.

**Trademark caveat.** The CC0 dedication covers the icon *files*. It does not
grant rights in the underlying brands. Simple Icons states that the depicted
marks remain the property of their respective owners. Whether Atra's use of
GitHub, Slack, Google, Notion, Jira, Linear, Figma and Salesforce marks
qualifies as permissible nominative or descriptive use in an integration UI is
a trademark determination, not a copyright one, and has not been made. It is
carried in section 6 below.

### 5.2 Removed in this change

The following were unreferenced `create-next-app` scaffold assets with no
provenance record. They carried Vercel and Next.js marks or generic template
glyphs, were referenced by no source file, test, or stylesheet, and have been
deleted rather than left unresolved:

- `public/next.svg` (Next.js wordmark — Vercel, Inc.)
- `public/vercel.svg` (Vercel triangle mark — Vercel, Inc.)
- `public/file.svg`
- `public/globe.svg`
- `public/window.svg`

### 5.3 Unresolved assets

See section 6. These are tracked, distributed, and lack a verified basis.

## 6. Unresolved review

The items below block public release. They are listed here rather than
declared safe.

### 6.1 Raster provider logos with no provenance record

`public/Photos/icon/` — referenced by
`app/components/workunit-os/ActionFieldEntryPanel.tsx` and
`app/components/workunit-os/WorkUnitExplorerPane.tsx`:

| File | Format | Owner of depicted mark | Source | License |
| --- | --- | --- | --- | --- |
| `slack.png` | PNG 1024×1024 | Slack Technologies / Salesforce | unknown | unresolved |
| `github.png` | PNG 294×288 | GitHub, Inc. / Microsoft | unknown | unresolved |
| `gmail.png` | PNG 96×96 | Google LLC | unknown | unresolved |
| `google-calendar.png` | PNG 96×96 | Google LLC | unknown | unresolved |
| `salesforce.jpeg` | JPEG 300 DPI | Salesforce, Inc. | unknown | unresolved |
| `database.png` | PNG 256×256 | n/a (generic glyph) | unknown | unresolved |

`public/workunit-ui-icons/` — referenced by
`app/components/workunit-os/launcher/WorkUnitLauncher.module.css`:

| File | Format | Owner of depicted mark | Source | License |
| --- | --- | --- | --- | --- |
| `slack.png` | PNG 44×44 | Slack Technologies / Salesforce | unknown | unresolved |
| `github.png` | PNG 44×44 | GitHub, Inc. / Microsoft | unknown | unresolved |
| `jira.png` | PNG 44×44 | Atlassian Pty Ltd | unknown | unresolved |
| `notion.png` | PNG 44×44 | Notion Labs, Inc. | unknown | unresolved |
| `docs.png` | PNG 44×44 | Google LLC | unknown | unresolved |
| `slides.png` | PNG 44×44 | Google LLC | unknown | unresolved |
| `workunit-logo.png` | PNG 42×42 | unidentified | unknown | unresolved |

These 13 files have no `SOURCES.md`, no attribution, and no recorded origin.
Their heterogeneous dimensions and formats indicate ad-hoc collection rather
than a single licensed icon set, so the Simple Icons verification in section
5.1 does **not** extend to them. Both a copyright basis and a trademark basis
are missing.

`public/workunit-ui-icons/workunit-logo.png` is listed as unresolved
third-party content because its origin is unknown. Consistent with the current
release decision that no official Atra logo is designated, it is **not**
treated as an Atra brand asset and no ownership of it is claimed.

### 6.2 Default application icon

`app/favicon.ico` was introduced by the initial `Create Next App` commit and is
the unmodified Next.js default icon, which carries a Vercel mark. It is served
by the Next.js App Router as the site icon, so removing it would change product
presentation; it has been left in place and is reported here instead.

### 6.3 Contributor rights

Contributor ownership is not established by repository-controlled evidence.
See the pull request description and `CONTRIBUTING.md`.

## 7. Regenerating this inventory

```bash
npm ci
node scripts/verify-license-files.mjs
```

`scripts/verify-license-files.mjs` performs offline structural verification of
the licensing files. It does not re-resolve dependency licenses; regenerate
this document from `package-lock.json` when dependencies change.
