# LangGraph 运行时

[`Pregel`](https://reference.langchain.com/python/langgraph/pregel/main/Pregel) 实现了 LangGraph 的运行时，负责管理 LangGraph 应用程序的执行。

编译 [StateGraph](https://reference.langchain.com/python/langgraph/graph/state/StateGraph) 或创建 [`@entrypoint`](https://reference.langchain.com/python/langgraph/func/entrypoint) 都会产生一个 [`Pregel`](https://reference.langchain.com/python/langgraph/pregel/main/Pregel) 实例，该实例可以通过输入来调用。

本指南从较高层面解释运行时，并提供直接使用 Pregel 实现应用程序的说明。

> **注意：** [`Pregel`](https://reference.langchain.com/python/langgraph/pregel/main/Pregel) 运行时得名于 [Google 的 Pregel 算法](https://research.google/pubs/pub37252/)，该算法描述了一种利用图进行大规模并行计算的高效方法。

## 概述

在 LangGraph 中，Pregel 将 [**actor**](https://en.wikipedia.org/wiki/Actor_model) 和 **通道** 组合到一个应用程序中。**actor** 从通道读取数据并向通道写入数据。Pregel 遵循 **Pregel 算法**/**批量同步并行（Bulk Synchronous Parallel）** 模型，将应用程序的执行组织为多个步骤。

每个步骤包含三个阶段：

* **规划（Plan）**：确定本步骤要执行哪些 **actor**。例如，在第一步中，选择订阅特殊 **输入** 通道的 **actor**；在后续步骤中，选择订阅上一步中被更新通道的 **actor**。
* **执行（Execution）**：并行执行所有选中的 **actor**，直到全部完成、其中一个失败或达到超时。在此阶段，通道更新对 actor 不可见，直到进入下一步骤。
* **更新（Update）**：使用本步骤中 **actor** 写入的值更新通道。

重复执行，直到没有 **actor** 被选中执行，或达到最大步骤数。

## Actor

**actor** 是一个 `PregelNode`。它订阅通道，从通道读取数据并向通道写入数据。可以将其视为 Pregel 算法中的 **actor**。`PregelNode` 实现了 LangChain 的 Runnable 接口。

## 通道

通道用于在 actor（PregelNode）之间通信。每个通道都有一个值类型、一个更新类型和一个更新函数——更新函数接收一系列更新并修改存储的值。通道可用于将数据从一条链发送到另一条链，或将数据发送到链自身以供未来步骤使用。

### LastValue

[`LastValue`](https://reference.langchain.com/python/langgraph/channels/last_value/LastValue) 是默认的通道类型。它存储最后一次写入的值，并覆盖之前的任何值。可将它用于输入和输出值，或用于将数据从一个步骤传递到下一个步骤。

```python theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
from langgraph.channels import LastValue

channel: LastValue[int] = LastValue(int)
```

### Topic

[`Topic`](https://reference.langchain.com/python/langgraph/channels/topic/Topic) 是一种可配置的 PubSub 通道，可用于在 actor 之间发送多个值，或在多个步骤之间累积输出。它可以配置为对值去重，或累积一次运行期间写入的所有值。

```python theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
from langgraph.channels import Topic

# Accumulate all values written across steps
channel: Topic[str] = Topic(str, accumulate=True)
```

### BinaryOperatorAggregate

[`BinaryOperatorAggregate`](https://reference.langchain.com/python/langgraph/channels/binop/BinaryOperatorAggregate) 存储一个持久值，通过将二元运算符应用于当前值和每个新更新来更新该值。可使用它跨步骤计算累计聚合值。

```python theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
import operator
from langgraph.channels import BinaryOperatorAggregate

# Running total: each write adds to the current value
total = BinaryOperatorAggregate(int, operator.add)
```

### DeltaChannel

<Warning>
  `DeltaChannel` 需要 `langgraph>=1.2`，目前处于 **beta** 阶段。API 在未来的版本中可能会发生变化。
</Warning>

[`DeltaChannel`](https://reference.langchain.com/python/langgraph/channels/delta/DeltaChannel) 只存储每个步骤的增量变化，而不是完整的累积值。这对于频繁写入并随时间累积大量值的通道最为有用——例如，长时间运行的线程中的对话消息列表。如果没有增量存储，完整列表会被重新序列化到每一个检查点中；而使用 `DeltaChannel`，则只存储每个步骤中写入的新消息。

<Tip>
  当某个通道既被频繁写入、又随时间不断增大时，可以考虑使用 `DeltaChannel`。一个很好的信号：如果你注意到某个通道的检查点大小随线程长度线性增长，那么 `DeltaChannel` 很可能是合适的选择。
</Tip>

像使用普通 reducer 一样，在 `Annotated` 类型注解中使用 `DeltaChannel`：

```python theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
from typing import Annotated, Sequence
from typing_extensions import TypedDict
from langgraph.channels import DeltaChannel


def my_reducer(state: list[str], writes: Sequence[list[str]]) -> list[str]:
    result = list(state)
    for write in writes:
        result.extend(write)
    return result


class State(TypedDict):
    messages: Annotated[list[str], DeltaChannel(my_reducer)]
```

#### 批量 reducer 的要求

传递给 `DeltaChannel` 的 `reducer` 是一种**批量 reducer**：它在一次调用中接收当前状态以及当前步骤所有写入的*序列*——而不是像标准 reducer 那样成对处理。这与 `StateGraph` 中与 `Annotated` 一起使用的按键 reducer 不同，后者的 reducer 每次更新都会调用一次。

<Warning>
  批量 reducer **必须是可结合的**（与批处理方式无关）：

  ```
  reducer(reducer(state, [xs]), [ys]) == reducer(state, [xs, ys])
  ```

  如果你的 reducer 不可结合，重建后的状态可能会因 LangGraph 跨步骤批处理写入的方式不同而有所差异，从而产生不一致的行为。
</Warning>

<Warning>
  **reducer 在重建时运行，而非写入时运行。**与 [`BinaryOperatorAggregate`](https://reference.langchain.com/python/langgraph/channels/binop/BinaryOperatorAggregate)（其 reducer 在写入时调用，因此合并后的值会被序列化到检查点中）不同，`DeltaChannel` 的 reducer 是在通道值从持久化的写入记录中*重建*时被调用的。被序列化的是每个步骤的原始写入；reducer 只在值被具体化时才会被调用——即在下次读取时、供下一步骤的 actor 使用时，或回放历史时。

  设计 reducer 时需要注意的实际影响：

  * **使它成为 `(state, writes)` 的纯函数。**任何副作用、随机性或读取墙上时钟的操作（例如 `uuid.uuid4()`、`datetime.now()`）都会在每次重建值时执行，并在每次回放时产生不同的结果。它们*不会*被固化到持久化的写入中。
  * **不要依赖对传入写入的修改会被持久化。**如果你的 reducer 修改了某个写入对象（例如，为原本没有稳定 ID 的项目分配一个），该修改只存在于重建后的值中。存储的写入仍保持原始形状，因此下次重建时又会看到未修改的输入。
  * **在上游附加身份标识和其他稳定的元数据。**如果下游代码需要跨轮次按 ID 引用某个项目（例如，之后还要更新或删除它），请在值写入通道之前分配该 ID——而不是在 reducer 内部。
</Warning>

以下是两种最常见场景的批量 reducer：

```python theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
from typing import Any, Sequence


# List: append all writes in order
def list_reducer(state: list[Any], writes: Sequence[list[Any]]) -> list[Any]:
    result = list(state)
    for write in writes:
        result.extend(write)
    return result


# Dict: merge all writes, last write wins on key conflicts
def dict_reducer(
    state: dict[str, Any], writes: Sequence[dict[str, Any]]
) -> dict[str, Any]:
    result = dict(state)
    for write in writes:
        result.update(write)
    return result
```

两者都是可结合的：逐个应用批次与一次性全部应用会产生相同的结果。

#### 使用 snapshot\_frequency 限制读取延迟

如果没有快照，读取 `DeltaChannel` 的值就需要回放完整的写入历史——对于具有 N 个步骤的线程，复杂度为 O(N)。设置 `snapshot_frequency=K` 会在每 K 个 Pregel 步骤后写入完整快照，将读取深度限制在至多 K 个步骤：

```python theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
class State(TypedDict):
    messages: Annotated[
        list[str],
        DeltaChannel(my_reducer, snapshot_frequency=5),
    ]
```

`snapshot_frequency` 的值越大，存储开销越低，但读取延迟越高。值越小，延迟上限越严格，但代价是检查点更大。`None`（默认值）会完全跳过快照——适合读取次数很少或线程较短的情况。

#### 版本兼容性与回滚

<Warning>
  不建议将已持久化的通道从 `DeltaChannel` 更改为非 delta 通道。检查点对这些通道类型的编码方式不同，因此更改现有线程的通道类型可能导致状态重建不完整或不正确。请在线程的整个生命周期内保持通道定义稳定。在更改通道类型之前，请将受影响的线程迁移到新的表示形式，或丢弃它们并启动新线程。

  **不支持回滚到不支持 `DeltaChannel` 的版本。**`langgraph>=1.2` 会以早期版本无法读取的新格式写入 delta 通道检查点。一旦线程使用了 `DeltaChannel`，降级 LangGraph 会使这些检查点无法读取，因为旧版运行时不理解 delta 格式，无法重建通道状态。如果需要回滚，请先在降级前使用 [delta-channel-dump 恢复脚本](https://github.com/langchain-ai/langgraph/tree/main/examples/delta-channel-dump) 迁移受影响的线程，或将其丢弃。
</Warning>

## 示例

虽然大多数用户会通过 [StateGraph](https://reference.langchain.com/python/langgraph/graph/state/StateGraph) API 或 [`@entrypoint`](https://reference.langchain.com/python/langgraph/func/entrypoint) 装饰器与 Pregel 交互，但也可以直接与 Pregel 交互。

下面是一些不同的示例，帮助你了解 Pregel API。

<Tabs>
  <Tab title="单节点">
    ```python theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
    from langgraph.channels import EphemeralValue
    from langgraph.pregel import Pregel, NodeBuilder

    node1 = (
        NodeBuilder().subscribe_only("a")
        .do(lambda x: x + x)
        .write_to("b")
    )

    app = Pregel(
        nodes={"node1": node1},
        channels={
            "a": EphemeralValue(str),
            "b": EphemeralValue(str),
        },
        input_channels=["a"],
        output_channels=["b"],
    )

    app.invoke({"a": "foo"})
    ```

    ```con theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
    {'b': 'foofoo'}
    ```
  </Tab>

  <Tab title="多节点">
    ```python theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
    from langgraph.channels import LastValue, EphemeralValue
    from langgraph.pregel import Pregel, NodeBuilder

    node1 = (
        NodeBuilder().subscribe_only("a")
        .do(lambda x: x + x)
        .write_to("b")
    )

    node2 = (
        NodeBuilder().subscribe_only("b")
        .do(lambda x: x + x)
        .write_to("c")
    )


    app = Pregel(
        nodes={"node1": node1, "node2": node2},
        channels={
            "a": EphemeralValue(str),
            "b": LastValue(str),
            "c": EphemeralValue(str),
        },
        input_channels=["a"],
        output_channels=["b", "c"],
    )

    app.invoke({"a": "foo"})
    ```

    ```con theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
    {'b': 'foofoo', 'c': 'foofoofoofoo'}
    ```
  </Tab>

  <Tab title="Topic">
    ```python theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
    from langgraph.channels import EphemeralValue, Topic
    from langgraph.pregel import Pregel, NodeBuilder

    node1 = (
        NodeBuilder().subscribe_only("a")
        .do(lambda x: x + x)
        .write_to("b", "c")
    )

    node2 = (
        NodeBuilder().subscribe_to("b")
        .do(lambda x: x["b"] + x["b"])
        .write_to("c")
    )

    app = Pregel(
        nodes={"node1": node1, "node2": node2},
        channels={
            "a": EphemeralValue(str),
            "b": EphemeralValue(str),
            "c": Topic(str, accumulate=True),
        },
        input_channels=["a"],
        output_channels=["c"],
    )

    app.invoke({"a": "foo"})
    ```

    ```pycon theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
    {'c': ['foofoo', 'foofoofoofoo']}
    ```
  </Tab>

  <Tab title="BinaryOperatorAggregate">
    此示例演示如何使用 [`BinaryOperatorAggregate`](https://reference.langchain.com/python/langgraph/channels/binop/BinaryOperatorAggregate) 通道来实现 reducer。

    ```python theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
    from langgraph.channels import EphemeralValue, BinaryOperatorAggregate
    from langgraph.pregel import Pregel, NodeBuilder


    node1 = (
        NodeBuilder().subscribe_only("a")
        .do(lambda x: x + x)
        .write_to("b", "c")
    )

    node2 = (
        NodeBuilder().subscribe_only("b")
        .do(lambda x: x + x)
        .write_to("c")
    )

    def reducer(current, update):
        if current:
            return current + " | " + update
        else:
            return update

    app = Pregel(
        nodes={"node1": node1, "node2": node2},
        channels={
            "a": EphemeralValue(str),
            "b": EphemeralValue(str),
            "c": BinaryOperatorAggregate(str, operator=reducer),
        },
        input_channels=["a"],
        output_channels=["c"],
    )

    app.invoke({"a": "foo"})
    ```

    ```console theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
    { 'c': 'foofoo | foofoofoofoo' }
    ```
  </Tab>

  <Tab title="循环">
    此示例演示如何在图中引入循环：让一条链写入它所订阅的通道。执行将持续进行，直到向该通道写入 `None` 值。

    ```python theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
    from langgraph.channels import EphemeralValue
    from langgraph.pregel import Pregel, NodeBuilder, ChannelWriteEntry

    example_node = (
        NodeBuilder().subscribe_only("value")
        .do(lambda x: x + x if len(x) < 10 else None)
        .write_to(ChannelWriteEntry("value", skip_none=True))
    )

    app = Pregel(
        nodes={"example_node": example_node},
        channels={
            "value": EphemeralValue(str),
        },
        input_channels=["value"],
        output_channels=["value"],
    )

    app.invoke({"value": "a"})
    ```

    ```pycon theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
    {'value': 'aaaaaaaaaaaaaaaa'}
    ```
  </Tab>
</Tabs>

## 高层 API

LangGraph 提供了两种用于创建 Pregel 应用程序的高层 API：[StateGraph（Graph API）](/oss/python/langgraph/graph-api) 和 [Functional API](/oss/python/langgraph/functional-api)。

<Tabs>
  <Tab title="StateGraph（Graph API）">
    [StateGraph（Graph API）](https://reference.langchain.com/python/langgraph/graph/state/StateGraph) 是一种更高级的抽象，它简化了 Pregel 应用程序的创建。它允许你定义由节点和边组成的图。当你编译图时，StateGraph API 会自动为你创建 Pregel 应用程序。

    ```python theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
    from typing import TypedDict

    from langgraph.constants import START
    from langgraph.graph import StateGraph

    class Essay(TypedDict):
        topic: str
        content: str | None
        score: float | None

    def write_essay(essay: Essay):
        return {
            "content": f"Essay about {essay['topic']}",
        }

    def score_essay(essay: Essay):
        return {
            "score": 10
        }

    builder = StateGraph(Essay)
    builder.add_node(write_essay)
    builder.add_node(score_essay)
    builder.add_edge(START, "write_essay")
    builder.add_edge("write_essay", "score_essay")

    # Compile the graph.
    # This will return a Pregel instance.
    graph = builder.compile()
    ```

    编译后的 Pregel 实例将与一组节点和通道关联。你可以通过打印它们来检查节点和通道。

    ```python theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
    print(graph.nodes)
    ```

    你会看到类似下面的内容：

    ```pycon theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
    {'__start__': <langgraph.pregel.read.PregelNode at 0x7d05e3ba1810>,
     'write_essay': <langgraph.pregel.read.PregelNode at 0x7d05e3ba14d0>,
     'score_essay': <langgraph.pregel.read.PregelNode at 0x7d05e3ba1710>}
    ```

    ```python theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
    print(graph.channels)
    ```

    你应该会看到类似下面的内容：

    ```pycon theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
    {'topic': <langgraph.channels.last_value.LastValue at 0x7d05e3294d80>,
     'content': <langgraph.channels.last_value.LastValue at 0x7d05e3295040>,
     'score': <langgraph.channels.last_value.LastValue at 0x7d05e3295980>,
     '__start__': <langgraph.channels.ephemeral_value.EphemeralValue at 0x7d05e3297e00>,
     'write_essay': <langgraph.channels.ephemeral_value.EphemeralValue at 0x7d05e32960c0>,
     'score_essay': <langgraph.channels.ephemeral_value.EphemeralValue at 0x7d05e2d8ab80>,
     'branch:__start__:__self__:write_essay': <langgraph.channels.ephemeral_value.EphemeralValue at 0x7d05e32941c0>,
     'branch:__start__:__self__:score_essay': <langgraph.channels.ephemeral_value.EphemeralValue at 0x7d05e2d88800>,
     'branch:write_essay:__self__:write_essay': <langgraph.channels.ephemeral_value.EphemeralValue at 0x7d05e3295ec0>,
     'branch:write_essay:__self__:score_essay': <langgraph.channels.ephemeral_value.EphemeralValue at 0x7d05e2d8ac00>,
     'branch:score_essay:__self__:write_essay': <langgraph.channels.ephemeral_value.EphemeralValue at 0x7d05e2d89700>,
     'branch:score_essay:__self__:score_essay': <langgraph.channels.ephemeral_value.EphemeralValue at 0x7d05e2d8b400>,
     'start:write_essay': <langgraph.channels.ephemeral_value.EphemeralValue at 0x7d05e2d8b280>}
    ```
  </Tab>

  <Tab title="Functional API">
    在 [Functional API](/oss/python/langgraph/functional-api) 中，你可以使用 [`@entrypoint`](https://reference.langchain.com/python/langgraph/func/entrypoint) 创建 Pregel 应用程序。`entrypoint` 装饰器允许你定义一个接收输入并返回输出的函数。

    ```python theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
    from typing import TypedDict

    from langgraph.checkpoint.memory import InMemorySaver
    from langgraph.func import entrypoint

    class Essay(TypedDict):
        topic: str
        content: str | None
        score: float | None


    checkpointer = InMemorySaver()

    @entrypoint(checkpointer=checkpointer)
    def write_essay(essay: Essay):
        return {
            "content": f"Essay about {essay['topic']}",
        }

    print("Nodes: ")
    print(write_essay.nodes)
    print("Channels: ")
    print(write_essay.channels)
    ```

    ```pycon theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
    Nodes:
    {'write_essay': <langgraph.pregel.read.PregelNode object at 0x7d05e2f9aad0>}
    Channels:
    {'__start__': <langgraph.channels.ephemeral_value.EphemeralValue object at 0x7d05e2c906c0>, '__end__': <langgraph.channels.last_value.LastValue object at 0x7d05e2c90c40>, '__previous__': <langgraph.channels.last_value.LastValue object at 0x7d05e1007280>}
    ```
  </Tab>
</Tabs>

***

<div className="source-links">
  <Callout icon="terminal-2">
    通过 MCP 将[这些文档](/use-these-docs)连接到 Claude、VSCode 等工具，获取实时解答。
  </Callout>

  <Callout icon="edit">
    在 GitHub 上[编辑此页面](https://github.com/langchain-ai/docs/edit/main/src/oss/langgraph/pregel.mdx)或[提交问题](https://github.com/langchain-ai/docs/issues/new/choose)。
  </Callout>
</div>