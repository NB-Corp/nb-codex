# Extended Collaboration Packets

Ordinary node briefs and receipts are inlined by `SKILL.md`; do not load this file for routine dispatch. These packets apply only after the matching edge door in `AGENTS.md` 「协作边界」 is open.

## Successor Packet

Use after the collaboration policy determines that a logical owner continues through a new runtime thread. The predecessor lease must be closed before the successor acts.

```text
Lineage and node: <stable logical owner/node identity>
Current candidate/frame: <version or exact boundary>
Predecessor receipt reference: <path or message identity; do not paste its narrative body>
Pending delta: <next action or stable finding IDs>
Current anchors: <diff, files, symbols, contracts, evidence>
Proof state: <still valid versus directly invalidated>
Ownership: <edit/read/write/forbidden scope and live permissions>
Side effects: <allowed commands and prohibited external actions>
Stop: <completion, blocked decision, or safe handoff condition>
```

Use the same capability-specific role, a stable task name that identifies the continuation, and `fork_turns="none"`. Do not pass the old transcript, re-run valid work, estimate token counts, or promise prompt-cache reuse. Rotation is lineage continuity, not a new opinion.

## Finding Repair Packet

Route accepted findings to the logical implementation-owner lineage:

```text
Candidate: <exact reviewed diff or artifact>
Finding ID: <stable ID retained through focused recheck>
Governing contract and anchors: <paths, symbols, clauses, failing checks>
Decision-relevant evidence: <accepted facts that justified repair; do not paste finding prose>
Evidence provenance and limits: <producer, candidate/inputs, independent oracle, outcome, claim limits>
Task facts to preserve: <facts the repaired artifact must still communicate or implement>
Repair boundary: <allowed meaning-bearing and mechanical changes>
Proof state: <still-valid proof versus proof the repair invalidates>
Acceptance: <observable closure for this finding>
Receipt: <follow the common AGENTS contract and key it to this finding ID>
```

Repeat the packet fields per accepted finding. The finding prose is parent-internal evidence, not reader-facing replacement copy. The implementation owner repairs only the accepted findings and runs invalidated evidence. Root does not patch the candidate in parallel.

## Focused Recheck Packet

Return the repair receipt to the review lineage:

```text
Candidate: <exact repaired diff or artifact>
Original review reference: <review-lineage evidence retained by path or message identity>
Finding IDs to recheck: <the same stable IDs only>
Repair diff: <exact paths/changes>
Evidence: <producer, inputs, independent oracle, outcome, claim limits>
Task facts preserved: <decision-relevant facts carried through the repair>
Unchanged findings: <explicitly out of scope>
Report: <closed/open per ID, new material regression only if directly caused>
```

The recheck closes the named findings; it does not restart a full review or solicit a second opinion. Reuse a warm thread only for the immediate loop; otherwise use the successor packet with the same review lineage.

## Evidence Receipt Fields

When evidence can change a candidate verdict, include:

```text
Producer: <tool, harness, source, reviewer, or human>
Candidate/inputs: <diff, artifact, fixtures, selectors, environment/version>
Independent oracle: <where expected behavior comes from and why independent>
Claim boundary: <what failure it discriminates and what it cannot prove>
Outcome: <exact result and relevant failure output>
Freshness: <revision/input link only when a consumer uses it>
```

Hashes, snapshot equality, generated-byte equality, test counts, and self-authored expected prose do not replace these fields. A hash may identify exact bytes while the oracle separately judges meaning or behavior.
