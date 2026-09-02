# LangGraph 概述

> 借助 LangGraph 获得掌控力，设计能可靠处理复杂任务的智能体

LangGraph 是一个底层编排框架和运行时，用于构建、管理和部署长时间运行、有状态的智能体，深受 Klarna、Uber、J.P. Morgan 等塑造智能体未来的公司信赖。LangGraph 为你提供细粒度的控制，让你可以在同一个图中混合确定性、手写代码的步骤与 LLM 驱动的智能体步骤，从而构建出完全符合应用程序要求的定制智能体。

LangGraph 非常底层，完全专注于智能体**编排**。在使用 LangGraph 之前，我们建议你先熟悉一些用于构建智能体的组件，从[模型](/oss/python/langchain/models)和[工具](/oss/python/langchain/tools)开始。

在整个文档中，我们会经常使用 [LangChain](/oss/python/langchain/overview) 组件来集成模型和工具，但你并非必须使用 LangChain 才能使用 LangGraph。如果你刚开始接触智能体，或者想要更高层次的抽象，我们建议你使用 LangChain 的[智能体](/oss/python/langchain/agents)，它为常见的 LLM 和工具调用循环提供了预构建的架构。

LangGraph 专注于对智能体编排至关重要的底层能力：持久执行、流式处理、人在回路等。

LangGraph 的核心优势之一是能够在单个图中混合确定性步骤与 LLM 驱动的智能体步骤。这让你可以构建定制化工作流，其中部分逻辑完全可预测、可审计，而其他部分则灵活、由模型驱动，使你能够精确控制 AI 在何处以及如何被应用。

<Expandable title="LangChain 各产品如何协同工作" defaultOpen={false}>
  * [Deep Agents](/oss/python/deepagents/overview) 是一个[智能体框架（agent harness）](/oss/python/concepts/products#agent-harnesses-like-the-deep-agents-sdk)：在 LangGraph 之上提供规划、子智能体、文件系统工具和上下文管理。
  * [LangChain](/oss/python/langchain/overview) 是智能体框架：提供模型、工具和智能体循环的抽象与集成。
  * [LangGraph](/oss/python/langgraph/overview) 是编排运行时：持久执行、流式处理、人在回路和持久化。
  * [LangSmith](/langsmith/observability) 是跨框架进行追踪、评估、提示词和部署的平台。
  * [LangSmith Engine](/langsmith/engine) 检测你的 LangGraph 智能体追踪中的问题并提出修复建议。你可以直接从 Engine 标签页为建议的修复发起拉取请求。
  * [LangSmith Fleet](/langsmith/fleet/index) 是无代码智能体构建器，用于模板、集成和日常自动化。

  有关开源技术栈的比较，请阅读[框架、运行时与智能体框架](/oss/python/concepts/products)。
</Expandable>

## <Icon icon="download" size={20} /> 安装

<CodeGroup>
  ```bash pip theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
  pip install -U langgraph
  ```

  ```bash uv theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
  uv add langgraph
  ```
</CodeGroup>

然后，创建一个简单的 hello world 示例：

```python theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
from langgraph.graph import StateGraph, MessagesState, START, END

def mock_llm(state: MessagesState):
    return {"messages": [{"role": "ai", "content": "hello world"}]}

graph = StateGraph(MessagesState)
graph.add_node(mock_llm)
graph.add_edge(START, "mock_llm")
graph.add_edge("mock_llm", END)
graph = graph.compile()

graph.invoke({"messages": [{"role": "user", "content": "hi!"}]})
```

<Tip>
  使用 [LangSmith](/langsmith/observability) 追踪请求、调试智能体行为并评估输出。设置 `LANGSMITH_TRACING=true` 和你的 API 密钥即可开始。按照[追踪快速入门](/langsmith/trace-with-langchain)进行设置。我们还建议你配置 [LangSmith Engine](/langsmith/engine)，它会监控你的追踪、检测问题并提出修复建议。
</Tip>

## 核心优势

LangGraph 为*任何*长时间运行、有状态的工作流或智能体提供底层支撑基础设施。LangGraph 不抽象提示词或架构，而是提供以下核心优势：

* **混合确定性与智能体步骤**：在单个图中将手写代码的确定性逻辑与 LLM 驱动的决策相结合。在需要可靠性和可预测性的地方使用确定性步骤，在需要灵活性的地方使用智能体步骤——让你对智能体行为的每个部分都能精确控制。
* [持久化](/oss/python/langgraph/persistence)：构建能够在故障中存活、长时间运行并从中断处恢复的智能体。
* [人在回路](/oss/python/langgraph/interrupts)：通过在任何时刻检查和修改智能体状态来引入人工监督。
* [全面的记忆](/oss/python/concepts/memory)：创建有状态的智能体，既具备用于持续推理的短期工作记忆，也具备跨会话的长期记忆。
* [使用 LangSmith 调试](/langsmith/observability)：借助可视化工具深入了解复杂的智能体行为，这些工具可以追踪执行路径、捕获状态转换并提供详细的运行时指标。
* [生产级部署](/langsmith/deployment)：借助专为处理有状态、长时间运行工作流的独特挑战而设计的可扩展基础设施，自信地部署复杂的智能体系统。

## LangGraph 生态系统

虽然 LangGraph 可以独立使用，但它也能与任何 LangChain 产品无缝集成，为开发者提供一整套构建智能体的工具。为了改进你的 LLM 应用开发，可将 LangGraph 与以下产品搭配使用：

<Columns cols={1}>
  <Card title="LangSmith Observability" icon="https://mintcdn.com/langchain-5e9cc07a/nQm-sjd_MByLhgeW/images/brand/observability-icon-dark.png?fit=max&auto=format&n=nQm-sjd_MByLhgeW&q=85&s=ccbc183bca2a5e4ca78d30149e3836cc" href="/langsmith/observability" arrow cta="了解更多" width="200" height="200" data-path="images/brand/observability-icon-dark.png">
    在同一个地方追踪请求、评估输出并监控部署。在本地用 LangGraph 进行原型开发，然后借助集成式的可观测性和评估进入生产环境，构建更可靠的智能体系统。
  </Card>

  <Card title="LangSmith Deployment" icon="https://mintcdn.com/langchain-5e9cc07a/nQm-sjd_MByLhgeW/images/brand/deployment-icon-dark.png?fit=max&auto=format&n=nQm-sjd_MByLhgeW&q=85&s=024e3712d388bfa55f4f160cc9d6a85b" href="/langsmith/deployment" arrow cta="了解更多" width="200" height="200" data-path="images/brand/deployment-icon-dark.png">
    借助专为长时间运行、有状态工作流打造的部署平台，轻松部署和扩展智能体。跨团队发现、复用、配置和共享智能体——并通过 Studio 中的可视化原型快速迭代。
  </Card>

  <Card title="LangChain" icon="https://mintcdn.com/langchain-5e9cc07a/nQm-sjd_MByLhgeW/images/brand/langchain-icon.png?fit=max&auto=format&n=nQm-sjd_MByLhgeW&q=85&s=663b30f85baf99ad708b97e05da2a5a4" href="/oss/python/langchain/overview" arrow cta="了解更多" width="195" height="195" data-path="images/brand/langchain-icon.png">
    提供集成和可组合组件，以简化 LLM 应用开发。包含构建在 LangGraph 之上的智能体抽象。
  </Card>
</Columns>

## 致谢

LangGraph 的灵感来自 [Pregel](https://research.google/pubs/pub37252/) 和 [Apache Beam](https://beam.apache.org/)。其公共接口的设计参考了 [NetworkX](https://networkx.org/documentation/latest/)。LangGraph 由 LangChain 的创造者 LangChain Inc 构建，但可以不依赖 LangChain 使用。

***

<div className="source-links">
  <Callout icon="terminal-2">
    [通过 MCP 将这些文档连接到 Claude、VSCode 等](/use-these-docs)，获取实时解答。
  </Callout>

  <Callout icon="edit">
    [在 GitHub 上编辑此页面](https://github.com/langchain-ai/docs/edit/main/src/oss/langgraph/overview.mdx) 或[提交问题](https://github.com/langchain-ai/docs/issues/new/choose)。
  </Callout>
</div>