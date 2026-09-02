# MISSING_CHECKPOINTER

您正在尝试使用 LangGraph 内置的持久化功能，但没有提供检查点存储（checkpointer）。

当 [`StateGraph`](https://reference.langchain.com/python/langgraph/graph/state/StateGraph) 或 [`@entrypoint`](https://reference.langchain.com/python/langgraph/func/entrypoint) 的 `compile()` 方法中缺少 `checkpointer` 时，就会发生这种情况。

## 故障排查

以下方法可能有助于解决此错误：

* 初始化一个检查点存储，并将其传递给 [`StateGraph`](https://reference.langchain.com/python/langgraph/graph/state/StateGraph) 或 [`@entrypoint`](https://reference.langchain.com/python/langgraph/func/entrypoint) 的 `compile()` 方法。

```python theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
from langgraph.checkpoint.memory import InMemorySaver
checkpointer = InMemorySaver()

# Graph API
graph = StateGraph(...).compile(checkpointer=checkpointer)

# Functional API
@entrypoint(checkpointer=checkpointer)
def workflow(messages: list[str]) -> str:
    ...
```

* 使用 LangGraph API，这样您就无需手动实现或配置检查点存储。API 会为您处理所有持久化基础设施。

## 相关

* 阅读更多关于 [持久化](/oss/python/langgraph/persistence) 的内容。

***

<div className="source-links">
  <Callout icon="terminal-2">
    [Connect these docs](/use-these-docs) to Claude, VSCode, and more via MCP for real-time answers.
  </Callout>

  <Callout icon="edit">
    [Edit this page on GitHub](https://github.com/langchain-ai/docs/edit/main/src/oss/langgraph/errors/MISSING_CHECKPOINTER.mdx) or [file an issue](https://github.com/langchain-ai/docs/issues/new/choose).
  </Callout>
</div>