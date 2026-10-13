# Agentic Delivery Requirements Authority

This public repository is the selected central authority for approved factory,
shared and product requirements. [ADR-0024](https://github.com/agentic-delivery-lab/agentic-delivery-architecture/blob/a2189d491a65e643033ed193e834dde872277474/decisions/0024-centralize-approved-requirements-in-requirements-authority.md)
in Architecture owns the authority placement decision. This repository's
immutable GitHub ID is `1416207421`. Source work is tracked by [Requirements #1](https://github.com/agentic-delivery-lab/agentic-delivery-requirements/issues/1). The first W03 baseline was an empty administrative draft. W04 transfers all
18 QR IDs with their exact historical text, status and evidence, and adds five
inferred execution candidates (FR-001–FR-005). Candidate records are not
normative, and numerical resource bounds remain proposed pending W08 admission.

An approved W04 baseline is eligible for authority transfer, not automatically
adopted by every consumer. Effective QR ownership changes only when Architecture
accepts an exact immutable Requirements baseline pin and makes its local QR
catalog a checked projection. Until that acceptance, Architecture retains the
normative source and the transferred copies are non-effective for QR authority.
At cutover, there is one editable normative catalog here; old source commits
and the non-normative migration fixture preserve historical provenance. No
strategy goal, runtime participant or actual quality outcome is adopted through
this transfer. Trusted consumers must verify the selected authority/adoption
pin as well as approved status, origin, digest and explicit applicability.

Records contain stable ID, owner, explicit scope IDs, statement, immutable source
provenance and verification criterion. `proposed`, `approved` and `withdrawn`
record status is separate from `unverified`, `partial` and `verified` evidence.
An approved record has attributable acceptance metadata. The validator checks
metadata and integrity; it does not authenticate the approving actor or prove
live satisfaction. Trusted Control Plane admission validates that authority.

`requirements/scopes.yml` registers explicit repository-ID applicability.
Names can change without changing identity. Unknown scopes fail validation;
unknown repository applicability must hold a consumer rather than infer a
shared scope. Product catalogs belong under `requirements/products/`, require
real ownership, rights and public suitability, and reference existing source
Issues. No product requirements are inferred from Project text or model output.

The baseline manifest binds repository identity, version, exact source commit,
content digest, authority decision, catalog coverage and the exact sorted set
of approved record IDs. A draft or withdrawn baseline cannot be admitted as
normative. Consumers must use `--approved` plus their trusted repository ID,
pin and authority checks; a green default catalog check is not activation.

Run `pnpm install --frozen-lockfile`, `pnpm requirements:check`, and `pnpm test`.
After a source commit, `pnpm baseline:prepare` updates only the mutually
referential source/digest fields; it cannot approve records or the baseline.
Commit that projection, rerun checks on changed content, and propose a PR.
The digest covers AGENTS.md, README.md, requirements/, contracts/ and manifests/,
normalizing only the top-level sourceCommit and contentSha256 values in
the release manifest, then encoding that manifest as JSON. Nested authority
pins remain covered.
It reproduces from both the exact source commit and candidate working tree.

Schemas are closed Draft 2020-12 contracts. YAML uses strict core 1.2 with
unique keys, no custom tags or alias expansion. Dependencies reuse the pinned
Architecture versions. CI uses read-only credentials and performs no execution,
Issue mutation, publication or enrollment. Source provenance is immutable
metadata; QR transfer reproduction is separately verified in W04.

Rollback selects a previous supported accepted baseline and its reference-only
projections, preserving history and avoiding two normative catalogs. Unsuitable
public product content is held for an explicit visibility decision; there is
no implicit private mirror. Owner and delegated operator acceptance is recorded
accurately and is not described as independent human review.
