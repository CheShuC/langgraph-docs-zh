# MULTIPLE_SUBGRAPHS

当您在节点内[多次调用子图](/oss/python/langgraph/use-subgraphs#call-a-subgraph-inside-a-node)，并且该子图是以 `checkpointer=True`（continuations 模式）编译时，就会发生此错误。

## 故障排查

根据您的需求选择以下方案之一：

1. **不需要中断？** 使用 `checkpointer=False` 完全退出检查点持久化：
   ```python theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
   subgraph = subgraph_builder.compile(checkpointer=False)
   ```

2. **需要中断但不需要跨调用持久化？** 通过省略 `checkpointer` 使用默认的继承模式：
   ```python theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
   subgraph = subgraph_builder.compile()
   ```
   每次调用都会获得唯一的命名空间，因此并行执行可以正常工作。子图每次都会全新启动，但可以使用 `interrupt()`。

3. **需要跨调用持久化？** 使用 `checkpointer=True`。LangGraph 会为每次调用分配一个基于位置的命名空间后缀（`calling_node`、`calling_node|1` 等）以防止冲突。如需稳定的、基于名称的命名空间，请为每个子图包裹一个唯一的节点名称——参见[并行子图](/oss/python/langgraph/use-subgraphs#subgraph-persistence)。

## 相关

* [子图持久化](/oss/python/langgraph/use-subgraphs#subgraph-persistence) — 检查点存储模式的完整对比
* [持久化](/oss/python/langgraph/persistence) — 检查点存储在 LangGraph 中的工作原理

***

<div className="source-links">
  <Callout icon="terminal-2">
    [Connect these docs](/use-these-docs) to Claude, VSCode, and more via MCP for real-time answers.
  </Callout>

  <Callout icon="edit">
    [Edit this page on GitHub](https://github.com/langchain-ai/docs/edit/main/src/oss/langgraph/errors/MULTIPLE_SUBGRAPHS.mdx) or [file an issue](https://github.com/langchain-ai/docs/issues/new/choose).
  </Callout>
</div>