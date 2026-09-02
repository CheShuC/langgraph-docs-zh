# 快速入门

本快速入门演示如何使用 LangGraph 的 Graph API 或 Functional API 构建一个计算器智能体。

<Tip>
  **正在使用 AI 编码助手？**

  * 安装 [LangChain Docs MCP 服务器](/use-these-docs)，让你的助手能够访问最新的 LangChain 文档和示例。
  * 安装 [LangChain Skills](https://github.com/langchain-ai/langchain-skills)，提升你的助手在 LangChain 生态系统任务上的表现。
</Tip>

* 如果你倾向于将智能体定义为由节点和边构成的图，请[使用 Graph API](#use-the-graph-api)。
* 如果你倾向于将智能体定义为单一函数，请[使用 Functional API](#use-the-functional-api)。

概念信息请参阅 [Graph API 概述](/oss/python/langgraph/graph-api) 和 [Functional API 概述](/oss/python/langgraph/functional-api)。

<Info>
  本示例需要你注册一个 [Claude（Anthropic）](https://www.anthropic.com/) 账户并获取 API 密钥，然后在终端中设置 `ANTHROPIC_API_KEY` 环境变量。有关所有可用的提供商，请参阅[聊天模型集成](/oss/python/integrations/chat)。如果你使用 [LangSmith Gateway](/langsmith/llm-gateway)，你可以[自带提供商密钥](/langsmith/llm-gateway-quickstart)，或使用 [Gateway 积分](/langsmith/llm-gateway-credits)在无需提供商密钥的情况下访问模型。
</Info>

<Tabs>
  <Tab title="使用 Graph API">
    ## 1. 定义工具和模型

    在本示例中，我们将使用 Claude Sonnet 4.5 模型，并定义加法、乘法和除法工具。

    ```python theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
    from langchain.tools import tool
    from langchain.chat_models import init_chat_model


    model = init_chat_model(
        "claude-sonnet-4-6",
        temperature=0
    )


    # Define tools
    @tool
    def multiply(a: int, b: int) -> int:
        """Multiply `a` and `b`.

        Args:
            a: First int
            b: Second int
        """
        return a * b


    @tool
    def add(a: int, b: int) -> int:
        """Adds `a` and `b`.

        Args:
            a: First int
            b: Second int
        """
        return a + b


    @tool
    def divide(a: int, b: int) -> float:
        """Divide `a` and `b`.

        Args:
            a: First int
            b: Second int
        """
        return a / b


    # Augment the LLM with tools
    tools = [add, multiply, divide]
    tools_by_name = {tool.name: tool for tool in tools}
    model_with_tools = model.bind_tools(tools)
    ```

    ## 2. 定义状态

    图的状态用于存储消息和 LLM 调用次数。

    <Tip>
      LangGraph 中的状态会在智能体执行期间持续存在。

      `Annotated` 类型配合 `operator.add` 可确保新消息被追加到现有列表中，而不是替换它。
    </Tip>

    ```python theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
    from langchain.messages import AnyMessage
    from typing_extensions import TypedDict, Annotated
    import operator


    class MessagesState(TypedDict):
        messages: Annotated[list[AnyMessage], operator.add]
        llm_calls: int
    ```

    ## 3. 定义模型节点

    模型节点用于调用 LLM，并决定是调用工具还是不调用。

    ```python theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
    from langchain.messages import SystemMessage


    def llm_call(state: dict):
        """LLM decides whether to call a tool or not"""

        return {
            "messages": [
                model_with_tools.invoke(
                    [
                        SystemMessage(
                            content="You are a helpful assistant tasked with performing arithmetic on a set of inputs."
                        )
                    ]
                    + state["messages"]
                )
            ],
            "llm_calls": state.get('llm_calls', 0) + 1
        }
    ```

    ## 4. 定义工具节点

    工具节点用于调用工具并返回结果。

    ```python theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
    from langchain.messages import ToolMessage


    def tool_node(state: dict):
        """Performs the tool call"""

        result = []
        for tool_call in state["messages"][-1].tool_calls:
            tool = tools_by_name[tool_call["name"]]
            observation = tool.invoke(tool_call["args"])
            result.append(ToolMessage(content=observation, tool_call_id=tool_call["id"]))
        return {"messages": result}
    ```

    ## 5. 定义结束逻辑

    条件边函数用于根据 LLM 是否进行了工具调用来决定路由到工具节点还是结束。

    ```python theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
    from typing import Literal
    from langgraph.graph import StateGraph, START, END


    def should_continue(state: MessagesState) -> Literal["tool_node", END]:
        """Decide if we should continue the loop or stop based upon whether the LLM made a tool call"""

        messages = state["messages"]
        last_message = messages[-1]

        # If the LLM makes a tool call, then perform an action
        if last_message.tool_calls:
            return "tool_node"

        # Otherwise, we stop (reply to the user)
        return END
    ```

    ## 6. 构建并编译智能体

    智能体使用 [`StateGraph`](https://reference.langchain.com/python/langgraph/graph/state/StateGraph) 类构建，并使用 [`compile`](https://reference.langchain.com/python/langgraph/graph/state/StateGraph/compile) 方法编译。

    ```python theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
    # Build workflow
    agent_builder = StateGraph(MessagesState)

    # Add nodes
    agent_builder.add_node("llm_call", llm_call)
    agent_builder.add_node("tool_node", tool_node)

    # Add edges to connect nodes
    agent_builder.add_edge(START, "llm_call")
    agent_builder.add_conditional_edges(
        "llm_call",
        should_continue,
        ["tool_node", END]
    )
    agent_builder.add_edge("tool_node", "llm_call")

    # Compile the agent
    agent = agent_builder.compile()

    # Show the agent
    from IPython.display import Image, display
    display(Image(agent.get_graph(xray=True).draw_mermaid_png()))

    # Invoke
    from langchain.messages import HumanMessage
    messages = [HumanMessage(content="Add 3 and 4.")]
    messages = agent.invoke({"messages": messages})
    for m in messages["messages"]:
        m.pretty_print()
    ```

    <Tip>
      使用 [LangSmith](https://smith.langchain.com?utm_source=docs\&utm_medium=cta\&utm_campaign=langsmith-signup\&utm_content=oss-langgraph-quickstart) 追踪和调试你的智能体。按照[追踪快速入门](/langsmith/trace-with-langgraph)进行设置。当准备投入生产时，请参阅[部署](/langsmith/deployment)了解托管选项。

      我们还建议你配置 [LangSmith Engine](/langsmith/engine)，它会监控你的追踪、检测问题并提出修复建议。
    </Tip>

    恭喜！你已使用 LangGraph Graph API 构建了自己的第一个智能体。

    <Accordion title="完整代码示例">
      ```python theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
      # Step 1: Define tools and model

      from langchain.tools import tool
      from langchain.chat_models import init_chat_model


      model = init_chat_model(
          "claude-sonnet-4-6",
          temperature=0
      )


      # Define tools
      @tool
      def multiply(a: int, b: int) -> int:
          """Multiply `a` and `b`.

          Args:
              a: First int
              b: Second int
          """
          return a * b


      @tool
      def add(a: int, b: int) -> int:
          """Adds `a` and `b`.

          Args:
              a: First int
              b: Second int
          """
          return a + b


      @tool
      def divide(a: int, b: int) -> float:
          """Divide `a` and `b`.

          Args:
              a: First int
              b: Second int
          """
          return a / b


      # Augment the LLM with tools
      tools = [add, multiply, divide]
      tools_by_name = {tool.name: tool for tool in tools}
      model_with_tools = model.bind_tools(tools)

      # Step 2: Define state

      from langchain.messages import AnyMessage
      from typing_extensions import TypedDict, Annotated
      import operator


      class MessagesState(TypedDict):
          messages: Annotated[list[AnyMessage], operator.add]
          llm_calls: int

      # Step 3: Define model node
      from langchain.messages import SystemMessage


      def llm_call(state: MessagesState):
          """LLM decides whether to call a tool or not"""

          return {
              "messages": [
                  model_with_tools.invoke(
                      [
                          SystemMessage(
                              content="You are a helpful assistant tasked with performing arithmetic on a set of inputs."
                          )
                      ]
                      + state["messages"]
                  )
              ],
              "llm_calls": state.get('llm_calls', 0) + 1
          }


      # Step 4: Define tool node

      from langchain.messages import ToolMessage


      def tool_node(state: MessagesState):
          """Performs the tool call"""

          result = []
          for tool_call in state["messages"][-1].tool_calls:
              tool = tools_by_name[tool_call["name"]]
              observation = tool.invoke(tool_call["args"])
              result.append(ToolMessage(content=observation, tool_call_id=tool_call["id"]))
          return {"messages": result}

      # Step 5: Define logic to determine whether to end

      from typing import Literal
      from langgraph.graph import StateGraph, START, END


      # Conditional edge function to route to the tool node or end based upon whether the LLM made a tool call
      def should_continue(state: MessagesState) -> Literal["tool_node", END]:
          """Decide if we should continue the loop or stop based upon whether the LLM made a tool call"""

          messages = state["messages"]
          last_message = messages[-1]

          # If the LLM makes a tool call, then perform an action
          if last_message.tool_calls:
              return "tool_node"

          # Otherwise, we stop (reply to the user)
          return END

      # Step 6: Build agent

      # Build workflow
      agent_builder = StateGraph(MessagesState)

      # Add nodes
      agent_builder.add_node("llm_call", llm_call)
      agent_builder.add_node("tool_node", tool_node)

      # Add edges to connect nodes
      agent_builder.add_edge(START, "llm_call")
      agent_builder.add_conditional_edges(
          "llm_call",
          should_continue,
          ["tool_node", END]
      )
      agent_builder.add_edge("tool_node", "llm_call")

      # Compile the agent
      agent = agent_builder.compile()


      from IPython.display import Image, display
      # Show the agent
      display(Image(agent.get_graph(xray=True).draw_mermaid_png()))

      # Invoke
      from langchain.messages import HumanMessage
      messages = [HumanMessage(content="Add 3 and 4.")]
      messages = agent.invoke({"messages": messages})
      for m in messages["messages"]:
          m.pretty_print()

      ```
    </Accordion>
  </Tab>

  <Tab title="使用 Functional API">
    ## 1. 定义工具和模型

    在本示例中，我们将使用 Claude Sonnet 4.5 模型，并定义加法、乘法和除法工具。

    ```python theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
    from langchain.tools import tool
    from langchain.chat_models import init_chat_model


    model = init_chat_model(
        "claude-sonnet-4-6",
        temperature=0
    )


    # Define tools
    @tool
    def multiply(a: int, b: int) -> int:
        """Multiply `a` and `b`.

        Args:
            a: First int
            b: Second int
        """
        return a * b


    @tool
    def add(a: int, b: int) -> int:
        """Adds `a` and `b`.

        Args:
            a: First int
            b: Second int
        """
        return a + b


    @tool
    def divide(a: int, b: int) -> float:
        """Divide `a` and `b`.

        Args:
            a: First int
            b: Second int
        """
        return a / b


    # Augment the LLM with tools
    tools = [add, multiply, divide]
    tools_by_name = {tool.name: tool for tool in tools}
    model_with_tools = model.bind_tools(tools)

    from langgraph.graph import add_messages
    from langchain.messages import (
        SystemMessage,
        HumanMessage,
        ToolCall,
    )
    from langchain_core.messages import BaseMessage
    from langgraph.func import entrypoint, task
    ```

    ## 2. 定义模型节点

    模型节点用于调用 LLM，并决定是调用工具还是不调用。

    <Tip>
      [`@task`](https://reference.langchain.com/python/langgraph/func/task) 装饰器将函数标记为可作为智能体一部分执行的任务。任务可以在你的入口点函数内同步或异步调用。
    </Tip>

    ```python theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
    @task
    def call_llm(messages: list[BaseMessage]):
        """LLM decides whether to call a tool or not"""
        return model_with_tools.invoke(
            [
                SystemMessage(
                    content="You are a helpful assistant tasked with performing arithmetic on a set of inputs."
                )
            ]
            + messages
        )
    ```

    ## 3. 定义工具节点

    工具节点用于调用工具并返回结果。

    ```python theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
    @task
    def call_tool(tool_call: ToolCall):
        """Performs the tool call"""
        tool = tools_by_name[tool_call["name"]]
        return tool.invoke(tool_call)

    ```

    ## 4. 定义智能体

    智能体使用 [`@entrypoint`](https://reference.langchain.com/python/langgraph/func/entrypoint) 函数构建。

    <Note>
      在 Functional API 中，你不需要显式定义节点和边，而是在单个函数中编写标准的控制流逻辑（循环、条件判断）。
    </Note>

    ```python theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
    @entrypoint()
    def agent(messages: list[BaseMessage]):
        model_response = call_llm(messages).result()

        while True:
            if not model_response.tool_calls:
                break

            # Execute tools
            tool_result_futures = [
                call_tool(tool_call) for tool_call in model_response.tool_calls
            ]
            tool_results = [fut.result() for fut in tool_result_futures]
            messages = add_messages(messages, [model_response, *tool_results])
            model_response = call_llm(messages).result()

        messages = add_messages(messages, model_response)
        return messages

    # Invoke
    messages = [HumanMessage(content="Add 3 and 4.")]
    stream = agent.stream_events(messages, version="v3")
    for snapshot in stream.values:
        print(snapshot)
        print("\n")
    ```

    <Tip>
      使用 [LangSmith](https://smith.langchain.com?utm_source=docs\&utm_medium=cta\&utm_campaign=langsmith-signup\&utm_content=oss-langgraph-quickstart) 追踪和调试你的智能体。按照[追踪快速入门](/langsmith/trace-with-langgraph)进行设置。当准备投入生产时，请参阅[部署](/langsmith/deployment)了解托管选项。

      我们还建议你配置 [LangSmith Engine](/langsmith/engine)，它会监控你的追踪、检测问题并提出修复建议。
    </Tip>

    恭喜！你已使用 LangGraph Functional API 构建了自己的第一个智能体。

    <Accordion title="完整代码示例" icon="code">
      ```python theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
      # Step 1: Define tools and model

      from langchain.tools import tool
      from langchain.chat_models import init_chat_model


      model = init_chat_model(
          "claude-sonnet-4-6",
          temperature=0
      )


      # Define tools
      @tool
      def multiply(a: int, b: int) -> int:
          """Multiply `a` and `b`.

          Args:
              a: First int
              b: Second int
          """
          return a * b


      @tool
      def add(a: int, b: int) -> int:
          """Adds `a` and `b`.

          Args:
              a: First int
              b: Second int
          """
          return a + b


      @tool
      def divide(a: int, b: int) -> float:
          """Divide `a` and `b`.

          Args:
              a: First int
              b: Second int
          """
          return a / b


      # Augment the LLM with tools
      tools = [add, multiply, divide]
      tools_by_name = {tool.name: tool for tool in tools}
      model_with_tools = model.bind_tools(tools)

      from langgraph.graph import add_messages
      from langchain.messages import (
          SystemMessage,
          HumanMessage,
          ToolCall,
      )
      from langchain_core.messages import BaseMessage
      from langgraph.func import entrypoint, task


      # Step 2: Define model node

      @task
      def call_llm(messages: list[BaseMessage]):
          """LLM decides whether to call a tool or not"""
          return model_with_tools.invoke(
              [
                  SystemMessage(
                      content="You are a helpful assistant tasked with performing arithmetic on a set of inputs."
                  )
              ]
              + messages
          )


      # Step 3: Define tool node

      @task
      def call_tool(tool_call: ToolCall):
          """Performs the tool call"""
          tool = tools_by_name[tool_call["name"]]
          return tool.invoke(tool_call)


      # Step 4: Define agent

      @entrypoint()
      def agent(messages: list[BaseMessage]):
          model_response = call_llm(messages).result()

          while True:
              if not model_response.tool_calls:
                  break

              # Execute tools
              tool_result_futures = [
                  call_tool(tool_call) for tool_call in model_response.tool_calls
              ]
              tool_results = [fut.result() for fut in tool_result_futures]
              messages = add_messages(messages, [model_response, *tool_results])
              model_response = call_llm(messages).result()

          messages = add_messages(messages, model_response)
          return messages

      # Invoke
      messages = [HumanMessage(content="Add 3 and 4.")]
      stream = agent.stream_events(messages, version="v3")
      for snapshot in stream.values:
          print(snapshot)
          print("\n")
      ```
    </Accordion>
  </Tab>
</Tabs>

***

<div className="source-links">
  <Callout icon="terminal-2">
    [通过 MCP 将这些文档连接到 Claude、VSCode 等](/use-these-docs)，获取实时解答。
  </Callout>

  <Callout icon="edit">
    [在 GitHub 上编辑此页面](https://github.com/langchain-ai/docs/edit/main/src/oss/langgraph/quickstart.mdx) 或[提交问题](https://github.com/langchain-ai/docs/issues/new/choose)。
  </Callout>
</div>