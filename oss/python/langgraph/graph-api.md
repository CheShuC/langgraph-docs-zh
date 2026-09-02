# Graph API 概览

## 图

从本质上讲，LangGraph 将代理工作流建模为图。你可以使用三个关键组件来定义代理的行为：

1. [`State`](#state)：一个共享数据结构，表示应用程序当前的快照。它可以是任何数据类型，但通常使用共享的状态模式来定义。

2. [`Nodes`](#nodes)：对代理逻辑进行编码的函数。它们接收当前状态作为输入，执行一些计算或副作用，并返回更新后的状态。

3. [`Edges`](#edges)：根据当前状态决定接下来执行哪个 `Node` 的函数。它们可以是条件分支或固定转换。

通过组合 `Nodes` 和 `Edges`，你可以创建复杂的循环工作流，使状态随时间演变。不过，真正的强大之处在于 LangGraph 如何管理这种状态。

需要强调的是：`Nodes` 和 `Edges` 不过是函数——它们可以包含 LLM，也可以只是普通的代码。

简而言之：*节点负责干活，边决定接下来做什么*。

LangGraph 底层图算法使用[消息传递](https://en.wikipedia.org/wiki/Message_passing)来定义通用程序。当一个节点完成其操作时，它会沿一条或多条边向其他节点发送消息。这些接收节点随后执行各自的函数，将产生的消息传递给下一组节点，如此循环往复。受 Google 的 [Pregel](https://research.google/pubs/pregel-a-system-for-large-scale-graph-processing/) 系统启发，程序以离散的"超级步"（super-steps）方式推进。

超级步可以看作对图中节点的一次迭代。并行运行的节点属于同一个超级步，而顺序运行的节点则属于不同的超级步。在图执行开始时，所有节点都处于 `inactive` 状态。当节点在其任意入边（或"通道"）上收到新消息（状态）时，它就会变为 `active`。激活的节点随即运行其函数并响应更新。在每个超级步结束时，没有收到消息的节点通过将自己标记为 `inactive` 来投票 `halt`（暂停）。当所有节点都处于 `inactive` 状态且没有消息在传输中时，图执行终止。

### StateGraph

[`StateGraph`](https://reference.langchain.com/python/langgraph/graph/state/StateGraph) 类是主要使用的图类。它由用户定义的 `State` 对象进行参数化。

### 编译你的图

要构建图，首先要定义[状态](#state)，然后添加[节点](#nodes)和[边](#edges)，最后编译它。编译图到底是什么？为什么需要编译？

编译是一个相当简单的步骤。它会对图的结构进行一些基本检查（如没有孤立节点等）。同时，你也可以在这里指定运行时参数，例如[检查点器](/oss/python/langgraph/persistence)和断点。只需调用 `.compile` 方法即可编译图：

```python theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
graph = graph_builder.compile(...)
```

<Warning>
  在可以使用图之前，你**必须**先编译它。
</Warning>

## 状态

定义图时，你要做的第一件事就是定义图的 `State`。`State` 由[图的模式](#schema)以及指定如何对状态应用更新的 [`reducer` 函数](#reducers)组成。`State` 的模式将是图中所有 `Nodes` 和 `Edges` 的输入模式，可以是 `TypedDict` 或 `Pydantic` 模型。所有 `Nodes` 都会向 `State` 发出更新，这些更新随后使用指定的 `reducer` 函数进行应用。

### 模式

指定图模式的主要文档化方式是使用 [`TypedDict`](https://docs.python.org/3/library/typing.html#typing.TypedDict)。如果想在状态中提供默认值，可以使用 [`dataclass`](https://docs.python.org/3/library/dataclasses.html)。如果希望进行递归数据验证，我们还支持使用 Pydantic [`BaseModel`](/oss/python/langgraph/use-graph-api#use-pydantic-models-for-graph-state) 作为图状态（不过请注意，Pydantic 的性能不如 `TypedDict` 或 `dataclass`）。

默认情况下，图的输入和输出模式相同。如果想改变这一点，也可以直接指定显式的输入和输出模式。当你有很多键，其中一些专门用于输入、另一些专门用于输出时，这会很有用。更多信息请参阅[指南](/oss/python/langgraph/use-graph-api#define-input-and-output-schemas)。

<Info>
  `langchain` 中更高级别的 [`create_agent`](/oss/python/langchain/agents) 工厂函数不支持 Pydantic 状态模式。
</Info>

#### 多个模式

通常，所有图节点都使用单一模式进行通信。这意味着它们将读写相同的状态通道。但是，在某些情况下我们希望对这一点有更多控制：

* 内部节点可以传递图输入/输出中不需要的信息。
* 我们还可能希望对图使用不同的输入/输出模式。例如，输出可能只包含一个相关的输出键。

可以让节点写入图内部的私有状态通道，用于节点间的内部通信。我们可以简单地定义一个私有模式 `PrivateState`。

还可以为图定义显式的输入和输出模式。在这些情况下，我们定义一个包含与图操作相关的*所有*键的"内部"模式。同时，我们还定义 `input` 和 `output` 模式，它们是"内部"模式的子集，用于约束图的输入和输出。更多细节请参阅[定义输入和输出模式](/oss/python/langgraph/use-graph-api#define-input-and-output-schemas)。

让我们看一个例子：

```python theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
from typing import TypedDict

from langgraph.graph import END, START, StateGraph


class InputState(TypedDict):
    user_input: str


class OutputState(TypedDict):
    graph_output: str


class OverallState(TypedDict):
    foo: str
    user_input: str
    graph_output: str


class PrivateState(TypedDict):
    bar: str


def node_1(state: InputState) -> OverallState:
    # Write to OverallState
    return {"foo": state["user_input"] + " name"}


def node_2(state: OverallState) -> PrivateState:
    # Read from OverallState, write to PrivateState
    return {"bar": state["foo"] + " is"}


def node_3(state: PrivateState) -> OutputState:
    # Read from PrivateState, write to OutputState
    return {"graph_output": state["bar"] + " Lance"}


builder = StateGraph(OverallState, input_schema=InputState, output_schema=OutputState)
builder.add_node("node_1", node_1)
builder.add_node("node_2", node_2)
builder.add_node("node_3", node_3)
builder.add_edge(START, "node_1")
builder.add_edge("node_1", "node_2")
builder.add_edge("node_2", "node_3")
builder.add_edge("node_3", END)

graph = builder.compile()
graph.invoke({"user_input": "My"})
# {'graph_output': 'My name is Lance'}
```

这里有两个微妙且重要的点需要注意：

1. 我们将 `state: InputState` 作为输入模式传给 `node_1`。但是，我们写入的是 `OverallState` 中的一个通道 `foo`。我们如何能写入不在输入模式中的状态通道呢？这是因为节点*可以写入图状态中的任何状态通道。*图状态是初始化时定义的状态通道的并集，其中包括 `OverallState` 以及过滤器 `InputState` 和 `OutputState`。

2. 我们用以下方式初始化图：

   ```python theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
   StateGraph(
       OverallState,
       input_schema=InputState,
       output_schema=OutputState
   )
   ```

   我们如何在 `node_2` 中写入 `PrivateState`？如果 `StateGraph` 初始化时没有传入该模式，图又是如何获得这个模式的访问权的？

   我们可以这样做，因为只要状态模式定义存在，`_nodes` 也可以声明额外的状态 `channels_`。在本例中，`PrivateState` 模式已定义，因此我们可以在图中添加 `bar` 作为新的状态通道并写入其中。

<Warning>
  **流式传输时私有通道不会被隐去。**

  输入、输出和私有模式约束了每个节点*读取*的内容（其输入模式）以及 `invoke` *返回*的内容（输出模式）。它们**不会**从 `stream` 中隐藏通道。

  使用 `stream_mode="values"` 进行流式传输时，默认情况下图会发出其**所有**状态通道，包括私有通道，因为 values 流式传输默认使用完整的状态通道集合，而不是输出模式。这就是为什么像 `bar` 这样的私有通道在 `invoke` 中被隐藏，但在流式传输时可见：

  ```python theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
  stream = graph.stream_events({"user_input": "My"}, version="v3")
  for snapshot in stream.values:
      print(snapshot)
  # {'user_input': 'My'}
  # {'foo': 'My name', 'user_input': 'My'}
  # {'foo': 'My name', 'user_input': 'My', 'bar': 'My name is'}        # <-- private channel
  # {'foo': 'My name', 'user_input': 'My', 'graph_output': 'My name is Lance', 'bar': 'My name is'}
  ```

  要将流式传输的值限制为特定的通道集合（例如仅限输出模式），请传入 `output_keys`：

  ```python theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
  stream = graph.stream_events(
      {"user_input": "My"},
      version="v3",
      output_keys=["graph_output"],  # [!code highlight]
  )
  for snapshot in stream.values:
      print(snapshot)
  # {'graph_output': 'My name is Lance'}
  ```

  如果只需要节点每步实际产生的通道（而不是完整累积的状态），请改用 `stream_mode="updates"`。
</Warning>

### Reducer 函数

Reducer 是理解节点更新如何应用于 `State` 的关键。`State` 中的每个键都有自己独立的 reducer 函数。如果没有显式指定 reducer 函数，则假定该键的所有更新都应覆盖旧值。Reducer 有几种不同类型，首先介绍默认类型的 reducer：

#### Reducer 参数

每个 reducer 都是一个带有两个位置参数的二元函数：

* **左参数**：该键在状态中已存储的当前值。
* **右参数**：节点为该键返回的更新。

当节点返回部分更新时，LangGraph 会为每个被更新的键调用 reducer，并将返回值保存为新的状态值：

```python theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
new_value = reducer(left=current_state[key], right=node_update[key])
```

左参数总是来自累积的状态。右参数总是来自最新的节点更新。下面的例子显式命名了两个参数：

```python theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
from typing import Annotated

from typing_extensions import TypedDict


def append_strings(left: list[str], right: list[str]) -> list[str]:
    """Combine the existing state value (left) with a node update (right)."""
    return left + right


class State(TypedDict):
    tags: Annotated[list[str], append_strings]
```

假设状态是 `{"tags": ["draft"]}`，某个节点返回 `{"tags": ["review"]}`。LangGraph 会调用：

```python theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
append_strings(left=["draft"], right=["review"])  # returns ["draft", "review"]
```

`tags` 的新状态值为 `["draft", "review"]`。

自定义 reducer 会合并左参数和右参数。[默认 reducer](#default-reducer) 会丢弃左参数，只保留右参数。

#### 默认 reducer

默认 reducer 会忽略左参数，并用右参数替换状态值。这个例子展示了如何使用默认 reducer：

```python theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
from typing_extensions import TypedDict


class State(TypedDict):
    foo: int
    bar: list[str]
```

在这个例子中，没有为任何键指定 reducer 函数。假设图的输入是：

`{"foo": 1, "bar": ["hi"]}`。接着假设第一个 `Node` 返回 `{"foo": 2}`。这被视为对状态的一次更新。请注意，`Node` 不需要返回完整的 `State` 模式——只需要一个更新。应用这次更新后，`State` 变为 `{"foo": 2, "bar": ["hi"]}`。如果第二个节点返回 `{"bar": ["bye"]}`，那么 `State` 将变为 `{"foo": 2, "bar": ["bye"]}`。

#### 自定义 reducer

自定义 reducer 会合并左参数和右参数，而不是替换状态值，这对于累积值很有用，例如将更新追加到列表中。这个例子展示了如何指定自定义 reducer：

```python theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
from operator import add
from typing import Annotated

from typing_extensions import TypedDict


class State(TypedDict):
    foo: int
    bar: Annotated[list[str], add]
```

在这个例子中，我们使用 `Annotated` 类型为第二个键（`bar`）指定了一个 reducer 函数（`operator.add`）。请注意，第一个键保持不变。假设图的输入是 `{"foo": 1, "bar": ["hi"]}`。接着假设第一个 `Node` 返回 `{"foo": 2}`。这被视为对状态的一次更新。请注意，`Node` 不需要返回完整的 `State` 模式——只需要一个更新。应用这次更新后，`State` 变为 `{"foo": 2, "bar": ["hi"]}`。如果第二个节点返回 `{"bar": ["bye"]}`，那么 `State` 将变为 `{"foo": 2, "bar": ["hi", "bye"]}`。请注意，这里的 `bar` 键是通过将两个列表相加来更新的。

#### Overwrite

<Tip>
  在某些情况下，你可能想绕过 reducer，直接覆盖状态值。LangGraph 为此提供了 [`Overwrite`](https://reference.langchain.com/python/langgraph/types/) 类型。[在此了解如何使用 `Overwrite`](/oss/python/langgraph/use-graph-api#bypass-reducers-with-overwrite)。
</Tip>

#### 重置 reducer 字段

Reducer 常见的一个困惑点：对于合并型 reducer，返回空值**不会**清空字段。因为 reducer 会把右参数合并进左参数，所以空更新会被合并进去，之前累积的值会被保留。

这种模式对必须在重试之间清空的错误缓冲区或重试计数器很重要：

```python theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
from operator import add
from typing import Annotated

from typing_extensions import TypedDict


class State(TypedDict):
    errors: Annotated[list[str], add]


# node A returns {"errors": ["bad sql"]}
# node B returns {"errors": []}
# state["errors"] is still ["bad sql"]; the empty list is merged in, not cleared
```

要在保留合并型 reducer 的同时清空字段，请用 [`Overwrite`](https://reference.langchain.com/python/langgraph/types/) 包装更新：

```python theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
from operator import add
from typing import Annotated

from langgraph.types import Overwrite
from typing_extensions import TypedDict


class State(TypedDict):
    errors: Annotated[list[str], add]


def clear_errors(state: State):
    # Bypass the merging reducer and clear the field
    return {"errors": Overwrite([])}
```

更多信息请参阅[使用 Overwrite 绕过 reducers](/oss/python/langgraph/use-graph-api#bypass-reducers-with-overwrite)。

### 未跟踪的值

`UntrackedValue` 用于那些在图执行期间应存在但**绝不应被检查点（checkpoint）记录**的状态字段。当图从检查点恢复时，未跟踪的值将重置为其初始状态（或不可用）。

这对于以下情况很有用：

* **无法序列化的数据库连接**
* **应在恢复时重建的临时缓存**
* **你不想持久化的大型对象**
* **仅运行时使用的配置**，应每次重新传入

```typescript theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
import { StateSchema, UntrackedValue, MessagesValue } from "@langchain/langgraph";
import { z } from "zod/v4";

const State = new StateSchema({
  messages: MessagesValue,

  // Untracked: throws if multiple nodes write in same step (guard: true is default)
  dbConnection: new UntrackedValue<DatabaseConnection>(),

  // Untracked with guard: false allows multiple writes, keeps last value
  tempCache: new UntrackedValue(
    z.record(z.string(), z.unknown()),
    { guard: false }
  ),

  // Untracked without a schema (for maximum flexibility)
  runtimeConfig: new UntrackedValue(),
});
```

**行为：**

* 执行期间：值会像普通状态一样被存储和访问
* 检查点时：未跟踪的值**不会**包含在检查点数据中
* 恢复时：未跟踪的值从头开始（为空或使用其默认值）
* 使用 `guard: true`（默认）：如果多个节点在同一步骤中写入，则抛出错误
* 使用 `guard: false`：允许多次写入，以最后一个值为准

<Warning>
  不要将 `UntrackedValue` 用于需要在中断或时间旅行中持久化的数据。对于持久化数据，请使用常规状态字段或 `ReducedValue`。
</Warning>

### 类型工具

LangGraph 提供了几个类型工具，以便在定义节点和条件边时获得更好的 TypeScript 类型安全性。

#### `GraphNode`

使用 `GraphNode` 为图构建器之外定义的节点函数指定类型：

```typescript theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
import { GraphNode, StateSchema, Command } from "@langchain/langgraph";
import { z } from "zod/v4";

const State = new StateSchema({
  count: z.number().default(0),
  result: z.string(),
});

// Basic node - receives state, returns partial update
const incrementNode: GraphNode<typeof State> = (state) => {
  return { count: state.count + 1 };
};

// Async node
const fetchNode: GraphNode<typeof State> = async (state, config) => {
  const response = await fetch(`/api/data/${state.count}`);
  return { result: await response.text() };
};

// Node with Command routing - specify valid destinations
const routerNode: GraphNode<{ InputSchema: typeof State; Nodes: "process" | "done" }> = (state) => {
  if (state.count >= 10) {
    return new Command({ goto: "done" });
  }
  return new Command({
    update: { count: state.count + 1 },
    goto: "process"
  });
};
```

#### `State.Node` 简写

每个 `StateSchema` 实例都有一个 `Node` 属性，它为节点类型标注提供了简写方式：

```typescript theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
const State = new StateSchema({
  messages: MessagesValue,
  step: z.string(),
});

// These are equivalent:
const myNode1: GraphNode<typeof State> = (state) => ({ step: "done" });
const myNode2: typeof State.Node = (state) => ({ step: "done" });
```

#### `ConditionalEdgeRouter`

在条件边中使用 `ConditionalEdgeRouter` 作为路由函数（不更新状态，只做路由）：

```typescript theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
import { ConditionalEdgeRouter, END } from "@langchain/langgraph";

const State = new StateSchema({
  shouldContinue: z.boolean(),
  step: z.string(),
});

// Router returns node name(s) or END
const router: ConditionalEdgeRouter<{ InputSchema: typeof State; Nodes: "process" | "summarize" }> = (state) => {
  if (!state.shouldContinue) {
    return END;
  }
  return state.step === "initial" ? "process" : "summarize";
};

// Use in graph
graph.addConditionalEdges("check", router);
```

#### `StateSchema.State` 和 `StateSchema.Update`

从模式中提取状态类型和更新类型，用于自定义类型定义：

```typescript theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
import { StateSchema } from "@langchain/langgraph";

const MyStateSchema = new StateSchema({
  messages: MessagesValue,
  count: z.number().default(0),
});

// Extract the full state type
type MyState = typeof MyStateSchema.State;
// { messages: BaseMessage[], count: number }

// Extract the update type (partial, with reducer input types)
type MyUpdate = typeof MyStateSchema.Update;
// { messages?: Messages, count?: number }
```

:::

### 在图状态中使用消息

#### 为什么要使用消息？

大多数现代 LLM 提供商都有接受消息列表作为输入的聊天模型接口。尤其是 LangChain 的[聊天模型接口](/oss/python/langchain/models)，它接受消息对象列表作为输入。这些消息有多种形式，例如 [`HumanMessage`](https://reference.langchain.com/python/langchain-core/messages/human/HumanMessage)（用户输入）或 [`AIMessage`](https://reference.langchain.com/python/langchain-core/messages/ai/AIMessage)（LLM 响应）。

要了解更多关于消息对象的内容，请参阅[消息概念指南](/oss/python/langchain/messages)。

#### 在图中使用消息

在很多情况下，将之前的对话历史以消息列表的形式存储在图状态中会很有帮助。为此，我们可以在图状态中添加一个存储 `Message` 对象列表的键（通道），并用 reducer 函数对其进行注解（参见下面示例中的 `messages` 键）。reducer 函数对于告诉图如何在每次状态更新时（例如节点发送更新时）更新状态中的 `Message` 对象列表至关重要。如果不指定 reducer，每次状态更新都会用最近提供的值覆盖消息列表。如果只想简单地将消息追加到现有列表，可以使用 `operator.add` 作为 reducer。

不过，你可能还想手动更新图状态中的消息（例如人机协同 human-in-the-loop 的场景）。如果使用 `operator.add`，你发送给图的手动状态更新会被追加到现有消息列表中，而不是更新现有消息。为避免这种情况，你需要一个能够跟踪消息 ID 并在消息更新时覆盖现有消息的 reducer。为此，可以使用预构建的 [`add_messages`](https://reference.langchain.com/python/langgraph/graph/message/add_messages) 函数。对于全新的消息，它会简单地追加到现有列表，同时也能正确处理现有消息的更新。

#### 序列化

除了跟踪消息 ID，每当 `messages` 通道收到状态更新时，[`add_messages`](https://reference.langchain.com/python/langgraph/graph/message/add_messages) 函数还会尝试将消息反序列化为 LangChain `Message` 对象。

更多信息请参阅 [LangChain 序列化/反序列化](https://python.langchain.com/docs/how_to/serialization/)。这样你可以按以下格式发送图输入/状态更新：

```python theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
# this is supported
{"messages": [HumanMessage(content="message")]}

# and this is also supported
{"messages": [{"type": "human", "content": "message"}]}
```

由于使用 [`add_messages`](https://reference.langchain.com/python/langgraph/graph/message/add_messages) 时状态更新总是会被反序列化为 LangChain `Messages`，你应该使用点号表示法访问消息属性，例如 `state["messages"][-1].content`。

下面是一个使用 [`add_messages`](https://reference.langchain.com/python/langgraph/graph/message/add_messages) 作为 reducer 函数的图示例。

```python theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
from langchain.messages import AnyMessage
from langgraph.graph.message import add_messages
from typing import Annotated
from typing_extensions import TypedDict

class GraphState(TypedDict):
    messages: Annotated[list[AnyMessage], add_messages]
```

#### MessagesState

由于在状态中保存消息列表非常常见，因此存在一个名为 `MessagesState` 的预构建状态，它可以让你轻松使用消息。`MessagesState` 只定义了一个 `messages` 键，它是一个 `AnyMessage` 对象列表，并使用 [`add_messages`](https://reference.langchain.com/python/langgraph/graph/message/add_messages) reducer。通常需要跟踪的状态不止消息本身，所以我们看到人们会继承这个状态并添加更多字段，例如：

```python theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
from langgraph.graph import MessagesState

class State(MessagesState):
    documents: list[str]
```

## 节点

在 LangGraph 中，节点是接受以下参数的 Python 函数（可以是同步或异步的）：

1. `state`—图的[状态](#state)
2. `config`—一个 [`RunnableConfig`](https://reference.langchain.com/python/langchain-core/runnables/config/RunnableConfig) 对象，包含诸如 `thread_id` 之类的配置信息和诸如 `tags` 之类的追踪信息
3. `runtime`—一个 `Runtime` 对象，包含[运行时 `context`](#runtime-context) 以及其他信息，如 `store`、`stream_writer`、`execution_info`、`server_info`、`heartbeat`（用于空闲超时刷新）和 `control`（用于[优雅关闭](/oss/python/langgraph/fault-tolerance#graceful-shutdown)）

与 `NetworkX` 类似，你可以使用 [`add_node`](https://reference.langchain.com/python/langgraph/graph/state/StateGraph/add_node) 方法将这些节点添加到图中：

```python theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
from dataclasses import dataclass
from typing_extensions import TypedDict

from langgraph.graph import StateGraph
from langgraph.runtime import Runtime

class State(TypedDict):
    input: str
    results: str

@dataclass
class Context:
    user_id: str

builder = StateGraph(State)

def plain_node(state: State):
    return state

def node_with_runtime(state: State, runtime: Runtime[Context]):
    print("In node: ", runtime.context.user_id)
    return {"results": f"Hello, {state['input']}!"}

def node_with_execution_info(state: State, runtime: Runtime):
    print("In node with thread_id: ", runtime.execution_info.thread_id)  # [!code highlight]
    return {"results": f"Hello, {state['input']}!"}


builder.add_node("plain_node", plain_node)
builder.add_node("node_with_runtime", node_with_runtime)
builder.add_node("node_with_execution_info", node_with_execution_info)
...
```

在幕后，函数会被转换为 [`RunnableLambda`](https://reference.langchain.com/python/langchain-core/runnables/base/RunnableLambda)，从而为你的函数添加批处理和异步支持，以及[原生追踪和调试](/langsmith/observability)能力。

如果不指定名称就将节点添加到图中，它将获得一个与函数名相同的默认名称。

```python theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
builder.add_node(my_node)
# You can then create edges to/from this node by referencing it as `"my_node"`
```

### 重新执行与幂等性

当你使用[检查点器](/oss/python/langgraph/persistence)编译时，LangGraph 会在[超级步](#graphs)边界保存检查点，而不是在节点函数中间保存。如果执行停止后又恢复（例如在[中断](/oss/python/langgraph/interrupts)或[重试](/oss/python/langgraph/fault-tolerance#retries)之后），受影响的**节点**会从其函数开头重新运行。暂停之前的代码和副作用会再次执行。

**幂等性。**设计**节点**逻辑时，应确保重新执行不会破坏状态。如果节点插入数据库行，除非有意为之，否则运行两次不应产生重复行。请使用幂等键、upsert 或先读后写的检查。关于 `interrupt()` 周围的副作用，请参阅[在 `interrupt` 之前调用的副作用必须是幂等的](/oss/python/langgraph/interrupts#side-effects-called-before-interrupt-must-be-idempotent)。

**图变更。**关于代码变更的[确定性](/oss/python/langgraph/functional-api#determinism)规则不适用于图结构。你可以添加或删除**节点**和边，而不会破坏现有线程的恢复。恢复的运行使用已保存的状态，并执行你现在编译的任何图。

**节点内的任务和中断。**如果**节点**调用[**任务**](/oss/python/langgraph/functional-api#task)或 [`interrupt`](https://reference.langchain.com/python/langgraph/types/interrupt)，恢复时会应用更严格的确定性规则。LangGraph 会从检查点器恢复已完成的**任务**结果，但如果更改了恢复点之前代码中**任务**或 [`interrupt`](https://reference.langchain.com/python/langgraph/types/interrupt) 的顺序，可能会导致缓存值不匹配。[Functional API](/oss/python/langgraph/functional-api) **入口点**会编译为单个以这种方式运行整个入口点方法的**节点**。请参阅[确定性](/oss/python/langgraph/functional-api#determinism)、[幂等性](/oss/python/langgraph/functional-api#idempotency)和[在节点中使用任务](#using-tasks-in-nodes)。

### 在节点中使用任务

如果[节点](#nodes)包含多个操作，你可能会发现将每个操作实现为一个[**任务**](/oss/python/langgraph/functional-api#task)比将逻辑分散到多个节点中更容易。当图使用检查点器时，任务结果会被检查点记录，因此恢复线程时可以跳过节点内已完成的**任务**工作。

<Tabs>
  <Tab title="Original">
    ```python theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
    from typing import NotRequired

    import requests
    from langchain_core.utils.uuid import uuid7
    from langgraph.checkpoint.memory import InMemorySaver
    from langgraph.graph import END, START, StateGraph
    from typing_extensions import TypedDict


    class State(TypedDict):
        url: str
        result: NotRequired[str]


    def call_api(state: State):
        """Example node that makes an API request."""
        result = requests.get(state["url"]).text[:100]  # [!code highlight]
        return {"result": result}


    builder = StateGraph(State)
    builder.add_node("call_api", call_api)
    builder.add_edge(START, "call_api")
    builder.add_edge("call_api", END)

    checkpointer = InMemorySaver()
    graph = builder.compile(checkpointer=checkpointer)

    thread_id = str(uuid7())
    config = {"configurable": {"thread_id": thread_id}}

    graph.invoke({"url": "https://www.example.com"}, config)
    ```
  </Tab>

  <Tab title="With task">
    ```python theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
    from typing import NotRequired

    import requests
    from langchain_core.utils.uuid import uuid7
    from langgraph.checkpoint.memory import InMemorySaver
    from langgraph.func import task
    from langgraph.graph import END, START, StateGraph
    from typing_extensions import TypedDict


    class State(TypedDict):
        urls: list[str]
        results: NotRequired[list[str]]


    @task
    def _make_request(url: str):
        """Make a request."""
        return requests.get(url).text[:100]  # [!code highlight]


    def call_api(state: State):
        """Example node that makes API requests as checkpointed tasks."""
        futures = [_make_request(url) for url in state["urls"]]  # [!code highlight]
        results = [f.result() for f in futures]
        return {"results": results}


    builder = StateGraph(State)
    builder.add_node("call_api", call_api)
    builder.add_edge(START, "call_api")
    builder.add_edge("call_api", END)

    checkpointer = InMemorySaver()
    graph = builder.compile(checkpointer=checkpointer)

    thread_id = str(uuid7())
    config = {"configurable": {"thread_id": thread_id}}

    graph.invoke({"urls": ["https://www.example.com"]}, config)
    ```
  </Tab>
</Tabs>

### `START` 节点

[`START`](https://reference.langchain.com/python/langgraph/constants/START) 节点是一个特殊节点，代表将用户输入发送到图的节点。引用此节点的主要目的是确定应该首先调用哪些节点。

```python theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
from langgraph.graph import START

graph.add_edge(START, "node_a")
```

### `END` 节点

`END` 节点是一个表示终端节点的特殊节点。当你想表示哪些边完成后没有后续操作时，可以引用此节点。

```python theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
from langgraph.graph import END

graph.add_edge("node_a", END)
```

### 节点缓存

LangGraph 支持根据节点输入对任务/节点进行缓存。要使用缓存：

* 在编译图（或指定入口点）时指定缓存
* 为节点指定缓存策略。每种缓存策略支持：
  * `key_func`，用于根据节点输入生成缓存键，默认为使用 pickle 对输入做 `hash`。
  * `ttl`，缓存的生存时间（秒）。如果未指定，缓存将永不过期。

例如：

```python theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
import time
from typing_extensions import TypedDict
from langgraph.graph import StateGraph
from langgraph.cache.memory import InMemoryCache
from langgraph.types import CachePolicy


class State(TypedDict):
    x: int
    result: int


builder = StateGraph(State)


def expensive_node(state: State) -> dict[str, int]:
    # expensive computation
    time.sleep(2)
    return {"result": state["x"] * 2}


builder.add_node("expensive_node", expensive_node, cache_policy=CachePolicy(ttl=3))
builder.set_entry_point("expensive_node")
builder.set_finish_point("expensive_node")

graph = builder.compile(cache=InMemoryCache())

print(graph.invoke({"x": 5}, stream_mode='updates'))    # [!code highlight]
# [{'expensive_node': {'result': 10}}]
print(graph.invoke({"x": 5}, stream_mode='updates'))    # [!code highlight]
# [{'expensive_node': {'result': 10}, '__metadata__': {'cached': True}}]
```

<Note>
  `set_entry_point(node)` 定义图将执行的第一个节点。
  它等价于 `builder.add_edge(START, node)`。

  `set_finish_point(node)` 定义图中的最后一个节点。
  它等价于 `builder.add_edge(node, END)`。

  两种方法都有效，但 `add_edge(START, ...)` 和 `add_edge(..., END)`
  是推荐的现代语法。
</Note>

1. 第一次运行需要两秒（由于模拟的昂贵计算）。
2. 第二次运行利用缓存，快速返回。

## 边

边定义了逻辑如何路由以及图如何决定停止。这是代理工作方式以及不同节点之间如何通信的重要组成部分。边有几种关键类型：

* 普通边：直接从当前节点通往下一个节点。
* 条件边：调用一个函数来决定接下来前往哪些节点。
* 入口点：用户输入到达时首先调用哪个节点。
* 条件入口点：调用一个函数来决定用户输入到达时首先调用哪些节点。

一个节点可以有多个出边。如果节点有多个出边，**所有**目标节点将在下一个超级步中并行执行。

<Warning>
  对于每个节点，请选择一种路由机制：使用普通边进行静态路由，或使用条件边 / [`Command`](https://reference.langchain.com/python/langgraph/types/Command) 进行动态路由。不要从同一个节点上混用普通边和动态路由，因为两条路径都可能执行，使图的行为更难推理。
</Warning>

### 普通边

如果你**总是**想从节点 A 前往节点 B，可以直接使用 [`add_edge`](https://reference.langchain.com/python/langgraph/pregel/_draw/add_edge) 方法。

```python theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
graph.add_edge("node_a", "node_b")
```

### 条件边

如果你想**可选地**路由到一条或多条边（或可选地终止），可以使用 [`add_conditional_edges`](https://reference.langchain.com/python/langgraph/graph/state/StateGraph/add_conditional_edges) 方法。该方法接受节点名称和一个在该节点执行后调用的"路由函数"：

```python theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
graph.add_conditional_edges("node_a", routing_function)
```

与节点类似，`routing_function` 接受图的当前 `state` 并返回一个值。

默认情况下，`routing_function` 的返回值被用作下一步要向其发送状态的节点名称（或节点列表）。所有这些节点将在下一个超级步中并行运行。

你还可以选择提供一个字典，将 `routing_function` 的输出映射到下一个节点的名称。

```python theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
graph.add_conditional_edges("node_a", routing_function, {True: "node_b", False: "node_c"})
```

<Tip>
  如果想在单个函数中同时进行状态更新和路由，请使用 [`Command`](#command) 而不是条件边。
</Tip>

### 入口点

入口点是图启动时首先运行的节点。你可以使用 [`add_edge`](https://reference.langchain.com/python/langgraph/pregel/_draw/add_edge) 方法，从虚拟的 [`START`](https://reference.langchain.com/python/langgraph/constants/START) 节点连接到要执行的第一个节点，以指定从何处进入图。

```python theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
from langgraph.graph import START

graph.add_edge(START, "node_a")
```

### 条件入口点

条件入口点允许你根据自定义逻辑从不同的节点开始。你可以使用 [`add_conditional_edges`](https://reference.langchain.com/python/langgraph/graph/state/StateGraph/add_conditional_edges) 方法，从虚拟的 [`START`](https://reference.langchain.com/python/langgraph/constants/START) 节点出发来实现这一点。

```python theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
from langgraph.graph import START

graph.add_conditional_edges(START, routing_function)
```

你还可以选择提供一个字典，将 `routing_function` 的输出映射到下一个节点的名称。

```python theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
graph.add_conditional_edges(START, routing_function, {True: "node_b", False: "node_c"})
```

## `Send`

默认情况下，`Nodes` 和 `Edges` 是预先定义好的，并且操作于同一份共享状态。然而，有时具体的边无法提前确定，和/或你可能希望同时存在不同版本的 `State`。[map-reduce](/oss/python/langgraph/use-graph-api#map-reduce-and-the-send-api) 设计模式就是一个常见的例子。在这种设计模式中，第一个节点可能生成一个对象列表，而你希望对所有这些对象应用某个其他节点。对象的数量可能事先未知（意味着边的数量可能无法确定），并且下游 `Node` 的输入 `State` 应该各不相同（每个生成的对象对应一份）。

为了支持这种设计模式，LangGraph 支持从条件边返回 [`Send`](https://reference.langchain.com/python/langgraph/types/Send) 对象。`Send` 接受两个参数：第一个是节点名称，第二个是要传给该节点的状态。

```python theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
from langgraph.types import Send

def continue_to_jokes(state: OverallState):
    return [Send("generate_joke", {"subject": s}) for s in state['subjects']]

graph.add_conditional_edges("node_a", continue_to_jokes)
```

## `Command`

[`Command`](https://reference.langchain.com/python/langgraph/types/Command) 是控制图执行的多功能原语。它接受四个参数：

* `update`：应用状态更新（类似于从节点返回更新）。
* `goto`：导航到特定节点（类似于[条件边](#conditional-edges)）。
* `graph`：从[子图](/oss/python/langgraph/use-subgraphs)导航时指定目标父图。
* `resume`：在[中断](/oss/python/langgraph/interrupts)后提供一个值以恢复执行。

`Command` 用于三种场景：

* **[从节点返回](#return-from-nodes)**：使用 `update`、`goto` 和 `graph` 将状态更新与控制流结合起来。
* **[`invoke` 或 `stream` 的输入](#input-to-invoke-or-stream)**：使用 `resume` 在中断后继续执行。
* **[从工具返回](#return-from-tools)**：与从节点返回类似，从工具内部结合状态更新和控制流。

### 从节点返回

#### `update` 和 `goto`

从节点函数返回 [`Command`](https://reference.langchain.com/python/langgraph/types/Command)，以便在单个步骤中更新状态并路由到下一个节点：

```python theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
def my_node(state: State) -> Command[Literal["my_other_node"]]:
    return Command(
        # state update
        update={"foo": "bar"},
        # control flow
        goto="my_other_node"
    )
```

使用 [`Command`](https://reference.langchain.com/python/langgraph/types/Command) 还可以实现动态控制流行为（与[条件边](#conditional-edges)相同）：

```python theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
def my_node(state: State) -> Command[Literal["my_other_node"]]:
    if state["foo"] == "bar":
        return Command(update={"foo": "baz"}, goto="my_other_node")
```

当你**既**需要更新状态**又**需要路由到另一个节点时，请使用 [`Command`](https://reference.langchain.com/python/langgraph/types/Command)。如果只需要路由而不更新状态，请改用[条件边](#conditional-edges)。

<Note>
  在节点函数中返回 [`Command`](https://reference.langchain.com/python/langgraph/types/Command) 时，你必须添加返回类型注解，列出该节点要路由到的节点名称，例如 `Command[Literal["my_other_node"]]`。这对于图渲染是必要的，并告诉 LangGraph `my_node` 可以导航到 `my_other_node`。
</Note>

<Warning>
  [`Command`](https://reference.langchain.com/python/langgraph/types/Command) 只添加动态边——用 `add_edge` / `addEdge` 定义的静态边仍然会执行。例如，如果 `node_a` 返回 `Command(goto="my_other_node")`，同时你又定义了 `graph.add_edge("node_a", "node_b")`，那么 `node_b` 和 `my_other_node` 都会运行。对于每个节点，要么使用 [`Command`](https://reference.langchain.com/python/langgraph/types/Command)，要么使用静态边来路由到下一个节点，不要同时使用两者。
</Warning>

查看这个[操作指南](/oss/python/langgraph/use-graph-api#combine-control-flow-and-state-updates-with-command)以了解如何使用 [`Command`](https://reference.langchain.com/python/langgraph/types/Command) 的端到端示例。

#### `graph`

如果你在使用[子图](/oss/python/langgraph/use-subgraphs)，可以在 [`Command`](https://reference.langchain.com/python/langgraph/types/Command) 中指定 `graph=Command.PARENT`，从子图内的节点导航到父图中的另一个节点：

```python theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
def my_node(state: State) -> Command[Literal["other_subgraph"]]:
    return Command(
        update={"foo": "bar"},
        goto="other_subgraph",  # where `other_subgraph` is a node in the parent graph
        graph=Command.PARENT
    )
```

<Note>
  将 `graph` 设置为 `Command.PARENT` 将导航到最近的父图。

  当你从子图节点向父图节点发送某个键的更新，而该键同时存在于父图和子图的[状态模式](#schema)中时，你**必须**为父图状态中要更新的键定义一个 [reducer](#reducers)。请参阅这个[示例](/oss/python/langgraph/use-graph-api#navigate-to-a-node-in-a-parent-graph)。
</Note>

这在实现[多代理交接](/oss/python/langchain/multi-agent/handoffs)时特别有用。详情请参阅[导航到父图中的节点](/oss/python/langgraph/use-graph-api#navigate-to-a-node-in-a-parent-graph)。

### `invoke` 或 `stream` 的输入

<Warning>
  `Command(resume=...)` 是**唯一**作为 `invoke()`/`stream()` 输入用途的 `Command` 模式（可以结合 `update=...`，在恢复的同时应用状态更改）。不要单独使用 `Command(update=...)` 作为输入来继续多轮对话——因为传入任何 `Command` 作为输入都会从最新的检查点恢复（即最后运行的步骤，而不是 `__start__`），如果图已经结束，它会看起来像卡住了。要在现有线程上继续对话，请传入普通的输入字典：

  ```python theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
  # WRONG - graph resumes from the latest checkpoint
  # (last step that ran), appears stuck
  graph.invoke(Command(update={  # [!code --]
      "messages": [{"role": "user", "content": "follow up"}]  # [!code --]
  }), config)  # [!code --]

  # CORRECT - plain dict restarts from __start__
  graph.invoke( {  # [!code ++]
      "messages": [{"role": "user", "content": "follow up"}]  # [!code ++]
  }, config)  # [!code ++]
  ```
</Warning>

#### `resume`

使用 `Command(resume=...)` 在[中断](/oss/python/langgraph/interrupts)后提供一个值并恢复图执行。传给 `resume` 的值将成为暂停节点内部 `interrupt()` 调用的返回值：

```python theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
from typing import TypedDict

from langgraph.checkpoint.memory import InMemorySaver
from langgraph.graph import END, START, StateGraph
from langgraph.types import Command, interrupt


class State(TypedDict):
    messages: list[dict]


def human_review(state: State):
    # Pauses the graph and waits for a value
    answer = interrupt("Do you approve?")
    return {"messages": [{"role": "user", "content": answer}]}


graph = (
    StateGraph(State)
    .add_node("human_review", human_review)
    .add_edge(START, "human_review")
    .add_edge("human_review", END)
    .compile(checkpointer=InMemorySaver())
)

config = {"configurable": {"thread_id": "graph-api-resume"}}

# First run - hits the interrupt and pauses
stream = graph.stream_events({"messages": []}, config, version="v3")
_ = stream.output  # drive the stream to completion
print(stream.interrupts)

# Resume with a value - the interrupt() call returns "yes"
resumed = graph.stream_events(Command(resume="yes"), config, version="v3")
final = resumed.output
```

请参阅[中断概念指南](/oss/python/langgraph/interrupts)，了解中断模式的完整细节，包括多个中断和验证循环。

### 从工具返回

你可以从工具返回 [`Command`](https://reference.langchain.com/python/langgraph/types/Command) 来更新图状态和控制流。使用 `update` 修改状态（例如，保存对话期间查到的客户信息），使用 `goto` 在工具完成后路由到特定节点。

<Warning>
  在工具内部使用时，`goto` 会添加一条动态边——调用该工具的节点上已经定义的任何静态边仍然会执行。对于每个节点，要么使用工具驱动的动态路由，要么使用静态边来路由到下一个节点，不要同时使用两者。
</Warning>

详情请参阅[在工具内部使用](/oss/python/langgraph/use-graph-api#use-inside-tools)。

## 图迁移

即使使用检查点器跟踪状态，LangGraph 也可以轻松处理图定义（节点、边和状态）的迁移。

* 对于处于图末尾的线程（即未被中断），你可以更改图的整个拓扑（即所有节点和边，删除、添加、重命名等）
* 对于当前被中断的线程，除重命名/删除节点外（因为该线程可能正打算进入一个已不存在的节点），我们支持所有拓扑更改——如果这对你造成了阻碍，请联系我们，我们可以优先考虑解决方案。
* 对于修改状态，我们在添加和删除键方面具有完全的向后和向前兼容性
* 被重命名的状态键在现有线程中会丢失其已保存的状态
* 状态键的类型发生不兼容更改，目前在变更前已有状态的线程中可能引发问题——如果这对你造成了阻碍，请联系我们，我们可以优先考虑解决方案。

<Tip>
  对于技术上兼容但会改变业务逻辑的更改，例如重写工具集或重构对话流程，请参阅[业务兼容性](/oss/python/langgraph/backward-compatibility#business-compatibility)。该页面介绍了在状态中固定行为版本，使现有线程保持旧路径，而新线程使用最新版本。
</Tip>

## 运行时上下文

创建图时，你可以为传递给节点的运行时上下文指定 `context_schema`。这对于向节点传递
图状态之外的信息很有用。例如，你可能想传递模型名称或数据库连接等依赖项。

```python theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
@dataclass
class ContextSchema:
    llm_provider: str = "openai"

graph = StateGraph(State, context_schema=ContextSchema)
```

然后你可以使用 `invoke` 方法的 `context` 参数将这个上下文传入图。

```python theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
graph.invoke(inputs, context={"llm_provider": "anthropic"})
```

然后你可以在节点或条件边内部访问和使用这个上下文：

```python theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
from langgraph.runtime import Runtime

def node_a(state: State, runtime: Runtime[ContextSchema]):
    llm = get_llm(runtime.context.llm_provider)
    # ...
```

有关配置的完整说明，请参阅[添加运行时配置](/oss/python/langgraph/use-graph-api#add-runtime-configuration)。

### 递归限制

递归限制设置了图在单次执行中可以执行的[超级步](#graphs)的最大数量。一旦达到限制，LangGraph 将抛出 `GraphRecursionError`。从版本 1.0.6 开始，默认递归限制设置为 1000 步。递归限制可以在运行时在任何图上设置，并通过 config 字典传递给 `invoke`/`stream`。重要的是，`recursion_limit` 是一个独立的 `config` 键，不应像其他用户自定义配置那样放在 `configurable` 键内。请看下面的示例：

```python theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
graph.invoke(inputs, config={"recursion_limit": 5}, context={"llm": "anthropic"})
```

阅读[递归限制](/oss/python/langgraph/graph-api#recursion-limit)以了解更多关于递归限制工作原理的内容。

### 访问和处理递归计数器

在任何节点内，都可以通过 `config["metadata"]["langgraph_step"]` 访问当前步骤计数器，从而在达到递归限制之前主动处理递归问题。这使你可以图逻辑中实现优雅降级策略。

#### 工作原理

步骤计数器存储在 `config["metadata"]["langgraph_step"]` 中。LangGraph 在图执行过程中递增该计数器，一旦超过配置的 `recursion_limit`，就会抛出 `GraphRecursionError`。

#### 访问当前步骤计数器

你可以在任何节点内访问当前步骤计数器，以监控执行进度。

```python theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
from langchain_core.runnables import RunnableConfig
from langgraph.graph import StateGraph

def my_node(state: dict, config: RunnableConfig) -> dict:
    current_step = config["metadata"]["langgraph_step"]
    print(f"Currently on step: {current_step}")
    return state
```

#### 主动的递归处理

LangGraph 提供了一个 `RemainingSteps` 托管值（managed value），用于跟踪距离达到递归限制还剩多少步。这使得你的图能够优雅降级。

```python theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
from typing import Annotated, Literal
from langgraph.graph import StateGraph, START, END
from langgraph.managed import RemainingSteps

class State(TypedDict):
    messages: Annotated[list, lambda x, y: x + y]
    remaining_steps: RemainingSteps  # Managed value - tracks steps until limit

def reasoning_node(state: State) -> dict:
    # RemainingSteps is automatically populated by LangGraph
    remaining = state["remaining_steps"]

    # Check if we're running low on steps
    if remaining <= 2:
        return {"messages": ["Approaching limit, wrapping up..."]}

    # Normal processing
    return {"messages": ["thinking..."]}

def route_decision(state: State) -> Literal["reasoning_node", "fallback_node"]:
    """Route based on remaining steps"""
    if state["remaining_steps"] <= 2:
        return "fallback_node"
    return "reasoning_node"

def fallback_node(state: State) -> dict:
    """Handle cases where recursion limit is approaching"""
    return {"messages": ["Reached complexity limit, providing best effort answer"]}

# Build graph
builder = StateGraph(State)
builder.add_node("reasoning_node", reasoning_node)
builder.add_node("fallback_node", fallback_node)
builder.add_edge(START, "reasoning_node")
builder.add_conditional_edges("reasoning_node", route_decision)
builder.add_edge("fallback_node", END)

graph = builder.compile()

# RemainingSteps works with any recursion_limit
result = graph.invoke({"messages": []}, {"recursion_limit": 10})
```

#### 主动与被动方法对比

处理递归限制主要有两种方法：主动式（在图内部监控）和被动式（在外部捕获错误）。

```python theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
from typing import Annotated, Literal, TypedDict
from langgraph.graph import StateGraph, START, END
from langgraph.managed import RemainingSteps
from langgraph.errors import GraphRecursionError

class State(TypedDict):
    messages: Annotated[list, lambda x, y: x + y]
    remaining_steps: RemainingSteps

# Proactive Approach (recommended) - using RemainingSteps
def agent_with_monitoring(state: State) -> dict:
    """Proactively monitor and handle recursion within the graph"""
    remaining = state["remaining_steps"]

    # Early detection - route to internal handling
    if remaining <= 2:
        return {
            "messages": ["Approaching limit, returning partial result"]
        }

    # Normal processing
    return {"messages": [f"Processing... ({remaining} steps remaining)"]}

def route_decision(state: State) -> Literal["agent", END]:
    if state["remaining_steps"] <= 2:
        return END
    return "agent"

# Build graph
builder = StateGraph(State)
builder.add_node("agent", agent_with_monitoring)
builder.add_edge(START, "agent")
builder.add_conditional_edges("agent", route_decision)
graph = builder.compile()

# Proactive: Graph completes gracefully
result = graph.invoke({"messages": []}, {"recursion_limit": 10})

# Reactive Approach (fallback) - catching error externally
try:
    result = graph.invoke({"messages": []}, {"recursion_limit": 10})
except GraphRecursionError as e:
    # Handle externally after graph execution fails
    result = {"messages": ["Fallback: recursion limit exceeded"]}
```

这两种方法的主要区别在于：

| 方法                                     | 检测时机       | 处理方式                        | 控制流                     |
| ----------------------------------------- | -------------------- | ------------------------------------ | ---------------------------------- |
| 主动式（使用 `RemainingSteps`）          | 达到限制之前        | 在图内部通过条件路由                | 图继续执行到完成节点              |
| 被动式（捕获 `GraphRecursionError`）     | 超过限制之后        | 在图外部通过 try/catch              | 图执行终止                        |

**主动式优点：**

* 图内优雅降级
* 可以在检查点中保存中间状态
* 部分结果的用户体验更好
* 图正常运行结束（无异常）

**被动式优点：**

* 实现更简单
* 无需修改图逻辑
* 集中的错误处理

#### 其他可用元数据

除了 `langgraph_step`，`config["metadata"]` 中还有以下元数据可用：

```python theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
def inspect_metadata(state: dict, config: RunnableConfig) -> dict:
    metadata = config["metadata"]

    print(f"Step: {metadata['langgraph_step']}")
    print(f"Node: {metadata['langgraph_node']}")
    print(f"Triggers: {metadata['langgraph_triggers']}")
    print(f"Path: {metadata['langgraph_path']}")
    print(f"Checkpoint NS: {metadata['langgraph_checkpoint_ns']}")

    return state
```

## 可视化

能够可视化图通常是很棒的，尤其是当图变得越来越复杂时。LangGraph 内置了多种可视化图的方式。更多信息请参阅[可视化你的图](/oss/python/langgraph/use-graph-api#visualize-your-graph)。

## 可观测性与追踪

要追踪、调试和评估你的代理，请使用 [LangSmith](/langsmith/observability)。

## 了解更多

* [如何使用 Graph API](/oss/python/langgraph/use-graph-api)
* [Functional API 概念概述](/oss/python/langgraph/functional-api)
* [在 Graph API 和 Functional API 之间选择](/oss/python/langgraph/choosing-apis)

***

<div className="source-links">
  <Callout icon="terminal-2">
    [将这些文档连接](/use-these-docs)到 Claude、VSCode 等工具，通过 MCP 获取实时答案。
  </Callout>

  <Callout icon="edit">
    [在 GitHub 上编辑此页面](https://github.com/langchain-ai/docs/edit/main/src/oss/langgraph/graph-api.mdx)或[提交问题](https://github.com/langchain-ai/docs/issues/new/choose)。
  </Callout>
</div>