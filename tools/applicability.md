# Requirements applicability index v1

Source scope: retained W20 in [Architecture #11](https://github.com/agentic-delivery-lab/agentic-delivery-architecture/issues/11).

`buildApplicabilityIndex(directory, pin)` in `validate-requirements.mjs` derives
an ID/reference index from an approved immutable Requirements baseline. The
caller supplies a trusted local Git object source and an admitted pin:

```js
{
  repository: 'agentic-delivery-lab/agentic-delivery-requirements',
  repositoryId: 1416207421,
  commit: '<40-character commit object ID>',
  version: '<exact baseline version>',
  contentSha256: '<64-character authoritative content digest>'
}
```

The result has `schemaVersion: 1`, an `authority` containing those fields plus
the baseline's prepared `sourceCommit`, and `repositories`. Each repository
entry contains its native `repositoryId`, sorted applicable `scopeIds`, and
sorted `requirements` references `{ id, catalogPath, scopeIds }`. Reference
scope IDs are the intersection that explains applicability for that consumer.
Only approved records are selected. Statements and satisfaction claims stay
in the canonical catalog. Repository IDs, scope IDs and record IDs have stable
ordering; output contains no current timestamps or mutable branch names.

`selectApplicableRequirements(directory, pin, repositoryId)` revalidates that
same baseline and returns `{ schemaVersion, authority, repositoryId, scopeIds,
requirements }`. An unknown consumer throws rather than inheriting factory or
shared scope. Invalid pins, unapproved baselines, unknown scopes, incomplete
catalog coverage and digest mismatches also throw. A consumer must hold on
these errors. Selection alone grants no execution authority.

Inputs are read from the pinned commit, including when the working tree or
HEAD differs. Replacement refs and lazy object fetching are disabled using
stock Git's `--no-replace-objects` and `--no-lazy-fetch` options. Git versions
without these options fail explicitly. The admitted tooling module and its
v1 schemas remain separate trusted inputs; the caller must pin them, verify
hosting repository identity and establish baseline adoption. Issue or Project
content must not select tooling, the authority pin or a consumer identity.

This source increment leaves the accepted normative baseline unchanged.
Control Plane #106's approved Architecture-context gate and participant/profile
admission still apply before runtime integration. Rollback reverts these
functions and their callers while retaining the approved baseline and explicit
references. Synthetic multi-scope tests do not identify or enroll a product.
