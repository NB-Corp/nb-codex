# Dispatch Examples

These are compact patterns, not a mandatory file format. Tool schemas vary; use
the equivalent exposed fields while preserving named ownership and isolation.

## Single critical blocker

Root may own a coherent root-cause investigation directly or delegate it to
`implement` when separation is useful. Use `think` for one difficult unknown
that blocks that owner, with enough evidence to solve the question and a clear
handoff. Think remains a leaf; small reversible scratch experiments are allowed
unless the dispatch is explicitly read-only or pure reasoning. Root continues
the user conversation and independent work without duplicating the leased investigation.

## Complex vertical slice

Assign one high-capability implementation role the complete contract for an
independently verifiable subsystem: investigate the existing paths, implement
the behavior, repair focused failures, and run directly affected proof. The
root keeps requirements and acceptance authority but does not retain personal
code-writing ownership of the critical path.

## Disjoint implementation DAG

```text
api_contract  implement    writes src/api/**       depends none
ui_consumer   implement    writes src/ui/**        depends api_contract receipt
docs          implement    writes docs/feature.md  depends api_contract receipt
integrate     implement    writes shared registry depends ui_consumer, docs
review        reviewer     writes NONE             depends integrate receipt
```

The implementation nodes use distinct `implement` instances. If the UI and docs can consume the accepted contract independently, they may run together. The `integrate` owner starts after their
overlapping ownership ends, alone edits the shared registry, and runs directly
affected integration proof. Root retains user communication and avoids overlapping
implementation through that receipt. An admitted `review` node covers the integrated milestone;
do not add a review seat for each leaf unless the always-loaded verification kernel
admits separate review for genuinely independent risk domains.

## Broad exploration, narrow writes

Dispatch `explore` for separate unfamiliar-codebase questions; it is a
maintained custom role, not a required architectural stage. Each lease returns
paths, symbols, facts, inferences, and risks.
After the parent chooses the direction, assign one coherent write owner; do not
ask explorers to edit and do not reread their full search trail.

## Context-cost routing

Keep a bounded local edit inline when its result can be checked directly. Root
can also own complex coherent work with well-loaded context. Delegate an implementation
when specialization, context isolation, or parallel readiness repays the fixed
briefing, repository-read, verification, and integration cost. Prefer one
capable owner over five file-based leaves.

## Frame doubt before a costly rewrite

Before committing to a costly rewrite whose scope comes from an inferred
diagnosis, dispatch `reviewer` in frame mode: exact user intent,
the proposed frame labeled provisional, and the decision that audit may
change. Use a fresh instance for a later independent candidate review. Adopt a supported revision,
reject it with counterevidence, or open a user decision door.

## Warm review repair loop

`reviewer` reports `F1` against the API candidate owned by
`api_contract`. Use `followup_task` on the original implementation owner with
`F1`, its anchor, and the accepted contract. After its focused repair receipt,
use `followup_task` on the same review seat to recheck `F1`. The root does not patch
the defect or launch a replacement review for convenience. Both runtime
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

If `F1` instead returns after the review thread has become context-pressured,
spawn a review successor with `F1`, the original review receipt, repair diff,
and invalidated proof. It performs a focused continuation recheck, not a new
full review or second opinion.

## Missing role and near-miss

If a preferred maintained custom role is unavailable, use another maintained
custom role only if its declared capabilities, permissions, and topology
position fit the node. Otherwise report the capability gap or let root handle
the work inside its authority. Never use the built-in `default`, `explorer`, or `worker`
types as fallback and never reconstruct one through prose. A one-line config
edit, three sequential migrations, or several files owned by one invariant are
not parallel DAGs merely because multiple threads are available.
