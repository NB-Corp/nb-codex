# nb-codex

一次性 Codex 安装包。协助配置的 AI 在新电脑上把本包装进选定的 `CODEX_HOME`：直接覆盖根 system prompt、写入 `config.toml` 托管键、安装角色 / 协作 skill / 模型目录。全局 `AGENTS.md`：没有则安装器写入模板；已有则以本包模板为骨架并入用户条款，主要冲突再问用户。

本包写入：根提示词、七个编码角色、`codex-parallel-collab`、`models.json`、以及 `config.toml` 托管键。不写 provider 密钥，也不改根会话的模型、推理档位和上下文——那些留给用户 Codex 自己的默认值。

## 协助配置的 AI 要做什么

前提：Git、Node.js 22+、Codex CLI 在 `PATH`。`portable init` 从不擅自选择 `~/.codex`；必须把这台机器上的绝对路径传给 `--home`。`status` / `diff` / `push` / `pull` 仍可能落到 `~/.codex`，那不是这条安装路径。

有冲突再问，没冲突就装。不要把安装做成确认题。apply 之前不要给空 home 预写 `AGENTS.md`。

对用户用白话说接下来会发生什么，不要念术语问卷。不要问「是否使用现有的 home」「是否同意覆盖 models.json」「是否删除 model_context_window」。可以说：

> 我会装到你现在的 Codex 目录 `<绝对路径>`。模型列表会换成这一包里的 8 个；平时用哪个模型、思考打到哪档，我不动。有文件对不上再停下来跟你说。

1. **自己选定 `CODEX_HOME`，不要问。** 已有 Codex 登录态就用那个绝对路径；没有就新建一个（常见是用户主目录下的 `.codex`）。跟用户说会装到哪里即可。这个绝对路径必须传给 `portable init --home`，安装器自己不会猜。
2. **`models.json` 必须整份覆盖**：catalog 带 `grok-4.6`，给根会话选用。告诉用户会换成这一包的 8 个模型，窗口按 sol 300k、terra / luna 500k、grok 400k 来写；上游不一定认这个值。这是整份快照覆盖，不是只改窗口，也没有 skip。不要问同不同意覆盖。
3. **根会话上下文走模型默认**：`config.toml` 不写 `model_context_window`，也不写自动压缩阈值。若目标 home 里已经有 `model_context_window`，建议用户删掉，让 Codex 用 catalog / 模型自己的窗口——当作装完后的说明，没有这项就不必提，也不要当成安装前必答。
4. 根提示词、七个编码角色、`codex-parallel-collab` 逐文件复制、以及 `config.toml` 托管键都由后面的 `apply` 写入，不要先手拷。根提示词按字节覆盖 `prompts/system-prompt-neutral.md`；不要换成另一份更软或更短的 system prompt。角色 pin 写在各自 TOML 里，安装器整文件复制，不要在这里改 pin。`grok-4.6` 要在用户 `config.toml` 里自备 `model_providers` 才能打通，本包不代写 provider 密钥。
5. 默认 overlay 写入：`model_instructions_file`、`model_catalog_json`、`agents.max_concurrent_threads_per_session`、multi-agent hint、`suppress_unstable_features_warning`、`features.default_mode_request_user_input`。根模型、推理档位、上下文不在写入面。另有一组 **absent**（存在则当漂移，授权替换后删除）：`stream_idle_timeout_ms`、顶层 `default_mode_request_user_input`、`features.js_repl`。`model_context_window` 不在 absent 里——安装器不代删，只建议用户自己拿掉。provider / sandbox / MCP / hooks 等其它键原样保留。
6. 全局 `AGENTS.md`：安装器只在目标不存在时写入 [`templates/AGENTS.md`](templates/AGENTS.md)。仅当 apply **之前** 目标已有该文件时，apply 之后以模板为骨架把用户条款搬进对应节；会改变 root 决策的主要冲突先列给用户裁决，得到回答前不要写、不要猜。做法见 [`docs/agents-merge.md`](docs/agents-merge.md)。若目标 home 里已经存在本包不写入的旧角色或 `policies/` 文件，对照升级节处理；全新 home 跳过。
7. 机械安装（跟用户说过会装到哪、会换模型列表之后就跑）：

```powershell
# 用步骤 1 选定的绝对路径，不要省略 --home
$env:CODEX_HOME = "<选定的绝对路径>"

node scripts/sync-codex.mjs portable init --home $env:CODEX_HOME
node scripts/sync-codex.mjs portable plan
node scripts/sync-codex.mjs portable apply
node scripts/sync-codex.mjs portable doctor
```

先看 plan 的 fingerprint 和变更数，再 apply。目标已有托管文件且内容不同时，整次 plan 拒绝：这时才问。用白话说「你原来的文件和这一包不一样，要按这一包换掉吗」；确认后再两边都加 `--replace-managed`。没撞上冲突就不要预演这句。plan 会打印 `AGENTS.md: create` 或 `keep-existing`；变更数不含已有 `AGENTS.md`。若 apply 前该文件已存在，机械安装结束后还要按 [`docs/agents-merge.md`](docs/agents-merge.md) 合并。

Apply 只接受当前 `portable plan` 和相同的 `--replace-managed` 选择。被替换的字节留在仓库 `.nb-codex/backups/<invocation>/`。失败时回滚本次写入，并尽量恢复仍匹配本次写入的旧字节。`portable init` 绑定 home；`plan` / `apply` 用这次记录，不回退 `~/.codex`。

装完后新开一个 Codex 会话，让 catalog、config 和自定义角色一起加载。仅当 apply **之前** 目标已有 `AGENTS.md` 时按 [`docs/agents-merge.md`](docs/agents-merge.md) 以模板为骨架合并；未决的主要冲突不要落盘。

## 安装器覆盖什么

| 仓库路径 | 运行时路径 | 安装动作 |
| --- | --- | --- |
| `prompts/system-prompt-neutral.md` | `$CODEX_HOME/prompts/system-prompt-neutral.md` | 覆盖 |
| `prompts/subagent-model-instructions.md` | `$CODEX_HOME/prompts/subagent-model-instructions.md` | 覆盖 |
| `agents/*.toml` | `$CODEX_HOME/agents/*.toml` | 覆盖（提示词路径改成本次 home） |
| `models.json` | `$CODEX_HOME/models.json` | 必须整份覆盖（含 Grok） |
| `skills/codex-parallel-collab/` | `$CODEX_HOME/skills/codex-parallel-collab/` | 逐文件复制；装完不依赖本包路径 |
| `config.toml` overlay | `$CODEX_HOME/config.toml` | 必须写入托管键；根模型 / 推理档位 / 上下文不在托管面内 |
| `templates/AGENTS.md` | `$CODEX_HOME/AGENTS.md` | 安装器仅当目标不存在时写入；已有文件由协助 AI 按 [`docs/agents-merge.md`](docs/agents-merge.md) 合并 |

根提示词直接改 `prompts/system-prompt-neutral.md`。

根会话的模型与推理档位由用户的 Codex 决定，本包不写也不删。根会话上下文也不写；若 `config.toml` 里已有 `model_context_window`，建议删掉、走 catalog 里的窗口。角色 pin 写死在各自 TOML 里。Grok 前提是本机已经配好 provider。

## 指令层级

一条规则一个 owner。读 [`docs/instruction-layers.md`](docs/instruction-layers.md) 再决定一条规则进 system prompt、用户 AGENTS 还是 skill。

## 校验

| 改动 | 检查 |
| --- | --- |
| 根提示词 | 直接读 `prompts/system-prompt-neutral.md`；行为主张另用新会话 |
| 安装器 / overlay | `node --test --test-concurrency=1 scripts/*.test.mjs` |
| 角色 TOML | 同上测试里的 pin / envelope 断言 |
