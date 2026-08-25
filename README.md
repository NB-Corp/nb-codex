# nb-codex

给 OpenAI Codex 用的一套配置：系统提示、七个编码角色、并行协作方式和模型列表。装进你这台机器上的 Codex 目录之后，写代码、查仓库、做调研和审查会按这套角色来分工。

## 怎么装

电脑上要有 Git、Node.js 22 和 Codex CLI。把下面这句话复制给帮你配环境的智能体即可：

```
帮我安装 https://github.com/NB-Corp/nb-codex/tree/with_grok
```

它会选定你的 Codex 目录，并写入本包的提示词、角色、协作方式和模型列表。平时用哪个模型、思考打到哪一档，这包不会改。原来的文件和这一包对不上时，它会先问你再动手。装完后新开一个 Codex 会话。

## 如果你是 AI

请打开 [`docs/install-for-ai.md`](docs/install-for-ai.md)，按那里的步骤装。
