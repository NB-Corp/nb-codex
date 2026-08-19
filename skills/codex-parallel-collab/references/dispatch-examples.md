# Dispatch Examples

These are compact patterns, not a mandatory file format. Tool schemas vary; use
the equivalent exposed fields while preserving named ownership and isolation.

## Single critical blocker

Delegate a coherent root-cause investigation to `think` (or a narrower
maintained custom role), with `agent_type` explicit and `fork_turns="none"`. The root
then enters coordination-only waiting. It does not reproduce the bug hunt while
the owner runs, even if one `wait_agent` call times out.

## Complex vertical slice

Assign one high-capability implementation role the complete contract for an
independently verifiable subsystem: investigate the existing paths, implement
the behavior, repair focused failures, and run directly affected proof. The
root keeps requirements and acceptance authority but does not retain personal
code-writing ownership of the critical path.

## Disjoint implementation DAG

```text
api_contract  implement  writes src/api/**       depends none
ui_consumer   implement  writes src/ui/**        depends api_contract receipt
docs          implement  writes docs/feature.md  depends api_contract receipt
integrate     implement  writes shared registry depends ui_consumer, docs
review        check      writes NONE             depends integrate receipt
```

Only ready nodes run. If the UI and docs can consume the accepted contract
independently, they may run together. The `integrate` owner starts after their
overlapping ownership ends, alone edits the shared registry, and runs directly
affected integration proof. The root remains coordination-only through that
receipt. The single `review` node covers the integrated coherent milestone;
do not add a checker for each leaf unless the always-loaded verification kernel
admits separate review for genuinely independent risk domains.

## Broad exploration, narrow writes

Dispatch `explore` for separate unfamiliar-codebase questions; it is a
maintained custom role, not a required architectural stage. Each lease returns
paths, symbols, facts, inferences, and risks.
After the parent chooses the direction, assign one coherent write owner; do not
ask explorers to edit and do not reread their full search trail.

## Context-cost routing

Keep a three-line local edit inline. Delegate a large coherent implementation
when specialization, context isolation, or parallel readiness repays the fixed
briefing, repository-read, verification, and integration cost. Prefer one
capable owner over five file-based leaves.

## Material frame audit

Before committing to a costly repository-wide rewrite, the parent notices that
its proposed scope comes from an inferred diagnosis rather than an explicit
user outcome. It dispatches `critic` once with the exact relevant user
excerpts, the proposed frame labeled as provisional, primary repository
anchors, and the decision boundary. The brief asks for an evidence-grounded
verdict rather than disagreement. The parent adopts a supported revision,
rejects it with counterevidence, or opens a user decision door.

Do not add this node because the rewrite is large, slow, at a candidate
boundary, or already has a checker. Do not dispatch another critic for the same unchanged frame; reuse the
first runtime thread only when new evidence arrives inside its warm, causally
adjacent lease. If that thread is stale, a same-role successor continues from
the prior report rather than supplying another independent vote.

## Warm reviewer repair loop

`check` reports `F1` against the API candidate owned by
`api_contract`. Use `followup_task` on the original implementation owner with
`F1`, its anchor, and the accepted contract. After its focused repair receipt,
use `followup_task` on the same checker to recheck `F1`. The root does not patch
the defect or launch a replacement reviewer for convenience. Both runtime
threads remain warm because the candidate, contract, and immediate repair loop
are unchanged.

## Expired owner successor

The same API area receives a later milestone after the earlier candidate was
accepted, integrated, and followed by unrelated work. Do not revive the old
implementation thread merely because it knows the files. Spawn the same named
implementation role as a successor with the logical node, current candidate,
predecessor receipt, current diff/contracts, still-valid evidence, and exact
remaining work. The predecessor is not marked failed, and the successor does
not replay its successful checks.

If `F1` instead returns after the reviewer thread has become context-pressured,
spawn a reviewer successor with `F1`, the original review receipt, repair diff,
and invalidated proof. It performs a focused continuation recheck, not a new
full review or second opinion.

## Missing role and near-miss

If a preferred maintained custom role is unavailable, use another maintained
custom role only if its declared capabilities, permissions, and topology
position fit the node. Otherwise report the capability gap or keep a genuinely
small change inline. Never use the built-in `default`, `explorer`, or `worker`
types as fallback and never reconstruct one through prose. A one-line config
edit, three sequential migrations, or several files owned by one invariant are
not parallel DAGs merely because multiple threads are available.
