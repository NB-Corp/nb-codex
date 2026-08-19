# Verification Edge Protocols

`AGENTS.md` is the authority for the routine **Work → Candidate Verdict → External-or-Irreversible Action** boundaries, the four-condition material gate, independent-oracle provenance, checker admission, scoped invalidation, and exact-byte limits on hashes. This policy owns only edge cases involving action eligibility, high-risk boundaries, disputed evidence, disposable-smoke contamination, and admitted broad or release gates.

## Current-Action Eligibility

Scope evidence to the claim and action being advanced now. Candidate maturity says **when** evidence is due; named risk surfaces say **which** evidence matters and can narrow the action. A downstream gap narrows downstream readiness, not earlier reversible work.

A clearly isolated, reversible internal reference or disposable effect smoke needs enough evidence to interpret its result and stay inside current safety, authority, confidentiality, contamination, cost, and asset-use bounds. Intended-use provenance, protocol, durable retention, and final-review evidence become due only when the result trains, enters, promotes, distributes, or authorizes a reusable candidate.

Missing or conflicting metadata is uncertainty, not automatic permission or prohibition. Stop only the action that an explicit rule forbids, crosses safety, security, protected-data, confidentiality, or authority boundaries, irreversibly contaminates later evidence or artifacts, or has unauthorized material cost or irreversibility. Record a narrower readiness claim rather than converting an unrelated downstream gap into a universal blocker.

### Licensing Door

Do not pause reversible internal analysis, reference use, or a disposable smoke for a license search unless an explicit restriction directly governs that action. Licensing becomes decision-relevant when the current action incorporates third-party material into a commercial product, public distribution, or final submission.

When `LICENSE` is absent, use an explicit declaration from the official repository, model card, or package metadata. If declarations conflict, prefer the current official repository declaration; otherwise use the interpretation most favorable to the current work while keeping the conclusion scoped to the asset and action actually governed.

### Contamination Door

Before a disposable run that can alter shared state, caches, training data, evaluation gold, user-visible defaults, or later provenance, isolate it in a disposable root or declare the exact cleanup and evidence boundary. A smoke ceases to be disposable when its outputs are retained, compared as a candidate, or consumed downstream; from that point it must satisfy the corresponding Candidate Verdict evidence.

## Risk-Scoped Evidence

File and line counts are hints only. Use the current claim and failure surface:

| Risk surface | Decision-relevant evidence |
| --- | --- |
| Isolated prose or task notes | Format, references, and a reader-relevant semantic check |
| Shared workflow, specification, or governance | Cross-layer consistency, representative positive and counterexample scenarios, and independent judgment only if it can change the verdict |
| One provider adapter or local command | Targeted contract tests, one real success path, and the highest-risk applicable failure path |
| Persistent state, authority, receipt, freshness, or compatibility migration | Focused invariants, affected package contract, exact prior/current state, and a boundary smoke |
| Cross-system schema or shared contract | Producer and consumer contract evidence plus exact compatibility or closure proof |
| Dependency or build configuration | Affected type/build path and directly dependent tests |
| Publish, deploy, real install, destructive mutation, or schema migration | Exact final candidate, every admitted gate that governs the action, a representative real flow, and explicit action authorization |

Projects may add named risks and standing gates, but listing a command does not make it authoritative. Apply the four-condition material gate from `AGENTS.md` at the actual decision boundary.

## Oracle Provenance And Reusable Receipts

For each material evidence item, record enough to answer:

- **Producer:** which tool, test harness, source, reviewer, or human emitted the signal;
- **Candidate and inputs:** the exact diff, artifact, fixture, selector, environment, and relevant version;
- **Independent oracle:** where the expected result came from and why it does not merely repeat the implementation or candidate wording;
- **Claim boundary:** the named behavior or risk it discriminates, and what it cannot establish;
- **Outcome and freshness:** result, timestamp or revision only when a consumer uses it, and edits that would invalidate it.

An oracle may be an external protocol, canonical schema, independently authored invariant, adversarial fixture, consumer behavior, or scoped reviewer judgment. A test that computes expected output through the same implementation path is not independent. Snapshot or golden prose created from the current output proves only regression against itself unless an independent contract owns that expected text. Test count and command success never replace this provenance.

A task report, check report, handoff, or agent receipt is reusable when it identifies the candidate, claims, risks, producer/oracle, exact checks and outcomes, skipped evidence, review verdict when applicable, and residual risks; its report agrees with the visible diff; and no later edit intersects what it proves. Do not create a duplicate form or replay successful commands for reassurance.

When freshness is disputed, inspect the evidence's declared inputs and the current diff. Re-run only if a changed input, environment, generator, contract, or risk surface can alter the signal. Exact hash equality may establish byte freshness only when bytes are the declared boundary; it does not settle semantic freshness.

## Independent Review Door

The checker rule in `AGENTS.md` controls admission. Independent review supplies orthogonal judgment; it is not another test runner and has no automatic place in a lifecycle. Typical decision-relevant gaps include:

- an uncovered authority, persistence, security, cross-system, or shared-governance claim;
- missing, contradictory, or non-independent oracle provenance for the current verdict;
- a named high-risk semantic gap that deterministic checks cannot settle; or
- combined work from multiple owners where shared meaning changed during integration.

Do not dispatch because work is large, long, high-effort, multi-file, produced by an agent, or at an external boundary by label alone. Do not dispatch per file, leaf, checkbox, turn, focused repair, or to verify another checker. A canonical CLI's schema/status/check output plus exact diff and named invariant assertions may fully decide a deterministic persistence or registry claim; review is still needed if that evidence is ambiguous or independent judgment can change the verdict.

Give one checker one coherent candidate: neutral goal and contracts, final diff or exact artifact, existing evidence receipt with provenance, read/write authority, and findings-first output. Default to read-only. The checker may reuse trustworthy mechanical evidence and runs another command only to fill a missing, contradictory, stale, or finding-specific gap. Findings cite the governing contract and path. A clean candidate-bound report needs neither a second checker nor duplicate broad commands.

## Invalidation, Repair, And Broad Gates

Later edits invalidate only evidence they can affect:

- docs-only changes do not invalidate runtime tests unless those docs are an executable or generated contract;
- focused code repairs invalidate related tests and any type/build evidence whose contract changed;
- shared schema, dependency, generator source, build configuration, or integration edits invalidate their producer/consumer evidence;
- evidence for an External-or-Irreversible Action must match the exact final candidate.

After a broad command fails, repair with focused checks, then rerun that failed command and directly invalidated companions only. A repeated successful broad command requires a concrete invalidation reason. Use a package-wide, workspace-wide, or release command only when the current verdict consumes its signal and the gate passes all four material conditions; there is no fixed pre-commit suite.

Prefer disposable roots over the real user home for routine verification. When a failure lies outside the current action, record it and narrow readiness rather than stopping permitted reversible work. Reviewer repairs follow the ownership routing in `policies/collaboration.md`.

## Exact Bytes, Mutable Sources, And Generated Projections

Use a hash only for destructive allowlists, compare-and-swap or prior-value ownership, content-addressed retention/cache lookup, declared byte freshness, or exact release/external-artifact reproduction. One authority computes the fingerprint and consumers reference it. Do not maintain per-run global hash tables, duplicate an identity already owned by a revision, or add hashes for reassurance.

A matching hash proves only matching bytes. It never proves semantic correctness, citation support, locator accuracy, claim truth, status, blockers, intent, or readiness. Receipts still need a trusted producer, domain and selector identity, declared inputs, independent oracle, and outcome.

Active authoring sources are mutable. Generated prompts and other build artifacts are reproducible projections whose identity is established by their generator and source inputs; source/projection byte agreement proves reproduction, not prompt quality or behavior. Only content-addressed or explicitly frozen release inputs become immutable boundaries.
