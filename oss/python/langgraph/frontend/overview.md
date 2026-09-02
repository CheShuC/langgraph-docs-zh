# 概述

> 将 LangGraph 智能体渲染到前端

实时构建可视化 LangGraph 流水线的前端。这些模式展示了如何渲染多步骤的图执行，包括每个节点的状态，以及来自自定义 `StateGraph` 工作流的流式内容。

LangGraph 在前端方面的优势在于，用户界面可以遵循与图相同的结构。节点、状态键、检查点、中断、子图和流式消息都是可见的运行时概念，因此您可以构建能够说明系统正在做什么的界面，而不是将执行过程隐藏在一句助手消息之后。

<Note>
  这些模式使用 v1 前端 SDK 包。如果您使用的是更早的版本，请参阅 [React](https://github.com/langchain-ai/langgraphjs/blob/main/libs/sdk-react/docs/v1-migration.md)、[Vue](https://github.com/langchain-ai/langgraphjs/blob/main/libs/sdk-vue/docs/v1-migration.md)、[Svelte](https://github.com/langchain-ai/langgraphjs/blob/main/libs/sdk-svelte/docs/v1-migration.md) 和 [Angular](https://github.com/langchain-ai/langgraphjs/blob/main/libs/sdk-angular/docs/v1-migration.md) 的迁移指南。
</Note>

## 架构

LangGraph 图由通过边连接的命名节点组成。每个节点执行一个步骤（分类、研究、分析、综合），并将输出写入特定的状态键。在前端，SDK 的流句柄提供对节点输出、流式令牌和已发现子图的响应式访问，因此您可以将每个节点映射到一张 UI 卡片。

```mermaid theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
%%{
  init: {
    "fontFamily": "monospace",
    "flowchart": {
      "curve": "curve"
    }
  }
}%%
graph LR
  FRONTEND["useStream()"]
  GRAPH["StateGraph"]
  N1["Node A"]
  N2["Node B"]
  N3["Node C"]

  GRAPH --"stream"--> FRONTEND
  FRONTEND --"submit"--> GRAPH
  GRAPH --> N1
  N1 --> N2
  N2 --> N3

  classDef blueHighlight fill:#DBEAFE,stroke:#2563EB,color:#1E3A8A;
  classDef greenHighlight fill:#DCFCE7,stroke:#16A34A,color:#14532D;
  classDef orangeHighlight fill:#FEF3C7,stroke:#D97706,color:#92400E;
  class FRONTEND blueHighlight;
  class GRAPH greenHighlight;
  class N1,N2,N3 orangeHighlight;
```

```python theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
from langgraph.graph import StateGraph, MessagesState, START, END

class State(MessagesState):
    classification: str
    research: str
    analysis: str
    synthesis: str

graph = StateGraph(State)
graph.add_node("classify", classify_node)
graph.add_node("do_research", research_node)
graph.add_node("analyze", analyze_node)
graph.add_node("synthesize", synthesize_node)
graph.add_edge(START, "classify")
graph.add_edge("classify", "do_research")
graph.add_edge("do_research", "analyze")
graph.add_edge("analyze", "synthesize")
graph.add_edge("synthesize", END)

app = graph.compile()
```

在前端，[`useStream`](https://reference.langchain.com/javascript/langchain-react/index/useStream) 通过 `stream.subgraphs` 暴露用于图节点发现的句柄，并提供诸如 `useMessages(stream, node)` 之类的选择器辅助函数，用于获取节点作用域的流式内容。当您需要诸如最终 `synthesis` 之类的字段时，`stream.values` 仍然保存完整的图状态。Angular 通过 [`injectStream`](https://reference.langchain.com/javascript/langchain-angular/injectStream) 使用相同的流 API 形态。

```ts theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
import { useStream } from "@langchain/react";

function Pipeline() {
  const stream = useStream<typeof graph>({
    apiUrl: "http://localhost:2024",
    assistantId: "pipeline",
  });

  const classification = stream.values?.classification;
  const research = stream.values?.research;
  const analysis = stream.values?.analysis;
  const graphNodes = [...stream.subgraphs.values()];
}
```

## 与聊天流有何不同

自定义图常用来驱动产品工作流：研究流水线、审批流、数据流水线、数据丰富、代码审查、规划以及多步骤分析。前端 SDK 让您可以使用图原生的信号来渲染这些工作流：

| 运行时概念        | 前端用户体验                                                                                            |
| ---------------------- | ------------------------------------------------------------------------------------------------------ |
| **命名节点**        | 每个图节点对应一张卡片、时间线步骤或状态徽章。                                               |
| **状态键**         | 为分类、来源、分析和最终综合等类型化输出提供专用的 UI 区域。 |
| **流式元数据** | 将部分消息路由到产生它们的节点。                                                 |
| **检查点**        | 检查或从先前的图状态恢复，用于调试和审计。                              |
| **中断**         | 暂停节点以等待人工输入、审批或更正，然后继续。                                  |
| **子图**          | 仅在用户需要更多细节时展示嵌套执行。                                          |

由于 SDK 直接暴露了这些概念，因此无需更改后端协议，您就可以从简单的聊天面板扩展为完整的工作流调试器。

## 模式

<CardGroup cols={2}>
  <Card title="图执行" icon="chart-dots" href="/oss/python/langgraph/frontend/graph-execution">
    可视化多步骤图流水线，显示每个节点的状态和流式内容。
  </Card>

  <Card title="自定义流通道" icon="broadcast" href="/oss/python/langgraph/frontend/custom-stream-channels">
    将自定义的服务端数据流式传输到前端，并使用 `useExtension` 和 `useChannel` 读取。
  </Card>
</CardGroup>

## 相关模式

[LangChain 前端模式](/oss/python/langchain/frontend/overview)——markdown 消息、工具调用、人机协同、可恢复流和时间旅行——适用于任何 LangGraph 图。无论您使用 `createAgent`、`createDeepAgent` 还是自定义的 `StateGraph`，流 API 都提供相同的核心数据模型。

***

<div className="source-links">
  <Callout icon="terminal-2">
    [Connect these docs](/use-these-docs) to Claude, VSCode, and more via MCP for real-time answers.
  </Callout>

  <Callout icon="edit">
    [Edit this page on GitHub](https://github.com/langchain-ai/docs/edit/main/src/oss/langgraph/frontend/overview.md) or [file an issue](https://github.com/langchain-ai/docs/issues/new/choose).
  </Callout>
</div>