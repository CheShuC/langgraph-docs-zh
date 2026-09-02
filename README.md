# LangGraph（Python）官方文档中文镜像

> 来源：https://docs.langchain.com/oss/python/langgraph/
> 页数：43 页（来自官方分区索引 `https://docs.langchain.com/oss/python/langgraph/llms.txt`）
> 格式：Markdown 原文（`.md` 端点 + `Accept: text/markdown` 内容协商），约 2.8 MB
> 抓取脚本：`langgraph_mirror.py`

## 📁 目录结构

```
langgraph-docs-zh/
└── oss/python/langgraph/*.md         # 43 篇文档的中文翻译，路径与原站 URL 一一对应
    ├── overview.md / quickstart.md / install.md / ...
    ├── use-graph-api.md / use-functional-api.md / ...
    ├── errors/*.md  frontend/*.md    # 子目录
    └── changelog-py.md / changelog-js.md
```

> 注：原始抓取镜像（含 `llms.txt`、`llms-langgraph.txt`、`pypi-langgraph.json`、`overview.html` 等文件）位于同级的 `langgraph-docs/` 目录。

## 📅 更新日期与版本核对（2026-09-02 镜像时）

| 项目 | 值 |
|------|-----|
| **Overview 页面最后修改**（页内 JSON-LD `dateModified`） | **2026-07-24** |
| Changelog 收录的最新 langgraph 条目 | **v1.2.0**（2026-05-12） |
| Changelog 页面最后一条（deepagents） | 2026-07-24 |
| **PyPI 最新版** | **1.2.11**（2026-08-11 上传） |
| 差异 | 文档主线在 1.2.x 时代，**落后最新版 11 个补丁版本**（1.2.1 ~ 1.2.11 尚未收录进该站 changelog） |

**结论**：这份文档对应的是 langgraph **1.2.0 时代**（主线内容与 1.2.x 一致，V2/函数式 API、持久化等均为当前形态）；不是 1.2.11 的最新快照。差别主要在小补丁的 bug 修复与微调，对翻译学习影响不大。注：GitHub Releases 的 "latest" 被 langgraph-sdk 占用（多包共仓），以 PyPI 为准。

## 🔄 重新抓取

```bash
python langgraph_mirror.py
```

## ✏️ 翻译约定

- 正文为 Markdown，含少量 MDX 组件（`<Callout>`、`<Expandable>`、`<CodeGroup>`、`<Update>`、`<Icon>` 等）与 `theme={...}` 代码块标记——翻译时保留这些结构，仅翻译其中的文字。
- 每个文件头部的 `> ## Documentation Index` 索引导言块已删除。
- 术语对照：Graph→图、Node→节点、Edge→边、State→状态、Channel→通道、Checkpointer→检查点存储、Subgraph→子图、Streaming→流式处理、Persistence→持久化、Agent→智能体、Tool→工具、Prompt→提示词。API 名称（Graph API、Functional API）与代码标识符保持原文。

---

## 📖 已翻译文档索引

> 基于 [LangGraph 官方文档](https://docs.langchain.com/oss/python/langgraph/) 翻译
> 版本：1.2.0 时代（2026-07-24 镜像）
> 共 44 篇文档

### 🚀 快速开始

| 文档 | 说明 |
|------|------|
| [概述](oss/python/langgraph/overview.md) | LangGraph 是什么 |
| [快速入门](oss/python/langgraph/quickstart.md) | 5 分钟上手 LangGraph |
| [安装](oss/python/langgraph/install.md) | 安装和配置 |

---

### 📚 核心概念

| 文档 | 说明 |
|------|------|
| [LangGraph 思维方式](oss/python/langgraph/thinking-in-langgraph.md) | 理解 LangGraph 的设计哲学 |
| [选择 API](oss/python/langgraph/choosing-apis.md) | Graph API vs 函数式 API |
| [应用结构](oss/python/langgraph/application-structure.md) | 应用的整体架构 |

---

### 🔧 API 文档

#### Graph API

| 文档 | 说明 |
|------|------|
| [使用 Graph API](oss/python/langgraph/use-graph-api.md) | Graph API 入门教程 |
| [Graph API 参考](oss/python/langgraph/graph-api.md) | 完整的 Graph API 参考 |
| [Pregel](oss/python/langgraph/pregel.md) | Pregel 执行引擎 |

#### 函数式 API

| 文档 | 说明 |
|------|------|
| [使用函数式 API](oss/python/langgraph/use-functional-api.md) | 函数式 API 入门教程 |
| [函数式 API 参考](oss/python/langgraph/functional-api.md) | 完整的函数式 API 参考 |

---

### 💾 持久化和状态

| 文档 | 说明 |
|------|------|
| [持久化](oss/python/langgraph/persistence.md) | 状态持久化机制 |
| [检查点存储](oss/python/langgraph/checkpointers.md) | 检查点存储实现 |
| [存储](oss/python/langgraph/stores.md) | 键值存储功能 |

---

### 📡 流式处理

| 文档 | 说明 |
|------|------|
| [流式处理](oss/python/langgraph/streaming.md) | 流式输出功能 |
| [事件流](oss/python/langgraph/event-streaming.md) | 事件流处理 |

---

### 🔁 中断和容错

| 文档 | 说明 |
|------|------|
| [中断](oss/python/langgraph/interrupts.md) | 工作流中断和恢复 |
| [容错](oss/python/langgraph/fault-tolerance.md) | 错误处理和重试 |

---

### 🧩 高级功能

| 文档 | 说明 |
|------|------|
| [子图](oss/python/langgraph/use-subgraphs.md) | 子图的使用 |
| [时间旅行](oss/python/langgraph/use-time-travel.md) | 状态回放和调试 |
| [工作流和智能体](oss/python/langgraph/workflows-agents.md) | 工作流与智能体模式 |
| [Agentic RAG](oss/python/langgraph/agentic-rag.md) | 自主检索增强生成 |
| [添加记忆](oss/python/langgraph/add-memory.md) | 记忆功能 |
| [SQL 智能体](oss/python/langgraph/sql-agent.md) | 数据库交互智能体 |

---

### 🚀 部署

| 文档 | 说明 |
|------|------|
| [本地服务器](oss/python/langgraph/local-server.md) | 本地开发服务器 |
| [部署](oss/python/langgraph/deploy.md) | 生产环境部署 |
| [可观测性](oss/python/langgraph/observability.md) | 监控和追踪 |

---

### 🎨 前端集成

| 文档 | 说明 |
|------|------|
| [前端概述](oss/python/langgraph/frontend/overview.md) | 前端集成概述 |
| [图执行](oss/python/langgraph/frontend/graph-execution.md) | 前端图执行控制 |
| [自定义流通道](oss/python/langgraph/frontend/custom-stream-channels.md) | 自定义流通道 |
| [用户界面](oss/python/langgraph/ui.md) | UI 工具 |
| [Studio](oss/python/langgraph/studio.md) | LangGraph Studio |

---

### 🧪 测试和错误处理

| 文档 | 说明 |
|------|------|
| [测试](oss/python/langgraph/test.md) | 测试指南 |
| [GRAPH_RECURSION_LIMIT](oss/python/langgraph/errors/GRAPH_RECURSION_LIMIT.md) | 递归限制错误 |
| [INVALID_CHAT_HISTORY](oss/python/langgraph/errors/INVALID_CHAT_HISTORY.md) | 无效聊天历史 |
| [INVALID_CONCURRENT_GRAPH_UPDATE](oss/python/langgraph/errors/INVALID_CONCURRENT_GRAPH_UPDATE.md) | 并发更新错误 |
| [INVALID_GRAPH_NODE_RETURN_VALUE](oss/python/langgraph/errors/INVALID_GRAPH_NODE_RETURN_VALUE.md) | 节点返回值错误 |
| [MISSING_CHECKPOINTER](oss/python/langgraph/errors/MISSING_CHECKPOINTER.md) | 缺少检查点存储 |
| [MULTIPLE_SUBGRAPHS](oss/python/langgraph/errors/MULTIPLE_SUBGRAPHS.md) | 多子图错误 |

---

### 📋 版本管理

| 文档 | 说明 |
|------|------|
| [向后兼容性](oss/python/langgraph/backward-compatibility.md) | 兼容性说明 |
| [Python 变更日志](oss/python/langgraph/changelog-py.md) | Python 版本历史 |
| [JavaScript 变更日志](oss/python/langgraph/changelog-js.md) | JavaScript 版本历史 |

---

### 🔗 相关链接

- [LangGraph 官方文档](https://docs.langchain.com/oss/python/langgraph/)
- [LangGraph GitHub](https://github.com/langchain-ai/langgraph)
- [LangChain 文档](https://python.langchain.com/)