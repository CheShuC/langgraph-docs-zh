# 安装 LangGraph

要安装 LangGraph 基础包：

<CodeGroup>
  ```bash pip theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
  pip install -U langgraph
  ```

  ```bash uv theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
  uv add langgraph
  ```
</CodeGroup>

使用 LangGraph 时，你通常需要访问 LLM 并定义工具。
你可以以任何你认为合适的方式来实现。

一种实现方式（文档中会采用）是使用 [LangChain](/oss/python/langchain/overview)。

使用以下命令安装 LangChain：

<CodeGroup>
  ```bash pip theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
  pip install -U langchain
  # Requires Python 3.10+
  ```

  ```bash uv theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
  uv add langchain
  # Requires Python 3.10+
  ```
</CodeGroup>

如需使用特定的 LLM 提供商包，你需要单独安装它们。

有关各提供商的安装说明，请参阅[集成](/oss/python/integrations/providers/overview)页面。

***

<div className="source-links">
  <Callout icon="terminal-2">
    [通过 MCP 将这些文档连接到 Claude、VSCode 等](/use-these-docs)，获取实时解答。
  </Callout>

  <Callout icon="edit">
    [在 GitHub 上编辑此页面](https://github.com/langchain-ai/docs/edit/main/src/oss/langgraph/install.mdx) 或[提交问题](https://github.com/langchain-ai/docs/issues/new/choose)。
  </Callout>
</div>