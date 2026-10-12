# Requirements Authority

Own approved factory, shared and product requirements, normative QR scenarios,
explicit applicability and immutable baselines. Architecture owns organizational
ADRs, mission, strategy, principles, domain contexts and canonical models.
Product repositories own implementation specifications and evidence.

Preserve stable IDs and immutable historical provenance. Generated drafts are
not normative. Approval and observed satisfaction are separate facts. Public
content must contain no credentials, private evidence or unsuitable product
material. Do not widen execution authority or change Control Plane enrollment.

Run `pnpm requirements:check` and `pnpm test` before proposing a PR. Prepare
baseline provenance with `pnpm baseline:prepare` after committing the candidate
source. Acceptance records name the actor, authority, exact head/baseline,
validation, evidence limits and rollback. ADR-0018 W02 permits the named
interactive operator delegation; self-hosted runner agents receive none.
