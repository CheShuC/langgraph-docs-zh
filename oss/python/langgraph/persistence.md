# 持久化

> LangGraph 的持久化层通过检查点存储（checkpointers）为 Agent 提供短期记忆，通过存储（stores）提供长期记忆。

<a id="checkpoints" />

<a id="threads" />

<a id="memory-store" />

<a id="checkpointer-libraries" />

<a id="pending-writes" />

<a id="durability-modes" />

持久化让 LangGraph 应用能够在单次图运行之外保留有用信息。当 Agent 需要继续对话、在中断后恢复、从故障中恢复或跨交互记住信息时，持久化至关重要。

LangGraph 提供两套互补的持久化系统：

* **[检查点存储](/oss/python/langgraph/checkpointers)** 将线程（thread）的图状态作为检查点（checkpoint）持久化。用于短期、线程范围内的记忆，包括对话连续性、人机协同工作流、时间旅行和容错。
* **[存储](/oss/python/langgraph/stores)** 在图状态之外持久化应用自定义数据。用于长期、跨线程的记忆，包括用户偏好、事实和共享知识。

大多数应用可以同时使用两者：一个[检查点存储](/oss/python/langgraph/checkpointers)跟踪当前线程，一个[存储](/oss/python/langgraph/stores)跨线程跟踪持久信息。

## 快速入门

使用检查点存储、存储或两者编译你的图：

```python theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
from langgraph.checkpoint.memory import InMemorySaver
from langgraph.store.memory import InMemoryStore

checkpointer = InMemorySaver()
store = InMemoryStore()

graph = builder.compile(checkpointer=checkpointer, store=store)

result = graph.invoke(
    {"messages": [{"role": "user", "content": "Hi, my name is Bob."}]},
    {"configurable": {"thread_id": "thread-1"}},
)
```

<Info>
  **Agent Server 会自动处理持久化**
  使用 [Agent Server](/langsmith/agent-server) 时，您无需手动实现或配置检查点存储或存储。服务器会在后台处理持久化基础设施。
</Info>

## 检查点存储 vs. 存储

|                | 检查点存储                                                             | 存储                                                   |
| -------------- | ---------------------------------------------------------------------------- | --------------------------------------------------- |
| 持久化内容       | 图状态快照                                                        | 应用自定义的键值数据                  |
| 作用范围          | 单个线程                                                              | 跨线程                                      |
| 记忆类型    | 短期、线程范围的记忆                                             | 长期、跨线程的记忆                      |
| 用于        | 对话连续性、人机协同、时间旅行和容错 | 用户偏好、事实和共享知识       |
| 访问模式 | 在图配置中传入 `thread_id`                                           | 从节点或应用代码读写条目 |
| 完整指南     | [检查点存储](/oss/python/langgraph/checkpointers)                         | [存储](/oss/python/langgraph/stores)              |

## 常见问题排查

### PostgresSaver：`thread_id` 过长

使用 `PostgresSaver`（或 `AsyncPostgresSaver`）时，`thread_id` 存储在长度有限的列中。如果您的 `thread_id` 超过列大小，将出现数据库错误。

**修复：** 将 `thread_id` 值保持在 255 个字符以内。如果需要确定性 ID，请使用 UUID 或哈希：

```python theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
import uuid

config = {"configurable": {"thread_id": str(uuid.uuid4())[:255]}}
```

### `MemorySaver` 不会在重启之间持久化

`MemorySaver` 和 `InMemorySaver` 将检查点存储在 RAM 中。进程重启后，所有检查点都会丢失。

**修复：** 生产环境请使用持久化检查点存储：

* `PostgresSaver`：PostgreSQL，支持异步
* `SqliteSaver`：基于本地文件的存储，适用于开发

### 检查点无限制增长

在长对话中，检查点会不断累积。这可能导致延迟和存储成本增加。

**修复：** 定期清理旧检查点或设置保留策略：

```python theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
from langgraph.checkpoint.postgres import PostgresSaver

checkpointer = PostgresSaver.from_conn_string("postgresql://...")
checkpointer.setup()  # Creates tables with indexes
# Consider adding a cron job to delete checkpoints older than N days
```

### 从父图到子图的状态访问

当子图更新状态时，父图可能不会立即看到更改。这是因为每个子图都管理自己的检查点命名空间。

**修复：** 对于需要跨图边界的数据，请使用[通过存储共享状态](/oss/python/langgraph/stores)，或配置子图写入父级检查点。

## 后续步骤

* [使用检查点存储](/oss/python/langgraph/checkpointers) 持久化并检查线程状态。
* [使用存储](/oss/python/langgraph/stores) 跨线程持久化持久数据。

***

<div className="source-links">
  <Callout icon="terminal-2">
    [Connect these docs](/use-these-docs) to Claude, VSCode, and more via MCP for real-time answers.
  </Callout>

  <Callout icon="edit">
    [Edit this page on GitHub](https://github.com/langchain-ai/docs/edit/main/src/oss/langgraph/persistence.mdx) or [file an issue](https://github.com/langchain-ai/docs/issues/new/choose).
  </Callout>
</div>