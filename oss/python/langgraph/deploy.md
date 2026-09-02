# 部署

> 使用 LangSmith Cloud 或 JavaScript 框架与托管平台将 LangGraph 智能体部署到生产环境。

当您准备将 LangGraph 智能体部署到生产环境时，请选择适合您技术栈的托管模型。**[LangSmith Cloud](/langsmith/deploy-to-cloud)** 为有状态、长时间运行的智能体提供完全托管的基础设施，支持持久化状态和后台执行。

<Tip>
  LangSmith 在 Cloud 之外还提供多种部署选项，包括[混合部署](/langsmith/hybrid)、[独立服务器](/langsmith/deploy-standalone-server)以及[带控制平面的自托管](/langsmith/deploy-with-control-plane)。更多信息请参阅 [LangSmith 部署概述](/langsmith/deployment)。
</Tip>

## LangSmith Cloud

本节将介绍如何从 GitHub 仓库将智能体部署到 LangSmith Cloud。LangSmith 负责处理基础设施、扩展和运维相关事宜。

### 前置条件

在开始之前，请确保您具备以下条件：

* 一个 [GitHub 账号](https://github.com/)
* 一个 [LangSmith 账号](https://smith.langchain.com?utm_source=docs\&utm_medium=cta\&utm_campaign=langsmith-signup\&utm_content=oss-langgraph-deploy)（免费注册）

### 部署您的智能体

#### 1. 在 GitHub 上创建仓库

您的应用程序代码必须存放在 GitHub 仓库中才能部署到 LangSmith。公有仓库和私有仓库均受支持。对于本快速入门，请先按照[本地服务器设置指南](/oss/python/langgraph/studio#set-up-local-agent-server)确保您的应用与 LangGraph 兼容。然后，将代码推送到仓库。

#### 2. 部署到 LangSmith

<Steps>
  <Step title="导航到 LangSmith 部署">
    登录 [LangSmith](https://smith.langchain.com?utm_source=docs\&utm_medium=cta\&utm_campaign=langsmith-signup\&utm_content=oss-langgraph-deploy)。在左侧边栏中，选择 **Deployments**（部署）。
  </Step>

  <Step title="创建新部署">
    单击 **+ New Deployment**（新建部署）按钮。将打开一个面板，您可以在此填写必填字段。
  </Step>

  <Step title="关联仓库">
    如果您是首次使用，或要添加之前未连接过的私有仓库，请单击 **Add new account**（添加新账号）按钮，并按照说明连接您的 GitHub 账号。
  </Step>

  <Step title="部署仓库">
    选择您的应用程序仓库。单击 **Submit**（提交）进行部署。此过程大约需要 15 分钟完成。您可以在 **Deployment details**（部署详情）视图中查看状态。
  </Step>
</Steps>

#### 3. 在 Studio 中测试您的应用

部署完成后：

1. 选择您刚刚创建的部署以查看更多详情。
2. 单击右上角的 **Studio** 按钮。Studio 将打开并显示您的图。

#### 4. 获取部署的 API URL

1. 在 LangGraph 的 **Deployment details**（部署详情）视图中，单击 **API URL** 将其复制到剪贴板。
2. 单击 `URL` 将其复制到剪贴板。

#### 5. 测试 API

您现在可以测试 API：

<Tabs>
  <Tab title="Python">
    1. 安装 LangGraph SDK：

    ```shell theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
    pip install langgraph-sdk
    ```

    2. 向智能体发送一条消息：

    ```python theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
    from langgraph_sdk import get_sync_client # or get_client for async

    client = get_sync_client(url="your-deployment-url", api_key="your-langsmith-api-key")

    for chunk in client.runs.stream(
        None,    # Threadless run
        "agent", # Name of agent. Defined in langgraph.json.
        input={
            "messages": [{
                "role": "human",
                "content": "What is LangGraph?",
            }],
        },
        stream_mode="updates",
    ):
        print(f"Receiving new event of type: {chunk.event}...")
        print(chunk.data)
        print("\n\n")
    ```
  </Tab>

  <Tab title="Rest API">
    ```bash theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
    curl -s --request POST \
        --url <DEPLOYMENT_URL>/runs/stream \
        --header 'Content-Type: application/json' \
        --header "X-Api-Key: <LANGSMITH API KEY> \
        --data "{
            \"assistant_id\": \"agent\", `# Name of agent. Defined in langgraph.json.`
            \"input\": {
                \"messages\": [
                    {
                        \"role\": \"human\",
                        \"content\": \"What is LangGraph?\"
                    }
                ]
            },
            \"stream_mode\": \"updates\"
        }"
    ```
  </Tab>
</Tabs>

***

<div className="source-links">
  <Callout icon="terminal-2">
    [Connect these docs](/use-these-docs) to Claude, VSCode, and more via MCP for real-time answers.
  </Callout>

  <Callout icon="edit">
    [Edit this page on GitHub](https://github.com/langchain-ai/docs/edit/main/src/oss/langgraph/deploy.mdx) or [file an issue](https://github.com/langchain-ai/docs/issues/new/choose).
  </Callout>
</div>