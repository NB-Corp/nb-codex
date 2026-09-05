# 把用户条款放进本包 AGENTS 骨架

安装器在目标 home **没有** `$CODEX_HOME/AGENTS.md` 时写入 [`templates/AGENTS.md`](../templates/AGENTS.md)。已有该文件则保留。协助配置的 AI 负责询问后合并：以模板为骨架，把用户有效条款放进对应节。

模板是纯 Markdown，无替换 token。协作与验证是文件内「协作边界」「验证边界」两节，不是独立 `policies/` 文件。

## 用户还没有全局 AGENTS.md

`portable apply` 会把模板写进去。apply 之前不要手写这份文件。不要另外覆盖这次写入。

## 用户已有全局 AGENTS.md

机械安装器仍不覆盖。协助 AI 按下面做，不要在用户文件上打补丁凑内核。

1. 通读现有 `$CODEX_HOME/AGENTS.md`。
2. 以 [`templates/AGENTS.md`](../templates/AGENTS.md) 为唯一骨架：节名、七角色拓扑、内置 `default` / `explorer` / `worker` 禁令、验证三类、四项阻塞、工具路由、协作 / 验证边界、root 版本管理默认，都用模板正文。
3. 把用户文件里不与上列内核冲突的条款搬进对应节。例如：额外角色写进「常驻协作内核」并标明例外；MCP / UI 偏好写进工具路由；不与「root 直接本地 commit」冲突的仓库习惯写进「技能、语义资产与项目默认值」。同义的边界展开丢掉用户那份，保留模板节。
4. 向用户说明合并方式、保留的有效条款与实质差异，明确询问是否合并；没有冲突也要询问。主要冲突一次列给用户裁决，得到回答前不要写文件、不要猜。典型：用户坚持内置 `default` / `explorer` / `worker` 当 fallback；验证生命周期与 Work / Candidate Verdict / External-or-Irreversible 不相容；用户要求独立 `policies/` 文件作权威；用户禁止本地 commit 或要求每次询问提交；用户角色与本包七角色同名但职责相反。
5. 确认合并且冲突已裁决后，将原文件备份到本次安装的备份目录，核对它自读取以来未被修改，再写入完整合并稿。不要用字符串拼接或直接覆盖模板代替语义合并。还有未决的主要冲突就停：保持 AGENTS 原样，只在对话里列冲突。拒绝或暂未回答时同样保留该文件，其它已授权安装可以继续；报告 AGENTS 尚未合并。后续要恢复合并时重新通读当前文件和模板、确认差异，再备份写入。

## 从更早布局升级

目标 `$CODEX_HOME` 里若存在下列旧文件，先检查内容与引用，列出仍在使用的条款和删除影响，询问并得到删除确认后再处理；保留未确认项：

- `agents/critic.toml`
- `agents/check.toml`
- `agents/executor.toml`
- `agents/review_gpt.toml`
- `agents/review_grok.toml`
- `agents/worker-lite.toml`
- `agents/worker.toml`
- `agents/worker_gpt.toml`
- `agents/worker_grok.toml`
- `policies/*.md`
- `skills/codex-agent-profile/`
