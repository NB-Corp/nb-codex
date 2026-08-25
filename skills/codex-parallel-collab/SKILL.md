---
name: codex-parallel-collab
description: Coordinate nb-codex subagents with named role ownership, proactive capability-aware delegation, integration ownership, wait-state discipline, and review repair loops. Use when the user asks for parallel agents, multi-agent collaboration, delegated implementation, or an ownership DAG, or when substantial work benefits from a coherent delegated owner, parallel leaves, context isolation, specialization, or independent evidence. Do not use for a small edit merely because it touches several files.
metadata:
  short-description: Coordinate named nb-codex owners without shadow work
---

# Codex Parallel Collaboration

这是 nb-codex 的协作**方法与工具**。治理以全局 `AGENTS.md` 为准；本 skill 不改写拓扑、验证内核或边界协议。工具名按 Codex 硬编码：`spawn_agent`、`wait_agent`、`followup_task`、`send_message`、`list_agents`、`interrupt_agent`。

维护角色（不要用内置 `default` / `explorer` / `worker`）。派发前过 AGENTS 放大器门：说得出收益才派，否则 root 自己做。不要把 `explore`→`implement`/`frontend`→`reviewer` 跑成例行流水线。

| Need | Role | Topology |
| --- | --- | --- |
| 不熟悉代码的只读地图 | `explore` | leaf |
| 范围清楚的快速执行 | `worker_lite` | leaf |
| 实现一个连贯切片 | `implement` | 可租 `explore` |
| UI 切片 | `frontend` | 可租 `explore` |
| 难架构 / 根因 / 精细改动 | `think` | 可租 `explore` / `research` / `worker_lite` |
| 一块会改决策的复杂调研 | `research` | leaf |
| 独立 candidate 判断 | `reviewer` | leaf |

lookup 用搜索工具，不要派 `research`。代码地图用 `explore`。`research` 贵，只接会改决策的问题块。UI 派 `frontend`。

能力、sandbox、子角色 allowlist 以 `$CODEX_HOME/agents/<role>.toml` 为准。

## 1. Map The Ownership Graph

从请求结果和仓库证据出发。看相关项目规则、`git status --short`、已有 diff、共享 registry 或生成镜像，以及识别连贯职责所需的最少代码。

多于一个节点时，先写一张紧凑图：

```text
node              owner       writes             depends             closing evidence
api_contract      implement   src/api/**         none                focused contract tests
ui_consumer       frontend    src/ui/**          api_contract        consumer scenario
integration       implement   shared registry    api, ui receipts    affected integration proof
```

`ui_consumer` 必须是 `frontend`。非 UI 实现节点派 `implement`。

节点是可独立验证的职责，不是文件。共享源和 integration owner 要标明。只有写入不相交的 ready 节点才一起跑。能由一个有能力的 owner 做完的连贯竖切，不要拆。

## 2. Dispatch

普通 dispatch 把合同直接写进 `spawn_agent`：

```text
Purpose: <one bounded outcome>
Depends on: <accepted inputs/receipts or none>
Owner: <explore|worker_lite|implement|frontend|think|research|reviewer>
Edit allowlist: <soft behavioral paths or NONE>
Read / write / forbidden scope: <clear boundaries>
Inputs and decisions: <only current authoritative context>
Side effects: <allowed commands and forbidden external actions>
Acceptance: <observable facts>
Verification: <focused evidence this node owns>
Receipt: <follow the AGENTS receipt contract; add only node-specific fields>
Stop: <completion, blocked decision, or safe handoff condition>
```

稳定小写 `task_name`，显式 `agent_type`，可用时 `fork_turns="none"`。brief 必须自包含；不要传 raw 会话或期望结论。引用已接受的先前工作，只带会改变当前决策的已接受字段。

公开产物节点把 deliverable 与 private execution context 分开，`Acceptance` 路由到 runtime system prompt 的 `Public-Facing Content`。

对当前所有 ready、写入不相交的节点一次 `spawn_agent`，记下返回的 canonical task name。dispatch 之后的相关证据用 `send_message`；它不新开一轮。仅当 AGENTS「协作边界」允许温热、因果相邻的续作时才用 `followup_task`。

## 3. Coordinate Without Re-Execution

dispatch 后保留小账本：

```text
node | canonical agent path | state | dependency result | owned paths
```

`wait_agent` 的超时是轮询间隔，不是执行期限。receipt 到达后：

1. 确认 parent-internal receipt 满足 AGENTS 合同；
2. 把声称范围与声明的 ownership 边界对照；
3. 记录残余风险和仍可复用的证据；
4. 派发新解锁、互不重叠的节点；
5. 仍有活动依赖就继续等。

`list_agents` 只用于真实的存活或 ownership 问题，不作例行轮询。steering、takeover、interruption 或超出节点的 delta，停下来走 AGENTS「协作边界」，不要用工具即兴发挥。`interrupt_agent` 只在当前用户明确要求终止那个特定 agent 时使用。

## 4. Integrate Shared Sources Once

DAG 汇合时，把已接受的 leaf receipt、当前共享文件 diff、生成镜像义务、未解决的机械冲突和直接受影响证明交给已声明的 integration owner。该节点应：

- 只在重叠 leaf ownership 结束后装配；
- 保留无关工作和已接受的语义选择；
- 在边界内修复跨切片机械问题；
- 只重新生成受影响投影；
- 跑装配使之失效的证明，而不是重放每个 leaf 检查。

集成 receipt 是下一裁决使用的 candidate receipt。Root 评估该 receipt 和可见边界，不重做集成节点。

## 5. Admit Review Only When It Can Change The Verdict

套用 AGENTS 里的 review 准入。获准后只送一个中立连贯 candidate：目标/合约、精确最终 diff 或 artifact、带独立 oracle 出处的既有证据、残余缺口、findings-first 报告合同。不要编码期望 verdict。审查席是 `reviewer`。

把已接受的稳定 finding ID 连同治理锚点、决策相关证据、须保留的任务事实、证明状态和验收，路由回实现 owner 谱系。Finding 正文不是面向读者的替换文案。立即 repair/recheck 循环走 AGENTS「协作边界」和下面的扩展 packet。不要在 root 侧做语义修复，也不要再开一轮全面 review。

## 6. Extended Edge Packets

只在这些情况下读 [`references/subtask-contract.md`](references/subtask-contract.md)：

- 过期 runtime lease 与同角色 successor packet；或
- review finding 修复 / 定向复检 packet。

多角色 DAG、共享文件集成或工具级等待/修复顺序仍不清楚时，读 [`references/dispatch-examples.md`](references/dispatch-examples.md)。这些是例子和 packet，不是治理权威。

## 7. Finish From Receipts

把控制交回 root 前，确认每个必需节点已终止、共享 ownership 已关闭、已接受 finding 已解决或显式留下、集成 receipt 满足 AGENTS 合同及任何集成特定 delta。

除非 root brief 明确授予该精确动作，否则不要 commit、push、publish、install 或做其他外部副作用。
