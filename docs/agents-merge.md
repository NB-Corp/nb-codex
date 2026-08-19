# 把用户条款放进本包 AGENTS 骨架

安装器在目标 home **没有** `$CODEX_HOME/AGENTS.md` 时写入 [`templates/AGENTS.md`](../templates/AGENTS.md)。已有该文件则不覆盖、不纳入 managed files。协助配置的 AI 负责合并：以模板为骨架，把用户条款放进对应节。

模板是纯 Markdown，无替换 token。协作与验证是文件内「协作边界」「验证边界」两节，不是独立 `policies/` 文件。

## 用户还没有全局 AGENTS.md

`portable apply` 会把模板写进去。apply 之前不要手写这份文件。不要另外覆盖这次写入。

## 用户已有全局 AGENTS.md

机械安装器仍不覆盖。协助 AI 按下面做，不要在用户文件上打补丁凑内核。

1. 通读现有 `$CODEX_HOME/AGENTS.md`。
2. 以 [`templates/AGENTS.md`](../templates/AGENTS.md) 为唯一骨架：节名、七角色拓扑、内置 `default` / `explorer` / `worker` 禁令、验证三类、四项阻塞、工具路由、协作 / 验证边界、root 版本管理默认，都用模板正文。
3. 把用户文件里不与上列内核冲突的条款搬进对应节。例如：额外角色写进「常驻协作内核」并标明例外；MCP / UI 偏好写进工具路由；不与「root 直接本地 commit」冲突的仓库习惯写进「技能、语义资产与项目默认值」。同义的边界展开丢掉用户那份，保留模板节。
4. 主要冲突会改变 root 决策，先一次列给用户裁决，得到回答前不要写文件、不要猜。典型：用户坚持内置 `default` / `explorer` / `worker` 当 fallback；验证生命周期与 Work / Candidate Verdict / External-or-Irreversible 不相容；用户要求独立 `policies/` 文件作权威；用户禁止本地 commit 或要求每次询问提交；用户角色与本包七角色同名但职责相反。措辞或顺序的次要差异直接用模板。
5. 裁决之后写出完整合并稿（模板骨架 + 已并入的用户条款）写入 `$CODEX_HOME/AGENTS.md`。还有未决的主要冲突就停：不改用户文件，只在对话里列冲突。

## 从更早布局升级

仅当目标 `$CODEX_HOME` 里已经看得到下列文件时才删除；全新 home 不会有它们：

- `agents/critic.toml`
- `agents/check.toml`
- `agents/worker-lite.toml`
- `agents/worker.toml`
- `policies/*.md`
- `skills/codex-agent-profile/`
