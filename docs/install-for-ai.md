# 协助 AI 安装 nb-codex

人类读者看 [`README.md`](../README.md)。协助安装的 AI 按以下步骤把提示词、七个角色、协作 skill 和模型目录装入用户选定的 Codex 目录。

## 准备与询问

前提：Git、Node.js 22+、支持本包角色字段的 Codex CLI 在 `PATH`。工作区还不是本仓库时，先 clone 用户给出的 GitHub URL。分支页 `https://github.com/<org>/<repo>/tree/<branch>` 对应 `git clone -b <branch> https://github.com/<org>/<repo>.git`，使用该分支。

1. 选定已有登录态使用的绝对 `CODEX_HOME`；没有则使用用户主目录下的 `.codex`。向用户说明安装位置。`--home` 是 Codex 目录，不是 clone 路径。命令在 clone 根目录执行；安装全程使用 `portable`，`status` / `diff` / `push` / `pull` 可能使用默认 home。
2. 说明 `models.json` 必须整份覆盖为本包的 9 个模型，包含 Astra 和 Grok。根会话的 `model`、`model_reasoning_effort` 原样保留。Grok 需要用户已配置可用 provider；本包保留 provider / sandbox / MCP / hooks，不写密钥。角色模型与推理设置见下表，Fast 和更高推理档会影响用量。
3. 通读目标 `config.toml`。发现顶层 `model_context_window`、`model_auto_compact_token_limit` 或 `model_auto_compact_token_limit_scope` 时，列出旧值，说明它们会覆盖目录窗口、压缩线或改变压缩统计范围。默认推荐删除这些覆盖、采用下表的按模型策略，但必须明确询问，得到确认后才使用 `--use-catalog-context`。无确认或用户拒绝时保留旧值，可以继续其它安装；不要把其它文件的替换确认当作上下文确认。保留时说明根会话仍使用这些覆盖，目录策略未完整生效。另查启动参数 `-c`、项目配置和外部配置层是否覆盖同类设置；本安装器只迁移所选 home 的顶层键，其它来源先说明并单独询问。
4. 目标已有 `AGENTS.md` 时，通读它与模板，向用户说明将以模板为骨架合并、哪些有效用户条款保留、有哪些实质冲突，然后明确询问。即使没有冲突，也要得到合并确认后才写。拒绝或未答复则保持原文件，可以继续其它安装；后续恢复见 [`agents-merge.md`](agents-merge.md)。目标不存在时留给安装器写模板，不要预写。

| 模型 | 自动压缩阈值 | 声明窗口 | 默认角色 |
| --- | --- | --- | --- |
| Astra / Sol | 320000 | 400000 | Sol：implement / research 默认 medium、可上调；Astra：frontend 默认 medium、可上调，reviewer 固定 medium，think 固定 xhigh |
| Terra / Luna | 650000 | 750000 | Luna：explore / worker_lite 固定 max + priority（Fast） |
| Grok | 保留目录默认 | 400000 | 可由用户选择作为根模型 |

320k / 650k 指自动压缩阈值。Codex 会按声明窗口的 90% 限制该阈值；400k / 750k 为它留出余量。窗口声明不会增加服务端额度或保证 provider 接受长上下文。角色 TOML 固定各自窗口与压缩线；根会话默认读取目录，不写一个统一的全局阈值。

`implement`、`research` 的角色 TOML 固定 Sol，effort 保持可临时上调。普通派发省略 effort 时，Codex 使用本包配置的共享 medium 默认；也可显式传 `reasoning_effort="medium"`。升级已有全局 AGENTS 时，合并掉旧的 implement 普通派发显式 low 约定。

## 计划与安装

```powershell
$env:CODEX_HOME = "<选定的绝对路径>"
node scripts/sync-codex.mjs portable init --home $env:CODEX_HOME
node scripts/sync-codex.mjs portable plan
```

Plan 不写目标 home；打印 fingerprint、变更数、上下文旧值及 `keep` / `remove`，并提示 `AGENTS.md` 是 `create` 还是 `keep-existing`。完整计划在仓库 `.nb-codex/install-plan.json`。已有托管文件或键不同会要求 `--replace-managed`：列明差异并询问，确认后用该参数重新 plan。只有已确认删除 root 上下文覆盖时才加 `--use-catalog-context`；两个参数可分别使用，也可组合。

```powershell
# 下例仅适用于用户已分别确认托管替换和上下文迁移
node scripts/sync-codex.mjs portable plan --replace-managed --use-catalog-context
node scripts/sync-codex.mjs portable apply --replace-managed --use-catalog-context
node scripts/sync-codex.mjs portable doctor
```

无托管冲突、无上下文迁移时直接 `portable apply`，再 `portable doctor`。Apply 必须与当前 plan 使用相同参数；期间源文件或目标变化会要求重新 plan。拒绝上下文迁移就省略 `--use-catalog-context`，其它替换仍按各自确认执行。拒绝托管替换则暂停该次安装，保留 home，待用户改变决定后重新 plan。已有 AGENTS 的合并确认不由这些参数代替；机械 apply 始终保留已有 AGENTS，由协助 AI 按合并指南另行备份、写入。

## 写入与恢复

| 仓库路径或设置 | 安装动作 |
| --- | --- |
| `prompts/system-prompt-neutral.md` | 覆盖根提示词 |
| `prompts/subagent-model-instructions.md` | 复制公共子代理提示词 |
| `agents/*.toml` | 逐文件复制，提示词路径改为本次 home |
| `models.json` | 整份覆盖，包含 Grok |
| `skills/codex-parallel-collab/` | 逐文件复制；安装后不依赖 clone 路径 |
| `model_instructions_file`、`model_catalog_json` | 指向本次 home 的文件 |
| `agents.max_concurrent_threads_per_session`、`agents.default_subagent_reasoning_effort` | 并发 15、默认子代理推理 medium；未 pin effort 的角色可在派发时上调 |
| multi-agent hint、支持的用户输入 feature | 写入本包配置 |
| `stream_idle_timeout_ms`、顶层 `default_mode_request_user_input`、`features.js_repl` | 若存在，托管替换确认后删除 |
| 三个 root 上下文覆盖键 | 仅在 `--use-catalog-context` 确认计划中删除 |
| `templates/AGENTS.md` → `$CODEX_HOME/AGENTS.md` | 不存在则写入；已有则保持，询问后由 AI 合并 |

被替换的原字节备份在仓库 `.nb-codex/backups/<invocation>/`。Apply 失败时回滚本次写入；若文件随后被其它进程修改，会保留新修改并报告未恢复项。手动恢复前先检查当前文件，选择对应 invocation 的备份，确认恢复范围后还原；`config.toml` 备份包含原上下文值及用户其它配置。恢复旧配置后重新 plan，按新的选择安装。

装完报告实际 home、已安装内容、保留的上下文覆盖或未合并 AGENTS、备份位置及 doctor 结果。Doctor 校验托管文件和配置结构，不证明保留覆盖后的根会话已采用目录压缩线。新开一个 Codex 会话加载新配置。仓库移动后仍应可使用安装后的角色和 skill。
