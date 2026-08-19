# Codex agent profile design

Use this reference to decide what belongs in a custom-agent TOML and whether an
existing profile is complete. Apply the questions selectively; do not turn them
into a form that every task must persist.

## Evidence hierarchy

1. The current Codex host and its strict configuration parser establish what
   the installed runtime accepts.
2. Current official Codex Subagents documentation establishes the supported
   public contract. The format is a configuration layer and may evolve.
3. The owning repository's canonical templates, tests, manifests, and working
   installed profiles establish local conventions and projections.
4. Frozen prompt guidance and prior profiles provide design evidence, not
   fields to copy blindly.

When these disagree, preserve the known-working source, identify the version
boundary, and test the smallest change. Do not silently merge incompatible V1,
V2, global, project, or generator conventions.

## Instruction ownership

| Concern | Primary owner | Profile behavior |
| --- | --- | --- |
| Universal safety, authorization, and engineering invariants | system/developer prompt | Do not reproduce the full policy. Keep only a narrow role projection when behavior would otherwise drift. |
| Maintained-role eligibility, routine spawn timing, finite topology, and ownership | global `AGENTS.md` routine kernel | The profile describes what the role does after selection and declares only its allowed child set; it does not admit itself or decide when to spawn. Collaboration policy applies only at its named edge protocols. |
| Project task state, current paths, acceptance criteria, and write scope | parent dispatch and project artifacts | State how to interpret the dispatch and stop when essential context is absent; do not bake a current task into the reusable profile. |
| Domain procedure, commands, schemas, and artifact formats | selected skill | Route to the skill and preserve its authority; do not paste its workflow into `developer_instructions`. |
| Cross-role baseline such as delegated-agent discipline or scientific epistemics | `model_instructions_file` when maintained | Share only behavior common to every profile using that file. |
| Stable role mission, judgment, authority, adjacent-role exclusions, completion, and report | agent TOML | Make these specific enough that a fresh child can finish its delegated slice without becoming a generic root agent. |

Prior production profiles are useful evidence for task loading, leaf guards,
dirty-worktree safety, and decision-dense reports. Project-specific context
discovery, compatibility notes, mirrored-template rules, and phase language
are not a length target for unrelated profiles. Conversely, the short examples
in the official documentation demonstrate syntax and narrow roles; they are
not proof that every production profile needs only three sentences.

## Role differentiation

A useful custom profile changes at least one stable dimension:

- delegated outcome or domain judgment;
- authority to inspect, write, execute, review, or coordinate;
- model, reasoning, context, latency, or cost requirement;
- sandbox or tool/skill surface;
- independence requirement or prohibited adjacent ownership;
- completion evidence and handoff destination.

If two profiles differ only by name or tone, merge them or move the distinction
into the dispatch. If one profile contains several jobs with incompatible
authority—for example executing experiments and independently reviewing the
same results—split it.

## Selector-facing description

`description` helps the parent choose a role. It should answer:

- What work should select this profile?
- What nearby work should select another role?
- Is there a material read/write, independence, cost, or domain boundary?

Do not hide all selection information inside `developer_instructions`; that
content is loaded after the role has already been selected.

## Runtime decisions

**Inheritance versus pinning.** Omit optional keys when parent inheritance is
the desired behavior. Pin a setting only when the role requires stable behavior
across dispatches or the owning system deliberately manages that projection.

**Model and reasoning.** Choose from the consequence of error, semantic depth,
context volume, latency, and frequency. Fast long-context models suit broad
retrieval; stronger or higher-effort models suit costly scientific or
architectural judgment. Max/ultra settings need a sparse high-value boundary,
not prestige. Compare representative tasks before claiming a better setting.

**Sandbox and tools.** `sandbox_mode` is a default and can be superseded by live
parent permissions. Align it with intended writes, but preserve behavioral
write boundaries in the role contract. Add network, MCP, skill, or other config
only for a named need; broad unused access increases ambiguity and cost. Treat
dispatch edit paths as a soft behavioral allowlist, not host capability: named
paths do not expand live permissions, and a denied target returns to the parent
without a permission request or escalation.

**Leaf versus coordinator.** A custom agent is a strict leaf unless global
`AGENTS.md` admits that role in its finite coordinator topology. Its durable
profile declares only the finite child-role allowlist. The coordinator may
allocate only subordinate, non-overlapping support inside its parent-owned
node; root still owns peer/top-level DAG decisions, integration owners, review
admission, commits, and external actions. Multi-agent feature switches are
defense in depth and reduce accidental recursion, but do not prove hard nesting
depth. Built-in `default`, `explorer`, and `worker` roles are not profile-design
fallbacks and must not be recreated through prose.

**Luna-pinned roles.** A Luna provider pin implies a strict leaf, max reasoning,
and the priority/fast service tier. A `lite` name narrows scope and authority; it
does not justify medium/default reasoning or service settings.

**Context and compaction.** Pin context-window and compaction settings only for
models and workloads where the local runtime supports them. Long context does
not replace evidence selection; a small context does not justify omitting
decision-critical material.

## Contract completeness

Review the finished profile as a fresh delegated child:

- Can it identify the requested object, output, authority, and stop condition
  from a normal self-contained dispatch?
- Does it know which current artifacts outrank summaries or stale state?
- Does it know when a selected skill owns the procedure?
- Does its method name the role-specific judgments that a generic agent would
  otherwise miss?
- Can it reject or hand off adjacent work without abandoning its own objective?
- Does its report preserve decisions, evidence locations, uncertainty,
  validation, and residual work without returning a transcript?
- Are any instructions duplicated, contradictory, task-specific, obsolete, or
  present only to make the file look substantial?

Length is a diagnostic only. Add the smallest instruction that closes an
observed role failure; remove prose that has no effect on selection, authority,
method, completion, or reporting.

## Validation boundary

The bundled validator proves parseability, required fields, nickname shape,
numeric relationships, shared-prompt existence when requested, and explicit
leaf guards when requested. It cannot judge whether the description selects the
right role, the model is cost-effective, the prompt improves behavior, or the
role produces good scientific/engineering work.

Use a representative named-agent task for runtime and behavior proof. Keep the
model, reasoning, tool set, and task constant when evaluating a prompt-only
change. A new task or host restart may be required before newly installed
profiles appear in the spawn schema.

Current public reference: <https://developers.openai.com/codex/subagents>
