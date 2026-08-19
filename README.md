# nb-codex

一次性 Codex 安装包。协助配置的 AI 在新电脑上把本包装进用户选定的 `CODEX_HOME`：直接覆盖根 system prompt、写入 `config.toml` 托管键、安装角色 / 协作 skill / 模型目录。全局 `AGENTS.md` 仅在目标不存在时写入，已有文件不覆盖。

本包写入：根提示词、七个编码角色、`codex-parallel-collab`、`models.json`、以及 `config.toml` 托管键。不写 provider 密钥。

## 协助配置的 AI 要做什么

前提：Git、Node.js 22+、Codex CLI 在 `PATH`。安装器从不擅自选择 `~/.codex`；必须由用户给出 home。

1. 让用户选定一个绝对路径作为 `CODEX_HOME`。已有 Codex 登录态可以沿用该 home；全新机器可以新建空目录。
2. 覆盖根提示词：本包 `prompts/system-prompt-neutral.md` → `$CODEX_HOME/prompts/system-prompt-neutral.md`。按字节安装这份工程底线；不要换成另一份更软或更短的 system prompt。
3. 必须配置 `config.toml`：用本包 `sync-manifest.json` 的 overlay 写入托管键，尤其是 `model_instructions_file` 指向刚装上的 `prompts/system-prompt-neutral.md`。未托管的键（provider、sandbox、MCP、hooks 等）原样保留。
4. 安装七个编码角色、`codex-parallel-collab` skill 链接、以及 `models.json`。catalog 含 `gpt-5.6-sol` / `terra` / `luna`，以及 `grok-4.6` 与 `deepseek-v4-flash`（本包把这两条的 Codex 窗口钉在 400k）。角色 pin：`explore` 钉 `gpt-5.6-luna` + `max` + `service_tier = "priority"`；`implement` / `reviewer` / `think` 钉 `gpt-5.6-sol`；`executor` / `research` / `frontend` 钉 `grok-4.6`。`executor` 是纯 leaf，不要把内置 `worker` 当 fallback。`grok-4.6` / `deepseek-v4-flash` 要在用户 `config.toml` 里自备 `model_providers` 才能打通，本包不代写 provider 密钥。若目标 home 里已经存在本包不写入的旧角色或 `policies/` 文件，对照 [`docs/agents-merge.md`](docs/agents-merge.md) 的升级节处理；全新 home 跳过。
5. 全局 `AGENTS.md`：目标不存在则写入 [`templates/AGENTS.md`](templates/AGENTS.md)；已有则不覆盖。已有文件缺本包内核时，对照模板与 [`docs/agents-merge.md`](docs/agents-merge.md) 给具体补丁。`templates/AGENTS.md` 是给用户全局文件用的正文，不是本仓库自己的治理文件。

机械步骤：

```powershell
$env:CODEX_HOME = Join-Path $HOME ".codex"

node scripts/sync-codex.mjs portable init --home $env:CODEX_HOME
node scripts/sync-codex.mjs portable plan
node scripts/sync-codex.mjs portable apply
node scripts/sync-codex.mjs portable doctor
```

先看 plan 的 fingerprint 和变更数，再 apply。目标已有托管文件且内容不同时，整次 plan 拒绝；确认替换后两边都加 `--replace-managed`。

Apply 只接受当前 `portable plan` 和相同的 `--replace-managed` 选择。被替换的字节留在仓库 `.nb-codex/backups/<invocation>/`。失败时回滚本次写入，并尽量恢复仍匹配本次写入的旧字节。

装完后新开一个 Codex 会话，让 catalog、config 和自定义角色一起加载。已有 AGENTS 的补丁建议交给用户改自己的文件。

## 安装器覆盖什么

| 仓库路径 | 运行时路径 | 安装动作 |
| --- | --- | --- |
| `prompts/system-prompt-neutral.md` | `$CODEX_HOME/prompts/system-prompt-neutral.md` | 覆盖 |
| `prompts/subagent-model-instructions.md` | `$CODEX_HOME/prompts/subagent-model-instructions.md` | 覆盖 |
| `agents/*.toml` | `$CODEX_HOME/agents/*.toml` | 覆盖（提示词路径改成本次 home） |
| `models.json` | `$CODEX_HOME/models.json` | 覆盖 |
| `skills/codex-parallel-collab/` | 同名 skill 链接 | 链接到本包 |
| `config.toml` overlay | `$CODEX_HOME/config.toml` | 必须写入托管键 |
| `templates/AGENTS.md` | `$CODEX_HOME/AGENTS.md` | 仅当目标不存在时写入 |

根提示词直接改 `prompts/system-prompt-neutral.md`。

根默认是 `gpt-5.6-sol` + `xhigh`；觉得贵就把 `config.toml` 里的 `model_reasoning_effort` 降到 `high`，不必换模型。`explore` 已钉 luna + priority；要降成本就改对应 TOML 的 `service_tier` 或 `model`。`executor` 相对 `implement`：更快、走 Grok 异族、且是 leaf。`deepseek-v4-flash` 只在 catalog 里，没有角色默认 pin。Grok / Flash 前提是本机已经配好 provider。

## 指令层级

一条规则一个 owner。读 [`docs/instruction-layers.md`](docs/instruction-layers.md) 再决定一条规则进 system prompt、用户 AGENTS 还是 skill。

## 校验

| 改动 | 检查 |
| --- | --- |
| 根提示词 | 直接读 `prompts/system-prompt-neutral.md`；行为主张另用新会话 |
| 安装器 / overlay | `node --test --test-concurrency=1 scripts/*.test.mjs` |
| 角色 TOML | 同上测试里的 pin / envelope 断言 |
