# 使用图 API

本指南演示 LangGraph 图 API 的基础知识。它逐步讲解[状态](#define-and-update-state)，以及如何组合常见的图结构，例如[序列](#create-a-sequence-of-steps)、[分支](#create-branches)和[循环](#create-and-control-loops)。它还涵盖 LangGraph 的控制功能，包括用于 map-reduce 工作流的 [Send API](#map-reduce-and-the-send-api)，以及用于将状态更新与跨节点"跳跃"相结合的 [Command API](#combine-control-flow-and-state-updates-with-command)。

## 安装

安装 `langgraph`：

<CodeGroup>
  ```bash pip theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
  pip install -U langgraph
  ```

  ```bash uv theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
  uv add langgraph
  ```
</CodeGroup>

<Tip>
  **设置 LangSmith 以获得更好的调试体验**

  注册 [LangSmith](https://smith.langchain.com?utm_source=docs\&utm_medium=cta\&utm_campaign=langsmith-signup\&utm_content=oss-langgraph-use-graph-api) 以快速发现问题并提升你的 LangGraph 项目的性能。LangSmith 让你能够使用追踪数据来调试、测试和监控使用 LangGraph 构建的 LLM 应用——在[文档](/langsmith/observability)中了解更多入门信息。
</Tip>

## 定义和更新状态

下面我们将展示如何在 LangGraph 中定义和更新[状态](/oss/python/langgraph/graph-api#state)。我们将演示：

1. 如何使用状态来定义图的[模式](/oss/python/langgraph/graph-api#schema)
2. 如何使用 [reducers](/oss/python/langgraph/graph-api#reducers) 控制状态更新的处理方式。

### 定义状态

[状态](/oss/python/langgraph/graph-api#state)在 LangGraph 中可以是 `TypedDict`、`Pydantic` 模型或 dataclass。下面我们将使用 `TypedDict`。有关使用 Pydantic 的详细信息，请参阅[使用 Pydantic 模型作为图状态](#use-pydantic-models-for-graph-state)。

默认情况下，图具有相同的输入和输出模式，且状态决定该模式。有关如何定义不同的输入和输出模式，请参阅[定义输入和输出模式](#define-input-and-output-schemas)。

让我们考虑一个使用[消息](/oss/python/langgraph/graph-api#messagesstate)的简单示例。这代表了适用于许多 LLM 应用的一种通用状态表述。更多细节请参阅我们的[概念页面](/oss/python/langgraph/graph-api#working-with-messages-in-graph-state)。

```python theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
from langchain.messages import AnyMessage
from typing_extensions import TypedDict

class State(TypedDict):
    messages: list[AnyMessage]
    extra_field: int
```

该状态跟踪[消息](https://python.langchain.com/docs/concepts/messages/)对象列表，以及一个额外的整数字段。

### 更新状态

让我们构建一个包含单个节点的示例图。我们的[节点](/oss/python/langgraph/graph-api#nodes)只是一个读取图状态并对其做出更新的 Python 函数。该函数的第一个参数始终是状态：

```python theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
from langchain.messages import AIMessage

def node(state: State):
    messages = state["messages"]
    new_message = AIMessage("Hello!")
    return {"messages": messages + [new_message], "extra_field": 10}
```

此节点只是向我们的消息列表追加一条消息，并填充一个额外字段。

<Warning>
  节点应直接返回对状态的更新，而不是对状态进行就地修改。
</Warning>

接下来，让我们定义一个包含此节点的简单图。我们使用 [`StateGraph`](/oss/python/langgraph/graph-api#stategraph) 来定义一个操作此状态的图，然后使用 [`add_node`](/oss/python/langgraph/graph-api#nodes) 填充我们的图。

```python theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
from langgraph.graph import StateGraph

builder = StateGraph(State)
builder.add_node(node)
builder.set_entry_point("node")
graph = builder.compile()
```

LangGraph 提供了用于可视化图的内置工具。让我们检查一下我们的图。有关可视化的详细信息，请参阅[可视化你的图](#visualize-your-graph)。

```python theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
from IPython.display import Image, display

display(Image(graph.get_graph().draw_mermaid_png()))
```

<img src="https://mintcdn.com/langchain-5e9cc07a/-_xGPoyjhyiDWTPJ/oss/images/graph_api_image_1.png?fit=max&auto=format&n=-_xGPoyjhyiDWTPJ&q=85&s=cf3d978b707847e166d5ed15bc7cbbe4" alt="Simple graph with single node" width="107" height="134" data-path="oss/images/graph_api_image_1.png" />

在这种情况下，我们的图只执行单个节点。让我们进行一次简单的调用：

```python theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
from langchain.messages import HumanMessage

result = graph.invoke({"messages": [HumanMessage("Hi")]})
result
```

```
{'messages': [HumanMessage(content='Hi'), AIMessage(content='Hello!')], 'extra_field': 10}
```

请注意：

* 我们通过更新状态的单个键来启动调用。
* 我们在调用结果中接收到完整的状态。

为了方便起见，我们经常通过 pretty-print 检查[消息对象](https://python.langchain.com/docs/concepts/messages/)的内容：

```python theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
for message in result["messages"]:
    message.pretty_print()
```

```
================================ Human Message ================================

Hi
================================== Ai Message ==================================

Hello!
```

### 使用 reducers 处理状态更新

状态中的每个键都可以拥有自己独立的 [reducer](/oss/python/langgraph/graph-api#reducers) 函数，该函数控制来自节点的更新如何被应用。如果未显式指定 reducer 函数，则假定对该键的所有更新都应覆盖它。

对于 `TypedDict` 状态模式，我们可以通过使用 reducer 函数注解状态的相应字段来定义 reducers。

在前面的示例中，我们的节点通过向其追加消息来更新状态中的 `"messages"` 键。下面，我们为该键添加一个 reducer，使更新自动追加：

```python theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
from typing_extensions import Annotated

def add(left, right):
    """Can also import `add` from the `operator` built-in."""
    return left + right

class State(TypedDict):
    messages: Annotated[list[AnyMessage], add]  # [!code highlight]
    extra_field: int
```

现在我们的节点可以简化：

```python theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
def node(state: State):
    new_message = AIMessage("Hello!")
    return {"messages": [new_message], "extra_field": 10}  # [!code highlight]
```

```python theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
from langgraph.graph import START

graph = StateGraph(State).add_node(node).add_edge(START, "node").compile()

result = graph.invoke({"messages": [HumanMessage("Hi")]})

for message in result["messages"]:
    message.pretty_print()
```

```
================================ Human Message ================================

Hi
================================== Ai Message ==================================

Hello!
```

#### MessagesState

在实践中，更新消息列表还有一些额外的考虑因素：

* 我们可能希望更新状态中已有的消息。
* 我们可能希望接受[消息格式](/oss/python/langgraph/graph-api#using-messages-in-your-graph)的简写形式，例如 [OpenAI 格式](https://python.langchain.com/docs/concepts/messages/#openai-format)。

LangGraph 包含一个内置的 reducer [`add_messages`](https://reference.langchain.com/python/langgraph/graph/message/add_messages)，它负责处理这些考虑因素：

```python theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
from langgraph.graph.message import add_messages

class State(TypedDict):
    messages: Annotated[list[AnyMessage], add_messages]  # [!code highlight]
    extra_field: int

def node(state: State):
    new_message = AIMessage("Hello!")
    return {"messages": [new_message], "extra_field": 10}

graph = StateGraph(State).add_node(node).set_entry_point("node").compile()
```

```python theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
input_message = {"role": "user", "content": "Hi"}  # [!code highlight]

result = graph.invoke({"messages": [input_message]})

for message in result["messages"]:
    message.pretty_print()
```

```
================================ Human Message ================================

Hi
================================== Ai Message ==================================

Hello!
```

对于涉及[聊天模型](https://python.langchain.com/docs/concepts/chat_models/)的应用来说，这是一种通用的状态表示。为方便起见，LangGraph 包含一个预构建的 `MessagesState`，因此我们可以有：

```python theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
from langgraph.graph import MessagesState

class State(MessagesState):
    extra_field: int
```

### 使用 `Overwrite` 绕过 reducers

在某些情况下，你可能希望绕过 reducer 并直接覆盖状态值。LangGraph 为此提供了 [`Overwrite`](https://reference.langchain.com/python/langgraph/types/) 类型。当节点返回用 `Overwrite` 包装的值时，reducer 将被绕过，通道将直接设置为该值。

当你想要重置或替换累积的状态，而不是将其与现有值合并时，这非常有用。

```python theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
from langgraph.graph import StateGraph, START, END
from langgraph.types import Overwrite
from typing_extensions import Annotated, TypedDict
import operator

class State(TypedDict):
    messages: Annotated[list, operator.add]

def add_message(state: State):
    return {"messages": ["first message"]}

def replace_messages(state: State):
    # Bypass the reducer and replace the entire messages list
    return {"messages": Overwrite(["replacement message"])}

builder = StateGraph(State)
builder.add_node("add_message", add_message)
builder.add_node("replace_messages", replace_messages)
builder.add_edge(START, "add_message")
builder.add_edge("add_message", "replace_messages")
builder.add_edge("replace_messages", END)

graph = builder.compile()

result = graph.invoke({"messages": ["initial"]})
print(result["messages"])
```

```
['replacement message']
```

你还可以使用带有特殊键 `"__overwrite__"` 的 JSON 格式：

```python theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
def replace_messages(state: State):
    return {"messages": {"__overwrite__": ["replacement message"]}}
```

<Warning>
  当节点并行执行时，在给定的超级步（super-step）中，只有一个节点可以对同一状态键使用 `Overwrite`。如果多个节点在同一个超级步中试图覆盖同一个键，将抛出 `InvalidUpdateError` 错误。
</Warning>

### 定义输入和输出模式

默认情况下，`StateGraph` 使用单一模式运行，所有节点都应使用该模式进行通信。不过，也可以为图定义不同的输入和输出模式。

当指定不同的模式时，内部仍会使用内部模式用于节点之间的通信。输入模式确保所提供的输入与预期结构匹配，而输出模式则过滤内部数据，只返回与所定义的输出模式相关的信息。

下面，我们将了解如何定义不同的输入和输出模式。

```python theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
from langgraph.graph import StateGraph, START, END
from typing_extensions import TypedDict

# Define the schema for the input
class InputState(TypedDict):
    question: str

# Define the schema for the output
class OutputState(TypedDict):
    answer: str

# Define the overall schema, combining both input and output
class OverallState(InputState, OutputState):
    pass

# Define the node that processes the input and generates an answer
def answer_node(state: InputState):
    # Example answer and an extra key
    return {"answer": "bye", "question": state["question"]}

# Build the graph with input and output schemas specified
builder = StateGraph(OverallState, input_schema=InputState, output_schema=OutputState)
builder.add_node(answer_node)  # Add the answer node
builder.add_edge(START, "answer_node")  # Define the starting edge
builder.add_edge("answer_node", END)  # Define the ending edge
graph = builder.compile()  # Compile the graph

# Invoke the graph with an input and print the result
print(graph.invoke({"question": "hi"}))
```

```
{'answer': 'bye'}
```

请注意，invoke 的输出只包含输出模式。

### 在节点之间传递私有状态

在某些情况下，你可能希望节点之间交换的信息对中间逻辑至关重要，但不需要成为图主模式的一部分。这些私有数据与图的整体输入/输出无关，只应在某些节点之间共享。

下面，我们将创建一个由三个节点（node\_1、node\_2 和 node\_3）组成的示例顺序图，其中私有数据在前两个步骤（node\_1 和 node\_2）之间传递，而第三个步骤（node\_3）只能访问公共的整体状态。

```python theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
from langgraph.graph import StateGraph, START, END
from typing_extensions import TypedDict

# The overall state of the graph (this is the public state shared across nodes)
class OverallState(TypedDict):
    a: str

# Output from node_1 contains private data that is not part of the overall state
class Node1Output(TypedDict):
    private_data: str

# The private data is only shared between node_1 and node_2
def node_1(state: OverallState) -> Node1Output:
    output = {"private_data": "set by node_1"}
    print(f"Entered node `node_1`:\n\tInput: {state}.\n\tReturned: {output}")
    return output

# Node 2 input only requests the private data available after node_1
class Node2Input(TypedDict):
    private_data: str

def node_2(state: Node2Input) -> OverallState:
    output = {"a": "set by node_2"}
    print(f"Entered node `node_2`:\n\tInput: {state}.\n\tReturned: {output}")
    return output

# Node 3 only has access to the overall state (no access to private data from node_1)
def node_3(state: OverallState) -> OverallState:
    output = {"a": "set by node_3"}
    print(f"Entered node `node_3`:\n\tInput: {state}.\n\tReturned: {output}")
    return output

# Connect nodes in a sequence
# node_2 accepts private data from node_1, whereas
# node_3 does not see the private data.
builder = StateGraph(OverallState).add_sequence([node_1, node_2, node_3])
builder.add_edge(START, "node_1")
graph = builder.compile()

# Invoke the graph with the initial state
response = graph.invoke(
    {
        "a": "set at start",
    }
)

print()
print(f"Output of graph invocation: {response}")
```

```
Entered node `node_1`:
    Input: {'a': 'set at start'}.
    Returned: {'private_data': 'set by node_1'}
Entered node `node_2`:
    Input: {'private_data': 'set by node_1'}.
    Returned: {'a': 'set by node_2'}
Entered node `node_3`:
    Input: {'a': 'set by node_2'}.
    Returned: {'a': 'set by node_3'}

Output of graph invocation: {'a': 'set by node_3'}
```

### 使用 Pydantic 模型作为图状态

[StateGraph](https://reference.langchain.com/python/langgraph/graph/state/StateGraph) 在初始化时接受一个 [`state_schema`](https://reference.langchain.com/python/langchain/middleware/#langchain.agents.middleware.AgentMiddleware.state_schema) 参数，该参数指定了图中节点可以访问和更新的状态的"形状"。

在我们的示例中，我们通常使用 Python 原生的 `TypedDict` 或 [`dataclass`](https://docs.python.org/3/library/dataclasses.html) 作为 `state_schema`，但 [`state_schema`](https://reference.langchain.com/python/langchain/middleware/#langchain.agents.middleware.AgentMiddleware.state_schema) 可以是任何[类型](https://docs.python.org/3/library/stdtypes.html#type-objects)。

在这里，我们将看到如何使用 [Pydantic BaseModel](https://docs.pydantic.dev/latest/api/base_model/) 作为 [`state_schema`](https://reference.langchain.com/python/langchain/middleware/#langchain.agents.middleware.AgentMiddleware.state_schema)，以对**输入**添加运行时验证。

<Note>
  **已知限制**

  * 目前，图的输出**不会**是 Pydantic 模型的实例。
  * 运行时验证只发生在图中第一个节点的输入上，而不是后续节点或输出上。
  * Pydantic 的验证错误追踪不会显示错误发生在哪个节点。
  * Pydantic 的递归验证可能较慢。对于性能敏感的应用，你可能需要考虑改用 `dataclass`。
</Note>

```python theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
from langgraph.graph import StateGraph, START, END
from typing_extensions import TypedDict
from pydantic import BaseModel

# The overall state of the graph (this is the public state shared across nodes)
class OverallState(BaseModel):
    a: str

def node(state: OverallState):
    return {"a": "goodbye"}

# Build the state graph
builder = StateGraph(OverallState)
builder.add_node(node)  # node_1 is the first node
builder.add_edge(START, "node")  # Start the graph with node_1
builder.add_edge("node", END)  # End the graph after node_1
graph = builder.compile()

# Test the graph with a valid input
graph.invoke({"a": "hello"})
```

使用**无效**输入调用图

```python theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
try:
    graph.invoke({"a": 123})  # Should be a string
except Exception as e:
    print("An exception was raised because `a` is an integer rather than a string.")
    print(e)
```

```
An exception was raised because `a` is an integer rather than a string.
1 validation error for OverallState
a
  Input should be a valid string [type=string_type, input_value=123, input_type=int]
    For further information visit https://errors.pydantic.dev/2.9/v/string_type
```

下面是 Pydantic 模型状态的更多特性：

<Accordion title="序列化行为">
  当使用 Pydantic 模型作为状态模式时，了解序列化的工作方式非常重要，尤其是在以下情况：

  * 将 Pydantic 对象作为输入传递
  * 接收来自图的输出
  * 使用嵌套的 Pydantic 模型

  让我们看看这些行为的实际表现。

  ```python theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
  from langgraph.graph import StateGraph, START, END
  from pydantic import BaseModel

  class NestedModel(BaseModel):
      value: str

  class ComplexState(BaseModel):
      text: str
      count: int
      nested: NestedModel

  def process_node(state: ComplexState):
      # Node receives a validated Pydantic object
      print(f"Input state type: {type(state)}")
      print(f"Nested type: {type(state.nested)}")
      # Return a dictionary update
      return {"text": state.text + " processed", "count": state.count + 1}

  # Build the graph
  builder = StateGraph(ComplexState)
  builder.add_node("process", process_node)
  builder.add_edge(START, "process")
  builder.add_edge("process", END)
  graph = builder.compile()

  # Create a Pydantic instance for input
  input_state = ComplexState(text="hello", count=0, nested=NestedModel(value="test"))
  print(f"Input object type: {type(input_state)}")

  # Invoke graph with a Pydantic instance
  result = graph.invoke(input_state)
  print(f"Output type: {type(result)}")
  print(f"Output content: {result}")

  # Convert back to Pydantic model if needed
  output_model = ComplexState(**result)
  print(f"Converted back to Pydantic: {type(output_model)}")
  ```
</Accordion>

<Accordion title="运行时类型强制转换">
  Pydantic 会对某些数据类型执行运行时类型强制转换。这可能很有帮助，但如果你不了解它，也可能导致意外行为。

  ```python theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
  from langgraph.graph import StateGraph, START, END
  from pydantic import BaseModel

  class CoercionExample(BaseModel):
      # Pydantic will coerce string numbers to integers
      number: int
      # Pydantic will parse string booleans to bool
      flag: bool

  def inspect_node(state: CoercionExample):
      print(f"number: {state.number} (type: {type(state.number)})")
      print(f"flag: {state.flag} (type: {type(state.flag)})")
      return {}

  builder = StateGraph(CoercionExample)
  builder.add_node("inspect", inspect_node)
  builder.add_edge(START, "inspect")
  builder.add_edge("inspect", END)
  graph = builder.compile()

  # Demonstrate coercion with string inputs that will be converted
  result = graph.invoke({"number": "42", "flag": "true"})

  # This would fail with a validation error
  try:
      graph.invoke({"number": "not-a-number", "flag": "true"})
  except Exception as e:
      print(f"\nExpected validation error: {e}")
  ```
</Accordion>

<Accordion title="处理消息模型">
  在状态模式中使用 LangChain 消息类型时，序列化有一些重要的注意事项。在通过网络传输消息对象时，你应该使用 `AnyMessage`（而不是 `BaseMessage`）来进行正确的序列化/反序列化。

  ```python theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
  from langgraph.graph import StateGraph, START, END
  from pydantic import BaseModel
  from langchain.messages import HumanMessage, AIMessage, AnyMessage
  from typing import List

  class ChatState(BaseModel):
      messages: List[AnyMessage]
      context: str

  def add_message(state: ChatState):
      return {"messages": state.messages + [AIMessage(content="Hello there!")]}

  builder = StateGraph(ChatState)
  builder.add_node("add_message", add_message)
  builder.add_edge(START, "add_message")
  builder.add_edge("add_message", END)
  graph = builder.compile()

  # Create input with a message
  initial_state = ChatState(
      messages=[HumanMessage(content="Hi")], context="Customer support chat"
  )

  result = graph.invoke(initial_state)
  print(f"Output: {result}")

  # Convert back to Pydantic model to see message types
  output_model = ChatState(**result)
  for i, msg in enumerate(output_model.messages):
      print(f"Message {i}: {type(msg).__name__} - {msg.content}")
  ```
</Accordion>
## 添加运行时配置

有时你可能希望在调用图时对图进行配置。例如，你可能希望在运行时指定使用哪个 LLM 或系统提示词，*而不让这些参数污染图的状态*。

要添加运行时配置：

1. 为你的配置指定一个模式
2. 在节点或条件边的函数签名中添加配置
3. 将配置传入图中。

下面是一个简单示例：

```python theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
from langgraph.graph import END, StateGraph, START
from langgraph.runtime import Runtime
from typing_extensions import TypedDict

# 1. Specify config schema
class ContextSchema(TypedDict):
    my_runtime_value: str

# 2. Define a graph that accesses the config in a node
class State(TypedDict):
    my_state_value: str

def node(state: State, runtime: Runtime[ContextSchema]):  # [!code highlight]
    if runtime.context["my_runtime_value"] == "a":  # [!code highlight]
        return {"my_state_value": 1}
    elif runtime.context["my_runtime_value"] == "b":  # [!code highlight]
        return {"my_state_value": 2}
    else:
        raise ValueError("Unknown values.")

builder = StateGraph(State, context_schema=ContextSchema)  # [!code highlight]
builder.add_node(node)
builder.add_edge(START, "node")
builder.add_edge("node", END)

graph = builder.compile()

# 3. Pass in configuration at runtime:
print(graph.invoke({}, context={"my_runtime_value": "a"}))  # [!code highlight]
print(graph.invoke({}, context={"my_runtime_value": "b"}))  # [!code highlight]
```

```
{'my_state_value': 1}
{'my_state_value': 2}
```

<Accordion title="扩展示例：在运行时指定 LLM">
  下面我们演示一个实际示例，在运行时配置要使用的 LLM。我们将同时使用 OpenAI 和 Anthropic 模型。

  ```python theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
  from dataclasses import dataclass

  from langchain.chat_models import init_chat_model
  from langgraph.graph import MessagesState, END, StateGraph, START
  from langgraph.runtime import Runtime
  from typing_extensions import TypedDict

  @dataclass
  class ContextSchema:
      model_provider: str = "anthropic"

  MODELS = {
      "anthropic": init_chat_model("claude-haiku-4-5-20251001"),
      "openai": init_chat_model("gpt-5.4-mini"),
  }

  def call_model(state: MessagesState, runtime: Runtime[ContextSchema]):
      model = MODELS[runtime.context.model_provider]
      response = model.invoke(state["messages"])
      return {"messages": [response]}

  builder = StateGraph(MessagesState, context_schema=ContextSchema)
  builder.add_node("model", call_model)
  builder.add_edge(START, "model")
  builder.add_edge("model", END)

  graph = builder.compile()

  # Usage
  input_message = {"role": "user", "content": "hi"}
  # With no configuration, uses default (Anthropic)
  response_1 = graph.invoke({"messages": [input_message]}, context=ContextSchema())["messages"][-1]
  # Or, can set OpenAI
  response_2 = graph.invoke({"messages": [input_message]}, context={"model_provider": "openai"})["messages"][-1]

  print(response_1.response_metadata["model_name"])
  print(response_2.response_metadata["model_name"])
  ```

  ```
  claude-haiku-4-5-20251001
  gpt-5.4-mini
  ```
</Accordion>

<Accordion title="扩展示例：在运行时指定模型和系统消息">
  下面我们演示一个实际示例，在运行时配置两个参数：要使用的 LLM 和系统消息。

  ```python theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
  from dataclasses import dataclass
  from langchain.chat_models import init_chat_model
  from langchain.messages import SystemMessage
  from langgraph.graph import END, MessagesState, StateGraph, START
  from langgraph.runtime import Runtime
  from typing_extensions import TypedDict

  @dataclass
  class ContextSchema:
      model_provider: str = "anthropic"
      system_message: str | None = None

  MODELS = {
      "anthropic": init_chat_model("claude-haiku-4-5-20251001"),
      "openai": init_chat_model("gpt-5.4-mini"),
  }

  def call_model(state: MessagesState, runtime: Runtime[ContextSchema]):
      model = MODELS[runtime.context.model_provider]
      messages = state["messages"]
      if (system_message := runtime.context.system_message):
          messages = [SystemMessage(system_message)] + messages
      response = model.invoke(messages)
      return {"messages": [response]}

  builder = StateGraph(MessagesState, context_schema=ContextSchema)
  builder.add_node("model", call_model)
  builder.add_edge(START, "model")
  builder.add_edge("model", END)

  graph = builder.compile()

  # Usage
  input_message = {"role": "user", "content": "hi"}
  response = graph.invoke({"messages": [input_message]}, context={"model_provider": "openai", "system_message": "Respond in Italian."})
  for message in response["messages"]:
      message.pretty_print()
  ```

  ```
  ================================ Human Message ================================

  hi
  ================================== Ai Message ==================================

  Ciao! Come posso aiutarti oggi?
  ```
</Accordion>

## 添加重试策略

在很多使用场景中，你可能希望为节点设置自定义的重试策略，例如在调用 API、查询数据库或调用 LLM 时等等。LangGraph 允许你为节点添加重试策略。

要配置重试策略，请将 `retry_policy` 参数传递给 [`add_node`](https://reference.langchain.com/python/langgraph/graph/state/StateGraph/add_node)。`retry_policy` 参数接收一个 `RetryPolicy` 具名元组对象。下面我们使用默认参数实例化一个 `RetryPolicy` 对象，并将其与一个节点关联：

```python theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
from langgraph.types import RetryPolicy

builder.add_node(
    "node_name",
    node_function,
    retry_policy=RetryPolicy(),
)
```

默认情况下，`retry_on` 参数使用 `default_retry_on` 函数，该函数会对除以下异常之外的任何异常进行重试：

* `ValueError`
* `TypeError`
* `ArithmeticError`
* `ImportError`
* `LookupError`
* `NameError`
* `SyntaxError`
* `RuntimeError`
* `ReferenceError`
* `StopIteration`
* `StopAsyncIteration`
* `OSError`

此外，对于来自 `requests` 和 `httpx` 等流行 HTTP 请求库的异常，它仅对 5xx 状态码进行重试。

<Accordion title="扩展示例：自定义重试策略">
  考虑一个从 SQL 数据库中读取数据的示例。下面我们向节点传递两种不同的重试策略：

  ```python theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
  import sqlite3
  from typing_extensions import TypedDict
  from langchain.chat_models import init_chat_model
  from langgraph.graph import END, MessagesState, StateGraph, START
  from langgraph.types import RetryPolicy
  from langchain.messages import AIMessage

  con = sqlite3.connect(":memory:")
  model = init_chat_model("claude-haiku-4-5-20251001")

  def query_database(state: MessagesState):
      cursor = con.cursor()
      cursor.execute("SELECT * FROM Artist LIMIT 10;")
      query_result = str(cursor.fetchall())
      return {"messages": [AIMessage(content=query_result)]}

  def call_model(state: MessagesState):
      response = model.invoke(state["messages"])
      return {"messages": [response]}

  # Define a new graph
  builder = StateGraph(MessagesState)
  builder.add_node(
      "query_database",
      query_database,
      retry_policy=RetryPolicy(retry_on=sqlite3.OperationalError),
  )
  builder.add_node("model", call_model, retry_policy=RetryPolicy(max_attempts=5))
  builder.add_edge(START, "model")
  builder.add_edge("model", "query_database")
  builder.add_edge("query_database", END)
  graph = builder.compile()
  ```
</Accordion>
## 设置节点超时

使用 [`add_node`](https://reference.langchain.com/python/langgraph/graph/state/StateGraph/add_node) 的 `timeout` 参数来限制单个异步节点调用可以运行的时间。以秒或 `datetime.timedelta` 的形式提供超时时间。

```python theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
import asyncio
from typing_extensions import TypedDict

from langgraph.errors import NodeTimeoutError
from langgraph.graph import END, START, StateGraph


class State(TypedDict):
    value: str


async def call_model(state: State) -> State:
    await asyncio.sleep(2)
    return {"value": "done"}


builder = StateGraph(State)
builder.add_node("model", call_model, timeout=1.0)
builder.add_edge(START, "model")
builder.add_edge("model", END)
graph = builder.compile()

try:
    await graph.ainvoke({"value": "start"})
except NodeTimeoutError:
    print("Node timed out")
```

节点超时仅支持异步节点。如果你在同步节点上设置 `timeout`，LangGraph 会在图编译时引发错误，因为同步 Python 执行无法在进程内被安全地取消。

当节点超过其超时时间时，LangGraph 会引发 `NodeTimeoutError`，它是 Python 内置 `TimeoutError` 的子类。如果节点具有重试 `TimeoutError` 或 `NodeTimeoutError` 的 `retry_policy`，则超时的尝试会被重试。超时独立应用于每次尝试，因此每次重试时计时器都会重置。

超时的尝试不会提交其缓冲的写入。这可以防止状态更新或子任务调度在超时边界之后泄漏出去。

## 配置节点超时

[`add_node`](https://reference.langchain.com/python/langgraph/graph/state/StateGraph/add_node) 上的 `timeout=` 参数限制了单个异步节点尝试可以运行的时间。传入数字（秒）、`timedelta` 或 [`TimeoutPolicy`](https://reference.langchain.com/python/langgraph/types/TimeoutPolicy) 可以更精细地控制运行和空闲超时。当超过限制时，LangGraph 会引发 [`NodeTimeoutError`](https://reference.langchain.com/python/langgraph/errors/NodeTimeoutError)，并由重试策略决定是否重试。

<Note>
  节点级超时要求 `langgraph>=1.2`。
</Note>

```python theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
from langgraph.types import TimeoutPolicy

builder.add_node(
    "call_model",
    call_model,
    timeout=TimeoutPolicy(run_timeout=120, idle_timeout=30),
)
```

有关完整的超时生命周期、空闲超时刷新来源以及 `runtime.heartbeat()`，请参阅[容错](/oss/python/langgraph/fault-tolerance#timeouts)。

## 处理节点错误

[`add_node`](https://reference.langchain.com/python/langgraph/graph/state/StateGraph/add_node) 上的 `error_handler=` 参数注册一个函数，该函数在节点失败且所有重试均已用尽后运行。该处理器接收当前状态和带有失败上下文的类型化 [`NodeError`](https://reference.langchain.com/python/langgraph/errors/NodeError)，并可以通过 [`Command`](https://reference.langchain.com/python/langgraph/types/Command) 路由到恢复分支：

<Note>
  节点级错误处理器要求 `langgraph>=1.2`。
</Note>

```python theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
from langgraph.errors import NodeError
from langgraph.types import Command, RetryPolicy

def payment_error_handler(state: State, error: NodeError) -> Command:
    return Command(
        update={"status": f"compensated: {error.error}"},
        goto="finalize",
    )

builder.add_node(
    "charge_payment",
    charge_payment,
    retry_policy=RetryPolicy(max_attempts=3, retry_on=ConnectionError),
    error_handler=payment_error_handler,
)
```

有关补偿模式和 `Command` 路由，请参阅[容错](/oss/python/langgraph/fault-tolerance#error-handling)。

## 设置图级节点默认值

<Note>
  需要 `langgraph>=1.2`。
</Note>

使用 [`set_node_defaults`](https://reference.langchain.com/python/langgraph/graph/state/StateGraph/set_node_defaults) 为图中每个节点一次性设置 `retry_policy`、`timeout`、`cache_policy` 或 `error_handler`，而不必在每次 [`add_node`](https://reference.langchain.com/python/langgraph/graph/state/StateGraph/add_node) 调用中重复设置。节点级的值始终优先，默认值在 [`StateGraph.compile`](https://reference.langchain.com/python/langgraph/graph/state/StateGraph/compile) 时应用：

```python theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
from langgraph.types import RetryPolicy, TimeoutPolicy

graph = (
    StateGraph(State)
    .set_node_defaults(
        retry_policy=RetryPolicy(max_attempts=3),
        timeout=TimeoutPolicy(run_timeout=30),
        error_handler=fallback_handler,
    )
    .add_node("a", node_a)
    .add_node("b", node_b, retry_policy=RetryPolicy(max_attempts=5))  # overrides default
    .add_edge(START, "a")
    .compile()
)
```

`retry_policy` 和 `timeout` 默认值适用于每个节点，包括错误处理器节点。`cache_policy` 和 `error_handler` 默认值仅适用于常规节点——处理器永远不会捕获自身，缓存处理器结果是不安全的。子图不会继承默认值。

有关完整的优先级规则和适用性表格，请参阅[容错](/oss/python/langgraph/fault-tolerance#graph-defaults)。

### 在节点内访问执行信息

你可以通过 `runtime.execution_info` 访问执行身份和重试信息。它会呈现线程、运行和检查点标识符以及重试状态，而无需直接读取 `config`。

| 属性 | 类型 | 描述 |
| ------------------------- | --------------- | ------------------------------------------------------------------------------------------------ |
| `thread_id`               | `str \| None`   | 当前执行的线程 ID。没有 checkpointer 时为 `None`。 |
| `run_id`                  | `str \| None`   | 当前执行的运行 ID。未在 config 中提供时为 `None`。 |
| `checkpoint_id`           | `str`           | 当前执行的检查点 ID。 |
| `checkpoint_ns`           | `str`           | 当前执行的检查点命名空间。 |
| `task_id`                 | `str`           | 当前执行的任务 ID。 |
| `node_attempt`            | `int`           | 当前执行的尝试次数（从 1 开始）。首次尝试为 `1`，第一次重试为 `2`，依此类推。 |
| `node_first_attempt_time` | `float \| None` | 第一次尝试开始时的 Unix 时间戳（秒）。重试期间保持不变。 |

#### 访问线程和运行 ID

在节点内使用 `execution_info` 访问线程 ID、运行 ID 和其他身份字段：

```python theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
from langgraph.graph import StateGraph, START, END
from langgraph.runtime import Runtime
from typing_extensions import TypedDict

class State(TypedDict):
    result: str

def my_node(state: State, runtime: Runtime):
    info = runtime.execution_info
    print(f"Thread: {info.thread_id}, Run: {info.run_id}")  # [!code highlight]
    return {"result": "done"}

builder = StateGraph(State)
builder.add_node("my_node", my_node)
builder.add_edge(START, "my_node")
builder.add_edge("my_node", END)
graph = builder.compile()
```

#### 根据重试状态调整行为

当节点具有重试策略时，使用 `execution_info` 检查当前尝试次数，并在第一次尝试失败后切换到回退方案：

```python theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
from langgraph.graph import StateGraph, START, END
from langgraph.runtime import Runtime
from langgraph.types import RetryPolicy
from typing_extensions import TypedDict

class State(TypedDict):
    result: str

def my_node(state: State, runtime: Runtime):
    info = runtime.execution_info
    if info.node_attempt > 1:  # [!code highlight]
        # use a fallback on retries
        return {"result": call_fallback_api()}
    return {"result": call_primary_api()}

builder = StateGraph(State)
builder.add_node("my_node", my_node, retry_policy=RetryPolicy(max_attempts=3))
builder.add_edge(START, "my_node")
builder.add_edge("my_node", END)
graph = builder.compile()
```

即使没有重试策略，`execution_info` 在 `Runtime` 对象上也可用——`node_attempt` 默认为 `1`，`node_first_attempt_time` 设置为节点开始执行的时间。

### 在节点内访问服务器信息

当你的图在 LangGraph Server 上运行时，你可以通过 `runtime.server_info` 访问服务器特定的元数据。它会呈现助手 ID、图 ID 和已认证用户，而无需直接读取配置元数据或可配置键。

| 属性 | 类型 | 描述 |
| -------------- | ------------------ | ------------------------------------------------------------------------------- |
| `assistant_id` | `str`              | 当前部署的助手 ID。 |
| `graph_id`     | `str`              | 当前部署的图 ID。 |
| `user`         | `BaseUser \| None` | 已认证的用户，前提是配置了[自定义认证](/langsmith/custom-auth)。 |

```python theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
from langgraph.graph import StateGraph, START, END
from langgraph.runtime import Runtime
from typing_extensions import TypedDict

class State(TypedDict):
    result: str

def my_node(state: State, runtime: Runtime):
    server = runtime.server_info
    if server is not None:
        print(f"Assistant: {server.assistant_id}, Graph: {server.graph_id}")  # [!code highlight]
        if server.user is not None:
            print(f"User: {server.user.identity}")
    return {"result": "done"}

builder = StateGraph(State)
builder.add_node("my_node", my_node)
builder.add_edge(START, "my_node")
builder.add_edge("my_node", END)
graph = builder.compile()
```

当图未在 LangGraph Server 上运行时（例如在本地开发或测试期间），`server_info` 为 `None`。

<Note>
  `runtime.execution_info` 和 `runtime.server_info` 需要 `deepagents>=0.5.0`（或 `langgraph>=1.1.5`）。
</Note>

### 在节点内访问排空状态

当已请求[优雅关闭](/oss/python/langgraph/fault-tolerance#graceful-shutdown)时，`runtime.drain_requested` 为 `True`。在节点内读取该值，以便在下一个超步边界之前跳过开销较大的工作：

```python theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
from langgraph.runtime import Runtime

def my_node(state: State, runtime: Runtime) -> State:
    if runtime.drain_requested:  # [!code highlight]
        return {"status": "skipped", "reason": runtime.drain_reason}
    return {"status": do_work()}
```

| 属性 | 类型 | 描述 |
| ----------------- | ------------- | ------------------------------------------------------------------------------------ |
| `drain_requested` | `bool`        | 如果已为此运行调用 `RunControl.request_drain()`，则为 `True`。 |
| `drain_reason`    | `str \| None` | 传递给 `request_drain()` 的原因字符串；如果未请求排空，则为 `None`。 |

<Note>
  需要 `langgraph>=1.2`。有关完整的 `RunControl` API，请参阅[优雅关闭](/oss/python/langgraph/fault-tolerance#graceful-shutdown)。
</Note>

## 添加节点缓存

节点缓存在你想要避免重复操作的情况下非常有用，例如执行开销较大（无论是时间还是成本方面）的操作时。LangGraph 允许你为图中的节点添加个性化的缓存策略。

要配置缓存策略，请将 `cache_policy` 参数传递给 [`add_node`](https://reference.langchain.com/python/langgraph/graph/state/StateGraph/add_node) 函数。在下面的示例中，实例化了一个 [`CachePolicy`](https://reference.langchain.com/python/langgraph/types/CachePolicy) 对象，其生存时间为 120 秒，并使用默认的 `key_func` 生成器。然后将其与节点关联：

```python theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
from langgraph.types import CachePolicy

builder.add_node(
    "node_name",
    node_function,
    cache_policy=CachePolicy(ttl=120),
)
```

然后，要为图启用节点级缓存，请在编译图时设置 `cache` 参数。下面的示例使用 `InMemoryCache` 设置带内存缓存的图，但 `SqliteCache` 也可用。

```python theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
from langgraph.cache.memory import InMemoryCache

graph = builder.compile(cache=InMemoryCache())
```
## 创建步骤序列

<Info>
  **先决条件**
  本指南假定您已熟悉上文关于[状态](#define-and-update-state)的部分。
</Info>

在这里，我们演示如何构建一个简单的步骤序列。我们将展示：

1. 如何构建顺序图
2. 用于构建类似图的内置简写。

要添加节点序列，我们使用[图](/oss/python/langgraph/graph-api#stategraph)的 [`add_node`](https://reference.langchain.com/python/langgraph/graph/state/StateGraph/add_node) 和 [`add_edge`](https://reference.langchain.com/python/langgraph/pregel/_draw/add_edge) 方法：

```python theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
from langgraph.graph import START, StateGraph

builder = StateGraph(State)

# Add nodes
builder.add_node(step_1)
builder.add_node(step_2)
builder.add_node(step_3)

# Add edges
builder.add_edge(START, "step_1")
builder.add_edge("step_1", "step_2")
builder.add_edge("step_2", "step_3")
```

我们还可以使用内置的简写方法 `.add_sequence`：

```python theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
builder = StateGraph(State).add_sequence([step_1, step_2, step_3])
builder.add_edge(START, "step_1")
```

<Accordion title="为什么使用 LangGraph 将应用程序步骤拆分为一个序列？">
  LangGraph 让您可以轻松地为应用程序添加底层持久化层。
  这允许在节点执行之间对状态进行检查点保存，因此您的 LangGraph 节点可以控制：

  * 状态更新如何被[检查点保存](/oss/python/langgraph/persistence)
  * 在[人机交互](/oss/python/langgraph/interrupts)工作流中如何恢复中断
  * 如何使用 LangGraph 的[时间旅行](/oss/python/langgraph/use-time-travel)功能"回退"并分支执行

  它们还决定了执行步骤如何被[流式传输](/oss/python/langgraph/streaming)，以及如何使用 [Studio](/langsmith/studio) 可视化并调试您的应用程序。

  让我们演示一个端到端的示例。我们将创建三个步骤的序列：

  1. 在状态的某个键中填充一个值
  2. 更新同一个值
  3. 填充一个不同的值

  让我们首先定义我们的[状态](/oss/python/langgraph/graph-api#state)。它规定[图的模式](/oss/python/langgraph/graph-api#schema)，并且还可以指定如何应用更新。更多细节请参阅[使用 reducer 处理状态更新](#process-state-updates-with-reducers)。

  在我们的例子中，我们只跟踪两个值：

  ```python theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
  from typing_extensions import TypedDict

  class State(TypedDict):
      value_1: str
      value_2: int
  ```

  我们的[节点](/oss/python/langgraph/graph-api#nodes)就是读取图状态并对其更新的 Python 函数。该函数的第一个参数将始终是状态：

  ```python theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
  def step_1(state: State):
      return {"value_1": "a"}

  def step_2(state: State):
      current_value_1 = state["value_1"]
      return {"value_1": f"{current_value_1} b"}

  def step_3(state: State):
      return {"value_2": 10}
  ```

  <Note>
    请注意，当对状态发出更新时，每个节点只需指定它想要更新的键的值。

    默认情况下，这将**覆盖**相应键的值。您还可以使用 [reducers](/oss/python/langgraph/graph-api#reducers) 来控制更新的处理方式——例如，您可以改为将连续的更新追加到某个键。更多细节请参阅[使用 reducer 处理状态更新](#process-state-updates-with-reducers)。
  </Note>

  最后，我们定义图。我们使用 [StateGraph](/oss/python/langgraph/graph-api#stategraph) 来定义在此状态上操作的图。

  然后我们将使用 [`add_node`](/oss/python/langgraph/graph-api#messagesstate) 和 [`add_edge`](/oss/python/langgraph/graph-api#edges) 来填充我们的图并定义其控制流。

  ```python theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
  from langgraph.graph import START, StateGraph

  builder = StateGraph(State)

  # Add nodes
  builder.add_node(step_1)
  builder.add_node(step_2)
  builder.add_node(step_3)

  # Add edges
  builder.add_edge(START, "step_1")
  builder.add_edge("step_1", "step_2")
  builder.add_edge("step_2", "step_3")
  ```

  <Tip>
    **指定自定义名称**
    您可以使用 [`add_node`](https://reference.langchain.com/python/langgraph/graph/state/StateGraph/add_node) 为节点指定自定义名称：

    ```python theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
    builder.add_node("my_node", step_1)
    ```
  </Tip>

  请注意：

  * [`add_edge`](https://reference.langchain.com/python/langgraph/pregel/_draw/add_edge) 接受节点名称，对函数来说默认为 `node.__name__`。
  * 我们必须指定图的入口点。为此，我们添加一条来自 [START 节点](/oss/python/langgraph/graph-api#start-node) 的边。
  * 当没有更多节点可执行时，图停止。

  接下来我们[编译](/oss/python/langgraph/graph-api#compiling-your-graph)我们的图。这会对图的结构进行一些基本检查（例如，识别孤立的节点）。如果我们通过[检查点器](/oss/python/langgraph/persistence)为应用程序添加持久化，它也会在这里传入。

  ```python theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
  graph = builder.compile()
  ```

  LangGraph 提供用于可视化图的内置实用程序。让我们检查一下我们的序列。有关可视化的详细信息，请参阅[可视化您的图](#visualize-your-graph)。

  ```python theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
  from IPython.display import Image, display

  display(Image(graph.get_graph().draw_mermaid_png()))
  ```

  <img src="https://mintcdn.com/langchain-5e9cc07a/-_xGPoyjhyiDWTPJ/oss/images/graph_api_image_2.png?fit=max&auto=format&n=-_xGPoyjhyiDWTPJ&q=85&s=fa0376786cc89d704a5435abba178804" alt="Sequence of steps graph" width="107" height="333" data-path="oss/images/graph_api_image_2.png" />

  让我们继续一个简单的调用：

  ```python theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
  graph.invoke({"value_1": "c"})
  ```

  ```
  {'value_1': 'a b', 'value_2': 10}
  ```

  请注意：

  * 我们通过为单个状态键提供值来启动调用。我们必须始终为至少一个键提供值。
  * 我们传入的值被第一个节点覆盖了。
  * 第二个节点更新了该值。
  * 第三个节点填充了一个不同的值。

  <Tip>
    **内置简写**
    `langgraph>=0.2.46` 包含一个用于添加节点序列的内置简写 `add_sequence`。您可以按如下方式编译同一个图：

    ```python theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
    builder = StateGraph(State).add_sequence([step_1, step_2, step_3])  # [!code highlight]
    builder.add_edge(START, "step_1")

    graph = builder.compile()

    graph.invoke({"value_1": "c"})
    ```
  </Tip>
</Accordion>

## 创建分支

节点的并行执行对于加速整体图操作至关重要。LangGraph 原生支持节点的并行执行，这可以显著提高基于图的工作流的性能。这种并行化是通过扇出（fan-out）和扇入（fan-in）机制实现的，同时使用标准边和 [conditional\_edges](https://reference.langchain.com/python/langgraph/graph/state/StateGraph/add_conditional_edges)。下面是一些示例，展示如何添加适合您的分支数据流。

### 并行运行图节点

在此示例中，我们从 `Node A` 扇出到 `B and C`，然后扇入到 `D`。对于我们的状态，[我们指定 reducer 的 add 操作](/oss/python/langgraph/graph-api#reducers)。这将组合或累加状态中特定键的值，而不是简单地覆盖现有值。对于列表，这意味着将新列表与现有列表拼接。有关使用 reducer 更新状态的更多细节，请参阅上文关于[状态 reducer](#process-state-updates-with-reducers) 的部分。

```python theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
import operator
from typing import Annotated, Any
from typing_extensions import TypedDict
from langgraph.graph import StateGraph, START, END

class State(TypedDict):
    # The operator.add reducer fn makes this append-only
    aggregate: Annotated[list, operator.add]

def a(state: State):
    print(f'Adding "A" to {state["aggregate"]}')
    return {"aggregate": ["A"]}

def b(state: State):
    print(f'Adding "B" to {state["aggregate"]}')
    return {"aggregate": ["B"]}

def c(state: State):
    print(f'Adding "C" to {state["aggregate"]}')
    return {"aggregate": ["C"]}

def d(state: State):
    print(f'Adding "D" to {state["aggregate"]}')
    return {"aggregate": ["D"]}

builder = StateGraph(State)
builder.add_node(a)
builder.add_node(b)
builder.add_node(c)
builder.add_node(d)
builder.add_edge(START, "a")
builder.add_edge("a", "b")
builder.add_edge("a", "c")
builder.add_edge("b", "d")
builder.add_edge("c", "d")
builder.add_edge("d", END)
graph = builder.compile()
```

```python theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
from IPython.display import Image, display

display(Image(graph.get_graph().draw_mermaid_png()))
```

<img src="https://mintcdn.com/langchain-5e9cc07a/-_xGPoyjhyiDWTPJ/oss/images/graph_api_image_3.png?fit=max&auto=format&n=-_xGPoyjhyiDWTPJ&q=85&s=8359f2e8d9dde03d7cc25f9d755a428d" alt="Parallel execution graph" width="143" height="432" data-path="oss/images/graph_api_image_3.png" />

使用 reducer，您可以看到每个节点中添加的值都会被累加。

```python theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
graph.invoke({"aggregate": []}, {"configurable": {"thread_id": "foo"}})
```

```
Adding "A" to []
Adding "B" to ['A']
Adding "C" to ['A']
Adding "D" to ['A', 'B', 'C']
```

<Note>
  在上面的示例中，节点 `"b"` 和 `"c"` 在同一个[超级步](/oss/python/langgraph/graph-api#graphs)中并发执行。由于它们位于同一步中，因此节点 `"d"` 会在 `"b"` 和 `"c"` 都完成后执行。

  重要的是，并行超级步中的更新可能无法一致地排序。如果您需要来自并行超级步的一致且预先确定的更新顺序，则应将输出连同用于排序的值一起写入状态中的一个单独字段。
</Note>

<Accordion title="异常处理？">
  LangGraph 在[超级步](/oss/python/langgraph/graph-api#graphs)中执行节点，这意味着虽然并行分支是并行执行的，但整个超级步是**事务性**的。如果这些分支中任何一个抛出异常，则**没有任何**更新会应用到状态（整个超级步都会报错）。

  重要的是，当使用[检查点器](/oss/python/langgraph/persistence)时，超级步内成功节点的结果会被保存，并且在恢复时不会重复执行。

  如果您的节点容易出错（或许您想处理不稳定的 API 调用），LangGraph 提供了两种解决方式：

  1. 您可以在节点内编写常规的 Python 代码来捕获并处理异常。
  2. 您可以设置 **[retry\_policy](https://langchain-ai.github.io/langgraph/reference/types/#langgraph.types.RetryPolicy)** 来指示图重试抛出某些类型异常的节点。只有失败的分支会被重试，因此您无需担心执行冗余工作。

  结合起来，这些功能让您能够进行并行执行并完全控制异常处理。
</Accordion>

<Tip>
  **设置最大并发数**
  您可以通过在调用图时在[配置](https://reference.langchain.com/python/langchain-core/runnables/config/RunnableConfig)中设置 `max_concurrency` 来控制并发任务的最大数量。

  ```python theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
  graph.invoke({"value_1": "c"}, {"configurable": {"max_concurrency": 10}})
  ```
</Tip>

### 延迟节点执行

当您希望延迟节点的执行，直到所有其他待处理任务都完成时，延迟节点执行会非常有用。当分支长度不同时尤其如此，这在 map-reduce 流程等工作流中很常见。

上面的示例展示了当每条路径只有一步时如何扇出和扇入。但如果一个分支有多步呢？让我们在 `"b"` 分支中添加一个节点 `"b_2"`：

```python theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
import operator
from typing import Annotated, Any
from typing_extensions import TypedDict
from langgraph.graph import StateGraph, START, END

class State(TypedDict):
    # The operator.add reducer fn makes this append-only
    aggregate: Annotated[list, operator.add]

def a(state: State):
    print(f'Adding "A" to {state["aggregate"]}')
    return {"aggregate": ["A"]}

def b(state: State):
    print(f'Adding "B" to {state["aggregate"]}')
    return {"aggregate": ["B"]}

def b_2(state: State):
    print(f'Adding "B_2" to {state["aggregate"]}')
    return {"aggregate": ["B_2"]}

def c(state: State):
    print(f'Adding "C" to {state["aggregate"]}')
    return {"aggregate": ["C"]}

def d(state: State):
    print(f'Adding "D" to {state["aggregate"]}')
    return {"aggregate": ["D"]}

builder = StateGraph(State)
builder.add_node(a)
builder.add_node(b)
builder.add_node(b_2)
builder.add_node(c)
builder.add_node(d, defer=True)  # [!code highlight]
builder.add_edge(START, "a")
builder.add_edge("a", "b")
builder.add_edge("a", "c")
builder.add_edge("b", "b_2")
builder.add_edge("b_2", "d")
builder.add_edge("c", "d")
builder.add_edge("d", END)
graph = builder.compile()
```

```python theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
from IPython.display import Image, display

display(Image(graph.get_graph().draw_mermaid_png()))
```

<img src="https://mintcdn.com/langchain-5e9cc07a/-_xGPoyjhyiDWTPJ/oss/images/graph_api_image_4.png?fit=max&auto=format&n=-_xGPoyjhyiDWTPJ&q=85&s=44cd97f020dfefeaffbe2b012514f343" alt="Deferred execution graph" width="161" height="531" data-path="oss/images/graph_api_image_4.png" />

```python theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
graph.invoke({"aggregate": []})
```

```
Adding "A" to []
Adding "B" to ['A']
Adding "C" to ['A']
Adding "B_2" to ['A', 'B', 'C']
Adding "D" to ['A', 'B', 'C', 'B_2']
```

在上面的示例中，节点 `"b"` 和 `"c"` 在同一个超级步中并发执行。我们在节点 `d` 上设置了 `defer=True`，因此它直到所有待处理任务完成后才会执行。在这种情况下，这意味着 `"d"` 会等待整个 `"b"` 分支完成后再执行。

当每个分支都总是运行时，您可以使用列表形式的边来等待，而不必使用 `defer=True`。`add_edge` 也接受起始节点的列表。这不是对单独 `add_edge` 调用的简写；这两种形式的行为不同：

```python theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
builder.add_edge(["b_2", "c"], "d")  # d runs once, after both b_2 and c complete
```

* **起始节点列表**会在所有列出的节点完成后运行一次 `d`。如果其中某个节点从未运行（例如，条件边没有选择其分支），`d` 将永远不会运行，也不会引发错误。已完成分支的状态更新会保留在图状态中，但 `d` 不会消费它们。
* **单独的边**会在任何传入分支完成的每个超级步中运行一次 `d`。当分支长度相等时，这只是一次运行；当分支长度不同时，`d` 会运行多次。
* **带有 `defer=True` 的单独边**（上面示例中的模式）会在每个选定的分支完成后运行一次 `d`，无论扇出选择的是全部分支还是仅其中一部分。

`defer=True` 会将节点推迟到图中任何地方都没有待处理任务时，而不仅仅是通往它的那些分支。寻址到该节点的 `Send` 仍会单独调用它。

### 条件分支

如果您的扇出应根据状态在运行时变化，您可以使用 [`add_conditional_edges`](https://reference.langchain.com/python/langgraph/graph/state/StateGraph/add_conditional_edges) 根据图状态选择一条或多条路径。请参阅下面的示例，其中节点 `a` 生成一个决定后续节点的状态更新。

```python theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
import operator
from typing import Annotated, Literal, Sequence
from typing_extensions import TypedDict
from langgraph.graph import StateGraph, START, END

class State(TypedDict):
    aggregate: Annotated[list, operator.add]
    # Add a key to the state. We will set this key to determine
    # how we branch.
    which: str

def a(state: State):
    print(f'Adding "A" to {state["aggregate"]}')
    return {"aggregate": ["A"], "which": "c"}  # [!code highlight]

def b(state: State):
    print(f'Adding "B" to {state["aggregate"]}')
    return {"aggregate": ["B"]}

def c(state: State):
    print(f'Adding "C" to {state["aggregate"]}')
    return {"aggregate": ["C"]}

builder = StateGraph(State)
builder.add_node(a)
builder.add_node(b)
builder.add_node(c)
builder.add_edge(START, "a")
builder.add_edge("b", END)
builder.add_edge("c", END)

def conditional_edge(state: State) -> Literal["b", "c"]:
    # Fill in arbitrary logic here that uses the state
    # to determine the next node
    return state["which"]

builder.add_conditional_edges("a", conditional_edge)  # [!code highlight]

graph = builder.compile()
```

```python theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
from IPython.display import Image, display

display(Image(graph.get_graph().draw_mermaid_png()))
```

<img src="https://mintcdn.com/langchain-5e9cc07a/-_xGPoyjhyiDWTPJ/oss/images/graph_api_image_5.png?fit=max&auto=format&n=-_xGPoyjhyiDWTPJ&q=85&s=3373a383d5acc3e4d6a4d1575e849146" alt="Conditional branching graph" width="143" height="333" data-path="oss/images/graph_api_image_5.png" />

```python theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
result = graph.invoke({"aggregate": []})
print(result)
```

```
Adding "A" to []
Adding "C" to ['A']
{'aggregate': ['A', 'C'], 'which': 'c'}
```

<Tip>
  您的条件边可以路由到多个目标节点。例如：

  ```python theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
  def route_bc_or_cd(state: State) -> Sequence[str]:
      if state["which"] == "cd":
          return ["c", "d"]
      return ["b", "c"]
  ```
</Tip>
## Map-Reduce 与 Send API

LangGraph 通过 Send API 支持 map-reduce 以及其他高级分支模式。以下是如何使用它的示例：

```python theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
from langgraph.graph import StateGraph, START, END
from langgraph.types import Send
from typing_extensions import TypedDict, Annotated
import operator

class OverallState(TypedDict):
    topic: str
    subjects: list[str]
    jokes: Annotated[list[str], operator.add]
    best_selected_joke: str

def generate_topics(state: OverallState):
    return {"subjects": ["lions", "elephants", "penguins"]}

def generate_joke(state: OverallState):
    joke_map = {
        "lions": "Why don't lions like fast food? Because they can't catch it!",
        "elephants": "Why don't elephants use computers? They're afraid of the mouse!",
        "penguins": "Why don't penguins like talking to strangers at parties? Because they find it hard to break the ice."
    }
    return {"jokes": [joke_map[state["subject"]]]}

def continue_to_jokes(state: OverallState):
    return [Send("generate_joke", {"subject": s}) for s in state["subjects"]]

def best_joke(state: OverallState):
    return {"best_selected_joke": "penguins"}

builder = StateGraph(OverallState)
builder.add_node("generate_topics", generate_topics)
builder.add_node("generate_joke", generate_joke)
builder.add_node("best_joke", best_joke)
builder.add_edge(START, "generate_topics")
builder.add_conditional_edges("generate_topics", continue_to_jokes, ["generate_joke"])
builder.add_edge("generate_joke", "best_joke")
builder.add_edge("best_joke", END)
graph = builder.compile()
```

```python theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
from IPython.display import Image, display

display(Image(graph.get_graph().draw_mermaid_png()))
```

<img src="https://mintcdn.com/langchain-5e9cc07a/-_xGPoyjhyiDWTPJ/oss/images/graph_api_image_6.png?fit=max&auto=format&n=-_xGPoyjhyiDWTPJ&q=85&s=48249d2085e8bfc63a142ccfba5082f5" alt="Map-reduce graph with fanout" width="160" height="432" data-path="oss/images/graph_api_image_6.png" />

```python theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
# Call the graph: here we call it to generate a list of jokes
stream = graph.stream_events({"topic": "animals"}, version="v3")
for message in stream.messages:
    for token in message.text:
        print(token, end="", flush=True)
```

```
{'generate_topics': {'subjects': ['lions', 'elephants', 'penguins']}}
{'generate_joke': {'jokes': ["Why don't lions like fast food? Because they can't catch it!"]}}
{'generate_joke': {'jokes': ["Why don't elephants use computers? They're afraid of the mouse!"]}}
{'generate_joke': {'jokes': ['Why don't penguins like talking to strangers at parties? Because they find it hard to break the ice.']}}
{'best_joke': {'best_selected_joke': 'penguins'}}
```

## 创建并控制循环

在创建带循环的图时，我们需要一种终止执行的机制。最常见的方式是添加一条[条件边](/oss/python/langgraph/graph-api#conditional-edges)，一旦达到某个终止条件，就将执行路由到 [END](/oss/python/langgraph/graph-api#end-node) 节点。

你还可以在调用或流式执行图时设置图的递归限制。递归限制规定了图在抛出错误之前允许执行的[超级步](/oss/python/langgraph/graph-api#graphs)数量。更多信息请参阅[递归限制概念](/oss/python/langgraph/graph-api#recursion-limit)。

让我们考虑一个带循环的简单图，以更好地理解这些机制是如何工作的。

<Tip>
  如果想返回状态的最后一个值而不是收到递归限制错误，请参阅[下一节](#impose-a-recursion-limit)。
</Tip>

创建循环时，你可以加入一条指定终止条件的条件边：

```python theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
builder = StateGraph(State)
builder.add_node(a)
builder.add_node(b)

def route(state: State) -> Literal["b", END]:
    if termination_condition(state):
        return END
    else:
        return "b"

builder.add_edge(START, "a")
builder.add_conditional_edges("a", route)
builder.add_edge("b", "a")
graph = builder.compile()
```

要控制递归限制，请在配置中指定 `"recursion_limit"`。这会抛出 `GraphRecursionError`，你可以捕获并处理该异常：

```python theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
from langgraph.errors import GraphRecursionError

try:
    graph.invoke(inputs, {"recursion_limit": 3})
except GraphRecursionError:
    print("Recursion Error")
```

让我们定义一个带简单循环的图。请注意，我们使用一条条件边来实现终止条件。

```python theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
import operator
from typing import Annotated, Literal
from typing_extensions import TypedDict
from langgraph.graph import StateGraph, START, END

class State(TypedDict):
    # The operator.add reducer fn makes this append-only
    aggregate: Annotated[list, operator.add]

def a(state: State):
    print(f'Node A sees {state["aggregate"]}')
    return {"aggregate": ["A"]}

def b(state: State):
    print(f'Node B sees {state["aggregate"]}')
    return {"aggregate": ["B"]}

# Define nodes
builder = StateGraph(State)
builder.add_node(a)
builder.add_node(b)

# Define edges
def route(state: State) -> Literal["b", END]:
    if len(state["aggregate"]) < 7:
        return "b"
    else:
        return END

builder.add_edge(START, "a")
builder.add_conditional_edges("a", route)
builder.add_edge("b", "a")
graph = builder.compile()
```

```python theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
from IPython.display import Image, display

display(Image(graph.get_graph().draw_mermaid_png()))
```

<img src="https://mintcdn.com/langchain-5e9cc07a/dL5Sn6Cmy9pwtY0V/oss/images/graph_api_image_7.png?fit=max&auto=format&n=dL5Sn6Cmy9pwtY0V&q=85&s=e1b99e7efe45b1fdc5836d590d5fbbc3" alt="Simple loop graph" width="188" height="249" data-path="oss/images/graph_api_image_7.png" />

这种架构类似于 [ReAct 智能体](/oss/python/langgraph/workflows-agents)，其中节点 `"a"` 是调用工具（tool-calling）的模型，节点 `"b"` 表示工具。

在我们的 `route` 条件边中，我们指定当状态中的 `"aggregate"` 列表超过某个阈值长度后，就应该结束执行。

调用图之后，我们可以看到执行在节点 `"a"` 和 `"b"` 之间交替进行，直到达到终止条件才结束。

```python theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
graph.invoke({"aggregate": []})
```

```
Node A sees []
Node B sees ['A']
Node A sees ['A', 'B']
Node B sees ['A', 'B', 'A']
Node A sees ['A', 'B', 'A', 'B']
Node B sees ['A', 'B', 'A', 'B', 'A']
Node A sees ['A', 'B', 'A', 'B', 'A', 'B']
```

### 施加递归限制

在某些应用中，我们可能无法保证能达到给定的终止条件。在这些情况下，我们可以设置图的[递归限制](/oss/python/langgraph/graph-api#recursion-limit)。这会在执行一定数量的[超级步](/oss/python/langgraph/graph-api#graphs)后抛出 `GraphRecursionError`。然后我们就可以捕获并处理这个异常：

```python theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
from langgraph.errors import GraphRecursionError

try:
    graph.invoke({"aggregate": []}, {"recursion_limit": 4})
except GraphRecursionError:
    print("Recursion Error")
```

```
Node A sees []
Node B sees ['A']
Node C sees ['A', 'B']
Node D sees ['A', 'B']
Node A sees ['A', 'B', 'C', 'D']
Recursion Error
```

<Accordion title="扩展示例：达到递归限制时返回状态">
  与其抛出 `GraphRecursionError`，我们可以在状态中引入一个新的键，用来记录距离达到递归限制还剩余多少步。然后我们可以利用这个键来决定是否应该结束运行。

  LangGraph 实现了一个特殊的 `RemainingSteps` 注解。在底层，它会创建一个 `ManagedValue` 通道 —— 一个仅在图运行期间存在、运行结束后即消失的状态通道。

  ```python theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
  import operator
  from typing import Annotated, Literal
  from typing_extensions import TypedDict
  from langgraph.graph import StateGraph, START, END
  from langgraph.managed.is_last_step import RemainingSteps

  class State(TypedDict):
      aggregate: Annotated[list, operator.add]
      remaining_steps: RemainingSteps

  def a(state: State):
      print(f'Node A sees {state["aggregate"]}')
      return {"aggregate": ["A"]}

  def b(state: State):
      print(f'Node B sees {state["aggregate"]}')
      return {"aggregate": ["B"]}

  # Define nodes
  builder = StateGraph(State)
  builder.add_node(a)
  builder.add_node(b)

  # Define edges
  def route(state: State) -> Literal["b", END]:
      if state["remaining_steps"] <= 2:
          return END
      else:
          return "b"

  builder.add_edge(START, "a")
  builder.add_conditional_edges("a", route)
  builder.add_edge("b", "a")
  graph = builder.compile()

  # Test it out
  result = graph.invoke({"aggregate": []}, {"recursion_limit": 4})
  print(result)
  ```

  ```
  Node A sees []
  Node B sees ['A']
  Node A sees ['A', 'B']
  {'aggregate': ['A', 'B', 'A']}
  ```
</Accordion>

<Accordion title="扩展示例：带分支的循环">
  为了更深入地理解递归限制的工作原理，让我们考虑一个更复杂的示例。下面我们实现了一个循环，但其中一个步骤会分叉到两个节点：

  ```python theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
  import operator
  from typing import Annotated, Literal
  from typing_extensions import TypedDict
  from langgraph.graph import StateGraph, START, END

  class State(TypedDict):
      aggregate: Annotated[list, operator.add]

  def a(state: State):
      print(f'Node A sees {state["aggregate"]}')
      return {"aggregate": ["A"]}

  def b(state: State):
      print(f'Node B sees {state["aggregate"]}')
      return {"aggregate": ["B"]}

  def c(state: State):
      print(f'Node C sees {state["aggregate"]}')
      return {"aggregate": ["C"]}

  def d(state: State):
      print(f'Node D sees {state["aggregate"]}')
      return {"aggregate": ["D"]}

  # Define nodes
  builder = StateGraph(State)
  builder.add_node(a)
  builder.add_node(b)
  builder.add_node(c)
  builder.add_node(d)

  # Define edges
  def route(state: State) -> Literal["b", END]:
      if len(state["aggregate"]) < 7:
          return "b"
      else:
          return END

  builder.add_edge(START, "a")
  builder.add_conditional_edges("a", route)
  builder.add_edge("b", "c")
  builder.add_edge("b", "d")
  builder.add_edge(["c", "d"], "a")
  graph = builder.compile()
  ```

  ```python theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
  from IPython.display import Image, display

  display(Image(graph.get_graph().draw_mermaid_png()))
  ```

  <img src="https://mintcdn.com/langchain-5e9cc07a/dL5Sn6Cmy9pwtY0V/oss/images/graph_api_image_8.png?fit=max&auto=format&n=dL5Sn6Cmy9pwtY0V&q=85&s=20e2a9e8c15760eb9ecb07fc411aa70e" alt="Complex loop graph with branches" width="297" height="348" data-path="oss/images/graph_api_image_8.png" />

  这个图看起来很复杂，但可以将其概念化为一个[超级步](/oss/python/langgraph/graph-api#graphs)的循环：

  1. 节点 A
  2. 节点 B
  3. 节点 C 和 D
  4. 节点 A
  5. ...

  我们有一个由四个超级步组成的循环，其中节点 C 和 D 是并发执行的。列表形式的边会同时等待 `"c"` 和 `"d"` 完成，然后再回到 `"a"`。关于列表形式的边与指向同一节点的独立边有何不同，请参阅[延迟节点执行](#defer-node-execution)。

  像之前一样调用图，我们可以看到在执行达到终止条件之前，完成了整整两"圈"：

  ```python theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
  result = graph.invoke({"aggregate": []})
  ```

  ```
  Node A sees []
  Node B sees ['A']
  Node D sees ['A', 'B']
  Node C sees ['A', 'B']
  Node A sees ['A', 'B', 'C', 'D']
  Node B sees ['A', 'B', 'C', 'D', 'A']
  Node D sees ['A', 'B', 'C', 'D', 'A', 'B']
  Node C sees ['A', 'B', 'C', 'D', 'A', 'B']
  Node A sees ['A', 'B', 'C', 'D', 'A', 'B', 'C', 'D']
  ```

  然而，如果我们将递归限制设置为四，我们只会完成一圈，因为每一圈包含四个超级步：

  ```python theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
  from langgraph.errors import GraphRecursionError

  try:
      result = graph.invoke({"aggregate": []}, {"recursion_limit": 4})
  except GraphRecursionError:
      print("Recursion Error")
  ```

  ```
  Node A sees []
  Node B sees ['A']
  Node C sees ['A', 'B']
  Node D sees ['A', 'B']
  Node A sees ['A', 'B', 'C', 'D']
  Recursion Error
  ```
</Accordion>
## 异步

使用异步编程范式可以在并发运行 [IO 密集型](https://en.wikipedia.org/wiki/I/O_bound) 代码时带来显著的性能提升（例如，向聊天模型提供商并发发起 API 请求）。

要将图的 `sync` 实现转换为 `async` 实现，你需要：

1. 将 `nodes` 更新为使用 `async def` 而不是 `def`。
2. 更新内部代码，在适当的地方使用 `await`。
3. 根据需要，使用 `.ainvoke` 或 `.astream` 调用图。

由于许多 LangChain 对象都实现了 [Runnable 协议](https://python.langchain.com/docs/expression_language/interface/)，该协议为所有 `sync` 方法提供了 `async` 变体，因此将 `sync` 图升级为 `async` 图通常相当快捷。

请参阅下面的示例。为了演示对底层 LLM 的异步调用，我们将包含一个聊天模型：

<Tabs>
  <Tab title="OpenAI">
    👉 阅读 [OpenAI 聊天模型集成文档](/oss/python/integrations/chat/openai/)

    <CodeGroup>
      ```bash pip theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
      pip install -U "langchain[openai]"
      ```

      ```bash uv theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
      uv add "langchain[openai]"
      ```
    </CodeGroup>

    <CodeGroup>
      ```python init_chat_model theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
      import os
      from langchain.chat_models import init_chat_model

      os.environ["OPENAI_API_KEY"] = "sk-..."

      model = init_chat_model("gpt-5.5")
      ```

      ```python Model Class theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
      import os
      from langchain_openai import ChatOpenAI

      os.environ["OPENAI_API_KEY"] = "sk-..."

      model = ChatOpenAI(model="gpt-5.5")
      ```
    </CodeGroup>
  </Tab>

  <Tab title="Anthropic">
    👉 阅读 [Anthropic 聊天模型集成文档](/oss/python/integrations/chat/anthropic/)

    <CodeGroup>
      ```bash pip theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
      pip install -U "langchain[anthropic]"
      ```

      ```bash uv theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
      uv add "langchain[anthropic]"
      ```
    </CodeGroup>

    <CodeGroup>
      ```python init_chat_model theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
      import os
      from langchain.chat_models import init_chat_model

      os.environ["ANTHROPIC_API_KEY"] = "sk-..."

      model = init_chat_model("claude-sonnet-4-6")
      ```

      ```python Model Class theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
      import os
      from langchain_anthropic import ChatAnthropic

      os.environ["ANTHROPIC_API_KEY"] = "sk-..."

      model = ChatAnthropic(model="claude-sonnet-4-6")
      ```
    </CodeGroup>
  </Tab>

  <Tab title="Azure">
    👉 阅读 [Azure 聊天模型集成文档](/oss/python/integrations/chat/azure_chat_openai/)

    <CodeGroup>
      ```bash pip theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
      pip install -U "langchain[openai]"
      ```

      ```bash uv theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
      uv add "langchain[openai]"
      ```
    </CodeGroup>

    <CodeGroup>
      ```python init_chat_model theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
      import os
      from langchain.chat_models import init_chat_model

      os.environ["AZURE_OPENAI_API_KEY"] = "..."
      os.environ["AZURE_OPENAI_ENDPOINT"] = "..."
      os.environ["OPENAI_API_VERSION"] = "2025-03-01-preview"

      model = init_chat_model(
          "azure_openai:gpt-5.5",
          azure_deployment=os.environ["AZURE_OPENAI_DEPLOYMENT_NAME"],
      )
      ```

      ```python Model Class theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
      import os
      from langchain_openai import AzureChatOpenAI

      os.environ["AZURE_OPENAI_API_KEY"] = "..."
      os.environ["AZURE_OPENAI_ENDPOINT"] = "..."
      os.environ["OPENAI_API_VERSION"] = "2025-03-01-preview"

      model = AzureChatOpenAI(
          model="gpt-5.5",
          azure_deployment=os.environ["AZURE_OPENAI_DEPLOYMENT_NAME"]
      )
      ```
    </CodeGroup>
  </Tab>

  <Tab title="Google Gemini">
    👉 阅读 [Google GenAI 聊天模型集成文档](/oss/python/integrations/chat/google_generative_ai/)

    <CodeGroup>
      ```bash pip theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
      pip install -U "langchain[google-genai]"
      ```

      ```bash uv theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
      uv add "langchain[google-genai]"
      ```
    </CodeGroup>

    <CodeGroup>
      ```python init_chat_model theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
      import os
      from langchain.chat_models import init_chat_model

      os.environ["GOOGLE_API_KEY"] = "..."

      model = init_chat_model("google_genai:gemini-3.7-flash")
      ```

      ```python Model Class theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
      import os
      from langchain_google_genai import ChatGoogleGenerativeAI

      os.environ["GOOGLE_API_KEY"] = "..."

      model = ChatGoogleGenerativeAI(model="gemini-3.7-flash")
      ```
    </CodeGroup>
  </Tab>

  <Tab title="AWS Bedrock">
    👉 阅读 [AWS Bedrock 聊天模型集成文档](/oss/python/integrations/chat/bedrock/)

    <CodeGroup>
      ```bash pip theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
      pip install -U "langchain[aws]"
      ```

      ```bash uv theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
      uv add "langchain[aws]"
      ```
    </CodeGroup>

    <CodeGroup>
      ```python init_chat_model theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
      from langchain.chat_models import init_chat_model

      # Follow the steps here to configure your credentials:
      # https://docs.aws.amazon.com/bedrock/latest/userguide/getting-started.html

      model = init_chat_model(
          "us.anthropic.claude-sonnet-4-6",
          model_provider="bedrock_converse",
      )
      ```

      ```python Model Class theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
      from langchain_aws import ChatBedrock

      model = ChatBedrock(model="us.anthropic.claude-sonnet-4-6")
      ```
    </CodeGroup>
  </Tab>

  <Tab title="HuggingFace">
    👉 阅读 [HuggingFace 聊天模型集成文档](/oss/python/integrations/chat/huggingface/)

    <CodeGroup>
      ```bash pip theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
      pip install -U "langchain[huggingface]"
      ```

      ```bash uv theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
      uv add "langchain[huggingface]"
      ```
    </CodeGroup>

    <CodeGroup>
      ```python init_chat_model theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
      import os
      from langchain.chat_models import init_chat_model

      os.environ["HUGGINGFACEHUB_API_TOKEN"] = "hf_..."

      model = init_chat_model(
          "microsoft/Phi-3-mini-4k-instruct",
          model_provider="huggingface",
          temperature=0.7,
          max_tokens=1024,
      )
      ```

      ```python Model Class theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
      import os
      from langchain_huggingface import ChatHuggingFace, HuggingFaceEndpoint

      os.environ["HUGGINGFACEHUB_API_TOKEN"] = "hf_..."

      llm = HuggingFaceEndpoint(
          repo_id="microsoft/Phi-3-mini-4k-instruct",
          temperature=0.7,
          max_length=1024,
      )
      model = ChatHuggingFace(llm=llm)
      ```
    </CodeGroup>
  </Tab>

  <Tab title="OpenRouter">
    👉 阅读 [OpenRouter 聊天模型集成文档](/oss/python/integrations/chat/openrouter/)

    <CodeGroup>
      ```bash pip theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
      pip install -U "langchain-openrouter"
      ```

      ```bash uv theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
      uv add "langchain-openrouter"
      ```
    </CodeGroup>

    <CodeGroup>
      ```python init_chat_model theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
      import os
      from langchain.chat_models import init_chat_model

      os.environ["OPENROUTER_API_KEY"] = "sk-..."

      model = init_chat_model(
          "auto",
          model_provider="openrouter",
      )
      ```

      ```python Model Class theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
      import os
      from langchain_openrouter import ChatOpenRouter

      os.environ["OPENROUTER_API_KEY"] = "sk-..."

      model = ChatOpenRouter(model="auto")
      ```
    </CodeGroup>
  </Tab>
</Tabs>

```python theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
from langchain.chat_models import init_chat_model
from langgraph.graph import MessagesState, StateGraph

async def node(state: MessagesState):  # [!code highlight]
    new_message = await llm.ainvoke(state["messages"])  # [!code highlight]
    return {"messages": [new_message]}

builder = StateGraph(MessagesState).add_node(node).set_entry_point("node")
graph = builder.compile()

input_message = {"role": "user", "content": "Hello"}
result = await graph.ainvoke({"messages": [input_message]})  # [!code highlight]
```

<Tip>
  **异步流式输出**
  有关使用异步进行流式输出的示例，请参阅[流式输出指南](/oss/python/langgraph/streaming)。
</Tip>
## 使用 `Command` 结合控制流与状态更新

将控制流（边）和状态更新（节点）结合起来会很有用。例如，您可能希望在同一个节点中既执行状态更新，又决定接下来要前往哪个节点。LangGraph 提供了一种实现方式：从节点函数返回 [Command](https://reference.langchain.com/python/langgraph/types/Command) 对象：

```python theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
def my_node(state: State) -> Command[Literal["my_other_node"]]:
    return Command(
        # state update
        update={"foo": "bar"},
        # control flow
        goto="my_other_node"
    )
```

下面我们展示一个端到端的示例。让我们创建一个包含 3 个节点（A、B 和 C）的简单图。我们将首先执行节点 A，然后根据节点 A 的输出决定接下来是前往节点 B 还是节点 C。

```python theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
import random
from typing_extensions import TypedDict, Literal
from langgraph.graph import StateGraph, START
from langgraph.types import Command

# Define graph state
class State(TypedDict):
    foo: str

# Define the nodes

def node_a(state: State) -> Command[Literal["node_b", "node_c"]]:
    print("Called A")
    value = random.choice(["b", "c"])
    # this is a replacement for a conditional edge function
    if value == "b":
        goto = "node_b"
    else:
        goto = "node_c"

    # note how Command allows you to BOTH update the graph state AND route to the next node
    return Command(
        # this is the state update
        update={"foo": value},
        # this is a replacement for an edge
        goto=goto,
    )

def node_b(state: State):
    print("Called B")
    return {"foo": state["foo"] + "b"}

def node_c(state: State):
    print("Called C")
    return {"foo": state["foo"] + "c"}
```

现在我们可以使用上面的节点创建 [`StateGraph`](https://reference.langchain.com/python/langgraph/graph/state/StateGraph)。请注意，图中没有用于路由的[条件边](/oss/python/langgraph/graph-api#conditional-edges)！这是因为控制流是通过 `node_a` 内部的 [`Command`](https://reference.langchain.com/python/langgraph/types/Command) 定义的。

```python theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
builder = StateGraph(State)
builder.add_edge(START, "node_a")
builder.add_node(node_a)
builder.add_node(node_b)
builder.add_node(node_c)
# NOTE: there are no edges between nodes A, B and C!

graph = builder.compile()
```

<Warning>
  您可能已经注意到，我们使用了 [`Command`](https://reference.langchain.com/python/langgraph/types/Command) 作为返回类型注解，例如 `Command[Literal["node_b", "node_c"]]`。这对于图的渲染是必要的，它告诉 LangGraph `node_a` 可以导航到 `node_b` 和 `node_c`。
</Warning>

```python theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
from IPython.display import display, Image

display(Image(graph.get_graph().draw_mermaid_png()))
```

<img src="https://mintcdn.com/langchain-5e9cc07a/-_xGPoyjhyiDWTPJ/oss/images/graph_api_image_11.png?fit=max&auto=format&n=-_xGPoyjhyiDWTPJ&q=85&s=f11e5cddedbf2760d40533f294c44aea" alt="Command-based graph navigation" width="232" height="333" data-path="oss/images/graph_api_image_11.png" />

如果我们多次运行该图，会看到它根据节点 A 中的随机选择走不同的路径（A -> B 或 A -> C）。

```python theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
graph.invoke({"foo": ""})
```

```
Called A
Called C
```

### 导航到父图中的节点

如果您正在使用[子图](/oss/python/langgraph/use-subgraphs)，您可能希望从子图内的节点导航到另一个子图（即父图中的另一个节点）。为此，您可以在 `Command` 中指定 `graph=Command.PARENT`：

```python theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
def my_node(state: State) -> Command[Literal["other_subgraph"]]:
    return Command(
        update={"foo": "bar"},
        goto="other_subgraph",  # where `other_subgraph` is a node in the parent graph
        graph=Command.PARENT
    )
```

让我们使用上面的示例来演示这一点。我们将把上面示例中的 `nodeA` 改为一个单节点图，并将其作为子图添加到父图中。

<Warning>
  **使用 `Command.PARENT` 进行状态更新**
  当您从子图节点向父图节点发送更新，且更新的键在父图和子图的[状态模式](/oss/python/langgraph/graph-api#schema)中都有定义时，您**必须**为父图状态中要更新的键定义归约器（reducer）。请参见下面的示例。
</Warning>

```python theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
import operator
from typing_extensions import Annotated

class State(TypedDict):
    # NOTE: we define a reducer here
    foo: Annotated[str, operator.add]  # [!code highlight]

def node_a(state: State):
    print("Called A")
    value = random.choice(["a", "b"])
    # this is a replacement for a conditional edge function
    if value == "a":
        goto = "node_b"
    else:
        goto = "node_c"

    # note how Command allows you to BOTH update the graph state AND route to the next node
    return Command(
        update={"foo": value},
        goto=goto,
        # this tells LangGraph to navigate to node_b or node_c in the parent graph
        # NOTE: this will navigate to the closest parent graph relative to the subgraph
        graph=Command.PARENT,  # [!code highlight]
    )

subgraph = StateGraph(State).add_node(node_a).add_edge(START, "node_a").compile()

def node_b(state: State):
    print("Called B")
    # NOTE: since we've defined a reducer, we don't need to manually append
    # new characters to existing 'foo' value. instead, reducer will append these
    # automatically (via operator.add)
    return {"foo": "b"}  # [!code highlight]

def node_c(state: State):
    print("Called C")
    return {"foo": "c"}  # [!code highlight]

builder = StateGraph(State)
builder.add_edge(START, "subgraph")
builder.add_node("subgraph", subgraph)
builder.add_node(node_b)
builder.add_node(node_c)

graph = builder.compile()
```

```python theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
graph.invoke({"foo": ""})
```

```
Called A
Called C
```

### 在工具中使用

一个常见的用例是在工具内部更新图状态。例如，在客户支持应用中，您可能希望在对话开始时根据客户的账号或 ID 查找客户信息。要从工具更新图状态，您可以从工具中返回 `Command(update={"my_custom_key": "foo", "messages": [...]})`：

```python theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
from langchain.tools import ToolRuntime

@tool
def lookup_user_info(runtime: ToolRuntime):
    """Use this to look up user information to better assist them with their questions."""
    user_info = get_user_info(runtime.server_info.user.identity)  # [!code highlight]
    return Command(
        update={
            # update the state keys
            "user_info": user_info,
            # update the message history
            "messages": [ToolMessage("Successfully looked up user information", tool_call_id=runtime.tool_call_id)]
        }
    )
```

<Warning>
  从工具返回 [`Command`](https://reference.langchain.com/python/langgraph/types/Command) 时，您**必须**在 `Command.update` 中包含 `messages`（或任何用于消息历史的状态键），并且 `messages` 中的消息列表**必须**包含一个 `ToolMessage`。这对于生成有效的消息历史是必要的（LLM 提供商要求带有工具调用的 AI 消息后面紧跟工具结果消息）。
</Warning>

如果您使用的工具通过 [`Command`](https://reference.langchain.com/python/langgraph/types/Command) 更新状态，我们建议使用预构建的 [`ToolNode`](https://reference.langchain.com/python/langgraph/agents/#langgraph.prebuilt.tool_node.ToolNode)，它会自动处理返回 [`Command`](https://reference.langchain.com/python/langgraph/types/Command) 对象的工具，并将它们传播到图状态。如果您正在编写一个调用工具的自定义节点，您需要手动将工具返回的 [`Command`](https://reference.langchain.com/python/langgraph/types/Command) 对象作为节点的更新进行传播。

## 可视化您的图

这里我们演示如何可视化您创建的图。

您可以可视化任意 [Graph](https://langchain-ai.github.io/langgraph/reference/graphs/)，包括 [StateGraph](https://langchain-ai.github.io/langgraph/reference/graphs/#langgraph.graph.state.StateGraph)。

让我们画一些分形图来玩一玩 :)。

```python theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
import random
from typing import Annotated, Literal
from typing_extensions import TypedDict
from langgraph.graph import StateGraph, START, END
from langgraph.graph.message import add_messages

class State(TypedDict):
    messages: Annotated[list, add_messages]

class MyNode:
    def __init__(self, name: str):
        self.name = name
    def __call__(self, state: State):
        return {"messages": [("assistant", f"Called node {self.name}")]}

def route(state) -> Literal["entry_node", END]:
    if len(state["messages"]) > 10:
        return END
    return "entry_node"

def add_fractal_nodes(builder, current_node, level, max_level):
    if level > max_level:
        return
    # Number of nodes to create at this level
    num_nodes = random.randint(1, 3)  # Adjust randomness as needed
    for i in range(num_nodes):
        nm = ["A", "B", "C"][i]
        node_name = f"node_{current_node}_{nm}"
        builder.add_node(node_name, MyNode(node_name))
        builder.add_edge(current_node, node_name)
        # Recursively add more nodes
        r = random.random()
        if r > 0.2 and level + 1 < max_level:
            add_fractal_nodes(builder, node_name, level + 1, max_level)
        elif r > 0.05:
            builder.add_conditional_edges(node_name, route, node_name)
        else:
            # End
            builder.add_edge(node_name, END)

def build_fractal_graph(max_level: int):
    builder = StateGraph(State)
    entry_point = "entry_node"
    builder.add_node(entry_point, MyNode(entry_point))
    builder.add_edge(START, entry_point)
    add_fractal_nodes(builder, entry_point, 1, max_level)
    # Optional: set a finish point if required
    builder.add_edge(entry_point, END)  # or any specific node
    return builder.compile()

app = build_fractal_graph(3)
```

### Mermaid

我们还可以将图类转换为 Mermaid 语法。

```python theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
print(app.get_graph().draw_mermaid())
```

```
%%{init: {'flowchart': {'curve': 'linear'}}}%%
graph TD;
    tart__([<p>__start__</p>]):::first
    ry_node(entry_node)
    e_entry_node_A(node_entry_node_A)
    e_entry_node_B(node_entry_node_B)
    e_node_entry_node_B_A(node_node_entry_node_B_A)
    e_node_entry_node_B_B(node_node_entry_node_B_B)
    e_node_entry_node_B_C(node_node_entry_node_B_C)
    nd__([<p>__end__</p>]):::last
    tart__ --> entry_node;
    ry_node --> __end__;
    ry_node --> node_entry_node_A;
    ry_node --> node_entry_node_B;
    e_entry_node_B --> node_node_entry_node_B_A;
    e_entry_node_B --> node_node_entry_node_B_B;
    e_entry_node_B --> node_node_entry_node_B_C;
    e_entry_node_A -.-> entry_node;
    e_entry_node_A -.-> __end__;
    e_node_entry_node_B_A -.-> entry_node;
    e_node_entry_node_B_A -.-> __end__;
    e_node_entry_node_B_B -.-> entry_node;
    e_node_entry_node_B_B -.-> __end__;
    e_node_entry_node_B_C -.-> entry_node;
    e_node_entry_node_B_C -.-> __end__;
    ssDef default fill:#f2f0ff,line-height:1.2
    ssDef first fill-opacity:0
    ssDef last fill:#bfb6fc
```

### PNG

如果愿意，我们可以将图渲染为 `.png`。这里有三种可选方式：

* 使用 Mermaid.ink API（不需要额外的包）
* 使用 Mermaid + Pyppeteer（需要 `pip install pyppeteer`）
* 使用 graphviz（需要 `pip install graphviz`）

**使用 Mermaid.Ink**

默认情况下，`draw_mermaid_png()` 使用 Mermaid.Ink 的 API 来生成图表。

```python theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
from IPython.display import Image, display
from langchain_core.runnables.graph import CurveStyle, MermaidDrawMethod, NodeStyles

display(Image(app.get_graph().draw_mermaid_png()))
```

<img src="https://mintcdn.com/langchain-5e9cc07a/-_xGPoyjhyiDWTPJ/oss/images/graph_api_image_10.png?fit=max&auto=format&n=-_xGPoyjhyiDWTPJ&q=85&s=6cb916b7c627e81c2816cc74ebf3f913" alt="Fractal graph visualization" width="2382" height="1131" data-path="oss/images/graph_api_image_10.png" />

**使用 Mermaid + Pyppeteer**

```python theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
import nest_asyncio

nest_asyncio.apply()  # Required for Jupyter Notebook to run async functions

display(
    Image(
        app.get_graph().draw_mermaid_png(
            curve_style=CurveStyle.LINEAR,
            node_colors=NodeStyles(first="#ffdfba", last="#baffc9", default="#fad7de"),
            wrap_label_n_words=9,
            output_file_path=None,
            draw_method=MermaidDrawMethod.PYPPETEER,
            background_color="white",
            padding=10,
        )
    )
)
```

**使用 Graphviz**

```python theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
try:
    display(Image(app.get_graph().draw_png()))
except ImportError:
    print(
        "You likely need to install dependencies for pygraphviz, see more here https://github.com/pygraphviz/pygraphviz/blob/main/INSTALL.txt"
    )
```

***

<div className="source-links">
  <Callout icon="terminal-2">
    通过 MCP [连接这些文档](/use-these-docs) 至 Claude、VSCode 等工具，即可获得实时解答。
  </Callout>

  <Callout icon="edit">
    [在 GitHub 上编辑此页面](https://github.com/langchain-ai/docs/edit/main/src/oss/langgraph/use-graph-api.mdx) 或[提交问题](https://github.com/langchain-ai/docs/issues/new/choose)。
  </Callout>
</div>
