# nb-codex

给 OpenAI Codex 用的一套配置：系统提示、七个编码角色、并行协作方式和模型列表。装进你这台机器上的 Codex 目录之后，写代码、查仓库、做调研和审查会按这套角色来分工。

## 怎么装

电脑上要有 Git、Node.js 22 和 Codex CLI。把下面这句话复制给帮你配环境的智能体即可：

```
帮我安装 https://github.com/NB-Corp/nb-codex/tree/with_grok
```

它会选定你的 Codex 目录，并写入本包的提示词、角色、协作方式和模型列表。主会话用哪个模型、思考打到哪一档，保持原样。实现、前端、调研、审查和深度思考角色使用 Astra，探索与批量执行使用 Luna；后两者开启 Fast，会增加额度消耗。

Astra / Sol 的自动压缩阈值为 320k，Terra / Luna 为 650k。已有上下文设置时，智能体会说明旧值与新策略的差别，询问后再替换；已有全局 AGENTS.md 也会先询问再合并。你可以保留这两项，只安装其它内容。原来的托管文件和这一包对不上时，也会先问再动手。装完后新开一个 Codex 会话。

## 如果你是 AI

请打开 [`docs/install-for-ai.md`](docs/install-for-ai.md)，按那里的步骤装。
