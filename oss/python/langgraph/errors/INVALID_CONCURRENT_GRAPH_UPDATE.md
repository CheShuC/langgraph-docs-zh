# INVALID_CONCURRENT_GRAPH_UPDATE

一个 LangGraph [`StateGraph`](https://reference.langchain.com/python/langgraph/graph/state/StateGraph) 从多个节点接收到了对某个不支持并发更新的状态属性的并发更新。

出现这种情况的一种方式是：如果您在图中使用了 [扇出（fanout）](/oss/python/langgraph/use-graph-api#map-reduce-and-the-send-api)
或其他并行执行，并且您定义了如下所示的图：

```python theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
class State(TypedDict):
    some_key: str  # [!code highlight]

def node(state: State):
    return {"some_key": "some_string_value"}

def other_node(state: State):
    return {"some_key": "some_string_value"}


builder = StateGraph(State)
builder.add_node(node)
builder.add_node(other_node)
builder.add_edge(START, "node")
builder.add_edge(START, "other_node")
graph = builder.compile()
```

如果上面图中的某个节点返回 `{ "some_key": "some_string_value" }`，这将用 `"some_string_value"` 覆盖 `"some_key"` 的状态值。
但是，如果在单步内（例如扇出中）有多个节点都为 `"some_key"` 返回值，图将抛出此错误，因为
在如何更新内部状态上存在不确定性。

要解决这个问题，您可以定义一个合并多个值的 reducer（归约器）：

```python theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
import operator
from typing import Annotated

class State(TypedDict):
    # The operator.add reducer fn makes this append-only  # [!code highlight]
    some_key: Annotated[list, operator.add]  # [!code highlight]
```

这将允许您定义逻辑来处理多个并行执行的节点返回同一个键的情况。

## 故障排查

以下方法可能有助于解决此错误：

* 如果您的图并行执行节点，请确保您已使用 reducer 定义了相关的状态键。

***

<div className="source-links">
  <Callout icon="terminal-2">
    [Connect these docs](/use-these-docs) to Claude, VSCode, and more via MCP for real-time answers.
  </Callout>

  <Callout icon="edit">
    [Edit this page on GitHub](https://github.com/langchain-ai/docs/edit/main/src/oss/langgraph/errors/INVALID_CONCURRENT_GRAPH_UPDATE.mdx) or [file an issue](https://github.com/langchain-ai/docs/issues/new/choose).
  </Callout>
</div>