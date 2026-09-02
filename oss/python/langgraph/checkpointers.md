# 检查点存储

> LangGraph 检查点存储在每一步将图状态保存为检查点，从而实现持久化、人机协同和容错执行。

检查点存储在每次超级步（super-step）结束时保存图状态的快照，并将这些快照组织到**线程（threads）**中。使用检查点存储编译图，即可启用人工参与工作流、时间旅行调试、容错执行和对话记忆。

<img src="https://mintcdn.com/langchain-5e9cc07a/-_xGPoyjhyiDWTPJ/oss/images/checkpoints.jpg?fit=max&auto=format&n=-_xGPoyjhyiDWTPJ&q=85&s=966566aaae853ed4d240c2d0d067467c" alt="Checkpoints" width="2316" height="748" data-path="oss/images/checkpoints.jpg" />

<Info>
  **Agent Server 会自动处理检查点存储**
  使用 [Agent Server](/langsmith/agent-server) 时，您无需手动实现或配置检查点存储。服务器会在后台为您处理所有持久化基础设施。
</Info>

<Tip>
  使用 [LangSmith](https://smith.langchain.com?utm_source=docs\&utm_medium=cta\&utm_campaign=langsmith-signup\&utm_content=oss-langgraph-checkpointers) 跟踪检查点的状态并调试您的 Agent 如何跨会话恢复。按照[跟踪快速入门](/langsmith/trace-with-langgraph)进行设置。
</Tip>

## 为什么使用检查点存储

以下功能需要检查点存储：

* **人机协同（Human-in-the-loop）**：检查点存储通过允许人工检查、中断和批准图步骤来支持[人机协同工作流](/oss/python/langgraph/interrupts)。这些工作流需要检查点存储，因为人工必须在任何时间点查看图的状态，并且图必须在人工对状态进行任何更新后能够恢复执行。参见[中断](/oss/python/langgraph/interrupts)中的示例。
* **记忆（Memory）**：检查点存储支持交互之间的["记忆"](/oss/python/concepts/memory)。在重复的人工交互（如对话）场景中，任何后续消息都可以发送到该线程，该线程会保留对先前消息的记忆。参见[添加记忆](/oss/python/langgraph/add-memory)了解如何使用检查点存储添加和管理对话记忆。
* **时间旅行（Time travel）**：检查点存储支持["时间旅行"](/oss/python/langgraph/use-time-travel)，允许用户重放先前的图执行以审查和/或调试特定的图步骤。此外，检查点存储还可以在任意检查点分叉图状态，以探索替代轨迹。
* **容错（Fault-tolerance）**：检查点机制提供容错和错误恢复：如果某个超级步中一个或多个节点失败，您可以从最后一个成功步骤重新启动图。

<a id="pending-writes" />

* **挂起写入（Pending writes）**：当图节点在某个[超级步](#super-steps)中执行到一半失败时，LangGraph 会存储该超级步中其他成功完成的节点的挂起检查点写入。当您从该超级步恢复图执行时，不会重新运行成功的节点。

## 核心概念

### 线程

线程是为检查点存储保存的每个检查点分配的唯一 ID 或线程标识符。它包含一系列[运行（runs）](/langsmith/runs)的累积状态。当一次运行执行时，底层图的[状态](/oss/python/langgraph/graph-api#state)会持久化到该线程中。

当使用检查点存储调用图时，您**必须**在配置的 `configurable` 部分中指定 `thread_id`：

```python theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
{"configurable": {"thread_id": "1"}}
```

线程的当前和历史状态都可以检索。要持久化状态，必须在执行运行之前创建线程。LangSmith API 提供了多个用于创建和管理线程及线程状态的端点。有关更多详细信息，请参阅 [API 参考](https://reference.langchain.com/python/langsmith/)。

检查点存储使用 `thread_id` 作为存储和检索检查点的主键。没有它，检查点存储无法保存状态或在[中断](/oss/python/langgraph/interrupts)后恢复执行，因为检查点存储使用 `thread_id` 加载已保存的状态。

### 检查点

线程在特定时间点的状态称为检查点。检查点是在每个[超级步](#super-steps)保存的图状态快照，由 `StateSnapshot` 对象表示（完整字段参考见 [StateSnapshot 字段](#statesnapshot-fields)）。

#### 超级步

LangGraph 在每个**超级步**边界创建检查点。超级步是图的一次"节拍"，该步骤中安排的所有节点（可能并行）执行。对于像 `START -> A -> B -> END` 这样的顺序图，输入、节点 A 和节点 B 各有单独的超级步——每个超级步之后都会产生一个检查点。理解超级步边界对于[时间旅行](/oss/python/langgraph/use-time-travel)很重要，因为您只能从检查点（即超级步边界）恢复执行。

除了超级步检查点之外，LangGraph 还在**节点（任务）级别**持久化写入。当超级步中的每个节点完成时，其输出会作为任务条目写入检查点存储的 `checkpoint_writes` 表，并链接到进行中的检查点。这些按任务划分的写入正是[挂起写入](#pending-writes)恢复所依赖的机制：如果同一超级步中的另一个节点失败，成功节点的写入已经持久化，恢复时无需重新运行。完整的状态快照则在超级步完成后提交。

LangGraph 还会持久化超级步内单个节点执行的写入。这些写入以任务形式存储，用于容错：如果同一超级步中的另一个节点失败，恢复时无需重新计算成功节点的写入。这些任务写入不是完整的 `StateSnapshot` 检查点，因此时间旅行从超级步边界的完整检查点恢复。

检查点会被持久化，之后可用于恢复线程的状态。

让我们看看在简单图被如下调用时保存了哪些检查点：

```python theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
from langgraph.graph import StateGraph, START, END
from langgraph.checkpoint.memory import InMemorySaver
from langchain_core.runnables import RunnableConfig
from typing import Annotated
from typing_extensions import TypedDict
from operator import add

class State(TypedDict):
    foo: str
    bar: Annotated[list[str], add]

def node_a(state: State):
    return {"foo": "a", "bar": ["a"]}

def node_b(state: State):
    return {"foo": "b", "bar": ["b"]}


workflow = StateGraph(State)
workflow.add_node(node_a)
workflow.add_node(node_b)
workflow.add_edge(START, "node_a")
workflow.add_edge("node_a", "node_b")
workflow.add_edge("node_b", END)

checkpointer = InMemorySaver()
graph = workflow.compile(checkpointer=checkpointer)

config: RunnableConfig = {"configurable": {"thread_id": "1"}}
graph.invoke({"foo": "", "bar":[]}, config)
```

运行图之后，将恰好有 4 个检查点：

* 以 [`START`](https://reference.langchain.com/python/langgraph/constants/START) 作为下一个待执行节点的空检查点
* 包含用户输入 `{'foo': '', 'bar': []}` 且 `node_a` 为下一个待执行节点的检查点
* 包含 `node_a` 的输出 `{'foo': 'a', 'bar': ['a']}` 且 `node_b` 为下一个待执行节点的检查点
* 包含 `node_b` 的输出 `{'foo': 'b', 'bar': ['a', 'b']}` 且没有下一个待执行节点的检查点

注意 `bar` 通道值包含两个节点的输出，因为此示例为 `bar` 通道设置了 reducer。

#### 检查点命名空间

每个检查点都有一个 `checkpoint_ns`（检查点命名空间）字段，用于标识它属于哪个图或子图：

* **`""`**（空字符串）：检查点属于父（根）图。
* **`"node_name:uuid"`**：检查点属于作为给定节点调用的子图。对于嵌套子图，命名空间使用 `|` 分隔符连接（例如 `"outer_node:uuid|inner_node:uuid"`）。

您可以在节点内通过配置访问检查点命名空间：

```python theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
from langchain_core.runnables import RunnableConfig

def my_node(state: State, config: RunnableConfig):
    checkpoint_ns = config["configurable"]["checkpoint_ns"]
    # "" for the parent graph, "node_name:uuid" for a subgraph
```

有关使用子图状态和检查点的更多详细信息，请参见[子图](/oss/python/langgraph/use-subgraphs)。

## 获取和更新状态

### 获取状态

与已保存的图状态交互时，您**必须**指定[线程标识符](#threads)。您可以调用 `graph.get_state(config)` 查看图的*最新*状态。这将返回一个 `StateSnapshot` 对象，对应于配置中提供的线程 ID 关联的最新检查点；如果提供了检查点 ID，则返回该线程中与该检查点 ID 关联的检查点。

```python theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
# get the latest state snapshot
config = {"configurable": {"thread_id": "1"}}
graph.get_state(config)

# get a state snapshot for a specific checkpoint_id
config = {"configurable": {"thread_id": "1", "checkpoint_id": "1ef663ba-28fe-6528-8002-5a559208592c"}}
graph.get_state(config)
```

在此示例中，`get_state` 的输出如下所示：

```
StateSnapshot(
    values={'foo': 'b', 'bar': ['a', 'b']},
    next=(),
    config={'configurable': {'thread_id': '1', 'checkpoint_ns': '', 'checkpoint_id': '1ef663ba-28fe-6528-8002-5a559208592c'}},
    metadata={'source': 'loop', 'writes': {'node_b': {'foo': 'b', 'bar': ['b']}}, 'step': 2},
    created_at='2024-08-29T19:19:38.821749+00:00',
    parent_config={'configurable': {'thread_id': '1', 'checkpoint_ns': '', 'checkpoint_id': '1ef663ba-28f9-6ec4-8001-31981c2c39f8'}}, tasks=()
)
```

#### StateSnapshot 字段

| 字段           | 类型                     | 描述                                                                                                                                                |
| --------------- | ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `values`        | `dict`                   | 此检查点处的状态通道值。                                                                                                                   |
| `next`          | `tuple[str, ...]`        | 接下来要执行的节点名称。空 `()` 表示图已完成。                                                                                        |
| `config`        | `dict`                   | 包含 `thread_id`、`checkpoint_ns` 和 `checkpoint_id`。                                                                                                |
| `metadata`      | `dict`                   | 执行元数据。包含 `source`（`"input"`、`"loop"` 或 `"update"`）、`writes`（节点输出）和 `step`（超级步计数器）。                      |
| `created_at`    | `str`                    | 此检查点创建的 ISO 8601 时间戳。                                                                                                    |
| `parent_config` | `dict \| None`           | 上一个检查点的配置。第一个检查点为 `None`。                                                                                        |
| `tasks`         | `tuple[PregelTask, ...]` | 此步骤要执行的任务。每个任务都有 `id`、`name`、`error`、`interrupts`，以及可选的 `state`（子图快照，使用 `subgraphs=True` 时）。 |

### 获取状态历史

您可以调用 [`graph.get_state_history(config)`](https://reference.langchain.com/python/langgraph/graphs/#langgraph.graph.state.CompiledStateGraph.get_state_history) 获取给定线程的图执行的完整历史。这将返回与配置中提供的线程 ID 关联的 `StateSnapshot` 对象列表。重要的是，检查点将按时间顺序排列，最近的检查点 / `StateSnapshot` 位于列表第一位。

```python theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
config = {"configurable": {"thread_id": "1"}}
list(graph.get_state_history(config))
```

在此示例中，[`get_state_history`](https://reference.langchain.com/python/langgraph/graphs/#langgraph.graph.state.CompiledStateGraph.get_state_history) 的输出如下所示：

```
[
    StateSnapshot(
        values={'foo': 'b', 'bar': ['a', 'b']},
        next=(),
        config={'configurable': {'thread_id': '1', 'checkpoint_ns': '', 'checkpoint_id': '1ef663ba-28fe-6528-8002-5a559208592c'}},
        metadata={'source': 'loop', 'writes': {'node_b': {'foo': 'b', 'bar': ['b']}}, 'step': 2},
        created_at='2024-08-29T19:19:38.821749+00:00',
        parent_config={'configurable': {'thread_id': '1', 'checkpoint_ns': '', 'checkpoint_id': '1ef663ba-28f9-6ec4-8001-31981c2c39f8'}},
        tasks=(),
    ),
    StateSnapshot(
        values={'foo': 'a', 'bar': ['a']},
        next=('node_b',),
        config={'configurable': {'thread_id': '1', 'checkpoint_ns': '', 'checkpoint_id': '1ef663ba-28f9-6ec4-8001-31981c2c39f8'}},
        metadata={'source': 'loop', 'writes': {'node_a': {'foo': 'a', 'bar': ['a']}}, 'step': 1},
        created_at='2024-08-29T19:19:38.819946+00:00',
        parent_config={'configurable': {'thread_id': '1', 'checkpoint_ns': '', 'checkpoint_id': '1ef663ba-28f4-6b4a-8000-ca575a13d36a'}},
        tasks=(PregelTask(id='6fb7314f-f114-5413-a1f3-d37dfe98ff44', name='node_b', error=None, interrupts=()),),
    ),
    StateSnapshot(
        values={'foo': '', 'bar': []},
        next=('node_a',),
        config={'configurable': {'thread_id': '1', 'checkpoint_ns': '', 'checkpoint_id': '1ef663ba-28f4-6b4a-8000-ca575a13d36a'}},
        metadata={'source': 'loop', 'writes': None, 'step': 0},
        created_at='2024-08-29T19:19:38.817813+00:00',
        parent_config={'configurable': {'thread_id': '1', 'checkpoint_ns': '', 'checkpoint_id': '1ef663ba-28f0-6c66-bfff-6723431e8481'}},
        tasks=(PregelTask(id='f1b14528-5ee5-579c-949b-23ef9bfbed58', name='node_a', error=None, interrupts=()),),
    ),
    StateSnapshot(
        values={'bar': []},
        next=('__start__',),
        config={'configurable': {'thread_id': '1', 'checkpoint_ns': '', 'checkpoint_id': '1ef663ba-28f0-6c66-bfff-6723431e8481'}},
        metadata={'source': 'input', 'writes': {'foo': ''}, 'step': -1},
        created_at='2024-08-29T19:19:38.816205+00:00',
        parent_config=None,
        tasks=(PregelTask(id='6d27aa2e-d72b-5504-a36f-8620e54a76dd', name='__start__', error=None, interrupts=()),),
    )
]
```

<img src="https://mintcdn.com/langchain-5e9cc07a/-_xGPoyjhyiDWTPJ/oss/images/get_state.jpg?fit=max&auto=format&n=-_xGPoyjhyiDWTPJ&q=85&s=38ffff52be4d8806b287836295a3c058" alt="State" width="2692" height="1056" data-path="oss/images/get_state.jpg" />

#### 查找特定检查点

您可以过滤状态历史以找到符合特定条件的检查点：

```python theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
history = list(graph.get_state_history(config))

# Find the checkpoint before a specific node executed
before_node_b = next(s for s in history if s.next == ("node_b",))

# Find a checkpoint by step number
step_2 = next(s for s in history if s.metadata["step"] == 2)

# Find checkpoints created by update_state
forks = [s for s in history if s.metadata["source"] == "update"]

# Find the checkpoint where an interrupt occurred
interrupted = next(
    s for s in history
    if s.tasks and any(t.interrupts for t in s.tasks)
)
```

### 重放

重放会重新执行先前检查点之后的步骤。使用先前的 `checkpoint_id` 调用图，以重新运行该检查点之后的节点。检查点之前的节点会被跳过（其结果已保存）。检查点之后的节点会重新执行，包括任何 LLM 调用、API 请求或[中断](/oss/python/langgraph/interrupts)——这些在重放期间总是会重新触发。

有关重放先前执行的完整细节和代码示例，请参见[时间旅行](/oss/python/langgraph/use-time-travel)。

<img src="https://mintcdn.com/langchain-5e9cc07a/dL5Sn6Cmy9pwtY0V/oss/images/re_play.png?fit=max&auto=format&n=dL5Sn6Cmy9pwtY0V&q=85&s=d7b34b85c106e55d181ae1f4afb50251" alt="Replay" width="2276" height="986" data-path="oss/images/re_play.png" />

### 更新状态

您可以使用 [`update_state`](https://reference.langchain.com/python/langgraph/graphs/#langgraph.graph.state.CompiledStateGraph.update_state) 编辑图状态。这会创建一个包含更新值的新检查点——它不会修改原始检查点。该更新与节点更新处理方式相同：定义 reducer 的通道的值会经过 [reducer](/oss/python/langgraph/graph-api#reducers) 函数处理，因此带有 reducer 的通道会*累积*值而不是覆盖它们。

您可以可选地指定 `as_node` 来控制更新被视为来自哪个节点，这会影响接下来执行哪个节点。详细信息请参见[时间旅行：`as_node`](/oss/python/langgraph/use-time-travel#from-a-specific-node)。

<img src="https://mintcdn.com/langchain-5e9cc07a/-_xGPoyjhyiDWTPJ/oss/images/checkpoints_full_story.jpg?fit=max&auto=format&n=-_xGPoyjhyiDWTPJ&q=85&s=a52016b2c44b57bd395d6e1eac47aa36" alt="Update" width="3705" height="2598" data-path="oss/images/checkpoints_full_story.jpg" />

## 持久性模式

LangGraph 支持三种持久性模式（durability modes），让您可以在性能和数据一致性之间进行权衡。您可以在调用任何图执行方法时指定持久性模式：

```python theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
graph.stream(
    {"input": "test"},
    durability="sync"
)
```

持久性模式从低到高如下：

* `"exit"`：LangGraph 仅在图执行退出时持久化更改——成功退出、出错退出或因人工参与而中断退出时。这为长时间运行的图提供了最佳性能，但意味着中间状态不会保存，因此您无法从执行中途的系统故障（如进程崩溃）中恢复。
* `"async"`：LangGraph 在下一步执行时异步持久化更改。这提供了良好的性能和持久性，但如果进程在执行期间崩溃，LangGraph 可能无法写入检查点，存在较小风险。
* `"sync"`：LangGraph 在下一步开始前同步持久化更改。这确保 LangGraph 在继续执行前写入每个检查点，提供高持久性，但会带来一些性能开销。

## 优化检查点存储

默认情况下，LangGraph 检查点会在每个超级步写入每个状态通道的完整值。对于具有大量累积的长线程——如多轮对话——这会随着时间推移产生显著的存储增长。

[`DeltaChannel`](https://reference.langchain.com/python/langgraph/channels/delta/DeltaChannel) 只存储增量而不是完整的累积值，从而大幅减少追加密集型通道的检查点大小。有关用法和存储与延迟的权衡，请参见 [DeltaChannel](/oss/python/langgraph/pregel#deltachannel)。

<Warning>
  `DeltaChannel` 需要 `langgraph>=1.2`，目前处于测试阶段。API 可能在未来的版本中发生变化。
</Warning>

## 检查点存储库

在底层，检查点机制由符合 [`BaseCheckpointSaver`](https://reference.langchain.com/python/langgraph/checkpoints/#langgraph.checkpoint.base.BaseCheckpointSaver) 接口的检查点存储对象驱动。LangGraph 提供了多个检查点存储实现，全部通过独立的、可安装的库实现。

<Note>
  有关可用提供程序，请参见[检查点存储集成](/oss/python/integrations/checkpointers/index)。
</Note>

* `langgraph-checkpoint`：检查点存储的基础接口（[`BaseCheckpointSaver`](https://reference.langchain.com/python/langgraph/checkpoints/#langgraph.checkpoint.base.BaseCheckpointSaver)）以及序列化/反序列化接口（[`SerializerProtocol`](https://reference.langchain.com/python/langgraph/checkpoints/#langgraph.checkpoint.serde.base.SerializerProtocol)）。包含用于实验的内存检查点存储实现（[`InMemorySaver`](https://reference.langchain.com/python/langgraph/checkpoints/#langgraph.checkpoint.memory.InMemorySaver)）。LangGraph 自带 `langgraph-checkpoint`。
* `langgraph-checkpoint-sqlite`：使用 SQLite 数据库的 LangGraph 检查点存储实现（[`SqliteSaver`](https://reference.langchain.com/python/langgraph/checkpoints/#langgraph.checkpoint.sqlite.SqliteSaver) / [`AsyncSqliteSaver`](https://reference.langchain.com/python/langgraph/checkpoints/#langgraph.checkpoint.sqlite.aio.AsyncSqliteSaver)）。非常适合实验和本地工作流。需要单独安装。
* `langgraph-checkpoint-postgres`：使用 Postgres 数据库的高级检查点存储（[`PostgresSaver`](https://reference.langchain.com/python/langgraph/checkpoints/#langgraph.checkpoint.postgres.PostgresSaver) / [`AsyncPostgresSaver`](https://reference.langchain.com/python/langgraph/checkpoints/#langgraph.checkpoint.postgres.aio.AsyncPostgresSaver)），用于 LangSmith。非常适合生产环境使用。需要单独安装。
* `langchain-azure-cosmosdb`：使用 Azure Cosmos DB for NoSQL 的 LangGraph 检查点存储实现（[`CosmosDBSaverSync`](https://reference.langchain.com/python/langchain-azure-cosmosdb/) / [`CosmosDBSaver`](https://reference.langchain.com/python/langchain-azure-cosmosdb/)）。非常适合在 Azure 上用于生产环境。支持同步和异步操作，并使用 Microsoft Entra ID 身份验证。需要单独安装。

### 检查点存储接口

每个检查点存储都符合 [`BaseCheckpointSaver`](https://reference.langchain.com/python/langgraph/checkpoints/#langgraph.checkpoint.base.BaseCheckpointSaver) 接口，并实现以下方法：

* `.put` - 存储带有其配置和元数据的检查点。
* `.put_writes` - 存储链接到检查点的中间写入（即[挂起写入](#pending-writes)）。
* `.get_tuple` - 使用给定的配置（`thread_id` 和 `checkpoint_id`）获取检查点元组。用于填充 `graph.get_state()` 中的 `StateSnapshot`。
* `.list` - 列出符合给定配置和过滤条件的检查点。用于填充 `graph.get_state_history()` 中的状态历史。

如果检查点存储用于异步图执行（即通过 `.ainvoke`、`.astream`、`.abatch` 执行图），将使用上述方法的异步版本（`.aput`、`.aput_writes`、`.aget_tuple`、`.alist`）。

<Note>
  要以异步方式运行图，您可以使用 [`InMemorySaver`](https://reference.langchain.com/python/langgraph/checkpoints/#langgraph.checkpoint.memory.InMemorySaver)，或 Sqlite/Postgres 检查点存储的异步版本——[`AsyncSqliteSaver`](https://reference.langchain.com/python/langgraph/checkpoints/#langgraph.checkpoint.sqlite.aio.AsyncSqliteSaver) / [`AsyncPostgresSaver`](https://reference.langchain.com/python/langgraph/checkpoints/#langgraph.checkpoint.postgres.aio.AsyncPostgresSaver) 检查点存储。
</Note>

### 序列化器

当检查点存储保存图状态时，它们需要序列化状态中的通道值。这是通过序列化器对象完成的。

`langgraph_checkpoint` 定义了用于实现序列化器的[协议](https://reference.langchain.com/python/langgraph/checkpoints/#langgraph.checkpoint.serde.base.SerializerProtocol)，并提供了默认实现（[`JsonPlusSerializer`](https://reference.langchain.com/python/langgraph/checkpoints/#langgraph.checkpoint.serde.jsonplus.JsonPlusSerializer)），可处理多种类型，包括 LangChain 和 LangGraph 原语、日期时间、枚举等。

#### 使用 `pickle` 进行序列化

默认序列化器 [`JsonPlusSerializer`](https://reference.langchain.com/python/langgraph/checkpoints/#langgraph.checkpoint.serde.jsonplus.JsonPlusSerializer) 在底层使用 ormsgpack 和 JSON，这并不适合所有类型的对象。

如果您想对 msgpack 编码器当前不支持的对象（如 Pandas 数据框）回退到 pickle，可以使用 [`JsonPlusSerializer`](https://reference.langchain.com/python/langgraph/checkpoints/#langgraph.checkpoint.serde.jsonplus.JsonPlusSerializer) 的 `pickle_fallback` 参数：

```python theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
from langgraph.checkpoint.memory import InMemorySaver
from langgraph.checkpoint.serde.jsonplus import JsonPlusSerializer

# ... Define the graph ...
graph.compile(
    checkpointer=InMemorySaver(serde=JsonPlusSerializer(pickle_fallback=True))
)
```

#### 加密

检查点存储可以选择加密所有持久化状态。要启用此功能，请将 [`EncryptedSerializer`](https://reference.langchain.com/python/langgraph/checkpoints/#langgraph.checkpoint.serde.encrypted.EncryptedSerializer) 实例传递给任何 [`BaseCheckpointSaver`](https://reference.langchain.com/python/langgraph/checkpoints/#langgraph.checkpoint.base.BaseCheckpointSaver) 实现的 `serde` 参数。创建加密序列化器的最简单方式是通过 [`from_pycryptodome_aes`](https://reference.langchain.com/python/langgraph/checkpoints/#langgraph.checkpoint.serde.encrypted.EncryptedSerializer.from_pycryptodome_aes)，它会从 `LANGGRAPH_AES_KEY` 环境变量中读取 AES 密钥（或接受 `key` 参数）：

```python theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
import sqlite3

from langgraph.checkpoint.serde.encrypted import EncryptedSerializer
from langgraph.checkpoint.sqlite import SqliteSaver

serde = EncryptedSerializer.from_pycryptodome_aes()  # reads LANGGRAPH_AES_KEY
checkpointer = SqliteSaver(sqlite3.connect("checkpoint.db"), serde=serde)
```

```python theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
from langgraph.checkpoint.serde.encrypted import EncryptedSerializer
from langgraph.checkpoint.postgres import PostgresSaver

serde = EncryptedSerializer.from_pycryptodome_aes()
checkpointer = PostgresSaver.from_conn_string("postgresql://...", serde=serde)
checkpointer.setup()
```

在 LangSmith 上运行时，只要存在 `LANGGRAPH_AES_KEY`，加密就会自动启用，因此您只需提供环境变量即可。可以通过实现 [`CipherProtocol`](https://reference.langchain.com/python/langgraph/checkpoints/#langgraph.checkpoint.serde.base.CipherProtocol) 并将其提供给 [`EncryptedSerializer`](https://reference.langchain.com/python/langgraph/checkpoints/#langgraph.checkpoint.serde.encrypted.EncryptedSerializer) 来使用其他加密方案。

## 构建自定义检查点存储

<Tip>
  构建时请使用[一致性测试套件](#testing-with-the-conformance-suite)验证您的实现。它涵盖了全部五个基础方法和扩展能力，包括 delta 通道。在发布前在 CI 中运行它。
</Tip>

本节介绍如何为自定义存储后端从头实现 `BaseCheckpointSaver`。如果您已有可用的检查点存储，只需要添加 delta 通道支持，请跳转到[Delta 通道支持](#delta-channel-support)。

### 概述

LangGraph 的持久化层建立在两个存储抽象之上：

* **检查点表** —— 每个超级步一行；存储序列化后的图状态（`channel_values`、`channel_versions`、`versions_seen`）并链接到其父检查点。
* **写入表** —— 超级步内每个节点输出一行；存储链接到检查点的 `(task_id, channel, value)` 元组。

您的检查点存储管理这两个表。`put` 写入检查点行；`put_writes` 写入节点输出行；`get_tuple` 将两者读回 `CheckpointTuple`。

### 基础契约

继承 `BaseCheckpointSaver` 并实现以下五个方法。所有方法都是必需的——缺少基础方法会在运行时抛出 `NotImplementedError`。

```python theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
from collections.abc import AsyncIterator, Iterator, Sequence
from typing import Any
from langchain_core.runnables import RunnableConfig
from langgraph.checkpoint.base import (
    BaseCheckpointSaver,
    ChannelVersions,
    Checkpoint,
    CheckpointMetadata,
    CheckpointTuple,
)

class MyCheckpointer(BaseCheckpointSaver):
    async def aput(
        self,
        config: RunnableConfig,
        checkpoint: Checkpoint,
        metadata: CheckpointMetadata,
        new_versions: ChannelVersions,
    ) -> RunnableConfig:
        ...

    async def aput_writes(
        self,
        config: RunnableConfig,
        writes: Sequence[tuple[str, Any]],
        task_id: str,
        task_path: str = "",
    ) -> None:
        ...

    async def aget_tuple(self, config: RunnableConfig) -> CheckpointTuple | None:
        ...

    async def alist(
        self,
        config: RunnableConfig | None,
        *,
        filter: dict[str, Any] | None = None,
        before: RunnableConfig | None = None,
        limit: int | None = None,
    ) -> AsyncIterator[CheckpointTuple]:
        ...
        yield  # make this an async generator

    async def adelete_thread(self, thread_id: str) -> None:
        ...
```

#### put / aput

存储一个检查点行。返回包含已存储 `checkpoint_id` 的更新配置。

关键要求：

* 使用 `self.serde.dumps_typed(checkpoint)` 序列化检查点——这会处理所有 LangGraph 原生类型，包括 delta 通道使用的 `_DeltaSnapshot` 二进制块。
* 完整存储 `metadata`——不要剥离未知键。LangGraph 会在小版本中新增元数据字段（例如 delta 通道的 `counters_since_delta_snapshot`）；丢弃它们会静默破坏功能。
* 将 `config["configurable"].get("checkpoint_id")` 存储为父检查点 ID，以便 `get_tuple` 可以填充 `parent_config`。

```python theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
async def aput(self, config, checkpoint, metadata, new_versions):
    thread_id = config["configurable"]["thread_id"]
    checkpoint_ns = config["configurable"]["checkpoint_ns"]
    checkpoint_id = checkpoint["id"]
    parent_id = config["configurable"].get("checkpoint_id")

    type_, blob = self.serde.dumps_typed(checkpoint)
    serialized_metadata = self.serde.dumps_typed(metadata)

    await self.db.execute(
        "INSERT INTO checkpoints (...) VALUES (...)",
        thread_id, checkpoint_ns, checkpoint_id, parent_id,
        type_, blob, *serialized_metadata,
    )
    return {
        "configurable": {
            "thread_id": thread_id,
            "checkpoint_ns": checkpoint_ns,
            "checkpoint_id": checkpoint_id,
        }
    }
```

#### put\_writes / aput\_writes

在当前超级步内存储单个任务的节点输出行。这些行通过 `(thread_id, checkpoint_ns, checkpoint_id)` 链接到检查点。

```python theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
async def aput_writes(self, config, writes, task_id, task_path=""):
    thread_id = config["configurable"]["thread_id"]
    checkpoint_ns = config["configurable"]["checkpoint_ns"]
    checkpoint_id = config["configurable"]["checkpoint_id"]

    rows = []
    for idx, (channel, value) in enumerate(writes):
        type_, blob = self.serde.dumps_typed(value)
        final_idx = WRITES_IDX_MAP.get(channel, idx)
        rows.append((thread_id, checkpoint_ns, checkpoint_id,
                      task_id, task_path, final_idx, channel, type_, blob))

    await self.db.executemany("INSERT INTO writes (...) VALUES (...)", rows)
```

从 `langgraph.checkpoint.base` 导入 `WRITES_IDX_MAP`。它将特殊通道（`__error__`、`__interrupt__` 等）映射到保留的负索引，以免与常规写入索引冲突。

#### get\_tuple / aget\_tuple

检索一个检查点。配置可以包含：

* **无 `checkpoint_id`** —— 返回该线程 + 命名空间的最新检查点。
* **有特定的 `checkpoint_id`** —— 返回该确切检查点。

**两条路径都必须正确工作。** 特定 ID 路径用于时间旅行，并且——关键的是——用于每次图调用时的 delta 通道状态重建（请参见 [Delta 通道支持](#delta-channel-support)）。损坏的特定 ID 查找会静默破坏 delta 通道状态。

```python theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
async def aget_tuple(self, config):
    thread_id = config["configurable"]["thread_id"]
    checkpoint_ns = config["configurable"].get("checkpoint_ns", "")
    checkpoint_id = config["configurable"].get("checkpoint_id")

    if checkpoint_id:
        row = await self.db.fetchone(
            "SELECT * FROM checkpoints "
            "WHERE thread_id=? AND checkpoint_ns=? AND checkpoint_id=?",
            thread_id, checkpoint_ns, checkpoint_id,
        )
    else:
        row = await self.db.fetchone(
            "SELECT * FROM checkpoints "
            "WHERE thread_id=? AND checkpoint_ns=? "
            "ORDER BY checkpoint_id DESC LIMIT 1",
            thread_id, checkpoint_ns,
        )

    if row is None:
        return None

    writes = await self.db.fetchall(
        "SELECT task_id, channel, type, value FROM writes "
        "WHERE thread_id=? AND checkpoint_ns=? AND checkpoint_id=? "
        "ORDER BY task_id, idx",
        thread_id, checkpoint_ns, row["checkpoint_id"],
    )
    pending_writes = [
        (w["task_id"], w["channel"], self.serde.loads_typed((w["type"], w["value"])))
        for w in writes
    ]

    checkpoint = self.serde.loads_typed((row["type"], row["blob"]))
    metadata = self.serde.loads_typed((row["metadata_type"], row["metadata"]))

    parent_config = None
    if row["parent_checkpoint_id"]:
        parent_config = {
            "configurable": {
                "thread_id": thread_id,
                "checkpoint_ns": checkpoint_ns,
                "checkpoint_id": row["parent_checkpoint_id"],
            }
        }

    return CheckpointTuple(
        config={
            "configurable": {
                "thread_id": thread_id,
                "checkpoint_ns": checkpoint_ns,
                "checkpoint_id": row["checkpoint_id"],
            }
        },
        checkpoint=checkpoint,
        metadata=metadata,
        parent_config=parent_config,
        pending_writes=pending_writes,
    )
```

<Warning>
  **行键 / 索引设计对特定 ID 查找至关重要。** 如果您的存储使用不嵌入 `checkpoint_id` 的时间有序键（例如反转的时间戳），则无法按 ID 直接读取行。您必须将 `checkpoint_id` 编码到行键中，或建立二级索引。每次查找都使用值过滤扫描可以工作，但无法扩展。
</Warning>

#### list / alist

返回线程的检查点，最新的在前。遵守 `before`（只返回早于该配置 `checkpoint_id` 的检查点）和 `limit`。

#### delete\_thread / adelete\_thread

删除线程的所有检查点和写入。检查点行和写入行都必须删除。

### 行键 / 索引设计

存储和索引检查点的方式直接影响正确性和性能。

**推荐的架构（SQL）：**

```sql theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
CREATE TABLE checkpoints (
    thread_id          TEXT NOT NULL,
    checkpoint_ns      TEXT NOT NULL DEFAULT '',
    checkpoint_id      TEXT NOT NULL,   -- ULID, lexicographically sortable newest-last
    parent_checkpoint_id TEXT,
    type               TEXT,
    checkpoint         BYTEA,
    metadata           JSONB,
    PRIMARY KEY (thread_id, checkpoint_ns, checkpoint_id)
);

CREATE TABLE writes (
    thread_id     TEXT NOT NULL,
    checkpoint_ns TEXT NOT NULL DEFAULT '',
    checkpoint_id TEXT NOT NULL,
    task_id       TEXT NOT NULL,
    task_path     TEXT NOT NULL DEFAULT '',
    idx           INTEGER NOT NULL,
    channel       TEXT NOT NULL,
    type          TEXT,
    value         BYTEA,
    PRIMARY KEY (thread_id, checkpoint_ns, checkpoint_id, task_id, task_path, idx)
);
```

因为 `checkpoint_id` 是 ULID，它可以按字典序排序——值越大越新。"获取最新"是 `ORDER BY checkpoint_id DESC LIMIT 1`；"按 ID 获取"是对主键的等值查找。

**对于非 SQL 存储：** 同样的原则适用。无论您使用什么键方案，按 `(thread_id, checkpoint_ns, checkpoint_id)` 直接查找都必须是 O(1) 或接近 O(1)。避免设计成只能通过扫描线程的所有行来按 ID 查找检查点。

### 序列化

始终使用 `self.serde`（继承自 `BaseCheckpointSaver`，默认为 `JsonPlusSerializer`）来序列化检查点、写入和元数据。不要直接对元数据使用 `pickle`——它虽然能工作，但 `JsonPlusSerializer` 产生人类可读的输出，并且能更好地处理版本问题。

`JsonPlusSerializer` 自动处理所有 LangGraph 原生类型：

* `_DeltaSnapshot` —— delta 通道使用的哨兵二进制块（msgpack 扩展码 7）
* Pydantic v2 模型、数据类、numpy 数组、日期时间、枚举等

如果您编写自定义序列化器，请确保它能从 `langgraph.checkpoint.serde.types` 往返处理 `_DeltaSnapshot`。

### 扩展能力

这些方法是可选的，但可以解锁额外的 Agent Server 功能。如果您的存储后端能够高效地支持它们，请实现它们。

| 方法                       | 启用内容                                          |
| ---------------------------- | -------------------------------------------------------- |
| `adelete_for_runs`           | 多任务策略回滚                              |
| `acopy_thread`               | 高效线程分叉                                 |
| `aprune`                     | 线程历史修剪                                   |
| `aget_delta_channel_history` | 高效 delta 通道状态重建（见下文） |

Agent Server 在启动时自动检测您的检查点存储实现了哪些能力，并激活相应功能。

### Delta 通道支持

<Info>
  **DeltaChannel 处于测试阶段。** API 和磁盘表示可能在设计稳定过程中发生变化。
</Info>

`DeltaChannel` 是一种 reducer 通道，它在检查点二进制块中只存储一个哨兵值（`MISSING`），而不是完整的通道值。状态通过将祖先写入重放通过 reducer 来重建。这使得检查点二进制块对每个步骤为 O(1)，而不是对像 `messages` 这样随时间累积的通道为 O(N)。

#### 运行时需要什么

当加载一个其 delta 通道不在 `channel_values` 中的检查点时，LangGraph 会调用 `saver.get_delta_channel_history(config=config, channels=[...])`。对于每个通道，它返回：

* **`writes`** —— 祖先链中对该通道的所有写入，从最旧到最新，直到最近的快照。
* **`seed`**（可选）—— 在最近的具有快照的祖先处存储的 `_DeltaSnapshot` 二进制块；如果向上走到根都未找到快照，则为缺失。

然后运行时调用 `channel.from_checkpoint(seed)` 和 `channel.replay_writes(writes)` 来重建活跃值。

#### 默认实现

`BaseCheckpointSaver` 提供了一个默认的 `get_delta_channel_history`，可与任何正确的 `get_tuple` 实现配合：

```python theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
# Simplified from BaseCheckpointSaver
def get_delta_channel_history(self, *, config, channels):
    target = self.get_tuple(config)          # load the head checkpoint
    cursor = target.parent_config            # walk from its parent
    collected = {ch: [] for ch in channels}
    seed = {}
    remaining = set(channels)

    while cursor and remaining:
        tup = self.get_tuple(cursor)         # ← requires correct by-id lookup
        if tup is None:
            break
        for write in reversed(tup.pending_writes or []):
            if write[1] in remaining:
                collected[write[1]].append(write)
        for ch in list(remaining):
            if ch in tup.checkpoint["channel_values"]:
                seed[ch] = tup.checkpoint["channel_values"][ch]
                remaining.discard(ch)
        cursor = tup.parent_config

    return {
        ch: {"writes": list(reversed(collected[ch])), **({"seed": seed[ch]} if ch in seed else {})}
        for ch in channels
    }
```

**关键依赖：** `get_tuple(cursor)` 总是使用特定的 `checkpoint_id`（父级的 ID）调用。如果该查找返回 `None`，遍历立即停止，每个 delta 通道都重建为空——静默进行，没有错误。这就是为什么 `get_tuple` 中的特定 ID 路径必须正确。

#### 性能覆盖

默认遍历每个祖先检查点会发起一次 `get_tuple` 调用。对于查询支持良好的后端，可以覆盖 `get_delta_channel_history`（及其异步版本），用两次查询检索祖先链和写入：

```python theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
async def aget_delta_channel_history(self, *, config, channels):
    if not channels:
        return {}

    thread_id = config["configurable"]["thread_id"]
    checkpoint_ns = config["configurable"].get("checkpoint_ns", "")
    checkpoint_id = config["configurable"]["checkpoint_id"]

    # Stage 1: stream ancestors newest-first until every channel has a seed
    ancestors = await self.db.fetchall(
        "SELECT checkpoint_id, parent_checkpoint_id, type, checkpoint "
        "FROM checkpoints "
        "WHERE thread_id=? AND checkpoint_ns=? AND checkpoint_id < ? "
        "ORDER BY checkpoint_id DESC",
        thread_id, checkpoint_ns, checkpoint_id,
    )

    chain_by_ch: dict[str, list[str]] = {ch: [] for ch in channels}
    seed_by_ch: dict[str, Any] = {}
    remaining = set(channels)
    cur_id = config["configurable"]["checkpoint_id"]

    for row in ancestors:
        if not remaining:
            break
        parent_id = row["parent_checkpoint_id"]
        ckpt = self.serde.loads_typed((row["type"], row["checkpoint"]))
        cv = ckpt.get("channel_values") or {}
        for ch in list(remaining):
            chain_by_ch[ch].append(row["checkpoint_id"])
            if ch in cv:
                seed_by_ch[ch] = cv[ch]
                remaining.discard(ch)
        cur_id = parent_id

    # Stage 2: fetch writes for each channel's ancestor chain in one query
    result: dict[str, DeltaChannelHistory] = {}
    for ch in channels:
        chain = chain_by_ch[ch]
        if not chain:
            entry: DeltaChannelHistory = {"writes": []}
            if ch in seed_by_ch:
                entry["seed"] = seed_by_ch[ch]
            result[ch] = entry
            continue

        write_rows = await self.db.fetchall(
            f"SELECT checkpoint_id, task_id, idx, type, value FROM writes "
            f"WHERE thread_id=? AND checkpoint_ns=? AND channel=? "
            f"AND checkpoint_id IN ({','.join('?' * len(chain))})"
            f"ORDER BY checkpoint_id, task_id, idx",
            thread_id, checkpoint_ns, ch, *chain,
        )
        writes_by_cid: dict[str, list[PendingWrite]] = {}
        for row in write_rows:
            cid = row["checkpoint_id"]
            value = self.serde.loads_typed((row["type"], row["value"]))
            writes_by_cid.setdefault(cid, []).append((row["task_id"], ch, value))

        # chain is newest-first; iterate oldest-first to get correct replay order
        collected: list[PendingWrite] = []
        for cid in reversed(chain):
            collected.extend(writes_by_cid.get(cid, []))

        entry = {"writes": collected}
        if ch in seed_by_ch:
            entry["seed"] = seed_by_ch[ch]
        result[ch] = entry

    return result
```

#### 使用 delta 通道进行修剪

`DeltaChannel` 状态在单个检查点中不是自包含的——它依赖于回到最近 `_DeltaSnapshot` 的祖先写入链。如果您实现 `prune` 或 `delete_for_runs`，绝不能删除幸存检查点的 delta 通道所依赖的写入行。

安全选项：

1. **修剪前先遍历** —— 对于您打算保留的每个检查点，遍历其祖先链，并标记直到最近 `_DeltaSnapshot` 的所有写入行为不可删除。
2. **修剪前强制快照** —— 在您保留的检查点上重写 `channel_values[ch] = _DeltaSnapshot(reconstructed_value)`，然后自由删除祖先。
3. **跳过 delta 通道线程的修剪** —— 如果您还不需要修剪，这是最安全的短期选项。

#### 复制带有 delta 通道的线程

实现 `copy_thread` 时，请复制完整的祖先链——而不只是头部检查点。目标线程必须为每个 delta 通道拥有至少回溯到一个 `_DeltaSnapshot` 的写入行，否则这些通道在复制后会重建为空。

### 使用一致性测试套件进行测试

`langgraph-checkpoint-conformance` 根据完整契约验证您的实现，包括 delta 通道历史：

```python theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
pip install langgraph-checkpoint-conformance
```

```python theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
import asyncio
from langgraph.checkpoint.conformance import checkpointer_test, validate

@checkpointer_test(name="MyCheckpointer")
async def my_checkpointer():
    async with MyCheckpointer.create() as saver:
        yield saver

async def main():
    report = await validate(my_checkpointer)
    report.print_report()
    # Fails the process if any base capability is missing or broken
    if not report.passed_all_base():
        raise RuntimeError("Checkpointer failed conformance suite")

asyncio.run(main())
```

该套件会自动检测您的检查点存储实现了哪些扩展能力（包括 `aget_delta_channel_history`），并为每个能力运行相关测试。请在发布前将其作为 CI 的一部分运行。

***

<div className="source-links">
  <Callout icon="terminal-2">
    [Connect these docs](/use-these-docs) to Claude, VSCode, and more via MCP for real-time answers.
  </Callout>

  <Callout icon="edit">
    [Edit this page on GitHub](https://github.com/langchain-ai/docs/edit/main/src/oss/langgraph/checkpointers.mdx) or [file an issue](https://github.com/langchain-ai/docs/issues/new/choose).
  </Callout>
</div>