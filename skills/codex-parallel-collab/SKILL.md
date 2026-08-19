---
name: codex-parallel-collab
description: Coordinate Codex subagents with named role ownership, proactive capability-aware delegation, integration ownership, wait-state discipline, and reviewer repair loops. Use when the user asks for parallel agents, multi-agent collaboration, delegated implementation, or an ownership DAG, or when substantial work benefits from a coherent delegated owner, parallel leaves, context isolation, specialization, or independent evidence. Do not use for a small edit merely because it touches several files.
metadata:
  short-description: Coordinate named Codex owners without shadow work
---

# Codex Parallel Collaboration

Use this skill for the **method and tools** of collaboration. The always-loaded global instruction kernel already decides routine ownership and verification; do not restate or reinterpret that governance here. Load `policies/collaboration.md` only for its named edge doors and `policies/verification.md` only for its named risk/evidence doors.

## 1. Map The Ownership Graph

Start from the requested outcome and current repository evidence. Inspect relevant project rules, `git status --short`, existing diffs, shared registries or generated mirrors, and the minimum code/docs needed to identify coherent responsibilities.

Write a compact graph before dispatch when more than one node exists:

```text
node              owner       writes             depends             closing evidence
api_contract      implement   src/api/**         none                focused contract tests
ui_consumer       implement   src/ui/**          api_contract        consumer scenario
integration       implement   shared registry    api, ui receipts    affected integration proof
```

Nodes represent independently verifiable responsibilities, not files. Mark shared sources and the integration owner explicitly. Only ready nodes with disjoint writes may run together. Keep a single coherent vertical slice with one capable owner when splitting would create repeated context or ambiguous assembly.

## 2. Select A Capability

Use the maintained role permitted by the current global topology:

| Need | Role |
| --- | --- |
| Bounded unfamiliar-code ownership map | `explore` |
| Coherent repository implementation or integration | `implement` |
| Difficult architecture, root cause, or safety-sensitive problem ownership | `think` |
| Material frame audit at the collaboration-policy door | `critic` |
| Conditional retrieval and synthesis | `research` |
| Exact finite local transformation allowed by its profile | `worker_lite` |
| Independent candidate judgment admitted by the verification kernel | `check` |
| Scientific inquiry, experiment, literature, manuscript, or review | matching `science_*` role |

Read the installed role profile when capability, sandbox, write authority, or child allowlist is uncertain. Let the profile supply model, reasoning, sandbox, and tools unless the user or project contract explicitly requires an override.

## 3. Dispatch With The Inline Brief

Ordinary dispatch needs no separate reference read. Put this minimal contract directly in the tool call:

```text
Purpose: <one bounded outcome>
Depends on: <accepted inputs/receipts or none>
Owner: <agent_type>
Edit allowlist: <soft behavioral paths or NONE>
Read / write / forbidden scope: <clear boundaries>
Inputs and decisions: <only current authoritative context>
Side effects: <allowed commands and forbidden external actions>
Acceptance: <observable facts>
Verification: <focused evidence this node owns>
Receipt: <follow the parent-internal AGENTS receipt contract; add only node-specific fields>
Stop: <completion, blocked decision, or safe handoff condition>
```

For a public-artifact node, identify the deliverable separately from private execution context and route `Acceptance` to the runtime system prompt's `Public-Facing Content`; no brief or receipt field is artifact-ready prose.

Use a stable lowercase `task_name`, explicit `agent_type`, and `fork_turns="none"` when available. The brief must be self-contained; do not pass raw conversation history or a desired conclusion. Reference accepted prior work and include only accepted fields that can change the current decision instead of pasting narrative receipt bodies or asking the child to rediscover them.

For `spawn_agent`, dispatch all currently ready disjoint nodes, then record their returned canonical task names. For related evidence after a dispatch, use `send_message`; it does not start a new turn. Use `followup_task` only for a warm, causally adjacent continuation allowed by the owner-lease edge protocol.

## 4. Coordinate Without Re-Execution

After dispatch, keep a small ledger:

```text
node | canonical agent path | state | dependency result | owned paths
```

Use `wait_agent` with a practical timeout measured as a polling interval, not an execution deadline. When a receipt arrives:

1. confirm the parent-internal receipt satisfies the applicable AGENTS contract;
2. compare its claimed scope with the declared ownership boundary;
3. record residual risks and which evidence remains reusable;
4. dispatch newly unblocked, non-overlapping nodes; and
5. continue waiting if active dependencies remain.

Use `list_agents` only for a real liveness or ownership question, not routine polling. For steering, takeover, interruption, or a beyond-node delta, stop and follow the collaboration policy's matching edge protocol rather than improvising with tools.

## 5. Integrate Shared Sources Once

When a DAG converges, give the declared integration owner the accepted leaf receipts, current shared-file diff, generated-mirror obligations, unresolved mechanical conflicts, and directly affected proof. The integration node should:

- assemble only after overlapping leaf ownership ends;
- preserve unrelated work and accepted semantic choices;
- repair cross-slice mechanics inside its boundary;
- regenerate only affected projections; and
- run proof invalidated by assembly rather than replaying every leaf check.

The integration receipt is the candidate receipt used for the next verdict. Root evaluates that receipt and the visible boundary; it does not redo the integration node.

## 6. Admit Review Only When It Can Change The Verdict

Apply the checker rule already resident in the global instruction kernel. If admitted, send one neutral coherent candidate: goal/contracts, exact final diff or artifact, existing evidence with independent-oracle provenance, residual gaps, and a findings-first report contract. Do not encode an expected verdict.

Route accepted stable finding IDs back to the implementation-owner lineage with the governing anchor, decision-relevant evidence, task facts to preserve, proof state, and acceptance. Finding prose is not reader-facing replacement copy. For the immediate repair/recheck loop, use the collaboration policy and the extended packet reference below. Do not make root-side semantic repairs or create another full review.

## 7. Route Only Extended Edge Packets

Read [`references/subtask-contract.md`](references/subtask-contract.md) only for:

- a `critic` frame-audit packet;
- an expired runtime lease and same-role successor packet; or
- a checker finding repair / focused recheck packet.

Read [`references/dispatch-examples.md`](references/dispatch-examples.md) when a multi-role DAG, shared-file integration, or tool-level wait/repair sequence remains unclear. These references are examples and packets, not governance authorities.

## 8. Finish From Receipts

Before returning control to root, ensure every required node is terminal, shared ownership is closed, accepted findings are resolved or explicit, and the integration receipt satisfies the common AGENTS contract plus any integration-specific delta.

Do not commit, push, publish, install, or perform another external side effect unless the root brief explicitly grants that exact action.
