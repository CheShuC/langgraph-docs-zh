# GRAPH_RECURSION_LIMIT

您的 LangGraph [`StateGraph`](https://reference.langchain.com/python/langgraph/graph/state/StateGraph) 在达到停止条件之前触达了最大步数。
这通常是由于类似下面示例的代码导致死循环（无限循环）引起的：

```python theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
class State(TypedDict):
    some_key: str

builder = StateGraph(State)
builder.add_node("a", ...)
builder.add_node("b", ...)
builder.add_edge("a", "b")
builder.add_edge("b", "a")
...

graph = builder.compile()
```

不过，复杂的图也可能自然触达默认的递归限制。

## 故障排查

* 如果您不期望图经历很多次迭代，那么您很可能有一个循环。请检查您的逻辑中是否存在无限循环。

* 如果您有一个复杂的图，可以在调用图时将更高的 `recursion_limit` 值传入您的 `config` 对象，如下所示：

```python theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
graph.invoke({...}, {"recursion_limit": 1000})
```

***

<div className="source-links">
  <Callout icon="terminal-2">
    [Connect these docs](/use-these-docs) to Claude, VSCode, and more via MCP for real-time answers.
  </Callout>

  <Callout icon="edit">
    [Edit this page on GitHub](https://github.com/langchain-ai/docs/edit/main/src/oss/langgraph/errors/GRAPH_RECURSION_LIMIT.mdx) or [file an issue](https://github.com/langchain-ai/docs/issues/new/choose).
  </Callout>
</div>