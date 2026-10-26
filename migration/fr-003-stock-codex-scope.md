# FR-003 stock-Codex scope correction

The owner withdrew the universal 100-tool ceiling on 21 October 2026. The
22 October delegated keep/drop disposition also withdrew an operation-wide
eight-native-transport-attempt ceiling. Those limits were still present in
proposed FR-003 after their implementation and canonical claims were removed.
This correction reconciles that proposal with the existing source decisions.

Sources:

- [Control Plane #105](https://github.com/agentic-delivery-lab/agentic-delivery/issues/105)
  records both withdrawals and the retained operation controls.
- [Canonical ADR-0009 at the reviewed Architecture source](https://github.com/agentic-delivery-lab/agentic-delivery-architecture/blob/59df514a3a6dc8a75b79b3fc75fe61aae4e6fdf3/decisions/0009-run-codex-from-source-issues-with-a-budget-boundary.md)
  distinguishes eight controller attempts from unsupported aggregate internal
  transport attempts. Stock provider retries bound an individual failed
  request or reconnection; they do not supply an operation-wide counter.
- [Architecture #11](https://github.com/agentic-delivery-lab/agentic-delivery-architecture/issues/11)
  is the existing W03/W08 remediation authority. The closed Requirements #3
  import remains historical provenance and is not reopened.

FR-003 remains proposed and unverified. Its stable ID, scope, owner and original
import provenance are unchanged. It retains shared consumption, 30 active
minutes, eight model turns, three validation attempts, at most eight controller
attempts, no child implementation and no automatic billing/account/model
fallback. These are proposed acceptance limits until policy and runtime
admission. Unknown tool/transport telemetry remains unknown. No fork, patched
upstream, proxy, provider switch or fabricated counter replaces the withdrawn
requirements.

Baseline 1.0.1 selects the same 18 approved QR IDs and byte-equivalent QR
records as historical 1.0.0. Approving the new baseline container does not
approve FR-003 or any other proposed FR. Historical approved baseline
`9ce017453a23240042f72214b09e3c6c5059854d` and its source/digest remain
immutable and usable by existing consumers. Consumer adoption is separate.

Provenance is prepared first as a committed draft using `pnpm baseline:prepare`.
The approved candidate records the owner-authorized interactive operator under
[ADR-0018 W02](https://github.com/agentic-delivery-lab/agentic-delivery-architecture/blob/59df514a3a6dc8a75b79b3fc75fe61aae4e6fdf3/decisions/0018-organization-wide-agentic-delivery-control-plane-distribution-and-versioning.md#development-phase-authority-amendment-w02).
Approval metadata is committed before the final source/digest binding is
computed with the existing exported content-digest function. The draft-only
prepare command remains unchanged; no schema or approval guard is weakened.
The branch's approved candidate is provisional until reviewed and merged.
Separate review and validation are not independent human approval or runtime
admission.

Rollback selects the historical 1.0.0 baseline with its exact immutable pin.
It does not reinstate either withdrawn ceiling or authorize a runtime action.
