# 运行本地服务器

本指南将向您展示如何在本地运行 LangGraph 应用。

## 前置条件

在开始之前，请确保您具备以下条件：

* 一个 [LangSmith](https://smith.langchain.com/settings) 的 API 密钥 - 免费注册

## 1. 安装 LangGraph CLI

<CodeGroup>
  ```bash pip theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
  # Python >= 3.11 is required.
  pip install -U "langgraph-cli[inmem]"
  ```

  ```bash uv theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
  # Python >= 3.11 is required.
  uv add "langgraph-cli[inmem]"
  ```
</CodeGroup>

## 2. 创建 LangGraph 应用

使用 [`new-langgraph-project-python` 模板](https://github.com/langchain-ai/new-langgraph-project)创建一个新应用。该模板演示了一个单节点应用，您可以用自己的逻辑扩展它。

```shell theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
langgraph new path/to/your/app --template new-langgraph-project-python
```

<Tip>
  **其他模板**
  如果您使用 `langgraph new` 而不指定模板，将会出现一个交互式菜单，让您从可用模板列表中进行选择。
</Tip>

## 3. 安装依赖

在您的新 LangGraph 应用的根目录中，以 `edit`（可编辑）模式安装依赖，以便服务器使用您的本地更改：

<CodeGroup>
  ```bash pip theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
  cd path/to/your/app
  pip install -e .
  ```

  ```bash uv theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
  cd path/to/your/app
  uv sync
  ```
</CodeGroup>

## 4. 创建 `.env` 文件

您会在新 LangGraph 应用的根目录中找到 `.env.example` 文件。请在应用根目录创建 `.env` 文件，将 `.env.example` 的内容复制进去，并填写必要的 API 密钥：

```bash theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
LANGSMITH_API_KEY=lsv2...
```

## 5. 启动智能体服务器

在本地启动 LangGraph API 服务器：

```shell theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
langgraph dev
```

示例输出：

```
INFO:langgraph_api.cli:

        Welcome to

╦  ┌─┐┌┐┌┌─┐╔═╗┬─┐┌─┐┌─┐┬ ┬
║  ├─┤││││ ┬║ ╦├┬┘├─┤├─┘├─┤
╩═╝┴ ┴┘└┘└─┘╚═╝┴└─┴ ┴┴  ┴ ┴

- 🚀 API: http://127.0.0.1:2024
- 🎨 Studio UI: https://smith.langchain.com/studio/?baseUrl=http://127.0.0.1:2024
- 📚 API Docs: http://127.0.0.1:2024/docs

This in-memory server is designed for development and testing.
For production use, please use LangSmith Deployment.
```

`langgraph dev` 命令以内存模式启动智能体服务器。此模式适用于开发和测试。对于生产环境，请以可访问持久化存储后端的方式部署智能体服务器。更多信息，请参阅[平台设置概述](/langsmith/platform-setup)。

## 6. 在 Studio 中测试您的应用

[Studio](/langsmith/studio) 是一个专用 UI，您可以将其连接到 LangGraph API 服务器，在本地可视化、交互和调试您的应用。访问 `langgraph dev` 命令输出中提供的 URL，在 Studio 中测试您的图：

```
>    - LangGraph Studio Web UI: https://smith.langchain.com/studio/?baseUrl=http://127.0.0.1:2024
```

对于在自定义主机/端口上运行的智能体服务器，请更新 URL 中的 `baseUrl` 查询参数。例如，如果您的服务器运行在 `http://myhost:3000`：

```
https://smith.langchain.com/studio/?baseUrl=http://myhost:3000
```

<Accordion title="Safari 兼容性">
  请在命令中使用 `--tunnel` 标志创建安全隧道，因为 Safari 在连接 localhost 服务器时存在限制：

  ```shell theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
  langgraph dev --tunnel
  ```
</Accordion>

## 7. 测试 API

<Tabs>
  <Tab title="Python SDK（异步）">
    1. 安装 LangGraph Python SDK：
       ```shell theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
       pip install langgraph-sdk
       ```
    2. 向助手发送一条消息（无线程运行）：
       ```python theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
       from langgraph_sdk import get_client
       import asyncio

       client = get_client(url="http://localhost:2024")

       async def main():
           async for chunk in client.runs.stream(
               None,  # Threadless run
               "agent", # Name of assistant. Defined in langgraph.json.
               input={
               "messages": [{
                   "role": "human",
                   "content": "What is LangGraph?",
                   }],
               },
           ):
               print(f"Receiving new event of type: {chunk.event}...")
               print(chunk.data)
               print("\n\n")

       asyncio.run(main())
       ```
  </Tab>

  <Tab title="Python SDK（同步）">
    1. 安装 LangGraph Python SDK：
       ```shell theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
       pip install langgraph-sdk
       ```
    2. 向助手发送一条消息（无线程运行）：
       ```python theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
       from langgraph_sdk import get_sync_client

       client = get_sync_client(url="http://localhost:2024")

       for chunk in client.runs.stream(
           None,  # Threadless run
           "agent", # Name of assistant. Defined in langgraph.json.
           input={
               "messages": [{
                   "role": "human",
                   "content": "What is LangGraph?",
               }],
           },
           stream_mode="messages-tuple",
       ):
           print(f"Receiving new event of type: {chunk.event}...")
           print(chunk.data)
           print("\n\n")
       ```
  </Tab>

  <Tab title="Rest API">
    ```bash theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
    curl -s --request POST \
        --url "http://localhost:2024/runs/stream" \
        --header 'Content-Type: application/json' \
        --data "{
            \"assistant_id\": \"agent\",
            \"input\": {
                \"messages\": [
                    {
                        \"role\": \"human\",
                        \"content\": \"What is LangGraph?\"
                    }
                ]
            },
            \"stream_mode\": \"messages-tuple\"
        }"
    ```
  </Tab>
</Tabs>

## 后续步骤

现在您已经在本地运行了一个 LangGraph 应用，可以通过探索部署和高级功能来进一步深化：

* [部署快速入门](/langsmith/deployment-quickstart)：使用 LangSmith 部署您的 LangGraph 应用。

* [LangSmith](/langsmith/observability)：了解 LangSmith 的基础概念。

* [SDK 参考](https://reference.langchain.com/python/langsmith/deployment/sdk/)：探索 SDK API 参考。

***

<div className="source-links">
  <Callout icon="terminal-2">
    [Connect these docs](/use-these-docs) to Claude, VSCode, and more via MCP for real-time answers.
  </Callout>

  <Callout icon="edit">
    [Edit this page on GitHub](https://github.com/langchain-ai/docs/edit/main/src/oss/langgraph/local-server.mdx) or [file an issue](https://github.com/langchain-ai/docs/issues/new/choose).
  </Callout>
</div>