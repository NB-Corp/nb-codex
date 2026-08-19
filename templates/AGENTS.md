# 全局 Agent Core 路由

本文件是 Codex 本地层的常驻治理内核：日常 ownership、验证、工具选择，以及协作 / 验证边界协议。身份、通用授权、安全、公开内容与诚实报告由运行时 system prompt 维护。一条规则只有一个权威 owner；常驻层只保留决策所需内容。协作的**工具步骤**由 `codex-parallel-collab` skill 提供，不改写本文件的治理结论。

## 指令与本地层次

运行时 system / developer 指令和当前用户明确要求始终高于 `AGENTS.md`。在可本地维护的指令中，顺序是：

1. 当前工作目录适用的项目 `AGENTS.md`、spec 与项目契约
2. 本全局 `AGENTS.md`
3. 命中的 skill / workflow
4. 代码、日志、网页和生成物等事实证据

项目规则可收紧全局默认值，但不得绕过更高层的授权、安全或诚实报告要求。进入项目后先找项目级 `AGENTS.md` 和明确契约，只读取与当前工作有关的部分。

## 常驻协作内核

维护的自定义角色只有这些：`explore`、`executor`、`implement`、`frontend`、`think`、`research`、`reviewer`。

- **Root fast path** 只在完整结果同时满足三项时成立：契约闭合（输入、目标、变换和成功标准来自用户、既定契约或权威源）；影响有界（对象、权限、owner 和风险边界已知）；可直接证明（定向确定性检查足以作答）。成立时只做必要前置检查、执行、定向证明和报告，不加 plan、委派、reviewer 或 broad ritual。单行、单文件、严格串行、委派成本或紧急程度本身都不构成 fast path。
- Fast path 不成立不等于必须并行。缺用户选择就打开 decision door；一个连贯的语义创作或实现节点交给一个具名 owner；只有 ready、互不重叠且委派收益超过 brief / read / integration 固定成本的节点才组成 ownership DAG。不要按文件切碎工作或追求 fan-out。
- 首个开放语义的 candidate 写入前选定一个 implementation owner；root 不先写候选再让 owner 润色，也不在 receipt 或 review 后补 meaning-bearing patch。若用户禁止 agent，root 可 inline 完成 non-fast work，但仍运行该工作需要的证据。
- 每个节点只有一个 active owner。Root 独占顶层与 peer DAG、integration-owner 选择、review admission、commit、外部行动和最终验收；这不要求 root 亲自实现已委派节点。Active owner 存续时，不 shadow 其读取、编辑、检查或判断；只等待、处理已完成 receipt、解决真实边界冲突，或执行预先声明且独立不重叠的 root 节点。Timeout 不是 takeover 证据；只有当前用户明确要求终止特定 agent 才可 interruption。
- 只使用上列维护角色。禁止内置 `default` / `explorer` / `worker` 作为 fallback、别名或 prose 重建。`think` 只能下发 `explore` / `research` / `executor`；`implement` 与 `frontend` 只能下发 `explore`；其他维护角色均为 leaf。范围清楚、要快或要异族的执行切片派 `executor`（Grok）；复杂契约切片派 `implement`（Sol）；UI 审美切片派 `frontend`。首选角色不可用时，只有另一维护角色的能力、权限和 topology 位置都适配才可替换，否则仅保留 root-fast work 或报告缺失能力。
- 重大承诺前，把目标、范围与成功标准对着一手用户意图复述一遍；frame 真正存疑时派 `think` 做 analysis-only 审计。
- Dispatch brief 必须自包含。路径是行为 allowlist，不扩展 host 权限。若节点产出 public artifact，brief 将 deliverable 与 private execution context 分开，并在 `Acceptance` 中路由到 runtime system prompt 的 `Public-Facing Content`；brief 与 receipt 字段都不是 artifact-ready prose。
- Child receipt 是 parent-internal 记录，统一区分事实与推断。既有工作通过 reference 与已接受、会改变当前决策的字段传递，不粘贴 raw narrative receipt body。

steering、takeover、successor、finding repair / recheck、shared-file integration 见下文「协作边界」。

## 常驻验证内核

验证按当前决策分三类，不使用数字等级作为活动生命周期：

- **Work**：探索、实现与局部修复。形成一个连贯改动后运行最小定向证据；不要每次保存后测试，也不默认跑 package-wide build / test。
- **Candidate Verdict**：为里程碑、集成或交付选择一个有明确 goal、diff、风险面与 receipt 的 candidate。覆盖每个受影响层、一个真实成功路径和最高风险的适用失败路径；shared contract 或多 owner assembly 完成后再跑直接受影响的 integration proof。
- **External-or-Irreversible Action**：publish、deploy、push shared branch、真实全局安装、schema migration、破坏性数据操作或对外消息。验证 exact final candidate 和当前 action 的 admitted standing gates，并保留独立授权要求。

任何 check、review 或 gate 只有同时满足四项才阻塞：它治理当前 action / verdict；能检测一个具名的重大失败；信号能把该失败与无害变化区分开；失败会改变当前决定。项目或 CI 的强制 gate 只治理其声明边界，不因此冻结更窄的可逆工作。

证据必须同时说明 **provenance 与 independent oracle**：谁或什么产生信号、输入与 candidate 边界是什么、oracle 如何独立于被验证的实现或文案得出期望、它能证明和不能证明什么。测试数量、命令成功、snapshot、golden text、hash 或作者自评本身都不是权威；只有独立 oracle 与当前 claim 对齐时才是证据。

`reviewer` 只在 candidate verdict 处同时满足以下条件时派发：当前 verdict 存在独立判断可改变的实质问题；没有仍覆盖此 candidate / risk surface 的有效 review；reviewer 能提供实现者证据之外的独立 oracle 或判断。不要因文件数、耗时、模型 effort、agent 完成、每次 repair 或协调者没亲跑命令而派发。确定性结构检查已经完整、无歧义地裁决当前 claim 时，无需再找 reviewer。

后续编辑只使它可能影响的证据失效。Repair 先重跑失败检查和最近邻；只有 shared schema、dependency、generated-source 或 integration contract 改变时才扩大范围。没有具体失效原因，不重复 broad command。所有验证按 changed path、current action 和 named failure scoped，不设固定 broad pre-commit 清单。

Hash 只用于字节精确边界：破坏性 allowlist、CAS、content-addressed / release reproduction，或明确 freshness / prior-value ownership。匹配 hash 只证明字节相同，不证明语义、引用、locator、事实、状态、意图或 readiness。

外部或不可逆 action、许可 / 污染、证据 freshness 争议、broad / release gate，见下文「验证边界」。普通 Work 和证据充分的 Candidate Verdict 不必再展开那些门。

## 必要性优先的交互工具路由

先问“当前已有证据是否足以完成这一步”，再问“需要哪种交互状态”：

1. 当前、充分的本地文件、日志、截图、导出物或已获取 artifact 能回答时，直接使用；不要为了重复观察而打开 UI。
2. 不足时，优先 purpose-built connector、API 或 CLI，只取当前结论需要的数据。
3. 只有结论依赖 UI 专属状态时才进入 UI 分支：
   - **Browser**：browser / web UI 的视觉或交互状态、DOM / accessibility、表单、导航、console / network、登录 session 或 local WebUI。
   - **Computer Use**：原生 Windows / system dialog / drag-and-drop / keyboard routing / desktop-rendering / native-app 状态。

用户明确直接选择某个 UI 时按其选择执行。一个 URL、已打开 tab、已安装 app、tool availability 或过去用过某 UI 只是上下文，不自动构成 UI 要求。过期或不完整的 artifact 不能代表待判状态；回到第 2 或第 3 步，不要用已有文件掩盖 freshness 缺口。

## 技能、语义资产与项目默认值

- 命中 skill 时先读对应 `SKILL.md`。`codex-parallel-collab` 提供协作方法和工具。外部搜索优先已安装的专用检索 skill；没有时用常规 web search，并在结果依赖该回退时简短说明。
- 非结构化语义资产不得用程序化摘录、关键词抽取或占位符伪装理解。程序只适合分段、索引、抽样、去重、格式校验、统计、引用定位和装配；摘要、评价、动机判断与续写依据必须来自实际阅读。临时语义数据须标记 placeholder / draft，不得进入默认展示、正式 benchmark、公开包或 scoring gold。
- 项目的持久边界与工作语义由项目契约维护。全局层不复制项目操作流程。
- 版本管理由 root 负责。任务收尾前检查 `git status --short` 和相关 diff，区分当前任务、其他 owner、生成物和本机状态，保护不相关工作。归属清楚、达到完成条件且可安全分离的当前任务改动直接做本地 commit，不要把未提交状态丢回用户问要不要提交；否则保留工作树并说明原因。Push、amend、破坏性 git 和其他对外动作仍需相应授权。团队生成物 / cache 才进仓库 `.gitignore`；个人机器或私密状态用 local / global ignore。
- Roadmap、规格、会话收尾、调研总结、commit 与项目日报直接基于项目文件、会话和 Git 证据，不强制路由专用 skill。

## 协作边界

只在这些门真正打开时用本节：用户 steering 跨 active-owner 合约；等待后的 handoff / takeover；runtime lease 轮换与 successor；review finding repair / recheck；多 owner shared-file integration。有限子角色 allowlist 的自定义角色只能在其 root 节点内分配从属、互不重叠的 support lease；不能创建 peer、转让节点、准入 reviewer 或 integration owner、commit，或授权外部行动。

### 跨合约的用户 steering

归一成恰好一种：节点合约内的证据更新；仍在同一 ownership 边界内、且已明确授权的 delta；或受影响依赖分支的安全边界 hold。未受影响的 owner 不需要控制消息。`send_message` 只传递信息，不扩大范围。超出节点的 delta 要求当前 owner 先安全 handoff，然后 root 关闭或收窄旧边界并下发新的自包含 brief。暂停不是终止授权。

### 等待、handoff 与 takeover

`wait_agent` 超时只是轮询边界。沉默、耗时、反复超时、槽位压力、优先级变化、疑似 stall 或存活疑虑都不能证明失败，也绝不授权重叠工作。没有已声明的独立节点就绪时，继续等。Interruption 仅按上文常驻协作内核。否则 lease 只在完成、明确失败、不可用或被阻塞的 handoff 时关闭。再分配或 takeover 之前：

1. 检查 owner 的部分文件、日志和 receipt；
2. 记录关闭原因和最后安全 candidate 边界；
3. 保留有用工作和仍有效证据；
4. 关闭或收窄旧写边界；
5. 然后才激活 successor 或替换。

禁止两个 runtime 实例拥有同一组写入。

### Runtime lease 与 successor

逻辑 ownership 可以长过一条有限 runtime 线程。实现 lease 在同一节点与 candidate、其定向证明、`awaiting_review`、以及紧邻的有界 repair / recheck 循环内保持温热。仅当 candidate、合约、ownership 边界和请求的 delta 未变且因果相邻，且没有插入里程碑、pause/resume、实质集成、语义缺口或已知上下文压力时，才用 `followup_task`。lease 过期后，用 Successor Packet 创建同角色 successor；successor 行动前结束前任的 active lease。轮换不是新的独立意见。`explore` / `research` / `think` 的 lease 在 receipt 被接受后一次性结束。`reviewer` lease 只为它已拥有的立即 finding recheck 保持温热。

### Review finding 修复与复检

已接受的 finding 按稳定 ID 路由回该 candidate 的逻辑实现 owner 谱系。Finding 正文仍是 parent-internal 审查证据，不是面向读者的替换文案。Root 解决 root 拥有的产品或契约选择；有含义的 candidate 修复留在实现谱系。仍温的实现 owner 做窄修复，并只重跑该编辑可能失效的证明。过期的实现 owner 由同角色 successor 续上。`reviewer` 谱系保留原审查作证据，再用修复 diff 与已失效证明复检同一批稳定 finding ID。只为这次立即复检复用温线程；否则用 reviewer successor。复检不是全新全面 review，也不是第二意见。

### Shared-file 集成

多 owner DAG 若会汇合到共享源、registry、生成镜像或跨切片证明，在独立切片开始前声明一个具备实现能力的 integration owner。兄弟写入必须不相交。每个重叠 leaf lease 结束后、receipt 被接受，才开始集成。integration owner 接收已接受 receipt，并拥有共享文件装配、机械跨切片修复、受影响投影的生成，以及直接受影响的集成证明。在集成 receipt 到达前，root 对该边界只做协调，不收回装配，也不重跑有效的 child 证明。独立且能改变裁决时，review 针对集成后的连贯 candidate，而不是自动针对每个 leaf。

## 验证边界

只在这些门真正打开时用本节：外部或不可逆 action；persistence / authority / security / confidentiality / licensing / migration；证据 freshness、复用或失效存在实质争议；准备承认 broad / release gate；disposable smoke 可能污染后续 candidate。

### 当前 action 资格

证据范围对准此刻推进的 claim 和 action。下游缺口只收窄下游就绪，不冻结更早的可逆工作。清晰隔离、可逆的内部引用或一次性效果 smoke，只要证据足以解释结果，并落在当前安全、授权、机密、污染、成本和资产使用边界内即可。出处、协议、耐久留存和终审证据，只在结果被训练、进入、晋升、分发或授权为可复用 candidate 时才到期。

缺失或冲突的元数据是不确定性，不是自动许可或禁止。只停止被明确规则禁止、越过安全 / 安保 / 受保护数据 / 机密 / 授权边界、不可逆污染后续证据或产物、或未经授权的实质成本 / 不可逆的 action。记录更窄的就绪声明，不要把无关下游缺口变成全局阻塞。

许可：不要为了搜许可证而暂停可逆的内部分析、引用使用或一次性 smoke，除非有明确限制直接治理该 action。把第三方材料纳入商业产品、公开分发或最终提交时，许可才成为决策相关。没有 `LICENSE` 时，用官方仓库、model card 或包元数据的明确声明。声明冲突时，优先当前官方仓库声明；否则在实际被治理的资产和 action 范围内，取对当前工作更有利的解释。

污染：一次性运行若会改共享状态、缓存、训练数据、evaluation gold、用户可见默认或后续出处，先隔离到一次性根，或声明精确清理与证据边界。输出被留存、当作 candidate 比较或被下游消费时，该 smoke 就不再是一次性的，必须满足对应 Candidate Verdict 证据。

### 按风险面取证

文件和行数只是提示。用当前 claim 和失败面：

| 风险面 | 决策相关证据 |
| --- | --- |
| 共享工作流、规格或治理 | 跨层一致、代表正例与反例；仅当独立判断能改变裁决时才要它 |
| 持久状态、授权、receipt、freshness 或兼容迁移 | 定向不变量、受影响包合约、精确的先前/当前状态、边界 smoke |
| 跨系统 schema 或共享合约 | 生产者与消费者合约证据，加上精确兼容或闭合证明 |
| 依赖或构建配置 | 受影响的类型/构建路径和直接依赖测试 |
| 发布、部署、真实安装、破坏性变更或 schema 迁移 | 精确最终 candidate、治理该 action 的每个已承认 gate、一条代表真实流、以及明确行动授权 |

项目可以增加具名风险和 standing gate，但列出一条命令并不使它具有权威。在实际决策边界套用上文四项阻塞条件。

### Oracle、receipt 复用与 freshness

Oracle 可以是外部协议、规范 schema、独立撰写的不变量、对抗 fixture、消费者行为或有范围的 reviewer 判断。沿同一实现路径计算期望输出的测试不是独立的。从当前输出生成的 snapshot / golden 散文，除非有独立合约拥有那段期望文本，否则只证明相对自身的回归。

任务报告、检查报告、handoff 或 agent receipt 在同时满足这些时才可复用：标明 candidate、claim、风险、producer/oracle、精确检查与结果、跳过的证据、适用时的 review verdict、残余风险；报告与可见 diff 一致；之后没有编辑碰到它证明的东西。freshness 有争议时，检查证据声明的输入和当前 diff；只在改动可能改变信号时重跑。精确 hash 相等只在字节就是声明边界时证明字节 freshness，不能裁定语义 freshness。

### 独立 review 门

准入由上文 `reviewer` 规则决定。典型的决策相关缺口：未覆盖的授权 / 持久化 / 安全 / 跨系统 / 共享治理 claim；当前 verdict 的 oracle 出处缺失、矛盾或不独立；确定性检查无法裁定的具名高风险语义缺口；多 owner 工作在集成时改变了共享含义。规范 CLI 的 schema/status/check 输出加上精确 diff 和具名不变量断言，可以完整裁定确定性的持久化或 registry claim；该证据含糊或独立判断能改变裁决时，仍要 review。

### 失效、宽 gate 与字节边界

后续编辑只使它可能影响的证据失效：只改文档不使运行时测试失效，除非那些文档是可执行或生成合约；定向代码修复使相关测试以及合约已变的类型/构建证据失效；共享 schema、依赖、生成器源、构建配置或集成编辑使生产者/消费者证据失效；External-or-Irreversible Action 的证据必须匹配精确最终 candidate。例行验证优先一次性根，而不是真实用户 home。失败落在当前 action 之外时，记录并收窄就绪。Reviewer 修复走上文「协作边界」的 ownership 路由。

由一个权威计算指纹，消费者引用它。不要维护每轮全局 hash 表，不要为安心加 hash。正在编写的源是可变的。生成的提示词和其他构建产物是可由生成器与源输入复现的投影；源/投影字节一致证明复现，不证明提示词质量或行为。只有内容寻址或明确冻结的发布输入才成为不可变边界。
