# Agent Chat UI

[Agent Chat UI](https://github.com/langchain-ai/agent-chat-ui) 是一个 Next.js 应用程序，为与任何 LangChain 智能体交互提供会话式界面。它支持实时聊天、工具可视化，以及时间旅行调试和状态分叉等高级功能。Agent Chat UI 可与使用 [`create_agent`](https://reference.langchain.com/python/langchain/agents/factory/create_agent) 创建的智能体无缝协作，并且只需极少的设置就能为您的智能体提供交互式体验，无论您是在本地运行还是在部署环境中运行（例如 [LangSmith](/langsmith/observability)）。

Agent Chat UI 是开源的，可以根据您的应用需求进行定制。

<Frame>
  <iframe className="w-full aspect-video rounded-xl" src="https://www.youtube.com/embed/lInrwVnZ83o?si=Uw66mPtCERJm0EjU" title="Agent Chat UI" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen />
</Frame>

<Tip>
  您可以在 Agent Chat UI 中使用生成式 UI。有关更多信息，请参阅[使用 LangGraph 实现生成式用户界面](/langsmith/generative-ui-react)。
</Tip>

### 快速开始

开始使用的最快方式是使用托管版本：

1. **访问 [Agent Chat UI](https://agentchat.vercel.app)**
2. **连接您的智能体**：输入您的部署 URL 或本地服务器地址
3. **开始聊天** - 界面将自动检测并渲染工具调用和中断

### 本地开发

要进行定制或本地开发，您可以在本地运行 Agent Chat UI：

<CodeGroup>
  ```bash Use npx theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
  # Create a new Agent Chat UI project
  npx create-agent-chat-app --project-name my-chat-ui
  cd my-chat-ui

  # Install dependencies and start
  pnpm install
  pnpm dev
  ```

  ```bash Clone repository theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
  # Clone the repository
  git clone https://github.com/langchain-ai/agent-chat-ui.git
  cd agent-chat-ui

  # Install dependencies and start
  pnpm install
  pnpm dev
  ```
</CodeGroup>

### 连接到您的智能体

Agent Chat UI 可以连接到[本地](/oss/python/langgraph/studio#set-up-local-agent-server)和[已部署的智能体](/oss/python/langgraph/deploy)。

启动 Agent Chat UI 后，您需要配置它来连接到您的智能体：

1. **Graph ID**：输入您的图名称（在 `langgraph.json` 文件的 `graphs` 下找到）
2. **部署 URL**：您的智能体服务器的端点（例如，本地开发使用 `http://localhost:2024`，或已部署智能体的 URL）
3. **LangSmith API 密钥（可选）**：添加您的 LangSmith API 密钥（如果您使用本地智能体服务器，则不需要）

配置完成后，Agent Chat UI 将自动获取并显示来自您智能体的任何被中断的线程。

<Tip>
  Agent Chat UI 对渲染工具调用和工具结果消息提供了开箱即用的支持。要自定义显示哪些消息，请参阅[在聊天中隐藏消息](https://github.com/langchain-ai/agent-chat-ui?tab=readme-ov-file#hiding-messages-in-the-chat)。
</Tip>

***

<div className="source-links">
  <Callout icon="terminal-2">
    [Connect these docs](/use-these-docs) to Claude, VSCode, and more via MCP for real-time answers.
  </Callout>

  <Callout icon="edit">
    [Edit this page on GitHub](https://github.com/langchain-ai/docs/edit/main/src/oss/langgraph/ui.mdx) or [file an issue](https://github.com/langchain-ai/docs/issues/new/choose).
  </Callout>
</div>