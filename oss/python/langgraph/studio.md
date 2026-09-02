# LangSmith Studio

在本地使用 LangChain 构建智能体时，可视化智能体内部发生的事情、实时与之交互并在问题出现时进行调试会很有帮助。**LangSmith Studio** 是一个免费的图形界面，用于在您的本地机器上开发和测试您的 LangChain 智能体。

Studio 连接到您本地运行的智能体，向您展示智能体采取的每个步骤：发送给模型的提示、工具调用及其结果，以及最终输出。您可以测试不同的输入、检查中间状态，并在无需额外代码或部署的情况下迭代智能体的行为。

本页介绍如何将 Studio 与您的本地 LangChain 智能体配合使用。

## 前置条件

在开始之前，请确保您具备以下条件：

* **一个 LangSmith 账户**：在 [smith.langchain.com](https://smith.langchain.com?utm_source=docs\&utm_medium=cta\&utm_campaign=langsmith-signup\&utm_content=oss-langgraph-studio)（免费）注册或登录。
* **一个 LangSmith API 密钥**：按照[创建 API 密钥](/langsmith/create-account-api-key)指南操作。
* 如果您不希望将数据[跟踪](/langsmith/observability-concepts#traces)到 LangSmith，请在应用程序的 `.env` 文件中设置 `LANGSMITH_TRACING=false`。禁用跟踪后，不会有任何数据离开您的本地服务器。

## 设置本地智能体服务器

### 1. 安装 LangGraph CLI

[LangGraph CLI](/langsmith/cli) 提供了本地开发服务器（也称为[智能体服务器](/langsmith/agent-server)），将您的智能体连接到 Studio。

```shell theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
# Python >= 3.11 is required.
pip install --upgrade "langgraph-cli[inmem]"
```

### 2. 准备您的智能体

如果您已经有 LangChain 智能体，可以直接使用它。此示例使用一个简单的邮件智能体：

```python title="agent.py" theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
from langchain.agents import create_agent

def send_email(to: str, subject: str, body: str):
    """Send an email"""
    email = {
        "to": to,
        "subject": subject,
        "body": body
    }
    # ... email sending logic

    return f"Email sent to {to}"

agent = create_agent(
    "gpt-5.5",
    tools=[send_email],
    system_prompt="You are an email assistant. Always use the send_email tool.",
)
```

### 3. 环境变量

Studio 需要一个 LangSmith API 密钥来连接您的本地智能体。在项目根目录创建 `.env` 文件，并添加来自 [LangSmith](https://smith.langchain.com/settings) 的 API 密钥。

<Warning>
  确保不要将您的 `.env` 文件提交到版本控制（例如 Git）中。
</Warning>

```bash .env theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
LANGSMITH_API_KEY=lsv2...
```

### 4. 创建 LangGraph 配置文件

LangGraph CLI 使用配置文件来定位您的智能体并管理依赖。在您的应用目录中创建 `langgraph.json` 文件：

```json title="langgraph.json" theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
{
  "dependencies": ["."],
  "graphs": {
    "agent": "./src/agent.py:agent"
  },
  "env": ".env"
}
```

[`create_agent`](https://reference.langchain.com/python/langchain/agents/factory/create_agent) 函数会自动返回一个已编译的 LangGraph 图，这正是配置文件中的 `graphs` 键所期望的。

<Info>
  有关配置文件中 JSON 对象每个键的详细说明，请参阅 [LangGraph 配置文件参考](/langsmith/cli#configuration-file)。
</Info>

此时，项目结构将如下所示：

```bash theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
my-app/
├── src
│   └── agent.py
├── .env
└── langgraph.json
```

### 5. 安装依赖

从根目录安装您的项目依赖：

<CodeGroup>
  ```shell pip theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
  pip install langchain langchain-openai
  ```

  ```shell uv theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
  uv add langchain langchain-openai
  ```
</CodeGroup>

### 6. 在 Studio 中查看您的智能体

启动开发服务器，将您的智能体连接到 Studio：

```shell theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
langgraph dev
```

<Warning>
  Safari 会阻止 `localhost` 连接到 Studio。要解决此问题，请使用 `--tunnel` 运行上述命令，通过安全隧道访问 Studio。您需要在 Studio UI 中点击**连接到本地服务器**，手动将隧道 URL 添加到允许的来源。相关步骤请参阅[故障排除指南](/langsmith/troubleshooting-studio#safari-connection-issues)。
</Warning>

服务器运行后，您的智能体既可以通过 `http://127.0.0.1:2024` 的 API 访问，也可以通过 `https://smith.langchain.com/studio/?baseUrl=http://127.0.0.1:2024` 的 Studio UI 访问：

<Frame>
  <img src="https://mintcdn.com/langchain-5e9cc07a/TCDks4pdsHdxWmuJ/oss/images/studio_create-agent.png?fit=max&auto=format&n=TCDks4pdsHdxWmuJ&q=85&s=ebd259e9fa24af7d011dfcc568f74be2" alt="Agent view in the Studio UI" width="2836" height="1752" data-path="oss/images/studio_create-agent.png" />
</Frame>

Studio 连接到您的本地智能体后，您可以快速迭代智能体的行为。运行一个测试输入，在 [LangSmith](/langsmith/observability-studio) 中检查完整的执行跟踪，包括提示、工具参数、返回值以及令牌/延迟指标。当出现问题时，Studio 会捕获异常及其周围的状态，帮助您理解发生了什么。

开发服务器支持热重载——修改代码中的提示或工具签名，Studio 会立即反映这些更改。从任意步骤重新运行对话线程来测试您的更改，而无需重新开始。此工作流可从简单的单工具智能体扩展到复杂的多节点图。

有关如何运行 Studio 的更多信息，请参阅 [LangSmith 文档](/langsmith/observability) 中的以下指南：

* [运行应用](/langsmith/use-studio#run-application)
* [管理助手](/langsmith/use-studio#manage-assistants)
* [管理线程](/langsmith/use-studio#manage-threads)
* [迭代提示](/langsmith/observability-studio)
* [调试 LangSmith 跟踪](/langsmith/observability-studio#debug-langsmith-traces)
* [将节点添加到数据集](/langsmith/observability-studio#add-node-to-dataset)

## 视频指南

<Frame>
  <iframe className="w-full aspect-video rounded-xl" src="https://www.youtube.com/embed/Mi1gSlHwZLM?si=zA47TNuTC5aH0ahd" title="Studio" frameBorder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen />
</Frame>

***

<div className="source-links">
  <Callout icon="terminal-2">
    [Connect these docs](/use-these-docs) to Claude, VSCode, and more via MCP for real-time answers.
  </Callout>

  <Callout icon="edit">
    [Edit this page on GitHub](https://github.com/langchain-ai/docs/edit/main/src/oss/langgraph/studio.mdx) or [file an issue](https://github.com/langchain-ai/docs/issues/new/choose).
  </Callout>
</div>