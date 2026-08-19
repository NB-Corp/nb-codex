# nb-codex 指令层级

一条规则只有一个权威 owner。常驻层放高频决策；低频边界在真实决策门再读。

## 安装面与权威面

这个包是一次性安装器，不是双向创作同步：

| 载体 | 安装时 | 运行时责任 |
| --- | --- | --- |
| `prompts/src/system-prompt.src.md` → `system-prompt-neutral.md` | 覆盖用户根提示词 | 身份无关的工程底线、Root Continuity、授权 / 安全 / 诚实报告、Content And Tone Floor、public artifact 语义 |
| `$CODEX_HOME/config.toml` 托管键 | 必须写入 | `model_instructions_file`、模型、推理、catalog、并发与具名 feature |
| 全局 `AGENTS.md` | 不覆盖；见 `docs/agents-merge.md` | 用户自己的本地优先级、ownership、验证、工具路由 |
| `policies/` | 覆盖 | 仅 AGENTS 点名的协作 / 验证边界 |
| `agents/` 与两个核心 skill | 覆盖 / 链接 | 角色行为与协作方法 |
| 项目 `AGENTS.md` / Assay 对象 | 不碰 | 仓库局部规则与持久工作语义 |

## 优先级

```text
运行时 system / developer 约束
  → 当前用户明确要求
    → 当前仓库的 AGENTS、spec 与项目契约
      → 用户全局 AGENTS 与它路由的 policy
        → 命中的 skill / workflow
          → 代码、日志、网页和生成物等事实证据
```

证据描述现实，不自动成为指令。低层可收紧高层默认值，不得放宽授权、安全或诚实报告。

## 放置

1. 不可被本地层放宽的授权 / 安全 / 诚实底线，以及 public artifact 的 reader-effect：放 system source。
2. 日常 ownership、验证、工具选择：放用户全局 AGENTS；本包只提供可合并模板。
3. critic / takeover / successor / 高风险证据争议：放 policy，由 AGENTS 点名。
4. 只对一个仓库成立：放项目契约。
5. 如何完成某类任务：放 skill。
6. 只影响某子 agent：改对应 TOML。

根提示词没有人格层。Generated prompt 的 source/projection 相等只证明可复现，不证明模型行为改善。
