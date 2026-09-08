# Gmail Message — Identity and Content-Scope Profile

Status: Reviewed per-provider profile. Scope: **Gmail messages only**, and within that class,
**non-draft messages in a single Gmail mailbox** — see §2.

Subordinate to:

- `PRODUCT_STATE.md` — sole current product-state authority
- `docs/archive/v0/PHASE1_VALUE_GATE_PROGRAM.md` — frozen V0 phase context only
- `docs/architecture/SOURCE_RECORD_V1_SEMANTICS.md` — the generic B1-A / B2-P1 semantics this profile must satisfy

This document addresses exactly two of the provider profile gates named in
`SOURCE_RECORD_V1_SEMANTICS.md` §4, for one provider and one resource class. It proves nothing about
Gmail threads, drafts, labels, attachments, history or settings, nothing about any other Google
product, and nothing about Slack. Those gates stay `REQUIRED_UNPROVEN`.

The two gates did not move to the same state, and this document does not pretend they did. The
content-scope gate is proven from Google's own published contract. The identity gate is **not**
proven: the human PM accepted it for Phase-1 bounded experimental use with named requirements left
unproven, and §4 records those residuals rather than arguing them away.

```text
Gmail MESSAGE identity profile      = PHASE1_SCOPED_ACCEPTED_WITH_UNPROVEN_RESIDUAL,
                                      gmail.message.rest.message-id v1
Gmail MESSAGE content-scope profile = PROVEN, gmail.message.rest.raw-rfc2822-octets v1
```

Gmail is the **second independent provider** to reach a reviewed profile pair, and it is the first
non-GitHub provider to do so. It entered on its own evidence: neither GitHub exception is a
precedent it claimed, and §4.1 is a third ratified decision rather than a template filled in.

## 1. Provider authority used

Every claim below is checked against Google's own published contract, not against a third-party
description and not against the shape of a payload that happened to be convenient.

- Gmail API **discovery document**, `gmail.googleapis.com/$discovery/rest?version=v1` — Google's
  machine-readable contract, and the primary source for every field description quoted here.
- Gmail API `users.messages` resource reference and the `users.messages.get` `format` parameter with
  its four `enumDescriptions`.
- Gmail API `users.messages.attachments` reference, for `MessagePartBody.attachmentId` and `data`.
- Gmail API `users.getProfile` reference and the `Profile` schema.
- Gmail API drafts guide and synchronization guide.
- Gmail **IMAP extensions** reference — the only Google surface that states anything about the scope
  of a Gmail message id.

The rendered reference pages are generated from the discovery document. Where this document says
Google is **silent**, that silence was confirmed against the machine-readable contract and not
inferred from a rendering.

**No real or private mail was inspected**, no mailbox was read, no credential was used, no Gmail
message API was called, and no participant data was touched. Every byte example is synthetic. This is
the constraint `PHASE1_VALUE_GATE_PROGRAM.md` states for human conversational content, and it was not
relaxed for this review.

## 2. Resource scope

```text
RESOURCE_CLASS     Gmail message
IN SCOPE           messages not carrying the DRAFT label, in exactly ONE Gmail mailbox
OUT OF SCOPE       draft-stage messages; Thread, Draft, Label, Attachment, History, Settings;
                   every other Google product
ACQUISITION_MODE   none authorized — see §8
```

Google's `Message` schema is one shape across received, sent, imported and inserted mail, with no
per-acquisition-mode variation. On that evidence the class is homogeneous — **except for drafts**,
and Google says so directly. The drafts guide states that a draft container "provides a stable ID
because the underlying message IDs change every time the message is replaced", and that on send "the
draft is automatically deleted and a new message with an updated ID is created".

Read structurally that is **replacement, not mutation** — which is what keeps `G-R1` from being
contradicted — but it also means a draft-stage message is a short-lived resource whose id Google
expects to be superseded, and that one human-meaningful email can occupy several message ids across
its composition life. A `DRAFT`-labelled message is nevertheless a real `Message` with a real `id`,
reachable through `messages.get`. So this profile fails closed on the sub-class rather than being
true of received mail and false of drafts.

**The draft exclusion is a scope narrowing, not a repair, and it may not be dropped.** A later
document that describes this profile as covering "Gmail messages" without it has widened the profile
past its evidence.

### 2.1 Canonical identity namespace — `gmail_message`

```text
SourceIdentityNamespace member   gmail_message
generic `gmail` member           REMOVED — not a member of the canonical vocabulary at all
```

Under `SOURCE_RECORD_V1_SEMANTICS.md` §4.3 a provider-level namespace member is a placeholder that
the WorkUnit reviewing that provider **resolves** into resource-scoped members — the way `github`
was resolved into `github_issue` and `github_pull_request` and then ceased to be a member. Gmail is
now reviewed, so `gmail` is resolved the same way: it is removed from `SourceIdentityNamespace`, and
producer-unreachability is guaranteed by non-existence rather than by convention. `ACCEPTED_PROVIDERS`
in `app/lib/domain/source/validateSourceRecord.ts` is typed `Record<SourceIdentityNamespace, true>`,
so the validator's accepted set follows the union at compile time and a record whose `provider` reads
`gmail` is rejected as `invalid_provider`.

Exactly **one** member is added, for exactly one resource class. `gmail_thread`, `gmail_draft` and
`gmail_attachment` are **not** added: no profile reviews those resources, and inventing namespaces for
them would repeat for Gmail the analogy this program refuses.

**The namespace names a key space; the profile names a population inside it, and they are not the
same width.** `gmail_message` is the space Gmail's `Message.id` values are drawn from, and draft-stage
messages draw ids from that same space — which is why the namespace is not split at the draft
boundary. The profile's in-scope population is narrower than the namespace (§2), so a producer that
emitted a record for a draft-stage message under `gmail_message` would be emitting under **no reviewed
profile at all**, not under a permissive one.

No `providerNamespace` field is introduced and no fourth identity component is added. Identity remains
exactly `(tenantId, provider, providerObjectKey)`, and `SourceType` — the application's separate
integration vocabulary, which keeps its own `gmail` member — is untouched.

## 3. Identity profile — `gmail.message.rest.message-id` v1

```text
providerNamespace  gmail.googleapis.com/rest/users.messages
providerObjectKey  the exact hex string of the message resource's `id`, byte-for-byte
composition        NONE — the key is scalar
```

### Why `Message.id`

Google's published field description is:

> "The immutable ID of the message."

That is a direct provider assertion of the exact property `SOURCE_RECORD_V1_SEMANTICS.md` §2
requires, made in the machine-readable contract. GitHub never asserted it for a REST issue or pull
request `id`, which is why `R1` and `P-R1` are unproven in §4.1 and §4.2 of that document. It is the
value Google's own `messages.get`, `messages.modify`, `messages.trash` and `messages.delete` methods
address the message by, so it participates in Google's own identity for the object. It is scalar and
carried as a string, so the byte-for-byte requirement is met with no serialization step.

### Why nothing else, and why no composite

| Candidate | Result | Ground |
| --- | --- | --- |
| mailbox identity + `Message.id` | **NOT ADMISSIBLE** | No admissible mailbox component exists — see below |
| `threadId` + `Message.id` | **REJECTED** | Google's own description is an instruction to the *caller* about supplying it, so it is client-influenced, not provider-issued. No method addresses a message by it, so it does not participate in identity. And it is discriminatively idle: it is shared by every message in the conversation |
| RFC 2822 `Message-ID` header | **REJECTED** | Generated by the sending client, not by Gmail. Google exposes it only as a *search* term in the `messages.list` `q` parameter |
| `historyId` | **REJECTED** | "The ID of the last history record that modified this message" — a change cursor that moves by construction |
| `internalDate` | **REJECTED** | A clock value, and explicitly client-configurable for API-migrated mail |
| `labelIds`, `snippet`, `payload`, `sizeEstimate`, `raw`, `classificationLabelValues` | **REJECTED** | Content or mailbox state, not identity |
| IMAP `X-GM-MSGID` | **NOT A SEPARATE CANDIDATE** | Google states it is the same value in a different base — `G-R6` |

**The composite repair is closed permanently, and that is load-bearing.** A mailbox component would
need to be provider-native and provider-immutable, and the Gmail API exposes none:

- `userId = "me"` resolves against whichever credential made the call — acquisition-credential
  identity, which §2 forbids outright;
- the primary email address is a **mutable display-and-routing value**: administrators rename users,
  addresses change, aliases resolve to one mailbox. §2 forbids mutable or display names as components.
  This is the same defect that disqualified `calendarId` on the Google Calendar route (§9);
- **no immutable Google account or mailbox identifier exists in this API.** The entire `Profile`
  schema is `emailAddress`, `messagesTotal`, `threadsTotal` and `historyId` — a mutable address, two
  counts and a moving cursor. Reaching into a different Google API for a stable subject identifier
  would source an identity component from a different provider contract than the one that issued the
  object, which is not what §2 permits;
- an Atra tenant id is forbidden: it is Atra-minted, and it is already the first element of the
  identity tuple.

So the route rests on `Message.id` alone or it does not exist. **No future evidence about `Message.id`
can reopen the composite**, because there is no admissible second component to pair with it.

### Representation — REST hex, byte-for-byte

Google's IMAP extensions reference states the message ID "is a 64-bit unsigned integer and is the
decimal equivalent for the ID hex string used in the web interface and the Gmail API". The surfaces
agree on the **value** and differ in **base**. §2 forbids every form of normalization and requires the
key be carried byte-for-byte, so this profile binds to exactly one surface's spelling:

```text
REPRESENTATION   the REST API's hex string, exactly as returned, byte-for-byte
FORBIDDEN        the IMAP decimal spelling; any re-basing, zero-padding, case folding,
                 trimming or re-encoding of the hex string
```

Mixing surfaces, or re-basing between them, would produce two distinct canonical keys for one
message. **The representation bound is part of the profile, not a note about it.**

## 4. Identity residual register

```text
G-R1  lifetime immutability        PROVEN     (contract term)
G-R2  uniqueness scope             UNPROVEN   ← load-bearing, unrepairable by composition
G-R3  non-reuse after deletion     UNPROVEN
G-R4  collision guarantee          UNPROVEN
G-R5  provider issuance            UNPROVEN
G-R6  cross-surface equivalence    PROVEN     (contract term)

DISPROVEN = NONE
```

Every unresolved item is unresolved because Google is **silent**, not because Google says otherwise.
That distinction is the whole reason this route reached a different result from Slack and Google
Calendar, where load-bearing properties were contradicted by the providers' own published text.

**`G-R1` — PROVEN, and the grade is deliberate.** "The immutable ID of the message" is an unambiguous
assertion of the property §2 requires, and this program treats a provider's published contract as
provider authority. Two honest qualifications: it is a bare field description Google nowhere
elaborates, and it is a statement about the **contract**, not a behavioural proof. It is bounded by
§2: it holds for the message resource, and it does not mean an email keeps one id across a draft
replacement.

**`G-R2` — UNPROVEN, and it is the one that matters.** Google's `Message.id` description says nothing
whatever about uniqueness. The only Google surface that speaks to scope is the IMAP reference —
"Gmail provides a unique message ID for each email so that a unique message may be identified across
multiple folders" — which asserts uniqueness across *labels, within one mailbox*. Google asserts
nothing wider. The REST path shape `users/{userId}/messages/{id}` is **not** read as evidence:
addressing scope is not identity uniqueness scope, and reading it as one would invent a provider
claim. Because the composite repair is permanently closed, this residual cannot be engineered away —
it can only be **bounded** (§4.1) or closed by Google publishing authority.

**`G-R3`, `G-R4` — UNPROVEN by silence.** Google states no non-reuse guarantee after
`messages.delete` and no collision guarantee for the id space. The IMAP reference bounds the space at
64 bits, which is not a guarantee about allocation within it.

**`G-R5` — UNPROVEN.** Evidence points both ways. Google says the id "is also contained in the result
when a message is inserted or imported", which is what server-side assignment looks like, and neither
method documents a caller-chosen id. But the request body of both is a full `Message`, which has an
`id` property — and Google's discovery document **does** mark fields output-only when it means to
(`CseKeyPair.keyPairId` and others carry `readOnly: true` and an "Output only." prefix). `Message.id`
carries no such flag. Within the very document where Google distinguishes output-only identifiers,
this one is not marked as one. Note also that "immutable ID" does not by itself imply output-only in
this API: `Label.id` is described the same way and is a *required input* to `labels.update`.

**`G-R6` — PROVEN, and genuinely closed.** Google explicitly relates the IMAP, web and API surfaces as
the same value. This is the residual that stays *unproven* for GitHub in both §4.1 (`R5`) and §4.2
(`P-R5`). Its consequence is the representation bound in §3, not a licence to mix surfaces.

**`G-R2`–`G-R5` may not be promoted.** Closing any of them requires Google publishing authority,
reviewed in a separately authorized WorkUnit. Acceptance (§4.1) discharges none of them.

### 4.1 Scoped exception — Gmail Message, identity profile v1, Phase-1 only

```text
decision token  ATRA_PM_P1_2_GMAIL_PHASE1_SCOPED_IDENTITY_EXCEPTION_ACCEPTED
state           PHASE1_SCOPED_ACCEPTED_WITH_UNPROVEN_RESIDUAL
```

**Exact approved scope.** The exception is granted over exactly this and nothing adjacent to it:

```text
RESOURCE_CLASS   Gmail Message
EXCLUDED         draft-stage / DRAFT-labelled messages
MAILBOX_SCOPE    exactly ONE Gmail mailbox
IDENTITY         Message.id alone
REPRESENTATION   Gmail REST API hex string, byte-for-byte
COMPOSITION      none
USE              Phase-1 bounded experimental use only
```

**Why the bound is the substance and not a disclaimer.** `G-R2` is load-bearing and unrepairable, but
its failure mode is specific: a cross-mailbox key collision. Google *has* asserted uniqueness within
one mailbox. A corpus restricted to one mailbox therefore sits entirely inside the guarantee Google
actually made, and the unproven half of `G-R2` is never relied upon. The moment a second mailbox
enters the corpus, the bound is breached and the unproven half becomes load-bearing again. That is a
real and checkable boundary.

**Who accepted it.** The human PM reviewed `G-R1`–`G-R6` and accepted the residual explicitly, as a
product decision to proceed at Phase 1 while knowing what is not known. **Acceptance is not evidence**:
it discharges none of `G-R2`–`G-R5`, and none of them may be rewritten as proven on its strength.

**It did not inherit the GitHub exceptions.** §4.1 and §4.2 of `SOURCE_RECORD_V1_SEMANTICS.md` grant
nothing to any other provider and are no precedent. This is a **third** exception, reviewed on Gmail's
own terms, and it differs from both in kind: GitHub's residual set is dominated by unstated
immutability, Gmail's by unstated uniqueness scope. The two are not the same risk wearing the same
label, and the bound that disposes of Gmail's would do nothing for GitHub's.

**What it is not.** It is not a uniqueness proof, a non-reuse proof, a production identity
certification, an authorization for any other Gmail resource or any second mailbox, an authorization
for live provider reads or credentials, or a precedent any further provider or profile may claim.

**Revisit triggers.** Repository authority reopens this exception on any of:

```text
- a second Gmail mailbox
- another Gmail resource class
- another identity representation
- an identity profile version bump
- a new Google identity authority publication
- evidence contradicting G-R1 or G-R6, or a relied-upon assumption
- persisting, correlating or deduplicating on `providerObjectKey`
  beyond Phase-1 bounded experimental use
- production use beyond Phase 1
```

**Bounded Phase-1 correlation does not reopen it.** The qualifier "beyond bounded Phase-1
experimental use" governs all three verbs in the seventh trigger — persisting, correlating **and**
deduplicating — exactly as ratified for GitHub under `P1_2_DOES_NOT_REOPEN_PHASE1_IDENTITY_EXCEPTIONS`
in `docs/archive/v0/PHASE1_VALUE_GATE_PROGRAM.md`. That citation is historical V0 context
only. The complete current technical boundary is stated here; the archive supplies no
current rule or authority.

## 5. Content-scope profile — `gmail.message.rest.raw-rfc2822-octets` v1

```text
CONTENT_BYTE_DOMAIN   the octets obtained by decoding the `raw` field of the Message returned by
                      users.messages.get with format=RAW, under the decode rule in §5.2
canonicalization      EXACT_PROVIDER_CONTENT_BYTES — identity, no transformation of any kind
contentDigest         sha256:<64 lowercase hex> over exactly those octets
```

Google's own description of the field is a direct assertion of totality:

> "The entire email message in an RFC 2822 formatted and base64url encoded string. Returned in
> `messages.get` and `drafts.get` responses when the `format=RAW` parameter is supplied."

```text
TOTALITY = PROVEN as a contract term
```

The grade is the same one §4 gives `G-R1`, on the same standard: *"The entire email message"* is as
direct an assertion of totality as *"The immutable ID of the message"* is of immutability, and grading
one proven and the other not would be inconsistent. The same two qualifications carry across — a bare
field description, and a statement about the contract rather than a behavioural proof. §7 records what
that leaves open.

RFC 2822 defines a message as a header section followed by a body, so "the entire email message"
covers **headers and body**. MIME carries attachments as body parts *inside* that body, so attachment
octets are inside the byte domain by construction of the format Google names — **with no secondary
fetch**. Google's API shape corroborates this negatively: the externalization path that exists under
`FULL` is `MessagePartBody.attachmentId` plus a separate `messages.attachments.get` call, and
`attachmentId` is reached only through `payload` — which Google states "is not used" under `RAW`.
There is no `attachmentId` to follow.

### 5.1 Why this surface and not the others

| Surface | Result | Ground |
| --- | --- | --- |
| exact HTTP response bytes | **REJECTED** | Transport envelope, and **caller-parameterized**: `prettyPrint` (default `true`), `fields`, `alt` and `callback` each change the response bytes while message content is identical. The digest would be a function of *how Atra called* — the capture path |
| the JSON `Message` resource under `RAW` | **REJECTED** | **Its membership is undocumented.** Google's `RAW` enum states only that body content is in `raw` and "the `payload` field is not used"; it publishes nothing about whether `snippet`, `labelIds`, `historyId`, `internalDate`, `sizeEstimate` or `classificationLabelValues` appear. Determining membership by observing a response would upgrade observation to authority. It also inherits `prettyPrint`/`fields`, and Google publishes no member ordering |
| the base64url `raw` text | **REJECTED** | Base64url is **not injective as text**: padded and unpadded spellings, and a spelling with a non-zero final quantum, are different strings for identical octets. Two captures of byte-identical content could carry different digests, so the `IFF` fails. Google pins no padding discipline and no alphabet anywhere |
| `messages.get(format=full)` | **REJECTED** | **Not total.** Attachment bytes may be absent and reachable only through `messages.attachments.get`, so two messages differing only in attachment bytes could share a digest. Making it total would require composing several responses into an Atra-designed serialization whose injectivity would itself need proving. Independently, `payload` is Google's **parse** of the message, not the message |
| `format=metadata` / `format=minimal` | **REJECTED** | Google: metadata "Returns only email message ID, labels, and email headers"; minimal returns neither headers, body nor payload. Not total, by the provider's own description |
| Gmail's IMAP `RFC822` / `BODY[]` fetch | **NOT SELECTED** | Google publishes **no** statement that the octets IMAP returns are byte-identical to the octets `raw` decodes to. The `G-R6` equivalence is about the *id*, and there is no content counterpart. Surfaces may not be mixed |
| `drafts.get` `raw` | **OUT OF CLASS** | Draft-stage messages are excluded by §2 |

**Why this is the smallest truthful domain.** It excludes every `Message` field that is identity,
mailbox state, provenance or projection (§6), so nothing outside the message is in scope. And nothing
smaller is available: any narrowing would have to select *within* the message, which means parsing
MIME — and every canonicalization considered (MIME parse-and-reserialize, header ordering, charset
folding, line-ending normalization) was rejected on one ground, that each makes the digest a function
of **Atra's parser** rather than of Google's octets. `DETERMINISTIC_CANONICALIZATION_REQUIRED` is
deliberately not returned: the stronger result available here is to need no canonicalization at all.

### 5.2 Transport-decode admissibility rule — fail-closed

Two encoding layers are in play and they belong to different parties:

```text
  the message                    ← the content; the digest's subject
    ↓ base64url                  Google's transport encoding of it, into the `raw` field
  `raw` string
    ↓ JSON + HTTP                Google's transport envelope — rejected surfaces, §5.1
  provider response
    ↓ retention encoding         Atra's own, pinned by the acquisition module
  retained capture
```

The one step between Google's response and the hash function is a lossless transport decode. It is
specified in full here rather than left to an implementer's default, because a default is exactly the
hidden canonicalization gap a proven scope may not have. **All five conditions must hold; if any
fails, acquisition refuses with `provider_content_encoding_inadmissible` and emits no digest:**

1. every character of the `raw` string is in the RFC 4648 §5 URL-safe alphabet — `A`–`Z`, `a`–`z`,
   `0`–`9`, `-`, `_` — with `=` permitted only as trailing padding;
2. `+` and `/` appear nowhere. The standard alphabet is refused even though it is decodable:
   accepting both alphabets would admit two texts for one octet string, reintroducing the rejected
   base64url-as-text defect one layer down;
3. no whitespace, line break or any other character appears anywhere in the string;
4. the string's length modulo 4 is not 1;
5. **the encoding is canonical**: re-encoding the decoded octets, under whichever padding discipline
   the received string itself uses, reproduces that string exactly, byte for byte.

Condition 5 is what catches a non-zero final quantum, which lenient decoders accept in silence.

The rule admits **at most two texts per octet string** — padded and unpadded, and only one where the
octet length is a multiple of three. Both decode to identical octets and therefore produce the **same
digest**: the biconditional survives because the digest's subject sits *below* the encoding. Google
pins neither discipline, so refusing one of them would refuse real messages for a reason Google never
stated.

### 5.3 Why this satisfies B2-P1

`SOURCE_RECORD_V1_SEMANTICS.md` §3 requires, for one provider and one profile version:

```text
equal digest     = byte-identical canonicalized in-scope provider content
different digest = at least one in-scope provider-content byte differs
any in-scope provider-content change must change the digest
```

With identity canonicalization the digest's subject *is* one octet string, so all three statements
reduce to properties of SHA-256 over it. There is no selection step, no serialization step and no
projection step between the provider's content and the hash function in which a change could be lost;
the single intervening step is the lossless, fail-closed decode above.

The digest is never computed over a `NormalizedToolSignal`, an acquisition envelope, a normalized
provider projection, `SourceRecord` fields, the base64url text, the JSON resource, the HTTP response
or any other Atra-side or transport representation.

**Any in-scope content change necessarily changes the digest**, because the scope is the *whole*
message: there is no part of the message outside the digest for a change to hide in. This is why the
absence of a documented content-mutation path (`G-C3`) is recorded but **not relied upon** — it governs
how *often* a digest changes, never whether a change can hide behind an unchanged one.

**What this profile does not claim.** It does not claim the octets are byte-identical to what arrived
over SMTP (`G-C2`) — the scope is defined as the octets the provider returns, and it must never be
described as "the original email". And it is total over the Gmail message, not over what the message
points at: a Drive-hosted attachment or a remote image appears in the octets as a *reference*, and the
referent's bytes are a different provider resource under a different contract. The GitHub profiles
carry the identical boundary for an issue body that links to a file.

Narrowing the scope is a **new profile version**, never an edit to this one. Digests are comparable
only within a version.

## 6. Field classification

Every property Google declares on `Message`, with the digest consequence. There is no third answer.

| Field | Class | Change ⇒ digest changes? |
| --- | --- | --- |
| `id` | **IDENTITY** — it is `providerObjectKey` (§3) | No. Identity is never content |
| `threadId` | **PROJECTION_METADATA** — Gmail-side grouping, client-influenced | No |
| `labelIds` | **PROJECTION_METADATA** — mailbox state | No |
| `snippet` | **PROJECTION_METADATA** — a provider-derived preview of content already wholly in scope | No |
| `historyId` | **PROVENANCE** — a change cursor | No |
| `internalDate` | **PROVENANCE** — a clock value, client-configurable for API-migrated mail | No |
| `sizeEstimate` | **PROJECTION_METADATA** — an estimate, not a count | No |
| `payload` | **PROJECTION_METADATA** — Google's parse; "not used" under `RAW` | No |
| `raw` | **CONTENT** — its decoded octets are the whole scope | **Yes** |
| `classificationLabelValues` | **PROJECTION_METADATA** — Workspace label state | No |
| acquisition ids, `observedAt`, capture path, retained filenames, operator metadata | **OUT_OF_SCOPE** — Atra-side, forbidden as digest subjects | No |

Three consequences, settled without ambiguity:

**Label changes do not change record content.** `labelIds` and `classificationLabelValues` are the only
two fields `messages.modify` writes, and neither is in scope; a label change also moves `historyId`,
which is out of scope too. A message that is read, starred, archived, marked spam, trashed and
untrashed carries one unchanging digest throughout.

**Thread membership changes do not change record content.** `threadId` is out of scope. One adjacent
case must not be confused with it: Gmail's threading criteria read the `References`, `In-Reply-To` and
`Subject` headers, and those headers **are** in scope as part of the octets — but they are headers of
the message, fixed at creation, and Google exposes no operation that rewrites a header on an existing
message. A Gmail-side regrouping moves `threadId` and does not reach the octets. If Google ever did
rewrite a header, the digest would change — correctly, because a header change is a content change.

**Gmail-generated metadata changes do not change record content.** `historyId`, `snippet`,
`sizeEstimate` and `internalDate` are all out of scope.

**No documented content-mutation path exists.** Body and attachment modification are not reachable
through any published operation, and `NO_DOCUMENTED_CONTENT_MUTATION_PATH` rests on three convergent
artifacts and on no assertion by Google: `users.messages` exposes no `update` and no `patch`; `ModifyMessageRequest` has exactly
`addLabelIds`, `removeLabelIds`, `addClassificationLabels` and `removeClassificationLabelIds`, with no
content field; and `history.list`'s `historyTypes` enum is exactly `messageAdded`, `messageDeleted`,
`labelAdded`, `labelRemoved`. The third artifact is the weakest — `History` also carries a generic
`messages` field whose membership Google does not enumerate, and history records expire — so it is
corroboration, never independent proof. Google nowhere states that message content is immutable, and
inference does not upgrade to provider authority. Recorded as `G-C3`.

## 7. Content residual register

```text
G-C1  byte-stability of `raw` across two reads of an unchanged message   UNPROVEN  (silence)
G-C2  byte-identity of `raw` to the octets received over SMTP            UNPROVEN  (silence)
G-C3  absence of a content-mutation path                                 UNPROVEN  (silence),
                                                                                   not load-bearing
G-C4  absence of truncation for large messages                           UNPROVEN  (silence)
G-C5  totality of `raw` over message content                             PROVEN    (contract term)

DISPROVEN = NONE
```

**None of the open items can let a content change hide behind an unchanged digest**, which is why the
content gate is `PROVEN` while the identity gate is not.

**`G-C1`** — if Gmail reconstructs the RFC 2822 stream rather than returning stored octets, two reads
of an unchanged message could differ. That does not falsify B2-P1: the scope is the octets returned at
capture, so different digests would correctly report that the returned octets differed. It means the
digest tracks Gmail's *representation* of the message. The GitHub issue profile records the identical
exposure in identical terms. It does not touch reproducibility: `contentDigest` is recomputed from the
**retained capture**, never from a re-read — re-fetching at verification time is a new observation of a
possibly-changed object and silently converts a non-live capture into an unauthorized live read.

**`G-C4` — the behavioural qualification on `G-C5`.** Google documents no truncation of `raw`, and also
**no exact octet count** that could verify totality: `sizeEstimate` is an estimate by its own
description. The population has documented upper bounds elsewhere — `messages.import` states a 150 MB
maximum and `messages.send` carries a 35 MB media limit — but neither is a statement about what `get`
returns. This is the one open item that could in principle let content sit outside the digest. It is
**bounded, not closed**: a Phase-1 corpus is kept far below any plausible bound, and a later WorkUnit
that acquires a large message inherits `G-C4` as the thing to watch.

## 8. Acquisition requirements

No acquisition exists for Gmail. `ACQUISITION_SCOPE_CHANGE_REQUIRED` stays `YES` for this provider.
This section is the obligation a **separately authorized** acquisition WorkUnit inherits — it is not a
permission, and nothing here authorizes a producer, a capture, a transport, a credential flow or a live
Gmail read.

```text
A1  read only users.messages.get with format=RAW; never format=full, metadata or minimal,
    and never the IMAP surface
A2  retain the provider response verbatim, under a pinned retention encoding, and compute
    contentDigest from the retained capture — never from a re-read
A3  decode `raw` under §5.2, fail-closed with provider_content_encoding_inadmissible
A4  carry the REST hex `id` byte-for-byte as providerObjectKey; no re-basing, no case folding
A5  emit under namespace gmail_message; fail closed on the retained bytes rather than on the
    caller's choice, so the namespace half of identity cannot be asserted by whoever ran the module
A6  refuse DRAFT-labelled messages; refuse a second mailbox
A7  sourceEventAt is NOT resolved by this profile. `internalDate` is documented client-configurable
    for API-migrated mail, so binding it as the provider-stated event time requires its own review.
    Until that review, no field is bound and the value is null
A8  the human-only constraint on conversational content in PHASE1_VALUE_GATE_PROGRAM.md governs
    every mailbox read; message content is not routed through any AI assistant
```

### 8.1 Mutation probe acceptance criteria

Twelve probes over synthetic octets, **specified and not executed** — running them requires a digest
implementation this profile does not authorize. The acquisition WorkUnit inherits this table as its
acceptance criteria.

| # | Probe | Expected |
| --- | --- | --- |
| `M1` | one byte changed in the `Subject` header | **digest changes** |
| `M2` | one byte changed in the body | **digest changes** |
| `M3` | whitespace byte changed (trailing space, `CRLF` ↔ `LF`) | **digest changes** — ratchet against line-ending folding |
| `M4` | MIME boundary string changed | **digest changes** |
| `M5` | one byte changed inside an attachment part | **digest changes** |
| `M6` | any other header added, removed or reordered | **digest changes** |
| `M7` | `labelIds` / `classificationLabelValues` changed, octets identical | **digest unchanged** |
| `M8` | `threadId` changed, octets identical | **digest unchanged** |
| `M9` | acquisition metadata changed — capture id, `observedAt`, retained filename, operator | **digest unchanged** |
| `M10` | octets replaced by a semantically equal, byte-different MIME reserialization | **digest changes** — ratchet proving no canonicalizer was introduced |
| `M11a` | `raw` respelled in the other admissible padding discipline | **digest unchanged** |
| `M11b` | `raw` respelled non-canonically — non-zero final quantum, embedded whitespace, or `+`/`/` | **refused**, `provider_content_encoding_inadmissible`, no digest |
| `M12` | one decoded octet mutated | **digest changes** |

**Non-vacuity is a requirement.** `M7`, `M8`, `M9` and `M11a` assert that a digest does *not* change,
and such a probe passes trivially if its fixtures could never have moved the digest. Each must be
paired with a positive control over the same fixture that *does* change it. Probes must operate on
octets; asserting over filenames or test names satisfies nothing. A probe that cannot fail is
`VACUOUS`, and `VACUOUS` never counts as `DETECTED`.

## 9. Route provenance

Recorded so the second-provider route is auditable and so a rejected route is not immediately
rediscovered. This is the finding, not the investigation.

**Google Calendar — ROUTE REJECTED.** Calendar events were examined first as the candidate second
provider and the route was rejected on Google's own published text, not on preference. The
determinative ground is that Calendar's identity route requires a `calendarId` component, and
`calendarId` is an **email address** — a mutable display-and-routing value that
`SOURCE_RECORD_V1_SEMANTICS.md` §2 forbids as an identity component; and Google **documents** that
callers may supply event ids. Residuals there were `DISPROVEN` by Google's text rather than left
unproven by silence, which is why that route was not exception-eligible and this one is. The Google
Calendar gates stay `REQUIRED_UNPROVEN` and are not moved by this document.

**Gmail is not "the Google route".** The two share nothing but a vendor. Nothing in the Calendar
rejection is evidence about Gmail, and nothing in this profile repairs or reopens Calendar.

**Slack** was examined separately and reached neither gate; nothing about it is load-bearing for this
profile, and it is not restated here.

## 10. Claim ceiling

This profile authorizes **nothing to run**. It is repository authority over vocabulary and profile
status, and its ceiling is stated so that no reader mistakes a reviewed profile for a capability:

- it authorizes no acquisition, producer, adapter, capture, transport, persistence, credential flow or
  live Gmail read, and adds no dataset, no gold label and no `CorrelationGroupV1`;
- it does not execute the probes in §8.1 and does not claim their expected column has been observed;
- it does not promote `G-R2`–`G-R5` or `G-C1`–`G-C4`, and acceptance is not evidence for any of them;
- it does not satisfy `N2` or `N3`, and it does not make `P1-2` ready. `N2` requires a frozen
  admissible dataset and `N3` requires two independent providers **represented in that dataset**; no
  dataset exists;
- it does not by itself satisfy `N4`. `N4` is quantified over the providers represented in the
  dataset, and with no frozen dataset there is no provider set to quantify over. What it establishes
  is narrower and exact: the **dataset-provider profile prerequisite is satisfiable** for the selected
  GitHub + Gmail route, because both providers now hold a reviewed profile pair at the required
  standard;
- it says nothing about any other Gmail resource, any other Google product, or any other provider.
