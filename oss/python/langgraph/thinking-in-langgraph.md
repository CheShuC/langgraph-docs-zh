# LangGraph 思维方式

> 学习如何以 LangGraph 的思维方式构建智能体

当你使用 LangGraph 构建智能体时，首先要将其拆解为称为**节点**的离散步骤。然后，描述每个节点中不同的决策和转换。最后，通过所有节点都可读写的共享**状态**将节点连接起来。

在本教程中，我们将带你走一遍使用 LangGraph 构建客户支持邮件智能体的思考过程。

## 从你想要自动化的流程开始

假设你需要构建一个处理客户支持邮件的 AI 智能体。你的产品团队给出了以下需求：

```txt theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
The agent should:

- Read incoming customer emails
- Classify them by urgency and topic
- Search relevant documentation to answer questions
- Draft appropriate responses
- Escalate complex issues to human agents
- Schedule follow-ups when needed

Example scenarios to handle:

1. Simple product question: "How do I reset my password?"
2. Bug report: "The export feature crashes when I select PDF format"
3. Urgent billing issue: "I was charged twice for my subscription!"
4. Feature request: "Can you add dark mode to the mobile app?"
5. Complex technical issue: "Our API integration fails intermittently with 504 errors"
```

要在 LangGraph 中实现一个智能体，你通常需要遵循以下五个步骤。

## 第 1 步：将工作流映射为离散步骤

首先确定流程中的不同步骤。每个步骤都将成为一个**节点**（一个执行一件特定事情的函数）。然后，勾画这些步骤之间如何相互连接。

```mermaid theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
flowchart TD
    A[START] --> B[Read Email]
    B --> C[Classify Intent]

    C -.-> D[Doc Search]
    C -.-> E[Bug Track]
    C -.-> F[Human Review]

    D --> G[Draft Reply]
    E --> G
    F --> G

    G -.-> H[Human Review]
    G -.-> I[Send Reply]

    H --> J[END]
    I --> J[END]

    classDef process fill:#E5F4FF,stroke:#006DDD,stroke-width:2px,color:#030710
    class A,B,C,D,E,F,G,H,I,J process
```

此图中的箭头显示了所有可能的路径，但实际选择走哪条路径的决策发生在每个节点内部。

现在我们已经确定了工作流中的组件，让我们了解每个节点需要做什么：

* `Read Email`：提取并解析邮件内容
* `Classify Intent`：使用 LLM 对紧急程度和主题进行分类，然后路由到相应的操作
* `Doc Search`：查询知识库以获取相关信息
* `Bug Track`：在跟踪系统中创建或更新问题
* `Draft Reply`：生成合适的回复
* `Human Review`：上报给人工客服进行审批或处理
* `Send Reply`：发送邮件回复

<Tip>
  请注意，有些节点会决定下一步去哪里（`Classify Intent`、`Draft Reply`、`Human Review`），而其他节点总是指向相同的下一步（`Read Email` 总是进入 `Classify Intent`，`Doc Search` 总是进入 `Draft Reply`）。
</Tip>

## 第 2 步：确定每个步骤需要做什么

对于图中的每个节点，确定它代表什么类型的操作，以及它正常工作需要什么上下文。

<CardGroup cols={2}>
  <Card title="LLM 步骤" icon="brain" href="#llm-steps">
    当你需要理解、分析、生成文本或做出推理决策时使用
  </Card>

  <Card title="数据步骤" icon="database" href="#data-steps">
    当你需要从外部来源检索信息时使用
  </Card>

  <Card title="动作步骤" icon="bolt" href="#action-steps">
    当你需要执行外部操作时使用
  </Card>

  <Card title="用户输入步骤" icon="user" href="#user-input-steps">
    当你需要人工干预时使用
  </Card>
</CardGroup>

### LLM 步骤

当某个步骤需要理解、分析、生成文本或做出推理决策时：

<AccordionGroup>
  <Accordion title="意图分类">
    * 静态上下文（提示词）：分类类别、紧急程度定义、回复格式
    * 动态上下文（来自状态）：邮件内容、发件人信息
    * 期望结果：决定路由的结构化分类
  </Accordion>

  <Accordion title="草拟回复">
    * 静态上下文（提示词）：语气准则、公司政策、回复模板
    * 动态上下文（来自状态）：分类结果、搜索结果、客户历史
    * 期望结果：可直接审核的专业邮件回复
  </Accordion>
</AccordionGroup>

### 数据步骤

当某个步骤需要从外部来源检索信息时：

<AccordionGroup>
  <Accordion title="文档搜索">
    * 参数：根据意图和主题构建的查询
    * 重试策略：是，对瞬时故障采用指数退避
    * 缓存：可以缓存常见查询以减少 API 调用
  </Accordion>

  <Accordion title="客户历史查询">
    * 参数：来自状态的客户邮箱或 ID
    * 重试策略：是，但如果不可用则回退到基本信息
    * 缓存：是，使用生存时间（TTL）来平衡新鲜度和性能
  </Accordion>
</AccordionGroup>

### 动作步骤

当某个步骤需要执行外部操作时：

<AccordionGroup>
  <Accordion title="发送回复">
    * 何时执行节点：审批（人工或自动）之后
    * 重试策略：是，对网络问题采用指数退避
    * 不应缓存：每次发送都是唯一的操作
  </Accordion>

  <Accordion title="Bug 跟踪">
    * 何时执行节点：意图为 "bug" 时始终执行
    * 重试策略：是，绝不能丢失 bug 报告
    * 返回：要在回复中包含的工单 ID
  </Accordion>
</AccordionGroup>

### 用户输入步骤

当某个步骤需要人工干预时：

<AccordionGroup>
  <Accordion title="人工审核节点">
    * 决策上下文：原始邮件、草拟回复、紧急程度、分类结果
    * 期望的输入格式：审批布尔值以及可选的修改后回复
    * 触发时机：高紧急程度、复杂问题或质量问题
  </Accordion>
</AccordionGroup>

## 第 3 步：设计你的状态

状态是智能体中所有节点均可访问的共享[记忆](/oss/python/concepts/memory)。可以把它想象成智能体在流程推进过程中用来记录所学到和决定的一切的笔记本。

### 状态中应该包含什么？

针对每条数据，问自己以下问题：

<CardGroup cols={2}>
  <Card title="包含在状态中" icon="check">
    它需要跨步骤持久化吗？如果需要，就放入状态。
  </Card>

  <Card title="不要存储" icon="code">
    你能否从其他数据推导出它？如果可以，就在需要时计算，而不是存储在状态中。
  </Card>
</CardGroup>

对于我们的邮件智能体，我们需要跟踪：

* 原始邮件和发件人信息（之后无法重建）
* 分类结果（后续/下游的多个节点需要）
* 搜索结果和客户数据（重新获取成本高）
* 草拟回复（需要跨审核环节持久化）
* 执行元数据（用于调试和恢复）

### 保持状态原始，按需格式化提示词

<Tip>
  一个关键原则：状态中应存储原始数据，而不是格式化文本。在节点内按需格式化提示词。
</Tip>

这种分离意味着：

* 不同的节点可以根据自身需要以不同方式格式化相同的数据
* 你可以修改提示词模板而无需更改状态模式
* 调试更清晰——你能看到每个节点收到的确切数据
* 智能体可以演进而不会破坏现有状态

让我们定义状态：

```python theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
from typing import TypedDict, Literal

# Define the structure for email classification
class EmailClassification(TypedDict):
    intent: Literal["question", "bug", "billing", "feature", "complex"]
    urgency: Literal["low", "medium", "high", "critical"]
    topic: str
    summary: str

class EmailAgentState(TypedDict):
    # Raw email data
    email_content: str
    sender_email: str
    email_id: str

    # Classification result
    classification: EmailClassification | None

    # Raw search/API results
    search_results: list[str] | None  # List of raw document chunks
    customer_history: dict | None  # Raw customer data from CRM

    # Generated content
    draft_response: str | None
    messages: list[str] | None
```

请注意，状态中只包含原始数据——没有提示词模板、没有格式化字符串、没有指令。分类输出以单个字典的形式直接存储来自 LLM 的结果。

## 第 4 步：构建你的节点

现在我们将每个步骤实现为函数。LangGraph 中的节点只是一个 Python 函数，它接收当前状态并返回对状态的更新。

### 适当处理错误

不同的错误需要不同的处理策略：

| 错误类型                                                      | 谁处理            | 策略                           | 适用场景                                               |
| --------------------------------------------------------------- | ----------------------- | ---------------------------------- | --------------------------------------------------------- |
| 瞬时错误（网络问题、速率限制）                  | 系统（自动）      | 重试策略                       | 通常重试即可解决的临时故障          |
| LLM 可恢复的错误（工具失败、解析问题）          | LLM                     | 将错误存入状态并循环回去 | LLM 可以看到错误并调整其方法             |
| 用户可修复的错误（信息缺失、指令不清） | 人工                   | 使用 `interrupt()` 暂停           | 需要用户输入才能继续                                |
| 重试后仍可恢复的失败                               | 开发者（声明式） | `error_handler`                    | 重试耗尽后运行补偿/恢复分支 |
| 意外错误                                               | 开发者               | 让其向上抛出                 | 需要调试的未知问题                        |

<Tabs>
  <Tab title="瞬时错误" icon="rotate">
    添加重试策略，自动重试网络问题和速率限制。

    与 `timeout=` 结合使用，限制每次尝试的耗时。完整的生命周期请参阅[容错](/oss/python/langgraph/fault-tolerance)。

    ```python theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
    from langgraph.types import RetryPolicy

    workflow.add_node(
        "search_documentation",
        search_documentation,
        retry_policy=RetryPolicy(max_attempts=3, initial_interval=1.0)
    )
    ```
  </Tab>

  <Tab title="LLM 可恢复" icon="brain">
    将错误存入状态并循环回去，让 LLM 看到问题所在并重试：

    ```python theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
    from langgraph.types import Command


    def execute_tool(state: State) -> Command[Literal["agent", "execute_tool"]]:
        try:
            result = run_tool(state['tool_call'])
            return Command(update={"tool_result": result}, goto="agent")
        except ToolError as e:
            # Let the LLM see what went wrong and try again
            return Command(
                update={"tool_result": f"Tool error: {str(e)}"},
                goto="agent"
            )
    ```
  </Tab>

  <Tab title="用户可修复" icon="user">
    在需要时暂停并从用户那里收集信息（例如账户 ID、订单号或澄清说明）：

    ```python theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
    from langgraph.types import Command


    def lookup_customer_history(
        state: State
    ) -> Command[Literal["lookup_customer_history", "draft_response"]]:
        if not state.get('customer_id'):
            user_input = interrupt({
                "message": "Customer ID needed",
                "request": "Please provide the customer's account ID to look up their subscription history"
            })
            return Command(
                update={"customer_id": user_input['customer_id']},
                goto="lookup_customer_history"
            )
        # Now proceed with the lookup
        customer_data = fetch_customer_history(state['customer_id'])
        return Command(update={"customer_history": customer_data}, goto="draft_response")
    ```
  </Tab>

  <Tab title="意外错误" icon="alert-triangle">
    让它们向上抛出以便调试。不要捕获你无法处理的错误：

    ```python theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
    def send_reply(state: EmailAgentState):
        try:
            email_service.send(state["draft_response"])
        except Exception:
            raise  # Surface unexpected errors
    ```
  </Tab>

  <Tab title="Saga / 补偿" icon="arrows-exchange">
    重试耗尽后，运行一个恢复函数，更新状态并路由到补偿分支。

    完整的模式请参阅[容错](/oss/python/langgraph/fault-tolerance#error-handling)。

    <Note>
      `error_handler` 需要 `langgraph>=1.2`。
    </Note>

    ```python theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
    from langgraph.errors import NodeError
    from langgraph.types import Command, RetryPolicy

    def payment_error_handler(state: State, error: NodeError) -> Command:
        return Command(
            update={"status": f"compensated: {error.error}"},
            goto="finalize",
        )

    workflow.add_node(
        "charge_payment",
        charge_payment,
        retry_policy=RetryPolicy(max_attempts=3, retry_on=ConnectionError),
        error_handler=payment_error_handler,
    )
    ```

    如果希望对图中的每个节点应用相同的 `retry_policy`、`timeout` 或 `error_handler`，而不必在每个 `add_node` 上重复编写，可以使用 `StateGraph.set_node_defaults(...)`。节点级的值仍然优先。请参阅[容错](/oss/python/langgraph/fault-tolerance#graph-defaults)。
  </Tab>
</Tabs>

### 实现我们的邮件智能体节点

我们将每个节点实现为一个简单函数。请记住：节点接收状态、开展工作并返回更新。

<AccordionGroup>
  <Accordion title="读取与分类节点" icon="brain">
    ```python theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
    from typing import Literal
    from langgraph.graph import StateGraph, START, END
    from langgraph.types import interrupt, Command, RetryPolicy
    from langchain_openai import ChatOpenAI
    from langchain.messages import HumanMessage

    llm = ChatOpenAI(model="gpt-5-nano")

    def read_email(state: EmailAgentState) -> dict:
        """Extract and parse email content"""
        # In production, this would connect to your email service
        return {
            "messages": [HumanMessage(content=f"Processing email: {state['email_content']}")]
        }

    def classify_intent(state: EmailAgentState) -> Command[Literal["search_documentation", "human_review", "draft_response", "bug_tracking"]]:
        """Use LLM to classify email intent and urgency, then route accordingly"""

        # Create structured LLM that returns EmailClassification dict
        structured_llm = llm.with_structured_output(EmailClassification)

        # Format the prompt on-demand, not stored in state
        classification_prompt = f"""
        Analyze this customer email and classify it:

        Email: {state['email_content']}
        From: {state['sender_email']}

        Provide classification including intent, urgency, topic, and summary.
        """

        # Get structured response directly as dict
        classification = structured_llm.invoke(classification_prompt)

        # Determine next node based on classification
        if classification['intent'] == 'billing' or classification['urgency'] == 'critical':
            goto = "human_review"
        elif classification['intent'] in ['question', 'feature']:
            goto = "search_documentation"
        elif classification['intent'] == 'bug':
            goto = "bug_tracking"
        else:
            goto = "draft_response"

        # Store classification as a single dict in state
        return Command(
            update={"classification": classification},
            goto=goto
        )
    ```
  </Accordion>

  <Accordion title="搜索与跟踪节点" icon="database">
    ```python theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
    def search_documentation(state: EmailAgentState) -> Command[Literal["draft_response"]]:
        """Search knowledge base for relevant information"""

        # Build search query from classification
        classification = state.get('classification', {})
        query = f"{classification.get('intent', '')} {classification.get('topic', '')}"

        try:
            # Implement your search logic here
            # Store raw search results, not formatted text
            search_results = [
                "Reset password via Settings > Security > Change Password",
                "Password must be at least 12 characters",
                "Include uppercase, lowercase, numbers, and symbols"
            ]
        except SearchAPIError as e:
            # For recoverable search errors, store error and continue
            search_results = [f"Search temporarily unavailable: {str(e)}"]

        return Command(
            update={"search_results": search_results},  # Store raw results or error
            goto="draft_response"
        )

    def bug_tracking(state: EmailAgentState) -> Command[Literal["draft_response"]]:
        """Create or update bug tracking ticket"""

        # Create ticket in your bug tracking system
        ticket_id = "BUG-12345"  # Would be created via API

        return Command(
            update={
                "search_results": [f"Bug ticket {ticket_id} created"],
                "current_step": "bug_tracked"
            },
            goto="draft_response"
        )
    ```
  </Accordion>

  <Accordion title="响应节点" icon="edit">
    ```python theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
    def draft_response(state: EmailAgentState) -> Command[Literal["human_review", "send_reply"]]:
        """Generate response using context and route based on quality"""

        classification = state.get('classification', {})

        # Format context from raw state data on-demand
        context_sections = []

        if state.get('search_results'):
            # Format search results for the prompt
            formatted_docs = "\n".join([f"- {doc}" for doc in state['search_results']])
            context_sections.append(f"Relevant documentation:\n{formatted_docs}")

        if state.get('customer_history'):
            # Format customer data for the prompt
            context_sections.append(f"Customer tier: {state['customer_history'].get('tier', 'standard')}")

        # Build the prompt with formatted context
        draft_prompt = f"""
        Draft a response to this customer email:
        {state['email_content']}

        Email intent: {classification.get('intent', 'unknown')}
        Urgency level: {classification.get('urgency', 'medium')}

        {chr(10).join(context_sections)}

        Guidelines:
        - Be professional and helpful
        - Address their specific concern
        - Use the provided documentation when relevant
        """

        response = llm.invoke(draft_prompt)

        # Determine if human review needed based on urgency and intent
        needs_review = (
            classification.get('urgency') in ['high', 'critical'] or
            classification.get('intent') == 'complex'
        )

        # Route to appropriate next node
        goto = "human_review" if needs_review else "send_reply"

        return Command(
            update={"draft_response": response.content},  # Store only the raw response
            goto=goto
        )

    def human_review(state: EmailAgentState) -> Command[Literal["send_reply", END]]:
        """Pause for human review using interrupt and route based on decision"""

        classification = state.get('classification', {})

        # interrupt() must come first - any code before it will re-run on resume
        human_decision = interrupt({
            "email_id": state.get('email_id',''),
            "original_email": state.get('email_content',''),
            "draft_response": state.get('draft_response',''),
            "urgency": classification.get('urgency'),
            "intent": classification.get('intent'),
            "action": "Please review and approve/edit this response"
        })

        # Now process the human's decision
        if human_decision.get("approved"):
            return Command(
                update={"draft_response": human_decision.get("edited_response", state.get('draft_response',''))},
                goto="send_reply"
            )
        else:
            # Rejection means human will handle directly
            return Command(update={}, goto=END)

    def send_reply(state: EmailAgentState) -> dict:
        """Send the email response"""
        # Integrate with email service
        print(f"Sending reply: {state['draft_response'][:100]}...")
        return {}
    ```
  </Accordion>
</AccordionGroup>

## 第 5 步：将它们连接起来

现在我们将节点连接成一个可工作的图。由于我们的节点自行处理路由决策，我们只需要几条必要的边。

要使用 `interrupt()` 启用[人在回路](/oss/python/langgraph/interrupts)，我们需要使用[检查点存储](/oss/python/langgraph/persistence)进行编译，以便在运行之间保存状态：

<Accordion title="图编译代码" icon="sitemap" defaultOpen={true}>
  ```python theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
  from langgraph.checkpoint.memory import MemorySaver
  from langgraph.types import RetryPolicy

  # Create the graph
  workflow = StateGraph(EmailAgentState)

  # Add nodes with appropriate error handling
  workflow.add_node("read_email", read_email)
  workflow.add_node("classify_intent", classify_intent)

  # Add retry policy for nodes that might have transient failures
  workflow.add_node(
      "search_documentation",
      search_documentation,
      retry_policy=RetryPolicy(max_attempts=3)
  )
  workflow.add_node("bug_tracking", bug_tracking)
  workflow.add_node("draft_response", draft_response)
  workflow.add_node("human_review", human_review)
  workflow.add_node("send_reply", send_reply)

  # Add only the essential edges
  workflow.add_edge(START, "read_email")
  workflow.add_edge("read_email", "classify_intent")
  workflow.add_edge("send_reply", END)

  # Compile with checkpointer for persistence, in case run graph with Local_Server --> Please compile without checkpointer
  memory = MemorySaver()
  app = workflow.compile(checkpointer=memory)
  ```
</Accordion>

图结构之所以最小化，是因为路由发生在节点内部，通过 [`Command`](https://reference.langchain.com/python/langgraph/types/Command) 对象完成。每个节点使用 `Command[Literal["node1", "node2"]]` 之类的类型提示声明它可以去往哪些节点，使流程显式且可追踪。

### 尝试运行你的智能体

让我们用一个需要人工审核的紧急计费问题来运行我们的智能体：

<Accordion title="测试智能体" icon="flask">
  ```python theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
  from typing import TypedDict

  from langgraph.checkpoint.memory import InMemorySaver
  from langgraph.graph import END, START, StateGraph
  from langgraph.types import Command, interrupt


  class EmailState(TypedDict):
      email_content: str
      response_text: str | None


  def human_review_node(state: EmailState):
      interrupt(
          {
              "approved": False,
              "edited_response": state.get("response_text") or "",
          }
      )
      return {"response_text": "placeholder"}


  app = (
      StateGraph(EmailState)
      .add_node("human_review", human_review_node)
      .add_edge(START, "human_review")
      .add_edge("human_review", END)
      .compile(checkpointer=InMemorySaver())
  )

  initial_state = {
      "email_content": "I was charged twice for my subscription! This is urgent!",
      "response_text": "Draft response",
  }

  # Run with a thread_id for persistence
  config = {"configurable": {"thread_id": "customer_123"}}
  stream = app.stream_events(initial_state, config, version="v3")
  _ = stream.output  # drive the stream to completion
  # The graph will pause at human_review
  print(f"human review interrupt:{stream.interrupts}")

  human_response = Command(
      resume={
          "approved": True,
          "edited_response": "We sincerely apologize for the double charge. I've initiated an immediate refund...",
      }
  )

  # Resume execution
  resumed = app.stream_events(human_response, config, version="v3")
  final_state = resumed.output
  print("Email sent successfully!")
  ```
</Accordion>

图在遇到 `interrupt()` 时暂停，将所有内容保存到检查点存储，然后等待。它可以几天后恢复，并精确地从离开的地方继续。`thread_id` 确保此对话的所有状态都一起保留。

## 总结与后续步骤

### 关键要点

构建这个邮件智能体让我们了解了 LangGraph 的思维方式：

<CardGroup cols={2}>
  <Card title="分解为离散步骤" icon="sitemap" href="#step-1-map-out-your-workflow-as-discrete-steps">
    每个节点做好一件事。这种分解支持流式进度更新、可暂停和恢复的持久执行，以及清晰的调试（因为你可以检查步骤之间的状态）。
  </Card>

  <Card title="状态是共享记忆" icon="database" href="#step-3-design-your-state">
    存储原始数据，而不是格式化文本。这让不同节点能够以不同方式使用相同的信息。
  </Card>

  <Card title="节点是函数" icon="code" href="#step-4-build-your-nodes">
    它们接收状态、开展工作并返回更新。当它们需要做出路由决策时，会同时指定状态更新和下一个目标。
  </Card>

  <Card title="错误是流程的一部分" icon="alert-triangle" href="#handle-errors-appropriately">
    瞬时故障获得重试，LLM 可恢复的错误携带上下文循环回去，用户可修复的问题暂停等待输入，意外错误向上抛出以便调试。
  </Card>

  <Card title="人工输入是一等公民" icon="user" href="/oss/python/langgraph/interrupts">
    `interrupt()` 函数无限期暂停执行，保存所有状态，并在你提供输入后从离开的地方精确恢复。当与节点中的其他操作结合使用时，它必须放在第一位。
  </Card>

  <Card title="图结构自然涌现" icon="sitemap" href="#step-5-wire-it-together">
    你定义必要的连接，节点自行处理路由逻辑。这样控制流保持显式且可追踪——你总能通过查看当前节点来了解智能体接下来会做什么。
  </Card>
</CardGroup>

### 进阶考虑

<Accordion title="节点粒度权衡" icon="adjustments">
  <Info>
    本节探讨节点粒度设计中的权衡。大多数应用程序可以跳过本节，直接使用上面展示的模式。
  </Info>

  你可能会问：为什么不把 `Read Email` 和 `Classify Intent` 合并到一个节点中？

  或者为什么要将 Doc Search 与 Draft Reply 分开？

  答案涉及弹性（resilience）与可观测性之间的权衡。

  **弹性方面的考虑：** LangGraph 的[持久化层](/oss/python/langgraph/persistence)在节点边界创建检查点。当工作流在中断或故障后恢复时，它会从执行停止的节点的开头重新开始。更小的节点意味着更频繁的检查点，也意味着如果出现问题需要重做的工作更少。如果你将多个操作合并到一个大节点中，接近末尾的故障意味着要从该节点的开头重新执行一切。

  我们为什么为邮件智能体选择这种拆分方式：

  * **外部服务的隔离：** Doc Search 和 Bug Track 是单独的节点，因为它们调用外部 API。如果搜索服务变慢或失败，我们希望将其与 LLM 调用隔离开来。我们可以为这些特定节点添加重试策略，而不会影响其他节点。

  * **中间过程可见性：** 将 `Classify Intent` 作为独立节点，让我们可以在采取行动之前检查 LLM 的决定。这对调试和监控很有价值——你可以确切地看到智能体何时以及为何路由到人工审核。

  * **不同的故障模式：** LLM 调用、数据库查询和邮件发送有不同的重试策略。单独的节点让你可以独立配置它们。

  * **可复用性与测试：** 较小的节点更容易独立测试，也更容易在其他工作流中复用。

  另一种同样可行的做法：你可以将 `Read Email` 和 `Classify Intent` 合并到一个节点中。但你会失去在分类之前检查原始邮件的能力，并且在该节点发生任何故障时都要重复这两个操作。对于大多数应用程序来说，独立节点带来的可观测性和调试优势是值得的。

  应用层面的考虑：第 2 步中关于缓存的讨论（是否缓存搜索结果）是应用层面的决策，而不是 LangGraph 框架功能。你可以根据具体需求在节点函数中实现缓存——LangGraph 对此不作规定。

  性能方面的考虑：更多节点并不意味着执行更慢。LangGraph 默认在后台写入检查点（[异步持久性模式](/oss/python/langgraph/checkpointers#durability-modes)），因此你的图会继续运行而无需等待检查点完成。这意味着你可以获得频繁的检查点而性能影响极小。如有需要，你可以调整此行为——使用 `"exit"` 模式仅在完成时创建检查点，或使用 `"sync"` 模式阻塞执行直到每个检查点写入完成。
</Accordion>

### 接下来去哪里

这只是用 LangGraph 构建智能体思维方式的入门介绍。你可以在此基础上扩展：

<CardGroup cols={2}>
  <Card title="人在回路模式" icon="user-check" href="/oss/python/langgraph/interrupts">
    了解如何在执行前添加工具审批、批量审批和其他模式
  </Card>

  <Card title="子图" icon="hierarchy" href="/oss/python/langgraph/use-subgraphs">
    为复杂的多步骤操作创建子图
  </Card>

  <Card title="流式处理" icon="broadcast" href="/oss/python/langgraph/streaming">
    添加流式处理，向用户展示实时进度
  </Card>

  <Card title="可观测性" icon="chart-line" href="/oss/python/langgraph/observability">
    使用 LangSmith 添加可观测性，用于调试和监控
  </Card>

  <Card title="工具集成" icon="tool" href="/oss/python/langchain/tools">
    集成更多工具，用于网络搜索、数据库查询和 API 调用
  </Card>

  <Card title="重试逻辑" icon="rotate" href="/oss/python/langgraph/use-graph-api#add-retry-policies">
    为失败的操作实现带指数退避的重试逻辑
  </Card>
</CardGroup>

***

<div className="source-links">
  <Callout icon="terminal-2">
    [通过 MCP 将这些文档连接到 Claude、VSCode 等](/use-these-docs)，获取实时解答。
  </Callout>

  <Callout icon="edit">
    [在 GitHub 上编辑此页面](https://github.com/langchain-ai/docs/edit/main/src/oss/langgraph/thinking-in-langgraph.mdx) 或[提交问题](https://github.com/langchain-ai/docs/issues/new/choose)。
  </Callout>
</div>