# INVALID_CHAT_HISTORY

此错误由预构建的 [`create_agent`](https://reference.langchain.com/python/langchain/agents/factory/create_agent) 在 `call_model` 图节点接收到格式错误的消息列表时抛出。具体来说，当存在带有 `tool_calls`（LLM 请求调用工具）的 `AIMessage`，但没有对应的 [`ToolMessage`](https://reference.langchain.com/python/langchain-core/messages/tool/ToolMessage)（工具调用的结果，用于返回给 LLM）时，该消息列表即为格式错误。

您看到此错误可能有以下几种原因：

1. 您在调用图时手动传入了一个格式错误的消息列表，例如 `graph.invoke({'messages': [AIMessage(..., tool_calls=[...])]})`
2. 图在收到来自 `tools` 节点的更新（即 [`ToolMessage`](https://reference.langchain.com/python/langchain-core/messages/tool/ToolMessage) 列表）之前被中断，
   并且您用一个既不是 None 也不是 ToolMessage 的输入调用了它，
   例如 `graph.invoke({'messages': [HumanMessage(...)]}, config)`。
   该中断可能由以下几种方式触发：
   * 您在 `create_agent` 中手动设置了 `interrupt_before = ['tools']`
   * 某个工具抛出了一个未被 [`ToolNode`](https://reference.langchain.com/python/langgraph/agents/#langgraph.prebuilt.tool_node.ToolNode)（`"tools"`）处理的错误

## 故障排查

要解决此问题，您可以执行以下任一操作：

1. 不要使用格式错误的消息列表调用图
2. 如果发生中断（手动或由于错误导致），您可以：

* 提供与现有工具调用匹配的 [`ToolMessage`](https://reference.langchain.com/python/langchain-core/messages/tool/ToolMessage) 对象，并调用 `graph.invoke({'messages': [ToolMessage(...)]})`。
  **注意**：这会将消息追加到聊天历史中，并从 START 节点开始运行图。
  * 手动更新状态并从中断处恢复图：
    1. 使用 `graph.get_state(config)` 从图状态中获取最近的消息列表
    2. 修改消息列表，要么从 AIMessages 中移除未应答的工具调用

或者添加 `tool_call_ids` 与未应答工具调用匹配的 [`ToolMessage`](https://reference.langchain.com/python/langchain-core/messages/tool/ToolMessage) 对象 3. 使用修改后的消息列表调用 `graph.update_state(config, {'messages': ...})` 4. 恢复图，例如调用 `graph.invoke(None, config)`

***

<div className="source-links">
  <Callout icon="terminal-2">
    [Connect these docs](/use-these-docs) to Claude, VSCode, and more via MCP for real-time answers.
  </Callout>

  <Callout icon="edit">
    [Edit this page on GitHub](https://github.com/langchain-ai/docs/edit/main/src/oss/langgraph/errors/INVALID_CHAT_HISTORY.mdx) or [file an issue](https://github.com/langchain-ai/docs/issues/new/choose).
  </Callout>
</div>