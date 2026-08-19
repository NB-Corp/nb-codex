# 把本包 AGENTS 正文并入用户全局文件

安装器在目标 home **没有** `$CODEX_HOME/AGENTS.md` 时写入 [`templates/AGENTS.md`](../templates/AGENTS.md)。已有该文件则不覆盖、不纳入 managed files。协助配置的 AI 只在已有文件缺少本包内核时给出补丁建议。

模板是纯 Markdown，无替换 token。协作与验证是文件内「协作边界」「验证边界」两节，不是独立 `policies/` 文件。

## 用户还没有全局 AGENTS.md

`portable apply` 会把模板写进去。不要另外手写一份覆盖这次写入。

## 用户已有全局 AGENTS.md

不要整文件替换。按段建议：

1. **角色拓扑**：禁止内置 `default` / `explorer` / `worker` 当 fallback，并采用本包七个编码角色的父子关系（`think` → `explore` / `research` / `executor`；`implement` 与 `frontend` → `explore`；其余 leaf）。用户另有角色时写明例外，不要删用户自己的角色段。
2. **验证生命周期**：对齐 Work / Candidate Verdict / External-or-Irreversible Action，以及四项 blocking 条件。
3. **边界协议**：若用户文件仍指向独立 `policies/collaboration.md` 或 `verification.md`，改为采用模板里的「协作边界」「验证边界」两节，或明确保留用户自己的等价协议。
4. **工具路由**：已有 artifact → 专用 CLI/API → 才进 Browser / Computer Use。不要把用户已声明的 MCP 或 UI 偏好抹掉。
5. **只合本包内核**：补丁只合模板里有的角色拓扑、验证生命周期和边界协议。不要从别的 Codex home 抄未随本包分发的 skill、路径或提示词。

给用户看的补丁要具体到段落，不要只说“建议参考模板”。

## 从更早布局升级

仅当目标 `$CODEX_HOME` 里已经看得到下列文件时才删除；全新 home 不会有它们：

- `agents/critic.toml`
- `agents/check.toml`
- `agents/worker-lite.toml`
- `agents/worker.toml`
- `policies/*.md`
- `skills/codex-agent-profile/`
