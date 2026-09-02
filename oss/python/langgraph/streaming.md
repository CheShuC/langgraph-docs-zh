# 流式处理

<Tip>
  对于新应用，我们推荐[事件流式处理](/oss/python/langgraph/event-streaming)——这是 LangGraph v1.2 中引入的带类型投影（typed projection）的 API。事件流式处理为每个投影（消息、值、子图、输出）提供独立的迭代器，您可以独立消费它们，而不必对 `stream_mode` 的块进行分支判断。
</Tip>

本页介绍 LangGraph 的流模式 API。它通过 `updates`、`values`、`messages`、`custom`、`checkpoints`、`tasks` 和 `debug` 等流模式暴露图执行过程。当您需要直接访问图运行时事件或特定流模式的输出时，请使用该 API。

## 开始使用

### 基本用法

LangGraph 图暴露了 [`stream`](https://reference.langchain.com/python/langgraph/pregel/#langgraph.pregel.Pregel.stream)（同步）和 [`astream`](https://reference.langchain.com/python/langgraph/pregel/#langgraph.pregel.Pregel.astream)（异步）方法，以迭代器的形式产生流式输出。传入一个或多个[流模式](#stream-modes)来控制您接收的数据。

```python theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
for chunk in graph.stream(
    {"topic": "ice cream"},
    stream_mode=["updates", "custom"],  # [!code highlight]
    version="v2",  # [!code highlight]
):
    if chunk["type"] == "updates":
        for node_name, state in chunk["data"].items():
            print(f"Node {node_name} updated: {state}")
    elif chunk["type"] == "custom":
        print(f"Status: {chunk['data']['status']}")
```

```shell title="Output" theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
Status: thinking of a joke...
Node generate_joke updated: {'joke': 'Why did the ice cream go to school? To get a sundae education!'}
```

<Accordion title="完整示例">
  ```python theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
  from typing import TypedDict
  from langgraph.graph import StateGraph, START, END
  from langgraph.config import get_stream_writer


  class State(TypedDict):
      topic: str
      joke: str


  def generate_joke(state: State):
      writer = get_stream_writer()
      writer({"status": "thinking of a joke..."})
      return {"joke": f"Why did the {state['topic']} go to school? To get a sundae education!"}

  graph = (
      StateGraph(State)
      .add_node(generate_joke)
      .add_edge(START, "generate_joke")
      .add_edge("generate_joke", END)
      .compile()
  )

  for chunk in graph.stream(
      {"topic": "ice cream"},
      stream_mode=["updates", "custom"],
      version="v2",
  ):
      if chunk["type"] == "updates":
          for node_name, state in chunk["data"].items():
              print(f"Node {node_name} updated: {state}")
      elif chunk["type"] == "custom":
          print(f"Status: {chunk['data']['status']}")
  ```

  ```shell title="Output" theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
  Status: thinking of a joke...
  Node generate_joke updated: {'joke': 'Why did the ice cream go to school? To get a sundae education!'}
  ```
</Accordion>

<Tip>
  使用 [LangSmith](https://smith.langchain.com?utm_source=docs\&utm_medium=cta\&utm_campaign=langsmith-signup\&utm_content=oss-langgraph-streaming) 调试流式事件、检查逐 token 的 LLM 输出并监控延迟。按照[跟踪快速入门](/langsmith/trace-with-langgraph)进行设置。
</Tip>

### 流输出格式（v2）

<Note>
  需要 LangGraph >= 1.1。本页所有示例都使用 `version="v2"`。
</Note>

向 `stream()` 或 `astream()` 传入 `version="v2"` 以获得统一的输出格式。每个块都是一个 `StreamPart` 字典，具有一致的形状——无论流模式、模式数量或子图设置如何：

```python theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
{
    "type": "values" | "updates" | "messages" | "custom" | "checkpoints" | "tasks" | "debug",
    "ns": (),           # namespace tuple, populated for subgraph events
    "data": ...,        # the actual payload (type varies by stream mode)
}
```

每种流模式都有对应的 `TypedDict`，包含 [`ValuesStreamPart`](https://reference.langchain.com/python/langgraph/types/ValuesStreamPart)、[`UpdatesStreamPart`](https://reference.langchain.com/python/langgraph/types/UpdatesStreamPart)、[`MessagesStreamPart`](https://reference.langchain.com/python/langgraph/types/MessagesStreamPart)、[`CustomStreamPart`](https://reference.langchain.com/python/langgraph/types/CustomStreamPart)、[`CheckpointStreamPart`](https://reference.langchain.com/python/langgraph/types/CheckpointStreamPart)、[`TasksStreamPart`](https://reference.langchain.com/python/langgraph/types/TasksStreamPart)、[`DebugStreamPart`](https://reference.langchain.com/python/langgraph/types/DebugStreamPart)。您可以从 `langgraph.types` 导入这些类型。联合类型 [`StreamPart`](https://reference.langchain.com/python/langgraph/types/StreamPart) 是 `part["type"]` 上的不相交联合，可在编辑器和类型检查器中实现完整的类型收窄。

使用 v1（默认）时，输出格式会根据您的流式选项而变化（单模式返回原始数据，多模式返回 `(mode, data)` 元组，子图返回 `(namespace, data)` 元组）。使用 v2 时，格式始终相同：

<CodeGroup>
  ```python v2 (new) theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
  for chunk in graph.stream(inputs, stream_mode="updates", version="v2"):
      print(chunk["type"])  # "updates"
      print(chunk["ns"])    # ()
      print(chunk["data"])  # {"node_name": {"key": "value"}}
  ```

  ```python v1 (current default) theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
  for chunk in graph.stream(inputs, stream_mode="updates"):
      print(chunk)  # {"node_name": {"key": "value"}}
  ```
</CodeGroup>

v2 格式还支持类型收窄，这意味着您可以按 `chunk["type"]` 过滤块并获得正确的载荷类型。每个分支都将 `part["data"]` 收窄为该模式的特定类型：

```python theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
for part in graph.stream(
    {"topic": "ice cream"},
    stream_mode=["values", "updates", "messages", "custom"],
    version="v2",
):
    if part["type"] == "values":
        # ValuesStreamPart — full state snapshot after each step
        print(f"State: topic={part['data']['topic']}")
    elif part["type"] == "updates":
        # UpdatesStreamPart — only the changed keys from each node
        for node_name, state in part["data"].items():
            print(f"Node `{node_name}` updated: {state}")
    elif part["type"] == "messages":
        # MessagesStreamPart — (message_chunk, metadata) from LLM calls
        msg, metadata = part["data"]
        print(msg.content, end="", flush=True)
    elif part["type"] == "custom":
        # CustomStreamPart — arbitrary data from get_stream_writer()
        print(f"Progress: {part['data']['progress']}%")
```

## 流模式

您可以将以下一个或多个流模式以列表形式传给 [`stream`](https://reference.langchain.com/python/langgraph/graphs/#langgraph.graph.state.CompiledStateGraph.stream) 或 [`astream`](https://reference.langchain.com/python/langgraph/graphs/#langgraph.graph.state.CompiledStateGraph.astream) 方法：

| 模式                        | 类型                                                                                                  | 描述                                                                                                                          |
| :-------------------------- | :---------------------------------------------------------------------------------------------------- | :----------------------------------------------------------------------------------------------------------------------------------- |
| [values](#graph-state)      | [`ValuesStreamPart`](https://reference.langchain.com/python/langgraph/types/ValuesStreamPart)         | 每一步之后的完整状态。                                                                                                          |
| [updates](#graph-state)     | [`UpdatesStreamPart`](https://reference.langchain.com/python/langgraph/types/UpdatesStreamPart)       | 每一步之后的状态更新。同一步中的多次更新会分别流式传输。                                            |
| [messages](#llm-tokens)     | [`MessagesStreamPart`](https://reference.langchain.com/python/langgraph/types/MessagesStreamPart)     | 来自 LLM 调用的 2 元组（LLM token、元数据）。                                                                                    |
| [custom](#custom-data)      | [`CustomStreamPart`](https://reference.langchain.com/python/langgraph/types/CustomStreamPart)         | 节点通过 [`get_stream_writer`](https://reference.langchain.com/python/langgraph/config/get_stream_writer) 发出的自定义数据。 |
| [checkpoints](#checkpoints) | [`CheckpointStreamPart`](https://reference.langchain.com/python/langgraph/types/CheckpointStreamPart) | 检查点事件（格式与 `get_state()` 相同）。需要检查点存储。                                                           |
| [tasks](#tasks)             | [`TasksStreamPart`](https://reference.langchain.com/python/langgraph/types/TasksStreamPart)           | 任务开始/结束事件，包含结果和错误。需要检查点存储。                                                           |
| [debug](#debug)             | [`DebugStreamPart`](https://reference.langchain.com/python/langgraph/types/DebugStreamPart)           | 所有可用信息——结合了 `checkpoints` 和 `tasks` 并带有额外元数据。                                                         |

<a id="messages" />

### 图状态

使用流模式 `updates` 和 `values` 在图执行时流式传输图的状态。

* `updates` 在图每一步之后流式传输状态的**更新**。
* `values` 在图每一步之后流式传输状态的**完整值**。

```python theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
from typing import TypedDict
from langgraph.graph import StateGraph, START, END


class State(TypedDict):
  topic: str
  joke: str


def refine_topic(state: State):
    return {"topic": state["topic"] + " and cats"}


def generate_joke(state: State):
    return {"joke": f"This is a joke about {state['topic']}"}

graph = (
  StateGraph(State)
  .add_node(refine_topic)
  .add_node(generate_joke)
  .add_edge(START, "refine_topic")
  .add_edge("refine_topic", "generate_joke")
  .add_edge("generate_joke", END)
  .compile()
)
```

<Tabs>
  <Tab title="updates">
    使用此模式只流式传输节点在每一步之后返回的**状态更新**。流式输出包括节点名称以及更新。

    ```python theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
    for chunk in graph.stream(
        {"topic": "ice cream"},
        stream_mode="updates",  # [!code highlight]
        version="v2",  # [!code highlight]
    ):
        if chunk["type"] == "updates":
            for node_name, state in chunk["data"].items():
                print(f"Node `{node_name}` updated: {state}")
    ```

    ```shell title="Output" theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
    Node `refine_topic` updated: {'topic': 'ice cream and cats'}
    Node `generate_joke` updated: {'joke': 'This is a joke about ice cream and cats'}
    ```
  </Tab>

  <Tab title="values">
    使用此模式在每一步之后流式传输图的**完整状态**。

    ```python theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
    for chunk in graph.stream(
        {"topic": "ice cream"},
        stream_mode="values",  # [!code highlight]
        version="v2",  # [!code highlight]
    ):
        if chunk["type"] == "values":
            print(f"topic: {chunk['data']['topic']}, joke: {chunk['data']['joke']}")
    ```

    ```shell title="Output" theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
    topic: ice cream, joke:
    topic: ice cream and cats, joke:
    topic: ice cream and cats, joke: This is a joke about ice cream and cats
    ```
  </Tab>
</Tabs>

### LLM Token

使用 `messages` 流模式从图的任何部分（包括节点、工具、子图或任务）**逐 token** 流式传输大语言模型（LLM）输出。

[`messages` 模式](#stream-modes)的流式输出是一个元组 `(message_chunk, metadata)`，其中：

* `message_chunk`：来自 LLM 的 token 或消息片段。
* `metadata`：包含图节点和 LLM 调用详细信息的字典。

> 如果您的 LLM 不能作为 LangChain 集成使用，您可以改用 `custom` 模式流式传输其输出。详细信息请参见[与任意 LLM 一起使用](#use-with-any-llm)。

<Warning>
  **Python \< 3.11 下异步需要手动配置**
  在 Python \< 3.11 下使用异步代码时，您必须显式地将 [`RunnableConfig`](https://reference.langchain.com/python/langchain-core/runnables/config/RunnableConfig) 传递给 `ainvoke()` 以启用正确的流式传输。详情请参见[Python \< 3.11 下的异步](#async)，或升级到 Python 3.11+。
</Warning>

```python theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
from dataclasses import dataclass

from langchain.chat_models import init_chat_model
from langgraph.graph import StateGraph, START


@dataclass
class MyState:
    topic: str
    joke: str = ""


model = init_chat_model(model="gpt-5.4-mini")

def call_model(state: MyState):
    """Call the LLM to generate a joke about a topic"""
    # Note that message events are emitted even when the LLM is run using .invoke rather than .stream
    model_response = model.invoke(  # [!code highlight]
        [
            {"role": "user", "content": f"Generate a joke about {state.topic}"}
        ]
    )
    return {"joke": model_response.content}

graph = (
    StateGraph(MyState)
    .add_node(call_model)
    .add_edge(START, "call_model")
    .compile()
)

# The "messages" stream mode streams LLM tokens with metadata
# Use version="v2" for a unified StreamPart format
for chunk in graph.stream(
    {"topic": "ice cream"},
    stream_mode="messages",  # [!code highlight]
    version="v2",  # [!code highlight]
):
    if chunk["type"] == "messages":
        message_chunk, metadata = chunk["data"]
        if message_chunk.content:
            print(message_chunk.content, end="|", flush=True)
```

#### 按 LLM 调用过滤

您可以将 `tags` 关联到 LLM 调用，以便按 LLM 调用过滤流式传输的 token。

```python theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
from langchain.chat_models import init_chat_model

# model_1 is tagged with "joke"
model_1 = init_chat_model(model="gpt-5.4-mini", tags=['joke'])
# model_2 is tagged with "poem"
model_2 = init_chat_model(model="gpt-5.4-mini", tags=['poem'])

graph = ... # define a graph that uses these LLMs

# The stream_mode is set to "messages" to stream LLM tokens
# The metadata contains information about the LLM invocation, including the tags
async for chunk in graph.astream(
    {"topic": "cats"},
    stream_mode="messages",  # [!code highlight]
    version="v2",  # [!code highlight]
):
    if chunk["type"] == "messages":
        msg, metadata = chunk["data"]
        # Filter the streamed tokens by the tags field in the metadata to only include
        # the tokens from the LLM invocation with the "joke" tag
        if metadata["tags"] == ["joke"]:
            print(msg.content, end="|", flush=True)
```

<Accordion title="扩展示例：按标签过滤">
  ```python theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
  from typing import TypedDict

  from langchain.chat_models import init_chat_model
  from langgraph.graph import START, StateGraph

  # The joke_model is tagged with "joke"
  joke_model = init_chat_model(model="gpt-5.4-mini", tags=["joke"])
  # The poem_model is tagged with "poem"
  poem_model = init_chat_model(model="gpt-5.4-mini", tags=["poem"])


  class State(TypedDict):
        topic: str
        joke: str
        poem: str


  async def call_model(state, config):
        topic = state["topic"]
        print("Writing joke...")
        # Note: Passing the config through explicitly is required for python < 3.11
        # Since context var support wasn't added before then: https://docs.python.org/3/library/asyncio-task.html#creating-tasks
        # The config is passed through explicitly to ensure the context vars are propagated correctly
        # This is required for Python < 3.11 when using async code. Please see the async section for more details
        joke_response = await joke_model.ainvoke(
              [{"role": "user", "content": f"Write a joke about {topic}"}],
              config,
        )
        print("\n\nWriting poem...")
        poem_response = await poem_model.ainvoke(
              [{"role": "user", "content": f"Write a short poem about {topic}"}],
              config,
        )
        return {"joke": joke_response.content, "poem": poem_response.content}


  graph = (
        StateGraph(State)
        .add_node(call_model)
        .add_edge(START, "call_model")
        .compile()
  )

  # The stream_mode is set to "messages" to stream LLM tokens
  # The metadata contains information about the LLM invocation, including the tags
  async for chunk in graph.astream(
        {"topic": "cats"},
        stream_mode="messages",
        version="v2",
  ):
      if chunk["type"] == "messages":
          msg, metadata = chunk["data"]
          if metadata["tags"] == ["joke"]:
              print(msg.content, end="|", flush=True)
  ```
</Accordion>

#### 从流中省略消息

使用 `nostream` 标签完全从流中排除 LLM 输出。带有 `nostream` 标签的调用仍然会运行并产生输出；只是其 token 不会在 `messages` 模式中发出。

这在以下场景中很有用：

* 您需要 LLM 输出用于内部处理（例如结构化输出），但不想将其流式传输给客户端
* 您通过另一个通道（例如自定义 UI 消息）流式传输相同内容，并希望避免 `messages` 流中出现重复输出

```python theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
from typing import Any, TypedDict

from langchain_anthropic import ChatAnthropic
from langgraph.graph import START, StateGraph

stream_model = ChatAnthropic(model_name="claude-haiku-4-5-20251001")
internal_model = ChatAnthropic(model_name="claude-haiku-4-5-20251001").with_config(
    {"tags": ["nostream"]}
)


class State(TypedDict):
    topic: str
    answer: str
    notes: str


def answer(state: State) -> dict[str, Any]:
    r = stream_model.invoke(
        [{"role": "user", "content": f"Reply briefly about {state['topic']}"}]
    )
    return {"answer": r.content}


def internal_notes(state: State) -> dict[str, Any]:
    # Tokens from this model are omitted from stream_mode="messages" because of nostream
    r = internal_model.invoke(
        [{"role": "user", "content": f"Private notes on {state['topic']}"}]
    )
    return {"notes": r.content}


graph = (
    StateGraph(State)
    .add_node("write_answer", answer)
    .add_node("internal_notes", internal_notes)
    .add_edge(START, "write_answer")
    .add_edge("write_answer", "internal_notes")
    .compile()
)

initial_state: State = {"topic": "AI", "answer": "", "notes": ""}
stream = graph.stream_events(initial_state, version="v3")
```

#### 按节点过滤

要只从特定节点流式传输 token，请使用 `stream_mode="messages"` 并按流式元数据中的 `langgraph_node` 字段过滤输出：

```python theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
# The "messages" stream mode streams LLM tokens with metadata
# Use version="v2" for a unified StreamPart format
for chunk in graph.stream(
    inputs,
    stream_mode="messages",  # [!code highlight]
    version="v2",  # [!code highlight]
):
    if chunk["type"] == "messages":
        msg, metadata = chunk["data"]
        # Filter the streamed tokens by the langgraph_node field in the metadata
        # to only include the tokens from the specified node
        if msg.content and metadata["langgraph_node"] == "some_node_name":
            ...
```

<Accordion title="扩展示例：从特定节点流式传输 LLM token">
  ```python theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
  from typing import TypedDict
  from langgraph.graph import START, StateGraph
  from langchain_openai import ChatOpenAI

  model = ChatOpenAI(model="gpt-5.4-mini")


  class State(TypedDict):
        topic: str
        joke: str
        poem: str


  def write_joke(state: State):
        topic = state["topic"]
        joke_response = model.invoke(
              [{"role": "user", "content": f"Write a joke about {topic}"}]
        )
        return {"joke": joke_response.content}


  def write_poem(state: State):
        topic = state["topic"]
        poem_response = model.invoke(
              [{"role": "user", "content": f"Write a short poem about {topic}"}]
        )
        return {"poem": poem_response.content}


  graph = (
        StateGraph(State)
        .add_node(write_joke)
        .add_node(write_poem)
        # write both the joke and the poem concurrently
        .add_edge(START, "write_joke")
        .add_edge(START, "write_poem")
        .compile()
  )

  # The "messages" stream mode streams LLM tokens with metadata
  # Use version="v2" for a unified StreamPart format
  for chunk in graph.stream(
      {"topic": "cats"},
      stream_mode="messages",  # [!code highlight]
      version="v2",  # [!code highlight]
  ):
      if chunk["type"] == "messages":
          msg, metadata = chunk["data"]
          # Filter the streamed tokens by the langgraph_node field in the metadata
          # to only include the tokens from the write_poem node
          if msg.content and metadata["langgraph_node"] == "write_poem":
              print(msg.content, end="|", flush=True)
  ```
</Accordion>

### 自定义数据

要从 LangGraph 节点或工具内部发送**自定义用户定义数据**，请按照以下步骤操作：

1. 使用 [`get_stream_writer`](https://reference.langchain.com/python/langgraph/config/get_stream_writer) 访问流写入器并发出自定义数据。
2. 调用 `.stream()` 或 `.astream()` 时设置 `stream_mode="custom"`，以在流中获取自定义数据。您可以组合多种模式（例如 `["updates", "custom"]`），但其中至少一种必须是 `"custom"`。

<Warning>
  **Python \< 3.11 下异步中无 [`get_stream_writer`](https://reference.langchain.com/python/langgraph/config/get_stream_writer)**
  在运行于 Python \< 3.11 的异步代码中，[`get_stream_writer`](https://reference.langchain.com/python/langgraph/config/get_stream_writer) 将无法工作。
  请改为在节点或工具中添加 `writer` 参数并手动传递。
  用法示例请参见[Python \< 3.11 下的异步](#async)。
</Warning>

<Tabs>
  <Tab title="node">
    ```python theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
    from typing import TypedDict
    from langgraph.config import get_stream_writer
    from langgraph.graph import StateGraph, START

    class State(TypedDict):
        query: str
        answer: str

    def node(state: State):
        # Get the stream writer to send custom data
        writer = get_stream_writer()
        # Emit a custom key-value pair (e.g., progress update)
        writer({"custom_key": "Generating custom data inside node"})
        return {"answer": "some data"}

    graph = (
        StateGraph(State)
        .add_node(node)
        .add_edge(START, "node")
        .compile()
    )

    inputs = {"query": "example"}

    # Set stream_mode="custom" to receive the custom data in the stream
    for chunk in graph.stream(inputs, stream_mode="custom", version="v2"):
        if chunk["type"] == "custom":
            print(f"Custom event: {chunk['data']['custom_key']}")
    ```
  </Tab>

  <Tab title="tool">
    ```python theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
    from langchain.tools import tool
    from langgraph.config import get_stream_writer

    @tool
    def query_database(query: str) -> str:
        """Query the database."""
        # Access the stream writer to send custom data
        writer = get_stream_writer()  # [!code highlight]
        # Emit a custom key-value pair (e.g., progress update)
        writer({"data": "Retrieved 0/100 records", "type": "progress"})  # [!code highlight]
        # perform query
        # Emit another custom key-value pair
        writer({"data": "Retrieved 100/100 records", "type": "progress"})
        return "some-answer"


    graph = ... # define a graph that uses this tool

    # Set stream_mode="custom" to receive the custom data in the stream
    for chunk in graph.stream(inputs, stream_mode="custom", version="v2"):
        if chunk["type"] == "custom":
            print(f"{chunk['data']['type']}: {chunk['data']['data']}")
    ```
  </Tab>
</Tabs>

### 子图输出

要将[子图](/oss/python/langgraph/use-subgraphs)的输出包含在流式输出中，您可以在父图的 `.stream()` 方法中设置 `subgraphs=True`。这将同时流式传输父图和任何子图的输出。

输出将以元组 `(namespace, data)` 的形式流式传输，其中 `namespace` 是一个元组，包含调用子图的节点的路径，例如 `("parent_node:<task_id>", "child_node:<task_id>")`。

<Tabs>
  <Tab title="v2 (LangGraph >= 1.1)">
    使用 `version="v2"` 时，子图事件使用相同的 `StreamPart` 格式。`ns` 字段标识来源：

    ```python theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
    for chunk in graph.stream(
        {"foo": "foo"},
        subgraphs=True,  # [!code highlight]
        stream_mode="updates",
        version="v2", # [!code highlight]
    ):
        print(chunk["type"])  # "updates"
        print(chunk["ns"])    # () for root, ("node_name:<task_id>",) for subgraph
        print(chunk["data"])  # {"node_name": {"key": "value"}}
    ```
  </Tab>

  <Tab title="v1 (default)">
    ```python theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
    for chunk in graph.stream(
        {"foo": "foo"},
        # Set subgraphs=True to stream outputs from subgraphs
        subgraphs=True,  # [!code highlight]
        stream_mode="updates",
    ):
        print(chunk)
    ```
  </Tab>
</Tabs>

<Note>
  这适用于每种 `stream_mode`，包括 `"messages"`。像 [`create_agent`](https://reference.langchain.com/python/langchain/agents/factory/create_agent) 这样的 Agent 构建器返回一个**已编译的图**，因此将其作为节点添加会把它变成子图。如果没有 `subgraphs=True`，父图上的 `stream_mode="messages"` 将不会发出内部 Agent LLM 调用的 token 块。直接调用 `agent.stream(...)` 则可以，这就是为什么这个问题通常只在包装之后出现。

  ```python theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
  from langchain.agents import create_agent
  from langgraph.graph import END, START, StateGraph

  graph = (
      StateGraph(State)
      .add_node("agent", create_agent(model, tools, state_schema=State))
      .add_edge(START, "agent")
      .add_edge("agent", END)
      .compile()
  )

  for chunk in graph.stream(
      {"messages": [{"role": "user", "content": "..."}]},
      stream_mode="messages",
      subgraphs=True,  # [!code highlight]
      version="v2",
  ):
      print(chunk["type"])  # "messages"
      print(chunk["ns"])    # () for root, ("agent:<task_id>",) for subgraph
      print(chunk["data"])  # (token, metadata)
  ```
</Note>

<Accordion title="扩展示例：从子图流式传输">
  ```python theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
  from langgraph.graph import START, StateGraph
  from typing import TypedDict

  # Define subgraph
  class SubgraphState(TypedDict):
      foo: str  # note that this key is shared with the parent graph state
      bar: str

  def subgraph_node_1(state: SubgraphState):
      return {"bar": "bar"}

  def subgraph_node_2(state: SubgraphState):
      return {"foo": state["foo"] + state["bar"]}

  subgraph_builder = StateGraph(SubgraphState)
  subgraph_builder.add_node(subgraph_node_1)
  subgraph_builder.add_node(subgraph_node_2)
  subgraph_builder.add_edge(START, "subgraph_node_1")
  subgraph_builder.add_edge("subgraph_node_1", "subgraph_node_2")
  subgraph = subgraph_builder.compile()

  # Define parent graph
  class ParentState(TypedDict):
      foo: str

  def node_1(state: ParentState):
      return {"foo": "hi! " + state["foo"]}

  builder = StateGraph(ParentState)
  builder.add_node("node_1", node_1)
  builder.add_node("node_2", subgraph)
  builder.add_edge(START, "node_1")
  builder.add_edge("node_1", "node_2")
  graph = builder.compile()

  for chunk in graph.stream(
      {"foo": "foo"},
      stream_mode="updates",
      # Set subgraphs=True to stream outputs from subgraphs
      subgraphs=True,  # [!code highlight]
      version="v2",  # [!code highlight]
  ):
      if chunk["type"] == "updates":
          if chunk["ns"]:
              print(f"Subgraph {chunk['ns']}: {chunk['data']}")
          else:
              print(f"Root: {chunk['data']}")
  ```

  ```
  Root: {'node_1': {'foo': 'hi! foo'}}
  Subgraph ('node_2:dfddc4ba-c3c5-6887-5012-a243b5b377c2',): {'subgraph_node_1': {'bar': 'bar'}}
  Subgraph ('node_2:dfddc4ba-c3c5-6887-5012-a243b5b377c2',): {'subgraph_node_2': {'foo': 'hi! foobar'}}
  Root: {'node_2': {'foo': 'hi! foobar'}}
  ```

  **注意** 我们不仅收到节点更新，还收到命名空间，它告诉我们正在从哪个图（或子图）流式传输。
</Accordion>

### 检查点

使用 `checkpoints` 流模式在图执行时接收检查点事件。每个检查点事件的格式与 `get_state()` 的输出相同。需要[检查点存储](/oss/python/langgraph/persistence)。

```python theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
from langgraph.checkpoint.memory import MemorySaver

graph = (
    StateGraph(State)
    .add_node(refine_topic)
    .add_node(generate_joke)
    .add_edge(START, "refine_topic")
    .add_edge("refine_topic", "generate_joke")
    .add_edge("generate_joke", END)
    .compile(checkpointer=MemorySaver())
)

config = {"configurable": {"thread_id": "1"}}

for chunk in graph.stream(
    {"topic": "ice cream"},
    config=config,
    stream_mode="checkpoints",  # [!code highlight]
    version="v2",  # [!code highlight]
):
    if chunk["type"] == "checkpoints":
        print(chunk["data"])
```

### 任务

使用 `tasks` 流模式在图执行时接收任务开始和结束事件。任务事件包含正在运行的节点、其结果以及任何错误的信息。需要[检查点存储](/oss/python/langgraph/persistence)。

```python theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
from langgraph.checkpoint.memory import MemorySaver

graph = (
    StateGraph(State)
    .add_node(refine_topic)
    .add_node(generate_joke)
    .add_edge(START, "refine_topic")
    .add_edge("refine_topic", "generate_joke")
    .add_edge("generate_joke", END)
    .compile(checkpointer=MemorySaver())
)

config = {"configurable": {"thread_id": "1"}}

for chunk in graph.stream(
    {"topic": "ice cream"},
    config=config,
    stream_mode="tasks",  # [!code highlight]
    version="v2",  # [!code highlight]
):
    if chunk["type"] == "tasks":
        print(chunk["data"])
```

<a id="debug" />

### 调试

使用 `debug` 流模式在图执行的整个过程中流式传输尽可能多的信息。流式输出包括节点名称以及完整状态。

```python theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
for chunk in graph.stream(
    {"topic": "ice cream"},
    stream_mode="debug",  # [!code highlight]
    version="v2",  # [!code highlight]
):
    if chunk["type"] == "debug":
        print(chunk["data"])
```

<Note>
  `debug` 模式结合了 `checkpoints` 和 `tasks` 事件并带有额外元数据。如果您只需要调试信息的子集，请直接使用 `checkpoints` 或 `tasks`。
</Note>

### 同时使用多种模式

您可以将列表作为 `stream_mode` 参数传递，以同时流式传输多种模式。

使用 `version="v2"` 时，每个块都是一个 `StreamPart` 字典。使用 `chunk["type"]` 区分模式：

<CodeGroup>
  ```python v2 theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
  for chunk in graph.stream(inputs, stream_mode=["updates", "custom"], version="v2"):
      if chunk["type"] == "updates":
          for node_name, state in chunk["data"].items():
              print(f"Node `{node_name}` updated: {state}")
      elif chunk["type"] == "custom":
          print(f"Custom event: {chunk['data']}")
  ```

  ```python v1 theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
  for mode, chunk in graph.stream(inputs, stream_mode=["updates", "custom"]):
      print(chunk)
  ```
</CodeGroup>

## 高级

### 与任意 LLM 一起使用

您可以使用 `stream_mode="custom"` 从**任意 LLM API** 流式传输数据——即使该 API **不**实现 LangChain 聊天模型接口。

这让您可以集成提供自研流式接口的原始 LLM 客户端或外部服务，使 LangGraph 对自定义设置高度灵活。

```python theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
from langgraph.config import get_stream_writer

def call_arbitrary_model(state):
    """Example node that calls an arbitrary model and streams the output"""
    # Get the stream writer to send custom data
    writer = get_stream_writer()  # [!code highlight]
    # Assume you have a streaming client that yields chunks
    # Generate LLM tokens using your custom streaming client
    for chunk in your_custom_streaming_client(state["topic"]):
        # Use the writer to send custom data to the stream
        writer({"custom_llm_chunk": chunk})  # [!code highlight]
    return {"result": "completed"}

graph = (
    StateGraph(State)
    .add_node(call_arbitrary_model)
    # Add other nodes and edges as needed
    .compile()
)
# Set stream_mode="custom" to receive the custom data in the stream
for chunk in graph.stream(
    {"topic": "cats"},
    stream_mode="custom",  # [!code highlight]
    version="v2",  # [!code highlight]
):
    if chunk["type"] == "custom":
        # The chunk data will contain the custom data streamed from the llm
        print(chunk["data"])
```

<Accordion title="扩展示例：流式传输任意聊天模型">
  ```python theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
  import operator
  import json

  from typing import TypedDict
  from typing_extensions import Annotated
  from langgraph.graph import StateGraph, START

  from openai import AsyncOpenAI

  openai_client = AsyncOpenAI()
  model_name = "gpt-5.4-mini"


  async def stream_tokens(model_name: str, messages: list[dict]):
      response = await openai_client.chat.completions.create(
          messages=messages, model=model_name, stream=True
      )
      role = None
      async for chunk in response:
          delta = chunk.choices[0].delta

          if delta.role is not None:
              role = delta.role

          if delta.content:
              yield {"role": role, "content": delta.content}


  # this is our tool
  async def get_items(place: str) -> str:
      """Use this tool to list items one might find in a place you're asked about."""
      writer = get_stream_writer()
      response = ""
      async for msg_chunk in stream_tokens(
          model_name,
          [
              {
                  "role": "user",
                  "content": (
                      "Can you tell me what kind of items "
                      f"i might find in the following place: '{place}'. "
                      "List at least 3 such items separating them by a comma. "
                      "And include a brief description of each item."
                  ),
              }
          ],
      ):
          response += msg_chunk["content"]
          writer(msg_chunk)

      return response


  class State(TypedDict):
      messages: Annotated[list[dict], operator.add]


  # this is the tool-calling graph node
  async def call_tool(state: State):
      ai_message = state["messages"][-1]
      tool_call = ai_message["tool_calls"][-1]

      function_name = tool_call["function"]["name"]
      if function_name != "get_items":
          raise ValueError(f"Tool {function_name} not supported")

      function_arguments = tool_call["function"]["arguments"]
      arguments = json.loads(function_arguments)

      function_response = await get_items(**arguments)
      tool_message = {
          "tool_call_id": tool_call["id"],
          "role": "tool",
          "name": function_name,
          "content": function_response,
      }
      return {"messages": [tool_message]}


  graph = (
      StateGraph(State)
      .add_node(call_tool)
      .add_edge(START, "call_tool")
      .compile()
  )
  ```

  让我们使用包含工具调用的 [`AIMessage`](https://reference.langchain.com/python/langchain-core/messages/ai/AIMessage) 调用图：

  ```python theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
  inputs = {
      "messages": [
          {
              "content": None,
              "role": "assistant",
              "tool_calls": [
                  {
                      "id": "1",
                      "function": {
                          "arguments": '{"place":"bedroom"}',
                          "name": "get_items",
                      },
                      "type": "function",
                  }
              ],
          }
      ]
  }

  async for chunk in graph.astream(
      inputs,
      stream_mode="custom",
      version="v2",
  ):
      if chunk["type"] == "custom":
          print(chunk["data"]["content"], end="|", flush=True)
  ```
</Accordion>

### 为特定聊天模型禁用流式传输

如果您的应用混合使用支持流式传输和不支持流式传输的模型，您可能需要为不支持流式传输的模型显式禁用流式传输。

初始化模型时设置 `streaming=False`。

<Tabs>
  <Tab title="init_chat_model">
    ```python theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
    from langchain.chat_models import init_chat_model

    model = init_chat_model(
        "claude-sonnet-4-6",
        # Set streaming=False to disable streaming for the chat model
        streaming=False  # [!code highlight]
    )
    ```
  </Tab>

  <Tab title="Chat model interface">
    ```python theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
    from langchain_openai import ChatOpenAI

    # Set streaming=False to disable streaming for the chat model
    model = ChatOpenAI(model="gpt-5.5", streaming=False)
    ```
  </Tab>
</Tabs>

<Note>
  并非所有聊天模型集成都支持 `streaming` 参数。如果您的模型不支持它，请改用 `disable_streaming=True`。该参数可通过基类在所有聊天模型上使用。
</Note>

### 迁移到 v2

v2 流式格式（本页各处使用）提供了统一的输出格式。以下是关键差异及如何迁移的总结：

| 场景                    | v1（默认）                       | v2（`version="v2"`）                               |
| --------------------------- | ---------------------------------- | ------------------------------------------------- |
| 单一流模式          | 原始数据（字典）                    | 带有 `type`、`ns`、`data` 的 `StreamPart` 字典       |
| 多种流模式       | `(mode, data)` 元组              | 相同的 `StreamPart` 字典，按 `chunk["type"]` 过滤 |
| 子图流式传输          | `(namespace, data)` 元组         | 相同的 `StreamPart` 字典，检查 `chunk["ns"]`       |
| 多种模式 + 子图  | `(namespace, mode, data)` 三元组  | 相同的 `StreamPart` 字典                            |
| `invoke()` 返回类型      | 普通字典（状态）                 | 带有 `.value` 和 `.interrupts` 的 `GraphOutput`     |
| 中断位置（流式） | 状态字典中的 `__interrupt__` 键  | `values` 流部件上的 `interrupts` 字段       |
| 中断位置（invoke） | 结果字典中的 `__interrupt__` 键 | `GraphOutput` 上的 `.interrupts` 属性          |
| Pydantic/dataclass 输出   | 返回普通字典                 | 强制转换为模型/dataclass 实例               |

#### v2 invoke 格式

当您向 `invoke()` 或 `ainvoke()` 传入 `version="v2"` 时，它返回一个带有 `.value` 和 `.interrupts` 属性的 [`GraphOutput`](https://reference.langchain.com/python/langgraph/types/GraphOutput) 对象：

```python theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
from langgraph.types import GraphOutput

result = graph.invoke(inputs, version="v2")

assert isinstance(result, GraphOutput)
result.value       # your output — dict, Pydantic model, or dataclass
result.interrupts  # tuple[Interrupt, ...], empty if none occurred
```

使用默认 `"values"` 之外的任何流模式时，`invoke(..., stream_mode="updates", version="v2")` 返回 `list[StreamPart]` 而不是 `list[tuple]`。

<Warning>
  对 `GraphOutput` 的字典风格访问（`result["key"]`、`"key" in result`、`result["__interrupt__"]`）仍然有效以保持向后兼容，但已**弃用**，将在未来版本中移除。请迁移到 `result.value` 和 `result.interrupts`。
</Warning>

这会将状态与中断元数据分离。使用 v1 时，中断嵌入在返回的字典的 `__interrupt__` 下：

<CodeGroup>
  ```python v2 (new) theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
  config = {"configurable": {"thread_id": "thread-1"}}
  result = graph.invoke(inputs, config=config, version="v2")

  if result.interrupts:
      print(result.interrupts[0].value)
      graph.invoke(Command(resume=True), config=config, version="v2")
  ```

  ```python v1 (current default) theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
  config = {"configurable": {"thread_id": "thread-1"}}
  result = graph.invoke(inputs, config=config)

  if "__interrupt__" in result:
      print(result["__interrupt__"][0].value)
      graph.invoke(Command(resume=True), config=config)
  ```
</CodeGroup>

#### Pydantic 和 dataclass 状态强制转换

当您的图状态是 Pydantic 模型或 dataclass 时，v2 的 `values` 模式会自动将输出强制转换为正确的类型：

```python theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
from pydantic import BaseModel
from typing import Annotated
import operator

class MyState(BaseModel):
    value: str
    items: Annotated[list[str], operator.add]

# With version="v2", chunk["data"] is a MyState instance
for chunk in graph.stream(
    {"value": "x", "items": []}, stream_mode="values", version="v2"
):
    print(type(chunk["data"]))  # <class 'MyState'>
```

<a id="async" />

### Python \< 3.11 下的异步

在 Python 版本 \< 3.11 中，[asyncio 任务](https://docs.python.org/3/library/asyncio-task.html#asyncio.create_task)不支持 `context` 参数。
这限制了 LangGraph 自动传播上下文的能力，并以两种关键方式影响 LangGraph 的流式机制：

1. 您**必须**将 [`RunnableConfig`](https://python.langchain.com/docs/concepts/runnables/#runnableconfig) 显式传入异步 LLM 调用（例如 `ainvoke()`），因为回调不会自动传播。
2. 您**不能**在异步节点或工具中使用 [`get_stream_writer`](https://reference.langchain.com/python/langgraph/config/get_stream_writer)——必须直接传递 `writer` 参数。

<Accordion title="扩展示例：使用手动配置的异步 LLM 调用">
  ```python theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
  from typing import TypedDict
  from langgraph.graph import START, StateGraph
  from langchain.chat_models import init_chat_model

  model = init_chat_model(model="gpt-5.4-mini")

  class State(TypedDict):
      topic: str
      joke: str

  # Accept config as an argument in the async node function
  async def call_model(state, config):
      topic = state["topic"]
      print("Generating joke...")
      # Pass config to model.ainvoke() to ensure proper context propagation
      joke_response = await model.ainvoke(  # [!code highlight]
          [{"role": "user", "content": f"Write a joke about {topic}"}],
          config,
      )
      return {"joke": joke_response.content}

  graph = (
      StateGraph(State)
      .add_node(call_model)
      .add_edge(START, "call_model")
      .compile()
  )

  # Set stream_mode="messages" to stream LLM tokens
  async for chunk in graph.astream(
      {"topic": "ice cream"},
      stream_mode="messages",  # [!code highlight]
      version="v2",  # [!code highlight]
  ):
      if chunk["type"] == "messages":
          message_chunk, metadata = chunk["data"]
          if message_chunk.content:
              print(message_chunk.content, end="|", flush=True)
  ```
</Accordion>

<Accordion title="扩展示例：使用流写入器的异步自定义流式传输">
  ```python theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
  from typing import TypedDict
  from langgraph.types import StreamWriter

  class State(TypedDict):
        topic: str
        joke: str

  # Add writer as an argument in the function signature of the async node or tool
  # LangGraph will automatically pass the stream writer to the function
  async def generate_joke(state: State, writer: StreamWriter):  # [!code highlight]
        writer({"custom_key": "Streaming custom data while generating a joke"})
        return {"joke": f"This is a joke about {state['topic']}"}

  graph = (
        StateGraph(State)
        .add_node(generate_joke)
        .add_edge(START, "generate_joke")
        .compile()
  )

  # Set stream_mode="custom" to receive the custom data in the stream  # [!code highlight]
  async for chunk in graph.astream(
        {"topic": "ice cream"},
        stream_mode="custom",
        version="v2",
  ):
        if chunk["type"] == "custom":
            print(chunk["data"])
  ```
</Accordion>

***

<div className="source-links">
  <Callout icon="terminal-2">
    [Connect these docs](/use-these-docs) to Claude, VSCode, and more via MCP for real-time answers.
  </Callout>

  <Callout icon="edit">
    [Edit this page on GitHub](https://github.com/langchain-ai/docs/edit/main/src/oss/langgraph/streaming.mdx) or [file an issue](https://github.com/langchain-ai/docs/issues/new/choose).
  </Callout>
</div>