# 中断

中断允许您在特定点暂停图执行，并在继续之前等待外部输入。这支持了需要外部输入才能继续的人机协同模式。当触发中断时，LangGraph 使用其[持久化](/oss/python/langgraph/persistence)层保存图状态，并无限期等待，直到您恢复执行。

中断的工作原理是在图节点的任何位置调用 `interrupt()` 函数。该函数接受任何可 JSON 序列化的值，该值会呈现给调用者。当您准备好继续时，您使用 `Command` 重新调用图来恢复执行，该值随后会成为节点内部 `interrupt()` 调用的返回值。

与静态断点（在特定节点之前或之后暂停）不同，中断是**动态的**：它们可以放置在代码中的任何位置，并且可以基于您的应用程序逻辑进行条件判断。

* **检查点机制保持您的位置：** 检查点存储写入确切的图状态，以便您可以稍后恢复，即使在错误状态下也是如此。
* **`thread_id` 是您的指针：** 设置 `config={"configurable": {"thread_id": ...}}` 告诉检查点存储要加载哪个状态。
* **中断载荷通过 `stream.interrupts` 呈现：** 使用[事件流式处理](/oss/python/langgraph/event-streaming)（`graph.stream_events(..., version="v3")`）时，您传递给 `interrupt()` 的值会出现在 `stream.interrupts` 上，当运行因等待输入而暂停时，`stream.interrupted` 为 `True`。

您选择的 `thread_id` 实际上是您的持久游标。重复使用它会恢复同一个检查点；使用新值会启动一个状态为空的全新线程。

## 使用 `interrupt` 暂停

[`interrupt`](https://reference.langchain.com/python/langgraph/types/interrupt) 函数会暂停图执行并向调用者返回一个值。当您在节点内调用 [`interrupt`](https://reference.langchain.com/python/langgraph/types/interrupt) 时，LangGraph 会保存当前图状态并等待您提供输入以恢复执行。

要使用 [`interrupt`](https://reference.langchain.com/python/langgraph/types/interrupt)，您需要：

1. 一个用于持久化图状态的**检查点存储**（生产环境使用持久化检查点存储）
2. 配置中的**线程 ID**，以便运行时知道从哪个状态恢复
3. 在您想要暂停的位置调用 `interrupt()`（载荷必须是可 JSON 序列化的）

```python theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
from langgraph.types import interrupt

def approval_node(state: State):
    # Pause and ask for approval
    approved = interrupt("Do you approve this action?")

    # When you resume, Command(resume=...) returns that value here
    return {"approved": approved}
```

当您调用 [`interrupt`](https://reference.langchain.com/python/langgraph/types/interrupt) 时，会发生以下情况：

1. **图执行被挂起**，精确地发生在调用 [`interrupt`](https://reference.langchain.com/python/langgraph/types/interrupt) 的位置

2. **状态被保存**，使用检查点存储，以便以后可以恢复执行。在生产环境中，这应该是持久化检查点存储（例如由数据库支持）

3. **值返回给调用者**，在使用[事件流式处理](/oss/python/langgraph/event-streaming)（`graph.stream_events(..., version="v3")`）时通过 `stream.interrupts` 呈现，或在使用默认的 `invoke()` API 时位于 `__interrupt__` 下；它可以是任何可 JSON 序列化的值（字符串、对象、数组等）

4. **图无限期等待**，直到您提供响应恢复执行

5. **响应被传回**节点，成为 `interrupt()` 调用的返回值

## 恢复中断

在中断暂停执行后，您可以通过再次调用图并使用包含恢复值的 `Command` 来恢复它。恢复值会被传回 `interrupt` 调用，允许节点使用外部输入继续执行。

驱动可能中断的图的推荐方式是[事件流式处理](/oss/python/langgraph/event-streaming)——它通过 `stream.interrupts` 和 `stream.interrupted` 呈现中断，并通过 `stream.output` 暴露最终状态。

```python theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
from langgraph.types import Command

# Initial run - hits the interrupt and pauses
# thread_id is the persistent pointer (stores a stable ID in production)
config = {"configurable": {"thread_id": "thread-1"}}
stream = graph.stream_events({"input": "data"}, config=config, version="v3")

# Drain the stream to drive the run; stream.output awaits the final state.
final = stream.output

# stream.interrupted is True when the run paused for human input, and
# stream.interrupts contains the payloads passed to interrupt().
if stream.interrupted:
    print(stream.interrupts)
    # > (Interrupt(value='Do you approve this action?'),)

# Resume with the human's response
# The resume payload becomes the return value of interrupt() inside the node
resumed = graph.stream_events(Command(resume=True), config=config, version="v3")
final = resumed.output
```

<Note>
  默认的 `graph.invoke(...)` API 仍然有效，并在 `result["__interrupt__"]` 下呈现中断。当您不需要流式投影时使用它；否则请优先使用 `graph.stream_events(..., version="v3")`。
</Note>

**关于恢复的要点：**

* 恢复时必须使用与中断发生时**相同的线程 ID**
* 传递给 `Command(resume=...)` 的值会成为 [`interrupt`](https://reference.langchain.com/python/langgraph/types/interrupt) 调用的返回值
* 恢复时节点会从调用 [`interrupt`](https://reference.langchain.com/python/langgraph/types/interrupt) 的节点的**开头**重新开始，因此 [`interrupt`](https://reference.langchain.com/python/langgraph/types/interrupt) 之前的任何代码都会再次运行
* 您可以传递任何可 JSON 序列化的值作为恢复值

<Warning>
  `Command(resume=...)` 是**唯一**设计作为 `invoke()`/`stream()`/`stream_events()` 输入的 `Command` 模式。其他 `Command` 参数（`update`、`goto`、`graph`）是为[从节点函数返回](/oss/python/langgraph/graph-api#command)设计的。不要把 `Command(update=...)` 作为继续多轮对话的输入——请传递普通输入字典。
</Warning>

## 常见模式

中断解锁的关键能力是在执行时暂停并等待外部输入。这对各种用例都很有用，包括：

* <Icon icon="circle-check" /> [审批工作流](#approve-or-reject)：在执行关键操作（API 调用、数据库更改、金融交易）之前暂停
* <Icon icon="link" /> [处理多个中断](#handling-multiple-interrupts)：在单次调用中恢复多个中断时，将中断 ID 与恢复值配对
* <Icon icon="pencil" /> [审查和编辑](#review-and-edit-state)：让人类在继续之前审查和修改 LLM 输出或工具调用
* <Icon icon="tool" /> [中断工具调用](#interrupts-in-tools)：在执行工具调用之前暂停，以审查和编辑工具调用
* <Icon icon="shield-check" /> [验证人工输入](#validating-human-input)：在进入下一步之前暂停以验证人工输入

### 使用人机协同（HITL）中断进行流式处理

在构建具有人机协同工作流的交互式 Agent 时，您可以使用[事件流式处理](/oss/python/langgraph/event-streaming)同时消费消息块和状态快照，同时处理中断。

在循环中使用 `graph.stream_events(..., version="v3")` 返回的带类型投影，直到运行结束：

* 通过 `stream.messages` 逐 token 流式传输 AI 响应
* 通过 `stream.values` 观察每步状态快照
* 通过 `stream.interrupted` 检测中断，并从 `stream.interrupts` 读取其载荷
* 通过再次调用 `stream_events` 并传入 `Command(resume=...)` 恢复执行，重复直到 `stream.interrupted` 为 false

```python theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
from langgraph.types import Command

stream_input: dict | Command = initial_input

while True:
    stream = graph.stream_events(stream_input, config=config, version="v3")

    # Stream LLM message chunks (including any in subgraphs) as they arrive.
    for message in stream.messages:
        for token in message.text:
            display_streaming_content(token)

    # After the run finishes (or pauses), check for interrupts and resume.
    if not stream.interrupted:
        final_state = stream.output
        break

    interrupt_info = stream.interrupts[0].value
    user_response = get_user_input(interrupt_info)
    stream_input = Command(resume=user_response)
```

* **`stream.messages`**：以内容块形式呈现的聊天模型输出；迭代每个 `message.text` 获取 token 增量。对于嵌套子图，从 `stream.subgraphs[*].messages` 读取消息块。
* **`stream.values`**：每一步之后的完整状态快照
* **`stream.interrupted` / `stream.interrupts`**：每次运行后，检查图是否暂停；从 `stream.interrupts` 读取载荷
* **`Command(resume=...)`**：作为下一次 `stream_events` 输入传入以恢复；循环直到运行完成且不再中断

### 处理多个中断

当并行分支同时中断时（例如，扇出到多个各自调用 `interrupt()` 的节点），您可能需要在单次调用中恢复多个中断。
在单次调用中恢复多个中断时，将每个中断 ID 映射到其恢复值。
这确保每个响应在运行时与正确的中断配对。

```python theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
from typing import Annotated, TypedDict
import operator

from langgraph.checkpoint.memory import InMemorySaver
from langgraph.graph import END, START, StateGraph
from langgraph.types import Command, interrupt


class State(TypedDict):
    vals: Annotated[list[str], operator.add]


def node_a(state):
    answer = interrupt("question_a")
    return {"vals": [f"a:{answer}"]}


def node_b(state):
    answer = interrupt("question_b")
    return {"vals": [f"b:{answer}"]}


graph = (
    StateGraph(State)
    .add_node("a", node_a)
    .add_node("b", node_b)
    .add_edge(START, "a")
    .add_edge(START, "b")
    .add_edge("a", END)
    .add_edge("b", END)
    .compile(checkpointer=InMemorySaver())
)

config = {"configurable": {"thread_id": "1"}}

# Step 1: stream events to drive the run; both parallel nodes hit interrupt() and pause
stream = graph.stream_events({"vals": []}, config, version="v3")
_ = stream.output  # drive the stream to completion
# stream.interrupts contains the pending Interrupt payloads
print(stream.interrupts)
# > (Interrupt(value='question_a', id='...'), Interrupt(value='question_b', id='...'))

# Step 2: resume all pending interrupts at once
resume_map = {
    i.id: f"answer for {i.value}" for i in stream.interrupts
}
resumed = graph.stream_events(Command(resume=resume_map), config, version="v3")

print("Final state:", resumed.output)
# Final state: {'vals': ['a:answer for question_a', 'b:answer for question_b']}
```

### 批准或拒绝

中断最常见的用途之一是在关键操作之前暂停并请求批准。例如，您可能希望让人批准 API 调用、数据库更改或任何其他重要决策。

```python theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
from typing import Literal
from langgraph.types import interrupt, Command

def approval_node(state: State) -> Command[Literal["proceed", "cancel"]]:
    # Pause execution; payload shows up on stream.interrupts (with stream_events) or result["__interrupt__"] (with invoke)
    is_approved = interrupt({
        "question": "Do you want to proceed with this action?",
        "details": state["action_details"]
    })

    # Route based on the response
    if is_approved:
        return Command(goto="proceed")  # Runs after the resume payload is provided
    else:
        return Command(goto="cancel")
```

恢复图时，传入 `True` 表示批准，传入 `False` 表示拒绝：

```python theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
# To approve
graph.stream_events(Command(resume=True), config=config, version="v3").output

# To reject
graph.stream_events(Command(resume=False), config=config, version="v3").output
```

<Accordion title="完整示例">
  ```python theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
  from typing import Literal, Optional, TypedDict

  from langgraph.checkpoint.memory import InMemorySaver
  from langgraph.graph import END, START, StateGraph
  from langgraph.types import Command, interrupt


  class ApprovalState(TypedDict):
      action_details: str
      status: Optional[Literal["pending", "approved", "rejected"]]


  def approval_node(state: ApprovalState) -> Command[Literal["proceed", "cancel"]]:
      # Expose details so the caller can render them in a UI
      decision = interrupt(
          {
              "question": "Approve this action?",
              "details": state["action_details"],
          }
      )

      # Route to the appropriate node after resume
      return Command(goto="proceed" if decision else "cancel")


  def proceed_node(state: ApprovalState):
      return {"status": "approved"}


  def cancel_node(state: ApprovalState):
      return {"status": "rejected"}


  builder = StateGraph(ApprovalState)
  builder.add_node("approval", approval_node)
  builder.add_node("proceed", proceed_node)
  builder.add_node("cancel", cancel_node)
  builder.add_edge(START, "approval")
  builder.add_edge("proceed", END)
  builder.add_edge("cancel", END)

  # Use a more durable checkpointer in production
  checkpointer = InMemorySaver()
  graph = builder.compile(checkpointer=checkpointer)

  config = {"configurable": {"thread_id": "approval-123"}}
  initial = graph.stream_events(
      {"action_details": "Transfer $500", "status": "pending"},
      config=config,
      version="v3",
  )
  _ = initial.output  # drive the stream to completion
  print(initial.interrupts)  # -> (Interrupt(value={'question': ..., 'details': ...}),)

  # Resume with the decision; True routes to proceed, False to cancel
  resumed = graph.stream_events(Command(resume=True), config=config, version="v3")
  print(resumed.output["status"])
  ```
</Accordion>

### 审查和编辑状态

有时您希望在继续之前让人审查和编辑部分图状态。这对于纠正 LLM、添加缺失信息或进行调整很有用。

```python theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
from langgraph.types import interrupt

def review_node(state: State):
    # Pause and show the current content for review (payload surfaces on stream.interrupts)
    edited_content = interrupt({
        "instruction": "Review and edit this content",
        "content": state["generated_text"]
    })

    # Update the state with the edited version
    return {"generated_text": edited_content}
```

恢复时，提供编辑后的内容：

```python theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
graph.stream_events(
    Command(resume="The edited and improved text"),  # Value becomes the return from interrupt()
    config=config,
    version="v3",
).output
```

<Accordion title="完整示例">
  ```python theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
  from typing import TypedDict

  from langgraph.checkpoint.memory import MemorySaver
  from langgraph.graph import END, START, StateGraph
  from langgraph.types import Command, interrupt


  class ReviewState(TypedDict):
      generated_text: str


  def review_node(state: ReviewState):
      # Ask a reviewer to edit the generated content
      updated = interrupt(
          {
              "instruction": "Review and edit this content",
              "content": state["generated_text"],
          }
      )
      return {"generated_text": updated}


  builder = StateGraph(ReviewState)
  builder.add_node("review", review_node)
  builder.add_edge(START, "review")
  builder.add_edge("review", END)

  checkpointer = MemorySaver()
  graph = builder.compile(checkpointer=checkpointer)

  config = {"configurable": {"thread_id": "review-42"}}
  initial = graph.stream_events(
      {"generated_text": "Initial draft"}, config=config, version="v3"
  )
  _ = initial.output  # drive the stream to completion
  print(initial.interrupts)  # -> (Interrupt(value={'instruction': ..., 'content': ...}),)

  # Resume with the edited text from the reviewer
  final_state = graph.stream_events(
      Command(resume="Improved draft after review"),
      config=config,
      version="v3",
  )
  print(final_state.output["generated_text"])  # -> "Improved draft after review"
  ```
</Accordion>

### 工具中的中断

您也可以将中断直接放在工具函数内部。这使得工具本身在每次被调用时暂停等待批准，并允许在工具调用执行之前对其进行人工审查和编辑。

首先，定义一个使用 [`interrupt`](https://reference.langchain.com/python/langgraph/types/interrupt) 的工具：

```python theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
from langchain.tools import tool
from langgraph.types import interrupt

@tool
def send_email(to: str, subject: str, body: str):
    """Send an email to a recipient."""

    # Pause before sending; payload surfaces on stream.interrupts when using event streaming
    response = interrupt({
        "action": "send_email",
        "to": to,
        "subject": subject,
        "body": body,
        "message": "Approve sending this email?"
    })

    if response.get("action") == "approve":
        # Resume value can override inputs before executing
        final_to = response.get("to", to)
        final_subject = response.get("subject", subject)
        final_body = response.get("body", body)
        return f"Email sent to {final_to} with subject '{final_subject}'"
    return "Email cancelled by user"
```

这种方法在您希望审批逻辑与工具本身共存时非常有用，使它可以在图的不同部分复用。LLM 可以自然调用该工具，每当工具被调用时中断就会暂停执行，允许您批准、编辑或取消操作。

<Accordion title="完整示例">
  ```python theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
  import sqlite3
  import operator
  from typing import TypedDict, Annotated, Literal
  from langchain.tools import tool
  from langchain_anthropic import ChatAnthropic
  from langgraph.checkpoint.sqlite import SqliteSaver
  from langgraph.graph import StateGraph, START, END
  from langgraph.types import Command, interrupt
  from langchain.messages import AnyMessage, SystemMessage, ToolMessage


  class AgentState(TypedDict):
      messages: Annotated[list[AnyMessage], operator.add]


  @tool
  def send_email(to: str, subject: str, body: str):
      """Send an email to a recipient."""

      # Pause before sending; payload surfaces on stream.interrupts when using event streaming
      response = interrupt({
          "action": "send_email",
          "to": to,
          "subject": subject,
          "body": body,
          "message": "Approve sending this email?",
      })

      if response.get("action") == "approve":
          final_to = response.get("to", to)
          final_subject = response.get("subject", subject)
          final_body = response.get("body", body)

          # Actually send the email (your implementation here)
          print(f"[send_email] to={final_to} subject={final_subject} body={final_body}")
          return f"Email sent to {final_to}"

      return "Email cancelled by user"


  model = ChatAnthropic(model="claude-sonnet-4-6").bind_tools([send_email])
  tools_by_name = {"send_email": send_email}


  def agent_node(state: AgentState):
      # LLM may decide to call the tool; interrupt pauses before sending
      result = model.invoke(state["messages"])
      return {"messages": [result]}

  def tool_node(state: AgentState):
      """Performs the tool call"""
      result = []
      for tool_call in state["messages"][-1].tool_calls:
          tool = tools_by_name[tool_call["name"]]
          observation = tool.invoke(tool_call["args"])
          result.append(ToolMessage(content=observation, tool_call_id=tool_call["id"]))
      return {"messages": result}

  def should_continue(state: AgentState) -> Literal["tool_node", END]:
      """Decide if we should continue the loop or stop based upon whether the LLM made a tool call"""
      messages = state["messages"]
      last_message = messages[-1]

      if last_message.tool_calls:
          return "tool_node"
      return END

  builder = StateGraph(AgentState)
  builder.add_node("agent", agent_node)
  builder.add_node("tool_node", tool_node)

  builder.add_edge(START, "agent")
  builder.add_conditional_edges("agent", should_continue, ["tool_node", END])  # Routes to "tools" or END
  builder.add_edge("tool_node", "agent")  # Loop back after tools

  checkpointer = SqliteSaver(
      sqlite3.connect("tool-approval.db", check_same_thread=False)
  )
  graph = builder.compile(checkpointer=checkpointer)

  config = {"configurable": {"thread_id": "email-workflow"}}
  initial = graph.stream_events(
      {
          "messages": [
              {"role": "user", "content": "Send an email to alice@example.com about the meeting"}
          ]
      },
      config=config,
      version="v3",
  )
  initial.output  # drive the stream to completion
  print(initial.interrupts)  # -> (Interrupt(value={'action': 'send_email', ...}),)

  # Resume with approval and optionally edited arguments
  resumed = graph.stream_events(
      Command(resume={"action": "approve", "subject": "Updated subject"}),
      config=config,
      version="v3",
  )
  print(resumed.output["messages"][-1])  # -> Tool result returned by send_email
  ```
</Accordion>

### 验证人工输入

有时您需要验证来自人类的输入，如果值无效则重新提示。推荐的方法是在**每次节点调用中调用一次 `interrupt()`**，从节点返回并将错误消息存储在状态中，并使用**条件边**循环回节点，直到提供有效值。

<Warning>
  **避免在单个节点内使用 `while True` + `interrupt()` 循环。** 因为节点在每次恢复时都会从头重新运行（参见[中断规则](#rules-of-interrupts)），多次调用 `interrupt()` 的循环会导致每次恢复都重放之前的所有迭代：第一次恢复重放 1 次迭代，第二次恢复重放 2 次，依此类推。结果是循环体内的任何代码都会指数级地重新执行。
</Warning>

正确的模式：

1. 将重新提示的问题存储在状态中（例如 `pending_question`）。
2. 在节点中**恰好调用一次** `interrupt()`，传入状态中的当前问题。
3. 如果答案无效，返回更新的 `pending_question`，以便下一次调用重新提示。
4. 使用 `add_conditional_edges` 路由回节点，直到收集到有效值。

```python theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
from typing import TypedDict

from langgraph.graph import END, START, StateGraph
from langgraph.types import interrupt


class FormState(TypedDict):
    age: int | None
    pending_question: str | None


def get_age_node(state: FormState):
    question = state.get("pending_question") or "What is your age?"
    answer = interrupt(question)  # called exactly once per invocation
    if isinstance(answer, int) and answer > 0:
        return {"age": answer, "pending_question": None}
    return {"pending_question": f"'{answer}' is not a valid age. Please enter a positive number."}


def route(state: FormState):
    return END if state.get("age") is not None else "collect_age"


builder = StateGraph(FormState)
builder.add_node("collect_age", get_age_node)
builder.add_edge(START, "collect_age")
builder.add_conditional_edges("collect_age", route)
```

每次恢复都会恰好调用一次 `get_age_node`，运行一次 `interrupt()` 调用，然后退出。当答案无效时，条件边循环回，下一次中断使用更新后的问题重新提示。每次恢复没有代码执行超过一次。

<Accordion title="完整示例">
  ```python theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
  from typing import TypedDict

  from langgraph.checkpoint.memory import InMemorySaver
  from langgraph.graph import END, START, StateGraph
  from langgraph.types import Command, interrupt


  class FormState(TypedDict):
      age: int | None
      pending_question: str | None


  def get_age_node(state: FormState):
      question = state.get("pending_question") or "What is your age?"
      answer = interrupt(question)  # called exactly once per node invocation
      print(f"I got {answer}")  # runs exactly once per resume
      if isinstance(answer, int) and answer > 0:
          return {"age": answer, "pending_question": None}
      return {"pending_question": f"'{answer}' is not a valid age. Please enter a positive number."}


  def route(state: FormState):
      # Loop back to collect_age until we have a valid age
      return END if state.get("age") is not None else "collect_age"


  builder = StateGraph(FormState)
  builder.add_node("collect_age", get_age_node)
  builder.add_edge(START, "collect_age")
  builder.add_conditional_edges("collect_age", route)

  checkpointer = InMemorySaver()
  graph = builder.compile(checkpointer=checkpointer)

  config = {"configurable": {"thread_id": "form-1"}}
  first = graph.stream_events({"age": None, "pending_question": None}, config=config, version="v3")
  _ = first.output  # drive the stream to completion
  print(first.interrupts)  # -> (Interrupt(value='What is your age?', ...),)

  # Provide invalid data; the node re-prompts via the conditional edge
  retry = graph.stream_events(Command(resume="thirty"), config=config, version="v3")
  _ = retry.output
  print(retry.interrupts)  # -> (Interrupt(value="'thirty' is not a valid age...", ...),)

  # Provide valid data; route() returns END and the graph finishes
  final = graph.stream_events(Command(resume=30), config=config, version="v3")
  print(final.output["age"])  # -> 30
  ```
</Accordion>

## 中断规则

当您在节点内调用 [`interrupt`](https://reference.langchain.com/python/langgraph/types/interrupt) 时，LangGraph 通过抛出一个信号异常来挂起执行，该异常向运行时发出暂停信号。这个异常会在调用栈中向上传播，并被运行时捕获，运行时通知图保存当前状态并等待外部输入。

当执行恢复时（在您提供请求的输入之后），运行时从**开头**重新启动整个节点——它不会从调用 [`interrupt`](https://reference.langchain.com/python/langgraph/types/interrupt) 的确切代码行恢复。这意味着在 [`interrupt`](https://reference.langchain.com/python/langgraph/types/interrupt) 之前运行的任何代码都会再次执行。正因如此，在处理中断时有几个重要的规则需要遵循，以确保它们按预期工作。

### 不要在 try/except 中包装 `interrupt` 调用

[`interrupt`](https://reference.langchain.com/python/langgraph/types/interrupt) 在调用点暂停执行的方式是抛出一个特殊异常。如果您将 [`interrupt`](https://reference.langchain.com/python/langgraph/types/interrupt) 调用包装在 try/except 块中，您会捕获这个异常，中断将不会传回图。

* ✅ 将 [`interrupt`](https://reference.langchain.com/python/langgraph/types/interrupt) 调用与容易出错的代码分开
* ✅ 在 try/except 块中使用特定的异常类型

<CodeGroup>
  ```python Separating logic theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
  def node_a(state: State):
      # ✅ Good: interrupting first, then handling
      # error conditions separately
      interrupt("What's your name?")
      try:
          fetch_data()  # This can fail
      except Exception as e:
          print(e)
      return state
  ```

  ```python Explicit exception handling theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
  def node_a(state: State):
      # ✅ Good: catching specific exception types
      # will not catch the interrupt exception
      try:
          name = interrupt("What's your name?")
          fetch_data()  # This can fail
      except NetworkException as e:
          print(e)
      return state
  ```
</CodeGroup>

* 🔴 不要在裸 try/except 块中包装 [`interrupt`](https://reference.langchain.com/python/langgraph/types/interrupt) 调用

```python theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
def node_a(state: State):
    # ❌ Bad: wrapping interrupt in bare try/except
    # will catch the interrupt exception
    try:
        interrupt("What's your name?")
    except Exception as e:
        print(e)
    return state
```

### 不要重新排序节点内的 `interrupt` 调用

在单个节点中使用多个中断很常见，但如果处理不当，这可能导致意外行为。

当一个节点包含多个中断调用时，LangGraph 会保留一个特定于执行该节点的任务的恢复值列表。每当执行恢复时，它都会从节点的开头开始。对于遇到的每个中断，LangGraph 都会检查任务的恢复列表中是否存在匹配的值。匹配是**严格基于索引的**，因此节点内中断调用的顺序很重要。

* ✅ 保持 [`interrupt`](https://reference.langchain.com/python/langgraph/types/interrupt) 调用在节点执行之间保持一致

```python theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
def node_a(state: State):
    # ✅ Good: interrupt calls happen in the same order every time
    name = interrupt("What's your name?")
    age = interrupt("What's your age?")
    city = interrupt("What's your city?")

    return {
        "name": name,
        "age": age,
        "city": city
    }
```

* 🔴 不要在节点内有条件地跳过 [`interrupt`](https://reference.langchain.com/python/langgraph/types/interrupt) 调用
* 🔴 不要使用跨执行不确定的逻辑循环 [`interrupt`](https://reference.langchain.com/python/langgraph/types/interrupt) 调用，包括 `while True` 验证循环。请改用条件边（参见[验证人工输入](#validating-human-input)）

<CodeGroup>
  ```python Skipping interrupts theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
  def node_a(state: State):
      # ❌ Bad: conditionally skipping interrupts changes the order
      name = interrupt("What's your name?")

      # On first run, this might skip the interrupt
      # On resume, it might not skip it - causing index mismatch
      if state.get("needs_age"):
          age = interrupt("What's your age?")

      city = interrupt("What's your city?")

      return {"name": name, "city": city}
  ```

  ```python Looping interrupts theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
  def node_a(state: State):
      # ❌ Bad: looping based on non-deterministic data
      # The number of interrupts changes between executions
      results = []
      for item in state.get("dynamic_list", []):  # List might change between runs
          result = interrupt(f"Approve {item}?")
          results.append(result)

      return {"results": results}
  ```
</CodeGroup>

### 不要在 `interrupt` 调用中返回复杂值

根据使用的检查点存储，复杂值可能无法序列化（例如您无法序列化一个函数）。为了使您的图适应任何部署，最佳实践是只使用可以合理序列化的值。

* ✅ 向 [`interrupt`](https://reference.langchain.com/python/langgraph/types/interrupt) 传递简单、可 JSON 序列化的类型
* ✅ 传递带简单值的字典/对象

<CodeGroup>
  ```python Simple values theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
  def node_a(state: State):
      # ✅ Good: passing simple types that are serializable
      name = interrupt("What's your name?")
      count = interrupt(42)
      approved = interrupt(True)

      return {"name": name, "count": count, "approved": approved}
  ```

  ```python Structured data theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
  def node_a(state: State):
      # ✅ Good: passing dictionaries with simple values
      response = interrupt({
          "question": "Enter user details",
          "fields": ["name", "email", "age"],
          "current_values": state.get("user", {})
      })

      return {"user": response}
  ```
</CodeGroup>

* 🔴 不要向 [`interrupt`](https://reference.langchain.com/python/langgraph/types/interrupt) 传递函数、类实例或其他复杂对象

<CodeGroup>
  ```python Functions theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
  def validate_input(value):
      return len(value) > 0

  def node_a(state: State):
      # ❌ Bad: passing a function to interrupt
      # The function cannot be serialized
      response = interrupt({
          "question": "What's your name?",
          "validator": validate_input  # This will fail
      })
      return {"name": response}
  ```

  ```python Class instances theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
  class DataProcessor:
      def __init__(self, config):
          self.config = config

  def node_a(state: State):
      processor = DataProcessor({"mode": "strict"})

      # ❌ Bad: passing a class instance to interrupt
      # The instance cannot be serialized
      response = interrupt({
          "question": "Enter data to process",
          "processor": processor  # This will fail
      })
      return {"result": response}
  ```
</CodeGroup>

### `interrupt` 之前调用的副作用必须是幂等的

因为中断的工作方式是重新运行调用它们的节点，所以在 [`interrupt`](https://reference.langchain.com/python/langgraph/types/interrupt) 之前调用的副作用（理想情况下）应该是幂等的。解释一下，幂等意味着相同的操作可以多次应用，而不会在初始执行之外改变结果。

举个例子，您可能在节点内部有一个更新记录的 API 调用。如果在调用之后调用了 [`interrupt`](https://reference.langchain.com/python/langgraph/types/interrupt)，当节点恢复时它会被多次重新运行，可能会覆盖最初的更新或创建重复记录。

* ✅ 在 [`interrupt`](https://reference.langchain.com/python/langgraph/types/interrupt) 之前使用幂等操作
* ✅ 将副作用放在 [`interrupt`](https://reference.langchain.com/python/langgraph/types/interrupt) 调用之后
* ✅ 尽可能将副作用分离到单独的节点中

<CodeGroup>
  ```python Idempotent operations theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
  def node_a(state: State):
      # ✅ Good: using upsert operation which is idempotent
      # Running this multiple times will have the same result
      db.upsert_user(
          user_id=state["user_id"],
          status="pending_approval"
      )

      approved = interrupt("Approve this change?")

      return {"approved": approved}
  ```

  ```python Side effects after interrupt theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
  def node_a(state: State):
      # ✅ Good: placing side effect after the interrupt
      # This ensures it only runs once after approval is received
      approved = interrupt("Approve this change?")

      if approved:
          db.create_audit_log(
              user_id=state["user_id"],
              action="approved"
          )

      return {"approved": approved}
  ```

  ```python Separating into different nodes theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
  def approval_node(state: State):
      # ✅ Good: only handling the interrupt in this node
      approved = interrupt("Approve this change?")

      return {"approved": approved}

  def notification_node(state: State):
      # ✅ Good: side effect happens in a separate node
      # This runs after approval, so it only executes once
      if (state.approved):
          send_notification(
              user_id=state["user_id"],
              status="approved"
          )

      return state
  ```
</CodeGroup>

* 🔴 不要在 [`interrupt`](https://reference.langchain.com/python/langgraph/types/interrupt) 之前执行非幂等操作
* 🔴 不要在不检查记录是否存在的情况下创建新记录

<CodeGroup>
  ```python Creating records theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
  def node_a(state: State):
      # ❌ Bad: creating a new record before interrupt
      # This will create duplicate records on each resume
      audit_id = db.create_audit_log({
          "user_id": state["user_id"],
          "action": "pending_approval",
          "timestamp": datetime.now()
      })

      approved = interrupt("Approve this change?")

      return {"approved": approved, "audit_id": audit_id}
  ```

  ```python Appending to lists theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
  def node_a(state: State):
      # ❌ Bad: appending to a list before interrupt
      # This will add duplicate entries on each resume
      db.append_to_history(state["user_id"], "approval_requested")

      approved = interrupt("Approve this change?")

      return {"approved": approved}
  ```
</CodeGroup>

## 与作为函数调用的子图一起使用

在节点内调用子图时，父图将从**调用子图且触发 [`interrupt`](https://reference.langchain.com/python/langgraph/types/interrupt) 的节点的开头**恢复执行。同样，**子图**也会从调用 [`interrupt`](https://reference.langchain.com/python/langgraph/types/interrupt) 的节点的开头恢复。

```python theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
def node_in_parent_graph(state: State):
    some_code()  # <-- This will re-execute when resumed
    # Invoke a subgraph as a function.
    # The subgraph contains an `interrupt` call.
    subgraph_result = subgraph.invoke(some_input)
    # ...

def node_in_subgraph(state: State):
    some_other_code()  # <-- This will also re-execute when resumed
    result = interrupt("What's your name?")
    # ...
```

## 使用中断进行调试

要调试和测试图，您可以使用静态中断作为断点，一次一个节点地逐步执行图。静态中断在定义的点触发，可以在节点执行之前或之后。您可以在编译图时指定 `interrupt_before` 和 `interrupt_after` 来设置它们。

<Note>
  不建议将静态中断用于人机协同工作流。请改用 [`interrupt`](https://reference.langchain.com/python/langgraph/types/interrupt) 函数。
</Note>

<Tabs>
  <Tab title="编译时">
    ```python theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
    graph = builder.compile(
        interrupt_before=["node_a"],  # [!code highlight]
        interrupt_after=["node_b", "node_c"],  # [!code highlight]
        checkpointer=checkpointer,
    )

    # Pass a thread ID to the graph
    config = {
        "configurable": {
            "thread_id": "some_thread"
        }
    }

    # Run the graph until the breakpoint
    graph.invoke(inputs, config=config)  # [!code highlight]

    # Resume the graph
    graph.invoke(None, config=config)  # [!code highlight]
    ```

    1. 断点在 `compile` 时设置。
    2. `interrupt_before` 指定在节点执行之前暂停执行的节点。
    3. `interrupt_after` 指定在节点执行之后暂停执行的节点。
    4. 需要检查点存储才能启用断点。
    5. 图会运行到第一个断点。
    6. 通过为输入传入 `None` 恢复图。这将运行图直到命中下一个断点。
  </Tab>

  <Tab title="运行时">
    ```python theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
    config = {
        "configurable": {
            "thread_id": "some_thread"
        }
    }

    # Run the graph until the breakpoint
    graph.invoke(
        inputs,
        interrupt_before=["node_a"],  # [!code highlight]
        interrupt_after=["node_b", "node_c"],  # [!code highlight]
        config=config,
    )

    # Resume the graph
    graph.invoke(None, config=config)  # [!code highlight]
    ```

    1. 使用 `interrupt_before` 和 `interrupt_after` 参数调用 `graph.invoke`。这是运行时配置，可以在每次调用时更改。
    2. `interrupt_before` 指定在节点执行之前暂停执行的节点。
    3. `interrupt_after` 指定在节点执行之后暂停执行的节点。
    4. 图会运行到第一个断点。
    5. 通过为输入传入 `None` 恢复图。这将运行图直到命中下一个断点。
  </Tab>
</Tabs>

<Tip>
  要调试您的中断，请使用 [LangSmith](/langsmith/observability)。
</Tip>

### 使用 LangSmith Studio

您可以使用 [LangSmith Studio](/langsmith/studio) 在运行图之前于 UI 中为图设置静态中断。您还可以使用 UI 在执行过程中的任何时间点检查图状态。

<img src="https://mintcdn.com/langchain-5e9cc07a/dL5Sn6Cmy9pwtY0V/oss/images/static-interrupt.png?fit=max&auto=format&n=dL5Sn6Cmy9pwtY0V&q=85&s=5aa4e7cea2ab147cef5b4e210dd6c4a1" alt="image" width="1252" height="1040" data-path="oss/images/static-interrupt.png" />

***

<div className="source-links">
  <Callout icon="terminal-2">
    [Connect these docs](/use-these-docs) to Claude, VSCode, and more via MCP for real-time answers.
  </Callout>

  <Callout icon="edit">
    [Edit this page on GitHub](https://github.com/langchain-ai/docs/edit/main/src/oss/langgraph/interrupts.mdx) or [file an issue](https://github.com/langchain-ai/docs/issues/new/choose).
  </Callout>
</div>