# INVALID_GRAPH_NODE_RETURN_VALUE

一个 LangGraph [`StateGraph`](https://reference.langchain.com/python/langgraph/graph/state/StateGraph)
从某个节点接收到了非 dict 的返回类型。以下是一个示例：

```python theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
class State(TypedDict):
    some_key: str

def bad_node(state: State):
    # Should return a dict with a value for "some_key", not a list
    return ["whoops"]

builder = StateGraph(State)
builder.add_node(bad_node)
...

graph = builder.compile()
```

调用上面的图将产生如下所示的错误：

```python theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
graph.invoke({ "some_key": "someval" });
```

```
InvalidUpdateError: Expected dict, got ['whoops']
For troubleshooting, visit: https://docs.langchain.com/oss/python/langgraph/errors/INVALID_GRAPH_NODE_RETURN_VALUE
```

图中的节点必须返回一个包含状态中定义的一个或多个键的 dict。

## 故障排查

以下方法可能有助于解决此错误：

* 如果您的节点中有复杂逻辑，请确保所有代码路径都为您的已定义状态返回合适的 dict。

***

<div className="source-links">
  <Callout icon="terminal-2">
    [Connect these docs](/use-these-docs) to Claude, VSCode, and more via MCP for real-time answers.
  </Callout>

  <Callout icon="edit">
    [Edit this page on GitHub](https://github.com/langchain-ai/docs/edit/main/src/oss/langgraph/errors/INVALID_GRAPH_NODE_RETURN_VALUE.mdx) or [file an issue](https://github.com/langchain-ai/docs/issues/new/choose).
  </Callout>
</div>