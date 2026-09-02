# 变更日志

> 我们 JavaScript/TypeScript 包更新与改进的日志

<Callout icon="rss" color="#4F46E5" iconType="regular">
  **订阅**：我们的变更日志包含一个 [RSS feed](https://docs.langchain.com/oss/javascript/releases/changelog/rss.xml)，可以集成到 [Slack](https://slack.com/help/articles/218688467-Add-RSS-feeds-to-Slack)、[电子邮件](https://zapier.com/apps/email/integrations/rss/1441/send-new-rss-feed-entries-via-email)、类似 [Readybot](https://readybot.io/) 或 [RSS Feeds to Discord Bot](https://rss.app/en/bots/rssfeeds-discord-bot) 的 Discord 机器人以及其他订阅工具中。
</Callout>

<Update label="Mar 24, 2026" tags={["deepagents"]} rss={{ title: "Mar 24, 2026 - deepagents" }}>
  ## `deepagents` v1.9.0-alpha.0

  `deepagents` v1.9.0 的 Alpha 版本。

  * **[异步子代理](/oss/javascript/deepagents/async-subagents)**：Deep Agents 可以启动非阻塞的后台任务，因此用户可以继续与代理交互，而子代理并发地工作。子代理需要 [LangSmith Deployment](/langsmith/deployment)。

  * **[后端](/oss/javascript/deepagents/backends)协议 v2**：我们引入了一个新的 v2 后端协议（`BackendProtocolV2`），对 Deep Agents 后端接口做了向后兼容的更改。主要更改：
    * **结构化结果类型**：所有方法现在都返回结构化的 `Result` 对象（例如 `ReadResult`、`LsResult`、`GrepResult`、`GlobResult`），并通过 `error` 字段进行一致的错误处理，而不是返回原始值或抛出异常。
    * **多模态文件支持**：`read()` 返回带有 `.content` 字段的 `ReadResult`，而不是普通字符串。对于二进制文件（图像、PDF、音频、视频），完整的原始 `Uint8Array` 内容通过 `readRaw()` 返回，使代理能够原生处理多模态文件。
    * **简化的方法名称**：`lsInfo` -> `ls`，`grepRaw` -> `grep`，`globInfo` -> `glob`。
    * **向后兼容**：现有的 v1 后端可以使用 `adaptBackendProtocol` 适配到 v2 接口。v1 接口（`BackendProtocolV1`、`SandboxBackendProtocolV1`）已被弃用，但为兼容性而保留。
</Update>

<Update label="Jan 14, 2026" tags={["langgraph"]} rss={{ title: "Jan 14, 2026 - langgraph" }}>
  ## v1.1.0

  ### `@langchain/langgraph`

  隆重推出 **StateSchema**——一种更简洁、与库无关的图状态定义方式，可与任何符合 [Standard Schema](https://github.com/standard-schema/standard-schema) 的校验库配合使用。

  ### Standard JSON Schema 支持

  LangGraph 现在支持 [Standard JSON Schema](https://standardschema.dev/json-schema)，这是一个由 Zod 4、Valibot、ArkType 和其他模式库实现的开源规范。这意味着你可以使用自己偏好的校验库而不会被锁定：

  ```typescript theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
  import { z } from "zod"; // or valibot, arktype, etc.
  import { StateSchema, ReducedValue, MessagesValue } from "@langchain/langgraph";

  const AgentState = new StateSchema({
    messages: MessagesValue,
    currentStep: z.string(),
    count: z.number().default(0),
    history: new ReducedValue(
      z.array(z.string()).default(() => []),
      {
        inputSchema: z.string(),
        reducer: (current, next) => [...current, next],
      }
    ),
  });

  // Type-safe state and update types
  type State = typeof AgentState.State;
  type Update = typeof AgentState.Update;

  const graph = new StateGraph(AgentState)
    .addNode("agent", (state) => ({ count: state.count + 1 }))
    .addEdge(START, "agent")
    .addEdge("agent", END)
    .compile();
  ```

  ### 新的状态值原语

  * **ReducedValue**：使用自定义 reducer 定义用于累积值的字段。支持单独的输入和输出模式，以实现类型安全的 reducer 输入。
  * **UntrackedValue**：定义在执行期间存在但从不写入检查点的瞬时状态——适用于数据库连接、缓存或仅运行时配置。
  * **MessagesValue**：针对聊天消息预构建的 `ReducedValue`，带有标准消息 reducer。

  ### 类型辅助导出

  新增导出的类型工具，用于在图构建器之外为函数提供类型：

  * `GraphNode<Schema, Nodes?, Config?>` - 为节点函数提供类型，支持完整推断
  * `ConditionalEdgeRouter<Schema, Nodes?>` - 为条件边路由器提供类型

  ```typescript theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
  // Type standalone node functions
  const myNode: GraphNode<typeof AgentState> = (state, config) => {
    return { count: state.count + 1 };
  };

  // Use schema type helpers directly
  const processState = (state: typeof AgentState.State) => {
    console.log(state.count);
  };
  ```

  现有的 `Annotation` 和基于 zod 的 API 继续原样工作——`StateSchema` 是为偏好模式优先定义的人提供的额外选项。

  <Card title="进一步了解 StateSchema" icon="book" href="/oss/javascript/langgraph/graph-api#schema">
    查看使用 StateSchema、ReducedValue 和 UntrackedValue 定义图状态的完整文档。
  </Card>

  <Card title="了解类型工具" icon="code" href="/oss/javascript/langgraph/graph-api#type-utilities">
    使用 GraphNode 和 ConditionalEdgeRouter 在图构建器之外为函数提供类型。
  </Card>
</Update>

<Update label="Dec 12, 2025" tags={["langchain", "@langchain/openai", "@langchain/anthropic", "@langchain/ollama", "@langchain/community", "@langchain/xai", "@langchain/tavily", "@langchain/mongodb", "@langchain/mcp-adapters", "@langchain/google-common", "@langchain/core"]} rss={{ title: "Dec 12, 2025 - langchain" }}>
  ## v1.2.0

  ### `langchain`

  * [结构化输出](/oss/javascript/langchain/structured-output)：增加了在使用 `providerStrategy` 进行结构化输出时手动设置 `strict` 模式的能力。

  ### `@langchain/openai`

  * **新的提供商内置工具**：支持由提供商在服务端执行的文件搜索、网页搜索、代码解释器、图像生成、计算机使用、shell 和 MCP 连接器工具。请参阅[服务端工具使用](/oss/javascript/langchain/tools#server-side-tool-use)和 [OpenAI](/oss/javascript/integrations/chat/openai) 聊天集成。
  * **内容审核**：`ChatOpenAI` 上新增了 `moderateContent` 选项，用于检测和处理不安全内容。
  * 对于 GPT-5.2 Pro 模型，优先使用 responses API。

  ## v1.3.0

  ### `@langchain/anthropic`

  * **新的提供商内置工具**：支持由提供商在服务端执行的文本编辑器、网页抓取、计算机使用、工具搜索和 MCP 工具集等工具。请参阅[服务端工具使用](/oss/javascript/langchain/tools#server-side-tool-use)和 [Anthropic](/oss/javascript/integrations/chat/anthropic) 聊天集成。
  * 公开了 `ChatAnthropicInput` 类型以提升类型安全性。

  ## v1.1.0

  ### `@langchain/ollama`

  * **原生结构化输出**：通过 `withStructuredOutput` 增加了对原生结构化输出的支持。
  * 支持自定义 `baseUrl` 配置。

  ## v1.0.0

  ### `@langchain/community`

  * Jira 文档加载器已更新为使用 v3 API。
  * LanceDB：增加了 `similaritySearch()` 和 `similaritySearchWithScore()` 支持。
  * Elasticsearch 混合搜索支持。
  * 新的 `GoogleCalendarDeleteTool`。
  * 针对 LlamaCppEmbeddings、PrismaVectorStore、IBM WatsonX 的各种缺陷修复，以及安全改进。

  ### 其他包

  * **@langchain/xai：** 原生 Live Search 支持。
  * **@langchain/tavily：** 增加了 Tavily 的研究端点。
  * **@langchain/mongodb：** 新的 MongoDB LLM 缓存。
  * **@langchain/mcp-adapters：** 增加了 `onConnectionError` 选项。
  * **@langchain/google-common：** 在 `withStructuredOutput` 中支持 `jsonSchema` 方法。
  * **@langchain/core：** 安全修复、Mermaid 图中更好的子图嵌套、运行 ID 使用 UUID7。
</Update>

<Update label="Nov 25, 2025" tags={["langchain"]} rss={{ title: "Nov 25, 2025 - langchain" }}>
  ## v1.1.0

  * [模型配置（Model profiles）](/oss/javascript/langchain/models#model-profiles)：聊天模型现在通过 `.profile` getter 公开支持的特性和能力。这些数据来自 [models.dev](https://models.dev)，一个提供模型能力数据的开源项目。
  * [模型重试中间件](/oss/javascript/langchain/middleware/built-in#model-retry)：新的中间件，用于以可配置的指数退避自动重试失败的模型调用，提高代理可靠性。
  * [内容审核中间件](/oss/javascript/langchain/middleware/built-in#provider-specific-middleware)：用于检测和处理代理交互中不安全内容的 OpenAI 内容审核中间件。支持检查用户输入、模型输出和工具结果。
  * [摘要中间件](/oss/javascript/langchain/middleware/built-in#summarization)：已更新为使用模型配置支持灵活的触发点，以实现上下文感知的摘要。
  * [结构化输出](/oss/javascript/langchain/structured-output)：`ProviderStrategy` 支持（原生结构化输出）现在可以从模型配置中推断。
  * [`createAgent` 的 `SystemMessage`](/oss/javascript/langchain/middleware/custom#dynamic-prompt)：支持将 `SystemMessage` 实例直接传递给 `createAgent` 的 `systemPrompt` 参数，以及新的用于扩展系统消息的 `concat` 方法。可启用缓存控制和结构化内容块等高级功能。
  * [动态系统提示词中间件](/oss/javascript/langchain/short-term-memory)：`dynamicSystemPromptMiddleware` 的返回值现在纯粹是叠加式的。当返回 [`SystemMessage`](https://reference.langchain.com/javascript/langchain-core/messages/SystemMessage) 或 `string` 时，它们会与现有系统消息合并而不是替换，从而更容易组合多个修改提示词的中间件。
  * **兼容性改进**：修复了结构化输出和工具模式中 Zod v4 校验错误的错误处理，确保详细错误消息能够正确显示。
</Update>

<Update label="Oct 20, 2025" tags={["langchain", "langgraph"]} rss={{ title: "Oct 20, 2025 - langchain" }}>
  ## v1.0.0

  ### `langchain`

  * [发布说明](/oss/javascript/releases/langchain-v1)
  * [迁移指南](/oss/javascript/migrate/langchain-v1)

  ### `langgraph`

  * [发布说明](/oss/javascript/releases/langgraph-v1)
  * [迁移指南](/oss/javascript/migrate/langgraph-v1)

  <Callout icon="speakerphone" color="#4F46E5" iconType="regular">
    如果你遇到任何问题或有反馈，请[提交 issue](https://github.com/langchain-ai/docs/issues/new?template=01-langchain.yml)以便我们改进。要查看 v0.x 文档，请[访问存档内容](https://github.com/langchain-ai/langchainjs/tree/v0.3/docs/core_docs/docs)。
  </Callout>
</Update>

***

<div className="source-links">
  <Callout icon="terminal-2">
    [连接这些文档](/use-these-docs) 到 Claude、VSCode 等，通过 MCP 获得实时答案。
  </Callout>

  <Callout icon="edit">
    [在 GitHub 上编辑此页面](https://github.com/langchain-ai/docs/edit/main/src/oss/javascript/releases/changelog.mdx)或[提交 issue](https://github.com/langchain-ai/docs/issues/new/choose)。
  </Callout>
</div>