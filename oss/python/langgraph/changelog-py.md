# 变更日志

> 我们 Python 包更新与改进的日志

<Callout icon="rss" color="#4F46E5" iconType="regular">
  **订阅**：我们的变更日志包含一个 [RSS feed](https://docs.langchain.com/oss/python/releases/changelog/rss.xml)，可以集成到 [Slack](https://slack.com/help/articles/218688467-Add-RSS-feeds-to-Slack)、[电子邮件](https://zapier.com/apps/email/integrations/rss/1441/send-new-rss-feed-entries-via-email)、类似 [Readybot](https://readybot.io/) 或 [RSS Feeds to Discord Bot](https://rss.app/en/bots/rssfeeds-discord-bot) 的 Discord 机器人以及其他订阅工具中。
</Callout>

<Update label="Jul 24, 2026" tags={["deepagents"]} rss={{ title: "Jul 24, 2026 - deepagents" }}>
  ## `deepagents` v0.7.0

  默认情况下，更精简、更可配置的 harness。在默认代理的一个回合中，输入令牌减少 **65%**（5,395 → 1,895），并针对我们[改进后的评估套件](https://www.langchain.com/blog/how-we-benchmark-deep-agents)进行验证，且没有任何质量回退。

  ### 优化

  * **默认精简提示词**：编写的基座提示词从空开始，重复工具模式的工具使用说明文本已被精简。仅就默认代理的工具模式而言，总描述令牌减少 **43%**（4,005 → 2,302）；结合空基座提示词和可选启用的 todos，默认代理一个回合的输入令牌减少 **65%**（5,395 → 1,895）。工具行为不变。（[#4859](https://github.com/langchain-ai/deepagents/pull/4859), [#4979](https://github.com/langchain-ai/deepagents/pull/4979), [#5009](https://github.com/langchain-ai/deepagents/pull/5009)）

  ### 功能

  * **[覆盖默认中间件实例](/oss/python/deepagents/customization#middleware)**：`.name` 与内置中间件匹配的 `middleware=`（或子代理 `middleware`）实例现在会就地替换该默认实例，而不会因重名而报错。例如，传入你自己的 `SummarizationMiddleware(...)` 来更改令牌触发条件或摘要模型，而无需禁用内置默认项。（[#4251](https://github.com/langchain-ai/deepagents/pull/4251)）
  * **文件系统工具**：新的 [`delete`](/oss/python/deepagents/tools#built-in-harness-tools) 工具可删除文件或递归删除目录（[#3659](https://github.com/langchain-ai/deepagents/pull/3659), [#3851](https://github.com/langchain-ai/deepagents/pull/3851)）；`write_file` 现在会覆盖现有文件而不是报错（[#4109](https://github.com/langchain-ai/deepagents/pull/4109)）；`FilesystemMiddleware` 接受一个[工具允许列表](/oss/python/deepagents/overview#virtual-filesystem-access)以仅暴露选定的内置工具（[#4325](https://github.com/langchain-ai/deepagents/pull/4325), [#4698](https://github.com/langchain-ai/deepagents/pull/4698)）；读取和搜索针对开放模型进行了调优——分页的 `read_file` 报告总行数、剩余行数以及下一个 `offset`（[#4540](https://github.com/langchain-ai/deepagents/pull/4540)），`grep`/`glob` 返回带 `truncated` 标志的部分结果，而不是在大型目录树上挂起（[#4063](https://github.com/langchain-ai/deepagents/pull/4063)），`grep` 增加了 1,000 条匹配上限，并支持流式输出和可选的上下文行（[#4570](https://github.com/langchain-ai/deepagents/pull/4570), [#4706](https://github.com/langchain-ai/deepagents/pull/4706)）。
  * **更多提示缓存支持**：通过 `deepagents[aws]` 附加依赖实现 Bedrock 提示缓存（[#4108](https://github.com/langchain-ai/deepagents/issues/4108)），以及自动的 Fireworks 提示缓存会话亲和性（[#4598](https://github.com/langchain-ai/deepagents/pull/4598)）。
  * **NVIDIA 支持**：内置的 Nemotron 3 Ultra harness 配置以及 NIM 应用来源归属。（[#4192](https://github.com/langchain-ai/deepagents/pull/4192), [#4455](https://github.com/langchain-ai/deepagents/pull/4455)）

  ### 破坏性变更

  * **规划 todos 改为可选启用**：`create_deep_agent` 默认不再包含 `TodoListMiddleware`，因此 `write_todos` 工具、`todos` 状态通道和 todo 规划提示词都将不存在，除非使用 `middleware=[TodoListMiddleware()]` 恢复。（OpenAI Codex harness 配置仍会自动启用。）（[#4929](https://github.com/langchain-ai/deepagents/pull/4929)）
  * **移除后端兼容性填充层（shim）**：传递具体的 `BackendProtocol` 实例而不是工厂，使用显式 `namespace` 配置 `StoreBackend`，并使用当前的 `ls` / `glob` / `grep` / `ReadResult` API。被移除的符号包括 `BackendFactory`、`BACKEND_TYPES`、`FileFormat` 和 `Unset`。新文件存储字符串类型的 `FileData.content`；旧的 `list[str]` 内容仍可读取，并在下次写入时转换。（[#4541](https://github.com/langchain-ai/deepagents/pull/4541)）
  * **输出格式更改**：空的 `ls` / `glob` 输出现在是 `No files found` 而不是 `[]`，且 `read_file` 不再渲染固定宽度的 `cat -n` 风格侧栏——请更新任何解析原始工具输出的解析器。（[#4561](https://github.com/langchain-ai/deepagents/pull/4561)）

  将以下提示词复制到你的 AI 编码助手中，以针对这些破坏性变更迁移代码库：

  <Prompt description="Migrate a deepagents codebase from v0.6.x to v0.7." icon="arrow-right" actions={["copy"]}>
    迁移此代码库，从 `deepagents` v0.6.x 迁移到 v0.7，以应对以下破坏性变更：

    1. `create_deep_agent` 默认不再包含 `TodoListMiddleware`。如果此代码库依赖 `write_todos` 工具、`todos` 状态通道或 todo 规划提示词，请从 `langchain.agents.middleware`（而非 `deepagents`）导入 `TodoListMiddleware` 并将其传递给 `create_deep_agent` 来恢复：

       ```python theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
       from langchain.agents.middleware import TodoListMiddleware
       from deepagents import create_deep_agent

       agent = create_deep_agent(middleware=[TodoListMiddleware()])
       ```

    2. 后端兼容性填充层已被移除：`BackendFactory`、`BACKEND_TYPES`、`FileFormat` 和 `Unset` 不再存在。将所有后端工厂替换为具体的 `BackendProtocol` 实例，并为每个 `StoreBackend` 配置添加显式 `namespace`：

       ```python theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
       from deepagents import create_deep_agent
       from deepagents.backends import StoreBackend

       # Before (v0.6.x): factory callable, and StoreBackend with no explicit namespace
       agent = create_deep_agent(backend=lambda rt: StoreBackend())  # [!code --]

       # After (v0.7): concrete backend instance with an explicit namespace
       agent = create_deep_agent(backend=StoreBackend(namespace=lambda rt: (rt.server_info.user.identity,)))  # [!code ++]
       ```

       同时更新调用，使用当前的 `ls`、`glob`、`grep` 和 `ReadResult` API。

    3. 工具输出格式已更改：空的 `ls` / `glob` 输出现在是字符串 `No files found` 而不是 `[]`，且 `read_file` 不再渲染固定宽度的 `cat -n` 风格行号侧栏。更新任何解析这些工具输出的代码。

    在代码库中搜索被移除符号的使用位置，以及依赖旧输出格式的解析逻辑，应用必要的更改，并标记任何需要手动审查的内容。
  </Prompt>
</Update>

<Update label="May 12, 2026" tags={["deepagents"]} rss={{ title: "May 12, 2026 - langchain" }}>
  ## `deepagents` v0.6.0

  * **[`CodeInterpreterMiddleware`](/oss/python/deepagents/interpreters)**：（实验性）`deepagents` 现在支持通过作用域隔离的 QuickJS 运行时进行代码执行和编程式工具调用。
  * 在 `stream_events` / `astream_events` 中支持 `version="v3"`。详情请参阅[事件流式传输](/oss/python/deepagents/event-streaming)指南。
  * **[`DeltaChannel`](/oss/python/langgraph/pregel#deltachannel)（测试版）**（[博客](https://www.langchain.com/blog/delta-channels-evolving-agent-runtime)）：Deep Agents 现在使用 `DeltaChannel` 存储消息历史和代理文件。不再将完整累积值重新序列化到每个检查点中，而是只存储每一步写入的增量（delta）——在线程变长时保持检查点体积较小。

  <Warning>
    **一旦线程已持久化，就不支持从 v0.6.0 回滚。** Deep Agents v0.6.0 将持久化的消息历史和代理文件更改为 `DeltaChannel`，这会以早期版本无法读取的新格式写入检查点。降级到较早的 Deep Agents 版本会将这些通道切换回非 delta 通道，使现有的 delta 检查点无法读取，并导致状态重建不完整或不正确。如果需要回滚，请在降级之前使用 [delta-channel-dump 恢复脚本](https://github.com/langchain-ai/langgraph/tree/main/examples/delta-channel-dump)迁移受影响的线程，或将其丢弃。更一般地，避免在 delta 和非 delta 表示之间切换已持久化的通道。请参阅[版本兼容性与通道更改](/oss/python/langgraph/pregel#version-compatibility-and-rollbacks)。
  </Warning>

  * **[Harness 配置（profiles）](/oss/python/deepagents/profiles)**：注册按提供商或按模型的配置包（`HarnessProfile`），当选择某个模型时 `create_deep_agent` 会自动应用——系统提示词调整、工具覆盖、中间件更改和子代理默认值——而无需修改调用位置。
  * **[`ContextHubBackend`](/oss/python/deepagents/backends#contexthubbackend)**（[博客](https://www.langchain.com/blog/introducing-context-hub)）：一个由 LangSmith Hub 支撑的新文件系统后端。代理文件——技能、记忆和其他持久化上下文——作为 Hub 提交存储，为你提供每次写入的版本历史以及 LangSmith 原生的持久性，而无需单独配置 LangGraph store。
</Update>

<Update label="May 12, 2026" tags={["langchain"]} rss={{ title: "May 12, 2026 - langchain" }}>
  ## `langchain` v1.3.0

  此版本为 `langchain` 代理在 `stream_events` / `astream_events` 中增加了对 `version="v3"` 的支持。详情请参阅[事件流式传输](/oss/python/langchain/event-streaming)指南。
</Update>

<Update label="May 12, 2026" tags={["langgraph"]} rss={{ title: "May 12, 2026 - langgraph" }}>
  ## `langgraph` v1.2.0

  此版本为节点执行增加了更细粒度的控制（超时、错误恢复和优雅关闭），一种可降低长运行线程检查点开销的新通道类型，以及一种以内容块为中心的新流式 API（v3），支持带类型的、按通道的投影。

  * **[`DeltaChannel`](/oss/python/langgraph/pregel#deltachannel)（测试版）**：一种新的通道类型，只存储每一步的增量（delta），而不是重新序列化完整的累积值。对于随时间增长变大的通道最有用，例如长运行线程中的消息列表。使用 `snapshot_frequency=K` 每 K 步写入一个完整快照，以约束读取延迟。

  * **[按节点的超时](/oss/python/langgraph/fault-tolerance#timeouts)**：向 [`add_node`](https://reference.langchain.com/python/langgraph/graph/state/StateGraph/add_node) 传递 `timeout=`，以限制单次尝试可运行的时间。设置硬性的墙钟时间限制（`run_timeout`）、在取得进展时重置的空闲限制（`idle_timeout`），或通过 [`TimeoutPolicy`](https://reference.langchain.com/python/langgraph/types/TimeoutPolicy) 同时设置两者。当限制触发时，LangGraph 会抛出 [`NodeTimeoutError`](https://reference.langchain.com/python/langgraph/errors/NodeTimeoutError)，清除该尝试的写入，并交给重试策略处理。仅限异步节点。

  * **[节点级错误处理器](/oss/python/langgraph/fault-tolerance#error-handling)**：向 [`add_node`](https://reference.langchain.com/python/langgraph/graph/state/StateGraph/add_node) 传递 `error_handler=`，在所有重试用尽后运行恢复函数。处理器接收带类型的 [`NodeError`](https://reference.langchain.com/python/langgraph/errors/NodeError)，并可返回一个 [`Command`](https://reference.langchain.com/python/langgraph/types/Command) 来更新状态并路由到其他节点，适用于 Saga/补偿模式。

  * **[优雅关闭](/oss/python/langgraph/fault-tolerance#graceful-shutdown)**：在当前超步完成后协作地停止进行中的运行，并保存可恢复的检查点。创建 [`RunControl`](https://reference.langchain.com/python/langgraph/runtime/RunControl) 并从任何线程调用 `request_drain()`；运行会抛出 `GraphDrained`，之后可以使用相同配置恢复。

  * **新的事件流式 API（测试版）**：向 `stream_events()` / `astream_events()` 传递 `version="v3"`，获得以内容块为中心的协议，支持带类型的按通道投影（`run.values`、`run.messages`、`run.lifecycle`、`run.subgraphs`），以及用于更新、自定义事件、检查点、任务和调试的可选转换器。`run.messages` 为每次 LLM 调用生成一个 `ChatModelStream`，并提供针对文本、推理、工具调用和用量（usage）的带类型子投影。`version="v1"` 和 `version="v2"` 保持不变。

  超时和错误处理器仅限 Python；重试策略在 Python 和 TypeScript 中均继续可用。
</Update>

<Update label="Apr 7, 2026" tags={["deepagents"]} rss={{ title: "Apr 7, 2026 - deepagents" }}>
  ## `deepagents` v0.5.0

  * **[异步子代理](/oss/python/deepagents/async-subagents)**：Deep Agents 可以启动非阻塞的后台任务，因此用户可以继续与代理交互，而子代理并发地工作。子代理需要 [LangSmith Deployment](/langsmith/deployment)。

  * **多模态支持**：`read_file` 工具现在除图像外还支持 PDF、音频和视频文件。

  * **后端更改**：我们对 Deep Agents [后端协议](https://github.com/langchain-ai/deepagents/blob/main/libs/deepagents/deepagents/backends/protocol.py)做了向后兼容的更改：
    * 更新了 [State 和 Store 后端](/oss/python/deepagents/backends)中存储的文件格式以支持二进制文件。
    * 改善了从后端到工具的错误传播。
    * 现在可以直接实例化 `StateBackend()` 和 `StoreBackend()`。使用工厂指定（例如 `backend=(lambda rt: StateBackend(rt))`）已被弃用。

  * **Anthropic 提示缓存改进**：我们做了一些改进以提升 Anthropic 模型的提示缓存性能。
</Update>

<Update label="Mar 10, 2026" tags={["langgraph"]} rss={{ title: "Mar 10, 2026 - langgraph" }}>
  ## `langgraph` v1.1.0

  * **类型安全的流式传输（`version="v2"`）**：向 `stream()` / `astream()` 传递 `version="v2"`，获得统一的 `StreamPart` 输出，每个块都带有 `type`、`ns` 和 `data` 键。每种模式都有自己的 `TypedDict`，均可从 `langgraph.types` 导入。请参阅[流式传输文档](/oss/python/langgraph/streaming#stream-output-format-v2)。

  * **类型安全的 invoke（`version="v2"`）**：向 `invoke()` / `ainvoke()` 传递 `version="v2"`，获得带有 `.value` 和 `.interrupts` 属性的 `GraphOutput` 对象。请参阅 [invoke 文档](/oss/python/langgraph/streaming#v2-invoke-format)。

  * **Pydantic 和 dataclass 强制转换**：使用 `version="v2"` 时，`invoke()` 和 `values` 模式的流式输出会自动强制转换为你声明的 Pydantic 模型或 dataclass 类型。

  * **修复了带 interrupt 和子图的时间旅行**：重放不再复用过期的 `RESUME` 值，子图会正确恢复父图历史状态的检查点。

  * **完全向后兼容**：`version="v2"` 是可选启用的。`GraphOutput` 支持已弃用的字典式访问，便于渐进迁移。
</Update>

<Update label="Feb 10, 2026" tags={["deepagents"]} rss={{ title: "Feb 10, 2026 - deepagents" }}>
  ## `deepagents` v0.4.0

  * 用于可插拔沙箱的新集成包：[`langchain-modal`](https://pypi.org/project/langchain-modal/)、[`langchain-daytona`](https://pypi.org/project/langchain-daytona/) 和 [`langchain-runloop`](https://pypi.org/project/langchain-runloop/)。请参阅[沙箱指南](/oss/python/deepagents/sandboxes)和示例[数据分析教程](/oss/python/deepagents/data-analysis)。
  * [对话历史摘要](/oss/python/deepagents/context-engineering#summarization)的更改：
    * 摘要现在通过 `wrap_model_call` 事件在模型节点中进行。因此我们在图状态中保留完整的消息历史。
    * 更准确的令牌计数。
    * 如果聊天模型抛出 [`ContextOverflowError`](https://reference.langchain.com/python/langchain-core/exceptions/ContextOverflowError)（在 `langchain-core` 中定义），摘要现在会自动触发。目前 `langchain-anthropic` 和 `langchain-openai` 支持此功能。
  * 我们现在对以 `"openai:"` 前缀开头的模型字符串默认使用 Responses API。
      <Accordion title="使用 Responses API 禁用数据保留">
        ```python theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
        from langchain.chat_models import init_chat_model

        agent = create_deep_agent(
            model=init_chat_model(
                "openai:...",
                use_responses_api=True,
                store=False,
                include=["reasoning.encrypted_content"],
            )
        )
        ```
      </Accordion>
</Update>

<Update label="Dec 15, 2025" tags={["langchain", "integrations"]} rss={{ title: "Dec 15, 2025 - langchain" }}>
  ## `langchain` v1.2.0

  * [`create_agent`](/oss/python/langchain/agents)：通过 [工具](/oss/python/langchain/tools) 上新的 [`extras`](https://reference.langchain.com/python/langchain/tools/#langchain.tools.BaseTool.extras) 属性，简化了对提供商特定工具参数和定义的支持。示例：
    * 提供商特定配置，例如 Anthropic 的[编程式工具调用](/oss/python/integrations/chat/anthropic#programmatic-tool-calling)和[工具搜索](/oss/python/integrations/chat/anthropic#tool-search)。
    * 在客户端执行的内置工具，如 [Anthropic](/oss/python/integrations/chat/anthropic#built-in-tools)、[OpenAI](/oss/python/integrations/chat/openai#responses-api) 和其他提供商所支持的那样。
  * 支持代理 `response_format` 中严格的模式遵循（请参阅 [`ProviderStrategy`](/oss/python/langchain/structured-output#provider-strategy) 文档）。
</Update>

<Update label="Dec 8, 2025" tags={["langchain", "integrations"]} rss={{ title: "Dec 8, 2025 - langchain" }}>
  ## `langchain-google-genai` v4.0.0

  我们重写了 Google GenAI 集成，改用 Google 统一的 Generative AI SDK，它通过同一接口提供对 Gemini API 和 Vertex AI Platform 的访问。这包括极少的破坏性变更，以及 `langchain-google-vertexai` 中的已弃用包。

  详情请参阅完整的[发布说明和迁移指南](https://github.com/langchain-ai/langchain-google/discussions/1422)。
</Update>

<Update label="Nov 25, 2025" tags={["langchain"]} rss={{ title: "Nov 25, 2025 - langchain" }}>
  ## `langchain` v1.1.0

  * [模型配置（Model profiles）](/oss/python/langchain/models#model-profiles)：聊天模型现在通过 `.profile` 属性公开支持的特性和能力。这些数据来自 [models.dev](https://models.dev)，一个提供模型能力数据的开源项目。
  * [摘要中间件](/oss/python/langchain/middleware/built-in#summarization)：已更新为使用模型配置支持灵活的触发点，以实现上下文感知的摘要。
  * [结构化输出](/oss/python/langchain/structured-output)：`ProviderStrategy` 支持（原生结构化输出）现在可以从模型配置中推断。
  * [`create_agent` 的 `SystemMessage`](/oss/python/langchain/middleware/custom#dynamic-prompt)：支持将 `SystemMessage` 实例直接传递给 `create_agent` 的 `system_prompt` 参数，从而启用缓存控制和结构化内容块等高级功能。
  * [模型重试中间件](/oss/python/langchain/middleware/built-in#model-retry)：新的中间件，用于以可配置的指数退避自动重试失败的模型调用。
  * [内容审核中间件](/oss/python/integrations/middleware/openai#content-moderation)：用于检测和处理代理交互中不安全内容的 OpenAI 内容审核中间件。支持检查用户输入、模型输出和工具结果。
</Update>

<Update label="Oct 20, 2025" tags={["langchain", "langgraph"]} rss={{ title: "Oct 20, 2025 - langchain" }}>
  ## v1.0.0

  ### `langchain`

  * [发布说明](/oss/python/releases/langchain-v1)
  * [迁移指南](/oss/python/migrate/langchain-v1)

  ### `langgraph`

  * [发布说明](/oss/python/releases/langgraph-v1)
  * [迁移指南](/oss/python/migrate/langgraph-v1)

  <Callout icon="speakerphone" color="#4F46E5" iconType="regular">
    如果你遇到任何问题或有反馈，请[提交 issue](https://github.com/langchain-ai/docs/issues/new?template=01-langchain.yml)以便我们改进。要查看 v0.x 文档，请[访问存档内容](https://github.com/langchain-ai/langchain/tree/v0.3/docs/docs)和 [API 参考](https://reference.langchain.com/v0.3/python/)。
  </Callout>
</Update>

***

<div className="source-links">
  <Callout icon="terminal-2">
    [连接这些文档](/use-these-docs) 到 Claude、VSCode 等，通过 MCP 获得实时答案。
  </Callout>

  <Callout icon="edit">
    [在 GitHub 上编辑此页面](https://github.com/langchain-ai/docs/edit/main/src/oss/python/releases/changelog.mdx)或[提交 issue](https://github.com/langchain-ai/docs/issues/new/choose)。
  </Callout>
</div>