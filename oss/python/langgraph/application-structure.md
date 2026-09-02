# 应用结构

一个 LangGraph 应用由一个或多个图、一个配置文件（`langgraph.json`）、一个指定依赖的文件，以及一个可选的用于指定环境变量的 `.env` 文件组成。

本指南展示了应用的典型结构，并说明如何提供必要的配置，以便使用 [LangSmith Deployment](/langsmith/deployment) 部署应用。

<Info>
  LangSmith Deployment 是一个用于部署和扩展 LangGraph 智能体的托管平台。它负责处理基础设施、扩展和运维问题，使你能够直接从仓库部署有状态、长期运行的智能体。更多信息请参阅[部署文档](/langsmith/deployment)。
</Info>

## 关键概念

要使用 LangSmith 进行部署，应提供以下信息：

1. 一个指定应用所需依赖、图和环境变量的 [LangGraph 配置文件](#configuration-file-concepts)（`langgraph.json`）。
2. 实现应用逻辑的[图](#graphs)。
3. 一个指定运行应用所需[依赖](#dependencies)的文件。
4. 应用运行所需的[环境变量](#environment-variables)。

## 文件结构

以下是应用目录结构的示例：

<Tabs>
  <Tab title="Python (requirements.txt)">
    ```plaintext theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
    my-app/
    ├── my_agent # all project code lies within here
    │   ├── utils # utilities for your graph
    │   │   ├── __init__.py
    │   │   ├── tools.py # tools for your graph
    │   │   ├── nodes.py # node functions for your graph
    │   │   └── state.py # state definition of your graph
    │   ├── __init__.py
    │   └── agent.py # code for constructing your graph
    ├── .env # environment variables
    ├── requirements.txt # package dependencies
    └── langgraph.json # configuration file for LangGraph
    ```
  </Tab>

  <Tab title="Python (pyproject.toml)">
    ```plaintext theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
    my-app/
    ├── my_agent # all project code lies within here
    │   ├── utils # utilities for your graph
    │   │   ├── __init__.py
    │   │   ├── tools.py # tools for your graph
    │   │   ├── nodes.py # node functions for your graph
    │   │   └── state.py # state definition of your graph
    │   ├── __init__.py
    │   └── agent.py # code for constructing your graph
    ├── .env # environment variables
    ├── langgraph.json  # configuration file for LangGraph
    └── pyproject.toml # dependencies for your project
    ```
  </Tab>
</Tabs>

<Note>
  LangGraph 应用的目录结构可能因编程语言和使用的包管理器而异。
</Note>

<a id="configuration-file-concepts" />

## 配置文件

`langgraph.json` 是一个 JSON 文件，用于指定部署 LangGraph 应用所需的依赖、图、环境变量和其他设置。

有关 JSON 文件中所有支持的键的详细信息，请参阅 [LangGraph 配置文件参考](/langsmith/cli#configuration-file)。

<Tip>
  [LangGraph CLI](/langsmith/cli) 默认使用当前目录中的配置文件 `langgraph.json`。
</Tip>

### 示例

* 依赖涉及一个自定义本地包和 `langchain_openai` 包。
* 将从文件 `./your_package/your_file.py` 中加载单个图，变量名为 `variable`。
* 环境变量从 `.env` 文件加载。

```json theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
{
  "dependencies": ["langchain_openai", "./your_package"],
  "graphs": {
    "my_agent": "./your_package/your_file.py:agent"
  },
  "env": "./.env"
}
```

## 依赖

一个 LangGraph 应用可能依赖其他 Python 包。

要正确设置依赖，你通常需要指定以下信息：

1. 目录中一个指定依赖的文件（例如 `requirements.txt`、`pyproject.toml` 或 `package.json`）。

2. [LangGraph 配置文件](#configuration-file-concepts)中的 `dependencies` 键，用于指定运行 LangGraph 应用所需的依赖。

3. 任何额外的二进制文件或系统库都可以通过 [LangGraph 配置文件](#configuration-file-concepts)中的 `dockerfile_lines` 键指定。

## 图

使用 [LangGraph 配置文件](#configuration-file-concepts)中的 `graphs` 键来指定已部署的 LangGraph 应用中可用的图。

你可以在配置文件中指定一个或多个图。每个图由一个名称（应为唯一）和一个路径标识，该路径指向：(1) 编译后的图，或 (2) 定义图的函数。

## 环境变量

如果你在本地使用已部署的 LangGraph 应用，可以在 [LangGraph 配置文件](#configuration-file-concepts)的 `env` 键中配置环境变量。

对于生产环境部署，你通常需要在部署环境中配置环境变量。

***

<div className="source-links">
  <Callout icon="terminal-2">
    [通过 MCP 将这些文档连接到 Claude、VSCode 等](/use-these-docs)，获取实时解答。
  </Callout>

  <Callout icon="edit">
    [在 GitHub 上编辑此页面](https://github.com/langchain-ai/docs/edit/main/src/oss/langgraph/application-structure.mdx) 或[提交问题](https://github.com/langchain-ai/docs/issues/new/choose)。
  </Callout>
</div>