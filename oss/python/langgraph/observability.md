# LangSmith 可观测性

Trace（追踪）是您的应用从输入到输出所经历的一系列步骤。其中每一个单独的步骤都由一个 run（运行）来表示。您可以使用 [LangSmith](https://smith.langchain.com?utm_source=docs\&utm_medium=cta\&utm_campaign=langsmith-signup\&utm_content=oss-langgraph-observability) 来可视化这些执行步骤。要使用它，请[为您的应用启用追踪](/langsmith/trace-with-langgraph)。这使您可以执行以下操作：

* [调试本地运行的应用](/langsmith/observability-studio#debug-langsmith-traces)。
* [评估应用的性能](/oss/python/langchain/test/evals)。
* [监控应用](/langsmith/dashboards)。

## 前置条件

在开始之前，请确保您具备以下条件：

* **一个 LangSmith 账号**：在 [smith.langchain.com](https://smith.langchain.com?utm_source=docs\&utm_medium=cta\&utm_campaign=langsmith-signup\&utm_content=oss-langgraph-observability) 免费注册或登录。
* **一个 LangSmith API 密钥**：按照[创建 API 密钥](/langsmith/create-account-api-key)指南操作。

## 启用追踪

要为您的应用启用追踪，请设置以下环境变量：

```python theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
export LANGSMITH_TRACING=true
export LANGSMITH_API_KEY=<your-api-key>
```

默认情况下，trace 将记录到名为 `default` 的项目中。要配置自定义项目名称，请参阅[记录到项目](#log-to-a-project)。

更多信息，请参阅[使用 LangGraph 进行追踪](/langsmith/trace-with-langgraph)。

## 选择性追踪

您可以使用 LangSmith 的 `tracing_context` 上下文管理器选择追踪特定的调用或应用的部分内容：

```python theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
import langsmith as ls

# This WILL be traced
with ls.tracing_context(enabled=True):
    agent.invoke({"messages": [{"role": "user", "content": "Send a test email to alice@example.com"}]})

# This will NOT be traced (if LANGSMITH_TRACING is not set)
agent.invoke({"messages": [{"role": "user", "content": "Send another email"}]})
```

## 记录到项目

<Accordion title="静态设置">
  您可以通过设置 `LANGSMITH_PROJECT` 环境变量为整个应用设置自定义项目名称：

  ```bash theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
  export LANGSMITH_PROJECT=my-agent-project
  ```
</Accordion>

<Accordion title="动态设置">
  您可以通过编程方式为特定操作设置项目名称：

  ```python theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
  import langsmith as ls

  with ls.tracing_context(project_name="email-agent-test", enabled=True):
      response = agent.invoke({
          "messages": [{"role": "user", "content": "Send a welcome email"}]
      })
  ```
</Accordion>

## 向 trace 添加元数据

您可以使用自定义元数据和标签来标注您的 trace：

```python theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
response = agent.invoke(
    {"messages": [{"role": "user", "content": "Send a welcome email"}]},
    config={
        "tags": ["production", "email-assistant", "v1.0"],
        "metadata": {
            "user_id": "user_123",
            "session_id": "session_456",
            "environment": "production"
        }
    }
)
```

`tracing_context` 也接受标签和元数据，以实现精细控制：

```python theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
with ls.tracing_context(
    project_name="email-agent-test",
    enabled=True,
    tags=["production", "email-assistant", "v1.0"],
    metadata={"user_id": "user_123", "session_id": "session_456", "environment": "production"}):
    response = agent.invoke(
        {"messages": [{"role": "user", "content": "Send a welcome email"}]}
    )
```

这些自定义元数据和标签将会附加到 LangSmith 中的 trace 上。

<Tip>
  要了解如何使用 trace 来调试、评估和监控您的智能体，请参阅 [LangSmith 文档](/langsmith/observability)。
</Tip>

## 使用匿名化器防止在 trace 中记录敏感数据

您可能希望屏蔽敏感数据，以防止其被记录到 LangSmith。您可以创建[匿名化器](/langsmith/mask-inputs-outputs#rule-based-masking-of-inputs-and-outputs)并通过配置将其应用到您的图上。以下示例将从发送到 LangSmith 的 trace 中遮蔽任何匹配美国社会安全号码格式 XXX-XX-XXXX 的内容。

```python Python theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
from langchain_core.tracers.langchain import LangChainTracer
from langgraph.graph import StateGraph, MessagesState
from langsmith import Client
from langsmith.anonymizer import create_anonymizer

anonymizer = create_anonymizer([
    # Matches SSNs
    { "pattern": r"\b\d{3}-?\d{2}-?\d{4}\b", "replace": "<ssn>" }
])

tracer_client = Client(anonymizer=anonymizer)
tracer = LangChainTracer(client=tracer_client)
# Define the graph
graph = (
    StateGraph(MessagesState)
    ...
    .compile()
    .with_config({'callbacks': [tracer]})
)
```

***

<div className="source-links">
  <Callout icon="terminal-2">
    [Connect these docs](/use-these-docs) to Claude, VSCode, and more via MCP for real-time answers.
  </Callout>

  <Callout icon="edit">
    [Edit this page on GitHub](https://github.com/langchain-ai/docs/edit/main/src/oss/langgraph/observability.mdx) or [file an issue](https://github.com/langchain-ai/docs/issues/new/choose).
  </Callout>
</div>