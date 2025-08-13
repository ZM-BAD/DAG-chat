# UniformLLM

## 项目介绍

UniformLLM 是一个统一的大语言模型接口项目，旨在为不同厂商的大模型提供统一的调用接口。

## Git Commit 规范

本项目使用标准化的 Git commit 模板来确保提交信息的一致性和可读性。

### 使用方法

在进行 Git commit 时，请使用以下命令来应用模板：

```
git config commit.template .gitmessage
```

配置完成后，每次提交时可以使用以下命令：

```
git commit
```

这将打开一个编辑器，其中包含预定义的 commit 模板，帮助您编写符合规范的提交信息。

### Commit 模板说明

模板文件位于项目根目录的 `.gitmessage` 文件中，包含以下部分：

1. **Type**: 提交类型，如 feat(新功能)、fix(修复)、docs(文档)等
2. **Scope**: 影响范围(可选)
3. **Subject**: 简短描述
4. **Body**: 详细描述(可选)
5. **Footer**: 引用问题或拉取请求(可选)

请遵循模板中的说明来编写提交信息。