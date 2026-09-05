# nb-codex 指令层级

一条规则只有一个权威 owner。常驻层放高频决策；低频方法按真实决策门再读。

## 安装面与权威面

这个包是一次性安装器，不是双向创作同步：

| 载体 | 安装时 | 运行时责任 |
| --- | --- | --- |
| `prompts/system-prompt-neutral.md` | 覆盖用户根提示词 | 身份无关的工程底线、Root Continuity、授权 / 安全 / 诚实报告、Content And Tone Floor、public artifact 语义 |
| `$CODEX_HOME/config.toml` 托管键 | 写入安装配置 | `model_instructions_file`、`model_catalog_json`、并发、默认子代理推理 medium 与具名 feature。不写根模型 / 推理。已有 root 窗口、压缩阈值及统计范围覆盖由协助 AI 列出旧值，询问后用 `--use-catalog-context` 删除；拒绝则保留并继续其它安装 |
| `templates/AGENTS.md` → 用户全局 `AGENTS.md` | 目标不存在时写入；已有则先通读、说明并询问，确认后以模板为骨架保留用户有效条款 | 本地优先级、ownership、验证、工具路由、协作/验证边界 |
| `agents/` 与 `codex-parallel-collab` | 覆盖 / 复制 | 角色行为与协作工具步骤 |
| 项目 `AGENTS.md` | 不碰 | 仓库局部规则 |

## 优先级

```text
运行时 system / developer 约束
  → 当前用户明确要求
    → 当前仓库的 AGENTS、spec 与项目契约
      → 用户全局 AGENTS
        → 命中的 skill / workflow
          → 代码、日志、网页和生成物等事实证据
```

证据描述现实，不自动成为指令。低层可收紧高层默认值，不得放宽授权、安全或诚实报告。

## 放置

1. 不可被本地层放宽的授权 / 安全 / 诚实底线，以及 public artifact 的 reader-effect：放 `prompts/system-prompt-neutral.md`。
2. 日常 ownership、验证、工具选择，以及 takeover / successor / 高风险证据争议：放用户全局 AGENTS；本包正文在 `templates/AGENTS.md`。
3. 只对一个仓库成立：放项目契约。
4. 如何完成并行协作（工具与 packet）：放 `codex-parallel-collab`。
5. 只影响某子 agent：改对应 TOML。

## 受众面

同一句话只写给会用它做决策的读者。维护时用正向枚举（本包安装什么、这个席位做什么），不要写相对源系统的减法叙事（去掉了谁、不是哪份旧稿、作者家里有过哪些文件）。

| 载体 | 写什么 |
| --- | --- |
| 子 TOML `developer_instructions` | 只写改变**这个孩子**运行时决策的内容：自身合同与边界。仅当 `multi_agent=true` 且内置类型在运行时仍可选时，才在 allowlist 补集里点名易混淆的内置邻居。不写改名前身、选型理由、或「你不是内置 `worker`」。选型理由放 TOML `description` 或全局 AGENTS。 |
| 全局 AGENTS（`templates/AGENTS.md`） | root 平面上拓扑与内置禁令的唯一规范性 owner。装进用户 home 后按用户全局文件口吻写，不自称安装器。 |
| 子代理公共基线（`prompts/subagent-model-instructions.md`） | 子平面唯一的第二 owner：leaf 纪律与（因孩子未必读到全局 AGENTS 而需要的）内置类型禁令。不写作者工作区的 task 产品名、已退役角色名或 feature-flag 旁白。 |
| README | 人类用户：这是什么、复制一句话让智能体安装。不写安装器命令、overlay 键名或协助 AI 问卷。 |
| `docs/install-for-ai.md` | 协助 AI 的安装协议：选定绝对 CODEX_HOME、`--home`、models.json 整份覆盖、根模型和推理档位保留、上下文覆盖询问后迁移、已有 AGENTS 询问后合并、分别拒绝后的继续与恢复方式、备份和验证。 |
| 协助 AI 文档（`install-for-ai.md` 与 `agents-merge.md`） | 可以提及旧文件名，但必须包在以可观测状态为键的条件句里。 |

文件存在或字节相等不证明语义或模型行为改善。
