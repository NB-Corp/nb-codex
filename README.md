# nb-codex

一次性 Codex 安装包。协助配置的 AI 在新电脑上把本包装进用户选定的 `CODEX_HOME`：直接覆盖根 system prompt、写入 `config.toml` 托管键、安装策略 / 角色 / 技能 / 模型目录。全局 `AGENTS.md` 不覆盖，只按本包模板提出修改建议。

本包装的是 `codex` 工程内核去掉妮娅人格层之后的发布切片。它不附带本机路径、产品反馈投影或科学角色。

## 协助配置的 AI 要做什么

前提：Git、Node.js 22+、Codex CLI 在 `PATH`。安装器从不擅自选择 `~/.codex`；必须由用户给出 home。

1. 让用户选定一个绝对路径作为 `CODEX_HOME`。已有 Codex 登录态可以沿用该 home；全新机器可以新建空目录。
2. 覆盖根提示词：本包 `prompts/system-prompt-neutral.md` → `$CODEX_HOME/prompts/system-prompt-neutral.md`。这是 nia 工程提示词去掉人格层与人格描述后的版本，不是另一套更软的中性稿。
3. 必须配置 `config.toml`：用本包 `sync-manifest.json` 的 overlay 写入托管键，尤其是 `model_instructions_file` 指向刚装上的 `prompts/system-prompt-neutral.md`。未托管的键（provider、sandbox、MCP、hooks 等）原样保留。
4. 安装策略、七个编码角色、两个核心 skill 链接、以及 `models.json`。本包装的 catalog 钉住 `gpt-5.6-sol` / `gpt-5.6-luna` / `gpt-5.6-terra`；用户 Codex 需要对得上这份目录。
5. **不要覆盖** 用户已有的 `$CODEX_HOME/AGENTS.md`。对照本包 `AGENTS.md` 与 [`docs/agents-merge.md`](docs/agents-merge.md) 给出具体补丁建议：换 `{CODEX_HOME}`、接上本包 `policies/`、对齐协作 / 验证内核。用户没有全局 AGENTS 时，提议从模板创建，仍等用户点头。

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

装完后新开一个 Codex 会话，让 catalog、config 和自定义角色一起加载。然后把 AGENTS 建议交给用户改自己的文件。

## 安装器覆盖什么

| 仓库路径 | 运行时路径 | 安装动作 |
| --- | --- | --- |
| `prompts/system-prompt-neutral.md` | `$CODEX_HOME/prompts/system-prompt-neutral.md` | 覆盖 |
| `prompts/subagent-model-instructions.md` | `$CODEX_HOME/prompts/subagent-model-instructions.md` | 覆盖 |
| `policies/*.md` | `$CODEX_HOME/policies/*.md` | 覆盖 |
| `agents/*.toml` | `$CODEX_HOME/agents/*.toml` | 覆盖（提示词路径改成本次 home） |
| `models.json` | `$CODEX_HOME/models.json` | 覆盖 |
| `skills/codex-parallel-collab/`、`skills/codex-agent-profile/` | 同名 skill 链接 | 链接到本包 |
| `config.toml` overlay | `$CODEX_HOME/config.toml` | 必须写入托管键 |
| `AGENTS.md` | 用户自己的全局 AGENTS | 不覆盖；只建议 |

根提示词由 `prompts/src/system-prompt.src.md` 生成。改源之后运行：

```powershell
node scripts/build-prompts.mjs
```

不要把生成文件当独立源来改。

## 指令层级

一条规则一个 owner。读 [`docs/instruction-layers.md`](docs/instruction-layers.md) 再决定一条规则进 system prompt、AGENTS 模板、policy 还是 skill。

## 校验

| 改动 | 检查 |
| --- | --- |
| 根提示词 | `node scripts/build-prompts.mjs --check`；行为主张另用新会话 |
| 安装器 / overlay | `node --test --test-concurrency=1 scripts/*.test.mjs` |
| 角色 TOML | 包内 Python 校验 |

字节相等只证明生成可复现，不证明语义正确。
