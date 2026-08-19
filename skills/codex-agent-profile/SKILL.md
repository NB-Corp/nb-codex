---
name: codex-agent-profile
description: Design, create, audit, and improve custom Codex subagent TOML profiles. Use when the user asks to add or revise a file under ~/.codex/agents or .codex/agents, choose a subagent model, reasoning, sandbox, or tool surface, separate shared instructions from role-specific developer_instructions, or validate and register a named agent. Do not use merely to spawn an existing agent.
metadata:
  short-description: Design and validate custom Codex agent TOML profiles
---

# Codex Agent Profile

Design the smallest role contract that reliably changes delegated behavior. A
long profile is not inherently stronger, and a short profile is not complete
merely because it parses.

Read `references/profile-design.md` before authoring or materially revising a
profile. It owns the layer boundaries, runtime-setting decisions, and review
questions used below.

## Locate the authority

Confirm the target Codex version and inspect the relevant project instructions,
adjacent working profiles, shared model-instruction file, and installation
mechanism. Distinguish the canonical authoring source from generated, copied,
junctioned, or globally installed projections.

When another repository or generator owns the profile, edit that source and its
tests or templates rather than treating `~/.codex/agents/` as the source of
truth. If ownership is unclear, inspect manifests and neighboring conventions
before changing anything. Do not overwrite a global or project profile that
has conflicting uncommitted intent.

For version-sensitive fields, prefer the current local Codex configuration and
official Codex Subagents documentation. If neither establishes a field, omit it
or report the uncertainty instead of inventing a schema.

## Define the role before the TOML

Resolve these decisions from the user's goal and local evidence:

- What delegated outcome does this role uniquely own, and when should the
  parent select it instead of an adjacent role?
- Is it a strict leaf or one of the coordinator roles admitted by the
  always-loaded global instruction kernel's finite topology? A coordinator
  profile declares only its finite child-role allowlist; it does not admit
  itself or decide when it is spawned.
- What may it read, write, decide, execute, or mutate? What must return to the
  parent or another specialist?
- Which task facts belong in each dispatch rather than in the reusable profile?
- Which procedure belongs to a selected skill rather than
  `developer_instructions`?
- What evidence or artifact ends the task, and what missing fact causes a stop
  or handoff?

Ask one question only when a choice such as read-only versus write-capable,
local versus external action, or cheap versus quality-first model materially
changes authority or cost and cannot be inferred.

## Choose runtime settings deliberately

The required profile fields are `name`, `description`, and
`developer_instructions`. Add optional settings only when they encode a real
role difference or a locally verified runtime need.

- Make `description` selector-facing: name the tasks, distinction from nearby
  roles, and material boundary that helps the parent choose correctly.
- Pin `model` and `model_reasoning_effort` only when quality, latency, context,
  or cost justifies it. Do not increase reasoning to compensate for a missing
  outcome, evidence, or stop condition.
- A Luna provider pin is a durable exception: require a strict-leaf contract,
  max reasoning, and the priority/fast service tier. A `lite` role name narrows
  scope and authority, not effort or service priority.
- Choose the narrowest workable `sandbox_mode`; remember that the live parent
  permission mode can override profile defaults.
- Add MCP servers, skills, or other tool configuration only when the role
  actually needs them. Do not expose a broad tool surface for hypothetical use.
- Use `model_instructions_file` for genuinely shared baseline behavior. Keep
  role selection and role-specific judgment in the TOML.
- For a leaf role, disable nested delegation when the current host supports
  those feature keys, treating them as defense in depth rather than hard depth
  enforcement. A coordinator requires an explicit orchestration mission,
  admission by the always-loaded global instruction topology, and a finite
  child-role allowlist; do not create a new coordinator merely because the
  schema exposes delegation tools.
- Never design a profile or fallback around the built-in `default`, `explorer`,
  or `worker` types. Use a maintained custom role or keep the work inline.
- Add nicknames only for useful UI distinction; they never replace `name`.

## Write the role contract

Keep the profile outcome-first. Usually it needs: identity and mission;
dispatch and authority boundary; role-specific decision method or modes;
forbidden adjacent ownership; completion, evidence, and report behavior. These
are design concerns, not mandatory headings.

Do not copy the full global policy, project workflow, selected skill, current
task, or example answer into the profile. Route to those owners instead. Remove
repeated instructions before adding new prose, and do not use word count as an
acceptance criterion.

For an existing profile, change one coherent behavior group at a time when the
goal is measurable improvement. A coordinated family edit may change a shared
baseline plus its projections together, but do not simultaneously change the
model, reasoning, prompt, tools, and sandbox and then attribute the outcome to
one of them.

## Validate the exact candidate

Run the bundled read-only validator from the skill directory:

```powershell
python scripts/validate_agent_toml.py <profile.toml>
python scripts/validate_agent_toml.py --expect-leaf --check-paths <profile.toml>
```

It checks TOML structure and selected machine-verifiable invariants; it does
not certify role quality. Then inspect the rendered contract against the design
reference and run the owning repository's focused tests or template checks.

Run `scripts/test_validate_agent_toml.py` through unittest discovery whenever
the validator itself changes:

```powershell
$env:PYTHONDONTWRITEBYTECODE = "1"
python -m unittest discover -s scripts -p "test_*.py" -v
```

If the profile is installed or registration/config changed, run the host's
strict configuration load. A successful real named-agent task is the runtime
proof; parsing, file existence, or strict-config help alone is not. Treat global
installation, config mutation, and model-consuming smoke tests as separate
authorized actions under the governing project policy.

Report the canonical files changed, runtime projections changed or intentionally
left alone, validation evidence, untested behavior, and any restart or new-task
requirement. Do not claim behavioral improvement without a representative
forward test or comparison.
