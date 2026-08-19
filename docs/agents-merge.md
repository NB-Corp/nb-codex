# 把本包 AGENTS 模板并入用户全局文件

安装器不写 `$CODEX_HOME/AGENTS.md`。协助配置的 AI 对照本包 `AGENTS.md` 给出修改建议，等用户接受后再改用户自己的文件。

`{CODEX_HOME}` 换成这次 `portable init` 记录的绝对 home，正斜杠即可，例如 `C:/Users/name/.codex`。

## 用户还没有全局 AGENTS.md

提议创建一份：复制本包 `AGENTS.md`，替换两处 `{CODEX_HOME}`，删掉文件开头说明安装器行为的那一段。不要在用户未确认时写入。

## 用户已有全局 AGENTS.md

不要整文件替换。按段建议：

1. **Policy 路径**：协作 / 验证边界门应读本包装上的 `{CODEX_HOME}/policies/collaboration.md` 与 `verification.md`。若用户文件仍指向别的绝对路径或已删除的 Trellis 文档，改这两处路由。
2. **角色拓扑**：建议禁止内置 `default` / `explorer` / `worker`，并采用本包七个编码角色的父子关系。用户另有角色时，写明例外，不要删用户自己的角色段。
3. **验证生命周期**：建议对齐 Work / Candidate Verdict / External-or-Irreversible Action，以及四项 blocking 条件。
4. **工具路由**：已有 artifact → 专用 CLI/API → 才进 Browser / Computer Use。不要把用户已声明的 MCP 或 UI 偏好抹掉。
5. **不要加回去的东西**：妮娅人格保护句、产品反馈 capture、本机 `ProductStewardship` 路径、未安装的 `debug-with-file` / `search-layer` 硬默认。

给用户看的补丁要具体到段落，不要只说“建议参考模板”。
