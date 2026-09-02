# 存储

> LangGraph 存储提供跨线程的长期记忆，补充了每线程的检查点存储持久化。

存储允许 Agent 跨线程持久化信息，包括用户偏好、积累的知识以及应该超越单次对话而存续的事实。与[检查点存储](/oss/python/langgraph/checkpointers)（保存限定于单个线程的完整图状态）不同，存储保存可从任何线程访问的任意键值数据。

<img src="https://mintcdn.com/langchain-5e9cc07a/dL5Sn6Cmy9pwtY0V/oss/images/shared_state.png?fit=max&auto=format&n=dL5Sn6Cmy9pwtY0V&q=85&s=354526fb48c5eb11b4b2684a2df40d6c" alt="Model of shared state" width="1482" height="777" data-path="oss/images/shared_state.png" />

<Info>
  **Agent Server 会自动处理存储**
  使用 [Agent Server](/langsmith/agent-server) 时，您无需手动实现或配置存储。API 会在后台为您处理所有存储基础设施。
</Info>

<Note>
  [InMemoryStore](https://reference.langchain.com/python/langchain-core/stores/InMemoryStore) 适用于开发和测试。生产环境请使用持久化存储，如 `PostgresStore`、`MongoDBStore`、`RedisStore` 或 `UpstashStore`。所有实现都扩展了 [BaseStore](https://reference.langchain.com/python/langchain-core/stores/BaseStore)，这是在节点函数签名中使用的类型注解。
</Note>

<Note>
  有关可用提供程序的完整列表，请参见[存储集成](/oss/python/integrations/long-term-memory/index)。
</Note>

## 基本用法

以下代码片段展示了不借助 LangGraph 单独使用 [InMemoryStore](https://reference.langchain.com/python/langchain-core/stores/InMemoryStore)：

```python theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
from langgraph.store.memory import InMemoryStore
store = InMemoryStore()
```

记忆通过 `tuple` 命名空间进行区分，在下面的示例中是 `(<user_id>, "memories")`。命名空间可以是任意长度并表示任何内容，不必与用户相关。

```python theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
user_id = "1"
namespace_for_memory = (user_id, "memories")
```

使用 `store.put` 方法将记忆保存到存储中的命名空间。指定上面定义的命名空间，以及记忆的键值对：键只是记忆的唯一标识符（`memory_id`），值（一个字典）就是记忆本身。

```python theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
memory_id = str(uuid.uuid4())
memory = {"food_preference" : "I like pizza"}
store.put(namespace_for_memory, memory_id, memory)
```

使用 `store.search` 方法从命名空间读出记忆，它会以列表形式返回给定用户的记忆，最多返回 `limit` 参数指定的数量（默认 `10`）。对于 `InMemoryStore`，条目按插入顺序返回，因此最近的记忆在列表末尾；其他后端可能以不同的顺序排列记忆（请参见[列出命名空间中的条目](#listing-items-in-a-namespace)）。

```python theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
memories = store.search(namespace_for_memory)
memories[-1].dict()
{'value': {'food_preference': 'I like pizza'},
 'key': '07e0caf4-1631-47b7-b15f-65515d4c1843',
 'namespace': ['1', 'memories'],
 'created_at': '2024-10-02T17:22:31.590602+00:00',
 'updated_at': '2024-10-02T17:22:31.590605+00:00'}
```

每种记忆类型都是一个带有特定属性的 Python 类（[`Item`](https://langchain-ai.github.io/langgraph/reference/store/#langgraph.store.base.Item)）。我们可以通过 `.dict` 将其转换为字典来访问。

它拥有的属性是：

* `value`：此记忆的值（本身是一个字典）

* `key`：此记忆在此命名空间中的唯一键

* `namespace`：一个字符串元组，此记忆类型的命名空间

  <Note>
    虽然类型是 `tuple[str, ...]`，但在转换为 JSON 时可能会序列化为列表（例如 `['1', 'memories']`）。
  </Note>

* `created_at`：此记忆创建的时间戳

* `updated_at`：此记忆更新的时间戳

## 列出命名空间中的条目

不带 `query` 和 `filter` 调用 [`store.search`](https://reference.langchain.com/python/langgraph/store/#langgraph.store.base.BaseStore.search)（或异步的 [`store.asearch`](https://reference.langchain.com/python/langgraph/store/#langgraph.store.base.BaseStore.asearch)）会返回存储在 `namespace_prefix` 下的条目，最多 `limit` 个。当您不需要语义排序时，可用它来枚举命名空间中的所有内容。

```python theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
# Return up to 100 items stored under ("alice", "memories").
items = store.search(("alice", "memories"), limit=100)
```

需要注意三个行为：

* **`namespace_prefix` 按前缀匹配，而非精确匹配。** `("alice",)` 也会返回 `("alice", "memories")`、`("alice", "preferences")` 等下的条目。要限制到单个层级，请传入完整命名空间或在客户端按 `item.namespace` 过滤返回的条目。
* **超过 `limit` 的结果会被静默截断。** 没有溢出信号——请将 `limit` 设置为高于您的预期最大值，或使用 `offset` 分页。
* **默认排序取决于存储后端。** `PostgresStore` 和 `AsyncPostgresStore` 按 `updated_at` 降序返回结果（最近更新的在前）。`InMemoryStore` 按插入顺序返回结果（最近插入的在末尾）。不要依赖跨实现的特定顺序；如果顺序很重要，请在客户端按 `item.updated_at` 排序。

要分页浏览大型命名空间：

```python theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
page_size = 50
offset = 0
while True:
    page = store.search(("alice", "memories"), limit=page_size, offset=offset)
    if not page:
        break
    for item in page:
        pass
    offset += page_size
```

要发现哪些命名空间存在（例如，在列出每个用户的记忆之前遍历所有用户），请使用 [`store.list_namespaces`](https://reference.langchain.com/python/langgraph/store/#langgraph.store.base.BaseStore.list_namespaces) 或 [`store.alist_namespaces`](https://reference.langchain.com/python/langgraph/store/#langgraph.store.base.BaseStore.alist_namespaces)：

```python theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
# All namespaces that start with ("alice",), truncated to two levels deep.
namespaces = store.list_namespaces(prefix=("alice",), max_depth=2)
```

## 语义搜索

除了简单检索之外，存储还支持语义搜索，允许您基于含义而不是精确匹配来查找记忆。要启用此功能，请使用嵌入模型配置存储：

```python theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
from langchain.embeddings import init_embeddings

store = InMemoryStore(
    index={
        "embed": init_embeddings("openai:text-embedding-3-small"),  # Embedding provider
        "dims": 1536,                              # Embedding dimensions
        "fields": ["food_preference", "$"]              # Fields to embed
    }
)
```

现在搜索时，您可以使用自然语言查询来查找相关记忆：

```python theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
# Find memories about food preferences
# (This can be done after putting memories into the store)
memories = store.search(
    namespace_for_memory,
    query="What does the user like to eat?",
    limit=3  # Return top 3 matches
)
```

您可以通过配置 `fields` 参数或在存储记忆时指定 `index` 参数来控制记忆的哪些部分被嵌入：

```python theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
# Store with specific fields to embed
store.put(
    namespace_for_memory,
    str(uuid.uuid4()),
    {
        "food_preference": "I love Italian cuisine",
        "context": "Discussing dinner plans"
    },
    index=["food_preference"]  # Only embed "food_preferences" field
)

# Store without embedding (still retrievable, but not searchable)
store.put(
    namespace_for_memory,
    str(uuid.uuid4()),
    {"system_info": "Last updated: 2024-01-01"},
    index=False
)
```

## 在 LangGraph 中使用

存储与检查点存储配合使用：如上所述，检查点存储将状态保存到线程中，而存储允许您存储任意信息以便*跨*线程访问。按照以下方式同时使用检查点存储和存储编译图。

```python theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
from dataclasses import dataclass
from langgraph.checkpoint.memory import InMemorySaver

@dataclass
class Context:
    user_id: str

# We need this because we want to enable threads (conversations)
checkpointer = InMemorySaver()

# ... Define the graph ...

# Compile the graph with the checkpointer and store
builder = StateGraph(MessagesState, context_schema=Context)
# ... add nodes and edges ...
graph = builder.compile(checkpointer=checkpointer, store=store)
```

然后像之前一样使用 `thread_id` 调用图，同时使用 `user_id`，它作为该特定用户的记忆命名空间。

```python theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
# Invoke the graph
config = {"configurable": {"thread_id": "1"}}

# First let's just say hi to the AI
for update in graph.stream(
    {"messages": [{"role": "user", "content": "hi"}]},
    config,
    stream_mode="updates",
    context=Context(user_id="1"),
):
    print(update)
```

您可以使用 `Runtime` 对象从*任何节点*访问存储和 `user_id`。当您在节点函数中添加 `Runtime` 作为参数时，LangGraph 会自动注入它。您可以用它来保存记忆：

```python theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
from langgraph.runtime import Runtime
from dataclasses import dataclass

@dataclass
class Context:
    user_id: str

async def update_memory(state: MessagesState, runtime: Runtime[Context]):

    # Get the user id from the runtime context
    user_id = runtime.context.user_id

    # Namespace the memory
    namespace = (user_id, "memories")

    # ... Analyze conversation and create a new memory

    # Create a new memory ID
    memory_id = str(uuid.uuid4())

    # We create a new memory
    await runtime.store.aput(namespace, memory_id, {"memory": memory})

```

您还可以从任何节点访问存储，并使用 `store.search` 方法获取记忆。记忆以对象列表形式返回，可以转换为字典。

```python theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
memories[-1].dict()
{'value': {'food_preference': 'I like pizza'},
 'key': '07e0caf4-1631-47b7-b15f-65515d4c1843',
 'namespace': ['1', 'memories'],
 'created_at': '2024-10-02T17:22:31.590602+00:00',
 'updated_at': '2024-10-02T17:22:31.590605+00:00'}
```

您可以在模型调用中访问和使用这些记忆。

```python theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
from dataclasses import dataclass
from langgraph.runtime import Runtime

@dataclass
class Context:
    user_id: str

async def call_model(state: MessagesState, runtime: Runtime[Context]):
    # Get the user id from the runtime context
    user_id = runtime.context.user_id

    # Namespace the memory
    namespace = (user_id, "memories")

    # Search based on the most recent message
    memories = await runtime.store.asearch(
        namespace,
        query=state["messages"][-1].content,
        limit=3
    )
    info = "\n".join([d.value["memory"] for d in memories])

    # ... Use memories in the model call
```

如果您创建一个新线程，只要 `user_id` 相同，您仍然可以访问相同的记忆。

```python theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
# Invoke the graph on a new thread
config = {"configurable": {"thread_id": "2"}}

# Let's say hi again
for update in graph.stream(
    {"messages": [{"role": "user", "content": "hi, tell me about my memories"}]},
    config,
    stream_mode="updates",
    context=Context(user_id="1"),
):
    print(update)
```

当您本地使用 LangSmith（例如在 [Studio](/langsmith/studio) 中）或[托管版](/langsmith/platform-setup)时，基础存储默认可用，您无需在图编译期间指定它。但是，要启用语义搜索，您**确实**需要在 `langgraph.json` 文件中配置索引设置。例如：

```json theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
{
    ...
    "store": {
        "index": {
            "embed": "openai:text-embeddings-3-small",
            "dims": 1536,
            "fields": ["$"]
        }
    }
}
```

有关更多详细信息和配置选项，请参见[部署指南](/langsmith/semantic-search)。

## 构建自定义存储

要使用内置实现之外的存储后端，请继承 [BaseStore](https://reference.langchain.com/python/langchain-core/stores/BaseStore) 并实现其必需方法。内置的 [InMemoryStore](https://reference.langchain.com/python/langchain-core/stores/InMemoryStore) 是最简单的参考实现。

### 基础契约

所有五个异步方法都是必需的。同步对应方法（`put`、`get`、`delete`、`search`、`list_namespaces`）是可选的，但推荐用于兼容同步图执行。

| 方法                                                                               | 描述                                                         |
| ------------------------------------------------------------------------------------ | ------------------------------------------------------------------- |
| `aput(namespace, key, value, index=None)`                                            | 存储或覆盖单个条目                                    |
| `aget(namespace, key)`                                                               | 按键检索单个条目；缺失时返回 `None`             |
| `adelete(namespace, key)`                                                            | 删除单个条目                                                |
| `asearch(namespace_prefix, *, query=None, filter=None, limit=10, offset=0)`          | 在命名空间前缀下搜索条目；可选地按语义查询 |
| `alist_namespaces(*, prefix=None, suffix=None, max_depth=None, limit=100, offset=0)` | 列出匹配前缀/后缀模式的命名空间                    |

实现前请查找准确的签名：

```python theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
import inspect
from langgraph.store.base import BaseStore
print(inspect.getsource(BaseStore))
```

### 命名空间设计

命名空间是字符串元组，例如 `("user_id", "memories")`。存储实现必须支持：

* **前缀匹配**：`asearch(("alice",))` 返回 `("alice",)`、`("alice", "memories")` 以及任何其他子命名空间下的条目。
* **精确键查找**：`aget(("alice", "memories"), "some-key")` 必须是 O(1) 或接近 O(1)。

对于 SQL 后端，常见的架构是：

```sql theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
CREATE TABLE store_items (
    namespace   TEXT[] NOT NULL,
    key         TEXT NOT NULL,
    value       JSONB NOT NULL,
    created_at  TIMESTAMPTZ DEFAULT now(),
    updated_at  TIMESTAMPTZ DEFAULT now(),
    PRIMARY KEY (namespace, key)
);

CREATE INDEX ON store_items USING gin(namespace);
```

### 序列化

存储值是普通的 Python 字典——不需要特殊的序列化器。使用 `json.dumps` / `json.loads` 序列化，或直接使用 JSONB 列。不要存储不可 JSON 序列化的原始 Python 对象。

### 语义搜索支持

如果您的后端支持向量搜索，请实现 `asearch` 上的 `query` 参数：

* 接受一个 `query: str | None` 参数。
* 当 `query` 不为 `None` 时，对其进行嵌入并按余弦相似度排序结果。
* 提供 `query` 时，结果应在每个 `Item` 上包含 `score` 字段。

如果您的后端不支持向量搜索，则在传入 `query` 时抛出 `NotImplementedError`。

### 测试

目前没有针对自定义存储的一致性测试套件。请以 [InMemoryStore](https://reference.langchain.com/python/langchain-core/stores/InMemoryStore) 为参考进行测试：

```python theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
import pytest
from langgraph.store.memory import InMemoryStore
from your_module import YourStore

@pytest.fixture
async def store():
    async with YourStore.create() as s:
        yield s

@pytest.fixture
def reference():
    return InMemoryStore()

async def test_put_and_get(store, reference):
    ns = ("test", "ns")
    for s in [store, reference]:
        await s.aput(ns, "k1", {"val": 1})
        item = await s.aget(ns, "k1")
        assert item is not None
        assert item.value == {"val": 1}

async def test_delete(store, reference):
    ns = ("test", "ns")
    for s in [store, reference]:
        await s.aput(ns, "k1", {"val": 1})
        await s.adelete(ns, "k1")
        assert await s.aget(ns, "k1") is None

async def test_search_prefix(store, reference):
    for s in [store, reference]:
        await s.aput(("user", "memories"), "m1", {"text": "likes pizza"})
        results = await s.asearch(("user",))
        assert any(r.key == "m1" for r in results)
```

### 后续步骤

* [将自定义存储添加到 Agent Server](/langsmith/custom-store) —— 部署您的实现
* [检查点存储](/oss/python/langgraph/checkpointers) —— 线程范围的状态持久化

***

<div className="source-links">
  <Callout icon="terminal-2">
    [Connect these docs](/use-these-docs) to Claude, VSCode, and more via MCP for real-time answers.
  </Callout>

  <Callout icon="edit">
    [Edit this page on GitHub](https://github.com/langchain-ai/docs/edit/main/src/oss/langgraph/stores.mdx) or [file an issue](https://github.com/langchain-ai/docs/issues/new/choose).
  </Callout>
</div>