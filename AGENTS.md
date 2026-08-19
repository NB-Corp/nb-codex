# 全局 Agent Core 路由

本文件是 nb-codex 提供的 Codex 本地治理模板，不是安装器会覆盖的运行时文件。安装时由协助配置的 AI 对照用户现有全局 `AGENTS.md` 提出修改建议；用户接受后才写入。把 `{CODEX_HOME}` 换成本次安装选定的 Codex home（例如 `C:/Users/<name>/.codex`）。

本模板覆盖日常 ownership、验证与工具选择；policy 只处理这里点名的少数边界协议。身份、通用授权、安全、公开内容与诚实报告由运行时 system prompt 维护。本地架构遵循一个原则：**一条规则只有一个权威 owner，常驻层只保留高频决策所需内容，低频方法按真实决策门路由**。这样控制固定上下文与工具调用成本，并减少重复、漂移和过期副本；这不是对模型注意力能力的判断。

## 指令与本地层次

运行时 system / developer 指令和当前用户明确要求始终高于 `AGENTS.md`。在可本地维护的指令中，顺序是：

1. 当前工作目录适用的项目 `AGENTS.md`、spec 与项目契约
2. 本全局 `AGENTS.md`，以及它在边界门明确路由的 policy
3. 命中的 skill / workflow
4. 代码、日志、网页和生成物等事实证据

项目规则可收紧全局默认值，但不得绕过更高层的授权、安全或诚实报告要求。进入项目后先找项目级 `AGENTS.md` 和明确契约；若项目由 Assay 管理，再按项目契约读取相关的原生 Project / Task 等对象。只读取与当前工作有关的部分。

用户在实现或纠偏语境中说“先脑暴 / 研究 / 想周全一点 / 用 brainstorm-to-decision”时，把它当作当前分析或决策阶段的指令，不自动沿用此前实现授权来落地结论、启动实验或改变 owner 合约；只有完整上下文清楚要求分析后继续执行时才继续。结合 response annotations、所给材料、紧邻待决项和当前阶段理解意图，不按关键词或句子是否完结机械冻结；语义清楚的直接、间接或省略行动指令仍立即执行。

## 常驻协作内核

- **Root fast path** 只在完整结果同时满足三项时成立：契约闭合（输入、目标、变换和成功标准来自用户、既定契约或权威源）；影响有界（对象、权限、owner 和风险边界已知）；可直接证明（定向确定性检查足以作答）。成立时只做必要前置检查、执行、定向证明和报告，不加 plan、委派、checker 或 broad ritual。单行、单文件、严格串行、委派成本或紧急程度本身都不构成 fast path。
- Fast path 不成立不等于必须并行。缺用户选择就打开 decision door；一个连贯的语义创作或实现节点交给一个具名 owner；只有 ready、互不重叠且委派收益超过 brief / read / integration 固定成本的节点才组成 ownership DAG。不要按文件切碎工作或追求 fan-out。
- 首个开放语义的 candidate 写入前选定一个 implementation owner；root 不先写候选再让 owner 润色，也不在 receipt 或 review 后补 meaning-bearing patch。若用户禁止 agent，root 可 inline 完成 non-fast work，但仍运行该工作需要的证据。
- 每个节点只有一个 active owner。Root 独占顶层与 peer DAG、integration-owner 选择、review admission、commit、外部行动和最终验收；这不要求 root 亲自实现已委派节点。Active owner 存续时，不 shadow 其读取、编辑、检查或判断；只等待、处理已完成 receipt、解决真实边界冲突，或执行预先声明且独立不重叠的 root 节点。Timeout 不是 takeover 证据；只有当前用户明确要求终止特定 agent 才可 interruption。
- 只使用维护中的具名自定义角色；所有层级都禁止内置 `default` / `explorer` / `worker`，包括 fallback、别名和 prose 重建。`think` 只能下发 `explore` / `research` / `worker_lite` support lease，`implement` 只能下发 `explore`；其他维护角色均为 leaf。Luna-pinned 角色始终是 max-reasoning、priority/fast 的 strict leaf；`lite` 只收窄 scope / authority。若本机还装了 `science_*` 角色，只把它们用于科学研究、实验、文献、论文和科学审查。首选角色不可用时，只有另一维护角色的能力、权限和 topology 位置都适配才可替换，否则仅保留 root-fast work 或报告缺失能力。
- 普通 dispatch brief 直接写齐：`Purpose`、`Depends on`、`Owner`、edit/read/write/forbidden scope、已有输入与决定、可执行副作用范围、`Acceptance`、允许的 focused verification、receipt 字段和 stop/handoff 条件。使用稳定 `task_name`、显式 `agent_type` 和可用时的 `fork_turns="none"`；路径是行为 allowlist，不扩展 host 权限。普通 dispatch 不读取额外 packet reference。若节点产出 public artifact，brief 将 deliverable 与 private execution context 分开，并在 `Acceptance` 中路由到 runtime system prompt 的 `Public-Facing Content`；brief 与 receipt 字段都不是 artifact-ready prose。
- Child receipt 是 parent-internal 记录，统一区分事实与推断，并列出状态、精确 paths / symbols 与 changed files、命令 / 结果 / proof limits、依赖结论、残余风险和下一动作。既有工作通过 reference 与已接受、会改变当前决策的字段传递，不粘贴 raw narrative receipt body。仍覆盖当前 candidate 的证据直接复用；只重查争议、缺失或被后续编辑影响的部分。

只在遇到这些**边界门**时读取 `{CODEX_HOME}/policies/collaboration.md`：critic frame audit；用户 steering 跨 active-owner 合约；等待后的 handoff / takeover；runtime lease 轮换与 successor；review finding repair / recheck；多 owner shared-file integration。具体协作工具步骤使用 `codex-parallel-collab` skill；扩展 critic / successor / repair packet 仅由该 skill 在对应边界路由。

## 常驻验证内核

验证按当前决策分三类，不使用数字等级作为活动生命周期：

- **Work**：探索、实现与局部修复。形成一个连贯改动后运行最小定向证据；不要每次保存后测试，也不默认跑 package-wide build / test。
- **Candidate Verdict**：为里程碑、集成或交付选择一个有明确 goal、diff、风险面与 receipt 的 candidate。覆盖每个受影响层、一个真实成功路径和最高风险的适用失败路径；shared contract 或多 owner assembly 完成后再跑直接受影响的 integration proof。
- **External-or-Irreversible Action**：publish、deploy、push shared branch、真实全局安装、schema migration、破坏性数据操作或对外消息。验证 exact final candidate 和当前 action 的 admitted standing gates，并保留独立授权要求。

任何 check、review 或 gate 只有同时满足四项才阻塞：它治理当前 action / verdict；能检测一个具名的重大失败；信号能把该失败与无害变化区分开；失败会改变当前决定。项目或 CI 的强制 gate 只治理其声明边界，不因此冻结更窄的可逆工作。

证据必须同时说明 **provenance 与 independent oracle**：谁或什么产生信号、输入与 candidate 边界是什么、oracle 如何独立于被验证的实现或文案得出期望、它能证明和不能证明什么。测试数量、命令成功、snapshot、golden text、hash 或作者自评本身都不是权威；只有独立 oracle 与当前 claim 对齐时才是证据。Generated prompt 是 mutable authoring source 的可重现 projection，不因生成或字节相等自动获得语义正确性。

Checker 只在 candidate verdict 处同时满足以下条件时派发：当前 verdict 存在独立判断可改变的实质问题；没有仍覆盖此 candidate / risk surface 的有效 review；checker 能提供实现者证据之外的独立 oracle 或判断。不要因文件数、耗时、模型 effort、agent 完成、每次 repair 或协调者没亲跑命令而派发。确定性结构检查已经完整、无歧义地裁决当前 claim 时，无需再找 checker。

后续编辑只使它可能影响的证据失效。Repair 先重跑失败检查和最近邻；只有 shared schema、dependency、generated-source 或 integration contract 改变时才扩大范围。没有具体失效原因，不重复 broad command。所有验证按 changed path、current action 和 named failure scoped，不设固定 broad pre-commit 清单。

Hash 只用于字节精确边界：破坏性 allowlist、CAS、content-addressed / release reproduction，或明确 freshness / prior-value ownership。匹配 hash 只证明字节相同，不证明语义、引用、locator、事实、状态、意图或 readiness。

只在这些**边界门**读取 `{CODEX_HOME}/policies/verification.md`：外部或不可逆 action；persistence / authority / security / confidentiality / licensing / migration；证据 freshness、复用或失效存在实质争议；准备承认 broad / release gate；disposable smoke 可能污染后续 candidate。普通 Work 和证据充分的 Candidate Verdict 不需再读 policy。

## 必要性优先的交互工具路由

先问“当前已有证据是否足以完成这一步”，再问“需要哪种交互状态”：

1. 当前、充分的本地文件、日志、截图、导出物或已获取 artifact 能回答时，直接使用；不要为了重复观察而打开 UI。
2. 不足时，优先 purpose-built connector、API 或 CLI，只取当前结论需要的数据。
3. 只有结论依赖 UI 专属状态时才进入 UI 分支：
   - **Browser**：browser / web UI 的视觉或交互状态、DOM / accessibility、表单、导航、console / network、登录 session 或 local WebUI。
   - **Computer Use**：原生 Windows / system dialog / drag-and-drop / keyboard routing / desktop-rendering / native-app 状态。

用户明确直接选择某个 UI 时按其选择执行。一个 URL、已打开 tab、已安装 app、tool availability 或过去用过某 UI 只是上下文，不自动构成 UI 要求。若已有 artifact 过期、不完整或不能代表待判状态，回到第 2 或第 3 步取得新证据；不能用“已有文件”掩盖 freshness 缺口。

## 技能、语义资产与项目默认值

- 命中 skill 时先读对应 `SKILL.md`；skill 提供方法和工具，不能改写本文件的治理结论。外部搜索优先已安装的专用检索 skill；没有时用常规 web search，并在结果依赖该回退时简短说明。只有用户明确要求或真实 decision door 需要持久化比较时才用 `brainstorm-to-decision`。
- 非结构化语义资产不得用程序化摘录、关键词抽取或占位符伪装理解。程序只适合分段、索引、抽样、去重、格式校验、统计、引用定位和装配；摘要、评价、动机判断与续写依据必须来自实际阅读。临时语义数据须标记 placeholder / draft，不得进入默认展示、正式 benchmark、公开包或 scoring gold。
- 项目的持久边界与工作语义由项目契约及 Assay 原生 Project / Task 等对象维护；Task 不授予权限，也不等同于 host job。全局层不复制项目操作流程。
- 任务收尾前在改动所属仓库检查 `git status --short` 和相关 diff，区分当前任务、其他 owner、生成物和本机状态。保护不相关工作；归属清楚、达到完成条件且可安全分离的当前任务改动默认进入本地 commit，否则保留工作树并说明原因。Push 和其他对外动作仍需相应授权。团队生成物 / cache 才进仓库 `.gitignore`；个人机器或私密状态用 local / global ignore。
- Roadmap、规格、会话收尾、调研总结、commit 与项目日报直接基于项目文件、会话和 Git 证据，不强制路由专用 skill。
