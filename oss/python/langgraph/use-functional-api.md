# 使用函数式 API

[**函数式 API**](/oss/python/langgraph/functional-api) 允许你以对现有代码的最小改动，将 LangGraph 的关键特性（[持久化](/oss/python/langgraph/persistence)、[记忆](/oss/python/langgraph/add-memory)、[人在回路](/oss/python/langgraph/interrupts)和[流式输出](/oss/python/langgraph/streaming)）添加到你的应用中。

<Tip>
  有关函数式 API 的概念性信息，请参阅 [函数式 API](/oss/python/langgraph/functional-api)。
</Tip>

## 创建简单工作流

定义 `entrypoint` 时，输入仅限于函数的第一个参数。要传递多个输入，可以使用字典。

```python theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
@entrypoint(checkpointer=checkpointer)
def my_workflow(inputs: dict) -> int:
    value = inputs["value"]
    another_value = inputs["another_value"]
    ...

my_workflow.invoke({"value": 1, "another_value": 2})
```

<Accordion title="扩展示例：简单工作流">
  ```python theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
  from langchain_core.utils.uuid import uuid7
  from langgraph.func import entrypoint, task
  from langgraph.checkpoint.memory import InMemorySaver

  # Task that checks if a number is even
  @task
  def is_even(number: int) -> bool:
      return number % 2 == 0

  # Task that formats a message
  @task
  def format_message(is_even: bool) -> str:
      return "The number is even." if is_even else "The number is odd."

  # Create a checkpointer for persistence
  checkpointer = InMemorySaver()

  @entrypoint(checkpointer=checkpointer)
  def workflow(inputs: dict) -> str:
      """Simple workflow to classify a number."""
      even = is_even(inputs["number"]).result()
      return format_message(even).result()

  # Run the workflow with a unique thread ID
  config = {"configurable": {"thread_id": str(uuid7())}}
  result = workflow.invoke({"number": 7}, config=config)
  print(result)
  ```
</Accordion>

<Accordion title="扩展示例：使用 LLM 撰写文章">
  本示例演示 `@task` 和 `@entrypoint` 装饰器的语法用法。由于提供了
  checkpointer，工作流的结果将被持久化保存在该
  checkpointer 中。

  ```python theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
  import uuid
  from langchain.chat_models import init_chat_model
  from langgraph.func import entrypoint, task
  from langgraph.checkpoint.memory import InMemorySaver

  model = init_chat_model('gpt-3.5-turbo')

  # Task: generate essay using an LLM
  @task
  def compose_essay(topic: str) -> str:
      """Generate an essay about the given topic."""
      return model.invoke([
          {"role": "system", "content": "You are a helpful assistant that writes essays."},
          {"role": "user", "content": f"Write an essay about {topic}."}
      ]).content

  # Create a checkpointer for persistence
  checkpointer = InMemorySaver()

  @entrypoint(checkpointer=checkpointer)
  def workflow(topic: str) -> str:
      """Simple workflow that generates an essay with an LLM."""
      return compose_essay(topic).result()

  # Execute the workflow
  config = {"configurable": {"thread_id": str(uuid7())}}
  result = workflow.invoke("the history of flight", config=config)
  print(result)
  ```
</Accordion>

## 并行执行

任务可以通过并发调用并等待结果来实现并行执行。这对于提升 IO 密集型任务（例如调用 LLM 的 API）的性能很有用。

```python theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
@task
def add_one(number: int) -> int:
    return number + 1

@entrypoint(checkpointer=checkpointer)
def graph(numbers: list[int]) -> list[str]:
    futures = [add_one(i) for i in numbers]
    return [f.result() for f in futures]
```

<Accordion title="扩展示例：并行 LLM 调用">
  本示例演示如何使用 `@task` 并行运行多个 LLM 调用。每次调用为不同的话题生成一段内容，然后将所有结果合并为单个文本输出。

  ```python theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
  import uuid
  from langchain.chat_models import init_chat_model
  from langgraph.func import entrypoint, task
  from langgraph.checkpoint.memory import InMemorySaver

  # Initialize the LLM model
  model = init_chat_model("gpt-3.5-turbo")

  # Task that generates a paragraph about a given topic
  @task
  def generate_paragraph(topic: str) -> str:
      response = model.invoke([
          {"role": "system", "content": "You are a helpful assistant that writes educational paragraphs."},
          {"role": "user", "content": f"Write a paragraph about {topic}."}
      ])
      return response.content

  # Create a checkpointer for persistence
  checkpointer = InMemorySaver()

  @entrypoint(checkpointer=checkpointer)
  def workflow(topics: list[str]) -> str:
      """Generates multiple paragraphs in parallel and combines them."""
      futures = [generate_paragraph(topic) for topic in topics]
      paragraphs = [f.result() for f in futures]
      return "\n\n".join(paragraphs)

  # Run the workflow
  config = {"configurable": {"thread_id": str(uuid7())}}
  result = workflow.invoke(["quantum computing", "climate change", "history of aviation"], config=config)
  print(result)
  ```

  本示例利用 LangGraph 的并发模型来改善执行时间，尤其是当任务涉及 LLM 补全等 I/O 时。
</Accordion>

## 调用图

**函数式 API** 与 [**图 API**](/oss/python/langgraph/graph-api) 可以在同一个应用中共用，因为它们共享相同的底层运行时。

```python theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
from langgraph.func import entrypoint
from langgraph.graph import StateGraph

builder = StateGraph()
...
some_graph = builder.compile()

@entrypoint()
def some_workflow(some_input: dict) -> int:
    # Call a graph defined using the graph API
    result_1 = some_graph.invoke(...)
    # Call another graph defined using the graph API
    result_2 = another_graph.invoke(...)
    return {
        "result_1": result_1,
        "result_2": result_2
    }
```

<Accordion title="扩展示例：从函数式 API 调用简单图">
  ```python theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
  import uuid
  from typing import TypedDict
  from langgraph.func import entrypoint
  from langgraph.checkpoint.memory import InMemorySaver
  from langgraph.graph import StateGraph

  # Define the shared state type
  class State(TypedDict):
      foo: int

  # Define a simple transformation node
  def double(state: State) -> State:
      return {"foo": state["foo"] * 2}

  # Build the graph using the Graph API
  builder = StateGraph(State)
  builder.add_node("double", double)
  builder.set_entry_point("double")
  graph = builder.compile()

  # Define the functional API workflow
  checkpointer = InMemorySaver()

  @entrypoint(checkpointer=checkpointer)
  def workflow(x: int) -> dict:
      result = graph.invoke({"foo": x})
      return {"bar": result["foo"]}

  # Execute the workflow
  config = {"configurable": {"thread_id": str(uuid7())}}
  print(workflow.invoke(5, config=config))  # Output: {'bar': 10}
  ```
</Accordion>

## 调用其他 entrypoint

你可以在 **entrypoint** 或 **task** 内部调用其他 **entrypoint**。

```python theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
@entrypoint() # Will automatically use the checkpointer from the parent entrypoint
def some_other_workflow(inputs: dict) -> int:
    return inputs["value"]

@entrypoint(checkpointer=checkpointer)
def my_workflow(inputs: dict) -> int:
    value = some_other_workflow.invoke({"value": 1})
    return value
```

<Accordion title="扩展示例：调用另一个 entrypoint">
  ```python theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
  import uuid
  from langgraph.func import entrypoint
  from langgraph.checkpoint.memory import InMemorySaver

  # Initialize a checkpointer
  checkpointer = InMemorySaver()

  # A reusable sub-workflow that multiplies a number
  @entrypoint()
  def multiply(inputs: dict) -> int:
      return inputs["a"] * inputs["b"]

  # Main workflow that invokes the sub-workflow
  @entrypoint(checkpointer=checkpointer)
  def main(inputs: dict) -> dict:
      result = multiply.invoke({"a": inputs["x"], "b": inputs["y"]})
      return {"product": result}

  # Execute the main workflow
  config = {"configurable": {"thread_id": str(uuid7())}}
  print(main.invoke({"x": 6, "y": 7}, config=config))  # Output: {'product': 42}
  ```
</Accordion>

## 流式输出

**函数式 API** 使用与 **图 API** 相同的流式机制。请
参阅[**流式指南**](/oss/python/langgraph/streaming)一节获取更多详情。

下面示例演示如何使用流式 API 从工作流运行中流式获取 value 数据块。

```python theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
config = {"configurable": {"thread_id": str(uuid7())}}

stream = main.stream_events({"x": 5}, config=config, version="v3")
for mode, chunk in stream.interleave("values"):
    print(f"{mode}: {chunk}")
# values: 10
```

1. 从 `langgraph.config` 中导入 [`get_stream_writer`](https://reference.langchain.com/python/langgraph/config/get_stream_writer)。
2. 在 entrypoint 内获取一个流写入器（stream writer）实例。
3. 在计算开始之前发出自定义数据。
4. 在计算出结果之后发出另一条自定义消息。
5. 使用 `stream_events()` 处理流式输出。
6. 遍历 `interleave("values")` 产生的 `(mode, chunk)` 组合。

<Warning>
  **Python \< 3.11 下的异步**
  如果使用 Python \< 3.11 编写异步代码，则无法使用 [`get_stream_writer`](https://reference.langchain.com/python/langgraph/config/get_stream_writer)。请
  直接使用 `StreamWriter` 类。更多详情请参阅 [Python \< 3.11 下的异步](/oss/python/langgraph/streaming#async)。

  ```python theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
  from langgraph.types import StreamWriter

  @entrypoint(checkpointer=checkpointer)
  async def main(inputs: dict, writer: StreamWriter) -> int:  # [!code highlight]
  ...
  ```
</Warning>

## 重试策略

```python theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
from langgraph.checkpoint.memory import InMemorySaver
from langgraph.func import entrypoint, task
from langgraph.types import RetryPolicy

# This variable is just used for demonstration purposes to simulate a network failure.
# It's not something you will have in your actual code.
attempts = 0

# Let's configure the RetryPolicy to retry on ValueError.
# The default RetryPolicy is optimized for retrying specific network errors.
retry_policy = RetryPolicy(retry_on=ValueError)

@task(retry_policy=retry_policy)
def get_info():
    global attempts
    attempts += 1

    if attempts < 2:
        raise ValueError('Failure')
    return "OK"

checkpointer = InMemorySaver()

@entrypoint(checkpointer=checkpointer)
def main(inputs, writer):
    return get_info().result()

config = {
    "configurable": {
        "thread_id": "1"
    }
}

main.invoke({'any_input': 'foobar'}, config=config)
```

```pycon theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
'OK'
```

## 设置 task 和 entrypoint 超时

将 `timeout` 参数与 `@task` 或 `@entrypoint` 一起使用，可以限制单次异步尝试的运行时长。超时时间可以秒或 `datetime.timedelta` 的形式指定。

```python theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
import asyncio

from langgraph.errors import NodeTimeoutError
from langgraph.func import entrypoint, task
from langgraph.types import RetryPolicy


@task(
    timeout=1.0,
    retry_policy=RetryPolicy(retry_on=NodeTimeoutError),
)
async def call_api(url: str) -> str:
    await asyncio.sleep(2)
    return f"result from {url}"


@entrypoint(timeout=5.0)
async def workflow(inputs: dict) -> str:
    return await call_api(inputs["url"])


try:
    await workflow.ainvoke({"url": "https://example.com"})
except NodeTimeoutError:
    print("Task timed out")
```

超时仅支持异步 task 和 entrypoint。如果在同步函数上设置 `timeout`，LangGraph 会在声明该 task 或 entrypoint 时抛出错误。

当 task 或 entrypoint 超过其超时时间时，LangGraph 会抛出 `NodeTimeoutError`，它是 Python 内置 `TimeoutError` 的子类。如果重试策略会对 `TimeoutError` 或 `NodeTimeoutError` 进行重试，则该次超时的尝试会被重试。超时对每次尝试独立生效，因此每次重试都会重置计时器。

## 缓存任务

```python theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
import time
from langgraph.cache.memory import InMemoryCache
from langgraph.func import entrypoint, task
from langgraph.types import CachePolicy


@task(cache_policy=CachePolicy(ttl=120))    # [!code highlight]
def slow_add(x: int) -> int:
    time.sleep(1)
    return x * 2


@entrypoint(cache=InMemoryCache())
def main(inputs: dict) -> dict[str, int]:
    result1 = slow_add(inputs["x"]).result()
    result2 = slow_add(inputs["x"]).result()
    return {"result1": result1, "result2": result2}


stream = main.stream_events({"x": 5}, version="v3")
for snapshot in stream.values:
    print(snapshot)
```

1. `ttl` 以秒为单位指定。超过此时长后缓存将失效。

## 出错后恢复

```python theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
import time
from langgraph.checkpoint.memory import InMemorySaver
from langgraph.func import entrypoint, task
from langgraph.types import StreamWriter

# This variable is just used for demonstration purposes to simulate a network failure.
# It's not something you will have in your actual code.
attempts = 0

@task()
def get_info():
    """
    Simulates a task that fails once before succeeding.
    Raises an exception on the first attempt, then returns "OK" on subsequent tries.
    """
    global attempts
    attempts += 1

    if attempts < 2:
        raise ValueError("Failure")  # Simulate a failure on the first attempt
    return "OK"

# Initialize an in-memory checkpointer for persistence
checkpointer = InMemorySaver()

@task
def slow_task():
    """
    Simulates a slow-running task by introducing a 1-second delay.
    """
    time.sleep(1)
    return "Ran slow task."

@entrypoint(checkpointer=checkpointer)
def main(inputs, writer: StreamWriter):
    """
    Main workflow function that runs the slow_task and get_info tasks sequentially.

    Parameters:
    - inputs: Dictionary containing workflow input values.
    - writer: StreamWriter for streaming custom data.

    The workflow first executes `slow_task` and then attempts to execute `get_info`,
    which will fail on the first invocation.
    """
    slow_task_result = slow_task().result()  # Blocking call to slow_task
    get_info().result()  # Exception will be raised here on the first attempt
    return slow_task_result

# Workflow execution configuration with a unique thread identifier
config = {
    "configurable": {
        "thread_id": "1"  # Unique identifier to track workflow execution
    }
}

# This invocation will take ~1 second due to the slow_task execution
try:
    # First invocation will raise an exception due to the `get_info` task failing
    main.invoke({'any_input': 'foobar'}, config=config)
except ValueError:
    pass  # Handle the failure gracefully
```

当我们恢复执行时，不需要重新运行 `slow_task`，因为其结果已经保存在 checkpoint 中。

```python theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
main.invoke(None, config=config)
```

```pycon theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
'Ran slow task.'
```

## 人在回路

函数式 API 使用 [`interrupt`](https://reference.langchain.com/python/langgraph/types/interrupt) 函数和 `Command` 原语支持[人在回路](/oss/python/langgraph/interrupts)工作流。

### 基础的人在回路工作流

我们将创建三个 [task](/oss/python/langgraph/functional-api#task)：

1. 追加 `"bar"`。
2. 暂停等待人工输入。恢复时，追加人工输入。
3. 追加 `"qux"`。

```python theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
from langgraph.func import entrypoint, task
from langgraph.types import Command, interrupt


@task
def step_1(input_query):
    """Append bar."""
    return f"{input_query} bar"


@task
def human_feedback(input_query):
    """Append user input."""
    feedback = interrupt(f"Please provide feedback: {input_query}")
    return f"{input_query} {feedback}"


@task
def step_3(input_query):
    """Append qux."""
    return f"{input_query} qux"
```

现在我们可以将这些 task 组合到一个 [entrypoint](/oss/python/langgraph/functional-api#entrypoint) 中：

```python theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
from langgraph.checkpoint.memory import InMemorySaver

checkpointer = InMemorySaver()


@entrypoint(checkpointer=checkpointer)
def graph(input_query):
    result_1 = step_1(input_query).result()
    result_2 = human_feedback(result_1).result()
    result_3 = step_3(result_2).result()

    return result_3
```

[interrupt()](/oss/python/langgraph/interrupts#pause-using-interrupt) 在 task 内部被调用，使人工能够查看并编辑上一个 task 的输出。先前 task 的结果——此处即 `step_1`——会被持久化，因此在 [`interrupt`](https://reference.langchain.com/python/langgraph/types/interrupt) 之后不会再次运行。

我们来发送一个查询字符串：

```python theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
config = {"configurable": {"thread_id": "1"}}

stream = graph.stream_events("foo", config, version="v3")
for message in stream.messages:
    for token in message.text:
        print(token, end="", flush=True)
```

请注意，我们在 `step_1` 之后通过 [`interrupt`](https://reference.langchain.com/python/langgraph/types/interrupt) 进行了暂停。该中断提供了恢复运行的指令。要恢复运行，我们需要发出一个 [`Command`](/oss/python/langgraph/interrupts#resuming-interrupts)，其中包含 `human_feedback` task 所期望的数据。

```python theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
# Continue execution
stream = graph.stream_events(Command(resume="baz"), config, version="v3")
for message in stream.messages:
    for token in message.text:
        print(token, end="", flush=True)
```

恢复之后，运行会继续执行剩余的步骤，并按预期终止。

### 审查工具调用

为了在执行前审查工具调用，我们添加一个调用 [`interrupt`](/oss/python/langgraph/interrupts#pause-using-interrupt) 的 `review_tool_call` 函数。当该函数被调用时，执行将暂停，直到我们发出命令恢复它。

给定一个工具调用，我们的函数会通过 [`interrupt`](https://reference.langchain.com/python/langgraph/types/interrupt) 等待人工审查。此时我们可以选择：

* 接受该工具调用
* 修改该工具调用并继续
* 生成一条自定义工具消息（例如，指示模型重新格式化其工具调用）

```python theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
from typing import Union

def review_tool_call(tool_call: ToolCall) -> Union[ToolCall, ToolMessage]:
    """Review a tool call, returning a validated version."""
    human_review = interrupt(
        {
            "question": "Is this correct?",
            "tool_call": tool_call,
        }
    )
    review_action = human_review["action"]
    review_data = human_review.get("data")
    if review_action == "continue":
        return tool_call
    elif review_action == "update":
        updated_tool_call = {**tool_call, **{"args": review_data}}
        return updated_tool_call
    elif review_action == "feedback":
        return ToolMessage(
            content=review_data, name=tool_call["name"], tool_call_id=tool_call["id"]
        )
```

现在我们可以更新 [entrypoint](/oss/python/langgraph/functional-api#entrypoint) 来审查生成的工具调用。如果工具调用被接受或修改，我们就和之前一样执行它。否则，我们只需追加人工提供的 [`ToolMessage`](https://reference.langchain.com/python/langchain-core/messages/tool/ToolMessage)。先前 task 的结果——此处即最初的模型调用——会被持久化，因此在 [`interrupt`](https://reference.langchain.com/python/langgraph/types/interrupt) 之后不会再次运行。

```python theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
from langgraph.checkpoint.memory import InMemorySaver
from langgraph.graph.message import add_messages
from langgraph.types import Command, interrupt


checkpointer = InMemorySaver()


@entrypoint(checkpointer=checkpointer)
def agent(messages, previous):
    if previous is not None:
        messages = add_messages(previous, messages)

    model_response = call_model(messages).result()
    while True:
        if not model_response.tool_calls:
            break

        # Review tool calls
        tool_results = []
        tool_calls = []
        for i, tool_call in enumerate(model_response.tool_calls):
            review = review_tool_call(tool_call)
            if isinstance(review, ToolMessage):
                tool_results.append(review)
            else:  # is a validated tool call
                tool_calls.append(review)
                if review != tool_call:
                    model_response.tool_calls[i] = review  # update message

        # Execute remaining tool calls
        tool_result_futures = [call_tool(tool_call) for tool_call in tool_calls]
        remaining_tool_results = [fut.result() for fut in tool_result_futures]

        # Append to message list
        messages = add_messages(
            messages,
            [model_response, *tool_results, *remaining_tool_results],
        )

        # Call model again
        model_response = call_model(messages).result()

    # Generate final response
    messages = add_messages(messages, model_response)
    return entrypoint.final(value=model_response, save=messages)
```

## 短期记忆

短期记忆允许在同一个 **thread id** 的多次**调用**之间存储信息。更多细节请参阅[短期记忆](/oss/python/langgraph/functional-api#short-term-memory)。

### 管理 checkpoints

你可以查看和删除由 checkpointer 存储的信息。

<a id="checkpoint" />

#### 查看线程状态

```python theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
config = {
    "configurable": {
        "thread_id": "1",  # [!code highlight]
        # optionally provide an ID for a specific checkpoint,
        # otherwise the latest checkpoint is shown
        # "checkpoint_id": "1f029ca3-1f5b-6704-8004-820c16b69a5a"  # [!code highlight]

    }
}
graph.get_state(config)  # [!code highlight]
```

```
StateSnapshot(
    values={'messages': [HumanMessage(content="hi! I'm bob"), AIMessage(content='Hi Bob! How are you doing today?), HumanMessage(content="what's my name?"), AIMessage(content='Your name is Bob.')]}, next=(),
    config={'configurable': {'thread_id': '1', 'checkpoint_ns': '', 'checkpoint_id': '1f029ca3-1f5b-6704-8004-820c16b69a5a'}},
    metadata={
        'source': 'loop',
        'writes': {'call_model': {'messages': AIMessage(content='Your name is Bob.')}},
        'step': 4,
        'parents': {},
        'thread_id': '1'
    },
    created_at='2025-05-05T16:01:24.680462+00:00',
    parent_config={'configurable': {'thread_id': '1', 'checkpoint_ns': '', 'checkpoint_id': '1f029ca3-1790-6b0a-8003-baf965b6a38f'}},
    tasks=(),
    interrupts=()
)
```

<a id="checkpoints" />

#### 查看线程历史

```python theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
config = {
    "configurable": {
        "thread_id": "1"  # [!code highlight]
    }
}
list(graph.get_state_history(config))  # [!code highlight]
```

```
[
    StateSnapshot(
        values={'messages': [HumanMessage(content="hi! I'm bob"), AIMessage(content='Hi Bob! How are you doing today? Is there anything I can help you with?'), HumanMessage(content="what's my name?"), AIMessage(content='Your name is Bob.')]},
        next=(),
        config={'configurable': {'thread_id': '1', 'checkpoint_ns': '', 'checkpoint_id': '1f029ca3-1f5b-6704-8004-820c16b69a5a'}},
        metadata={'source': 'loop', 'writes': {'call_model': {'messages': AIMessage(content='Your name is Bob.')}}, 'step': 4, 'parents': {}, 'thread_id': '1'},
        created_at='2025-05-05T16:01:24.680462+00:00',
        parent_config={'configurable': {'thread_id': '1', 'checkpoint_ns': '', 'checkpoint_id': '1f029ca3-1790-6b0a-8003-baf965b6a38f'}},
        tasks=(),
        interrupts=()
    ),
    StateSnapshot(
        values={'messages': [HumanMessage(content="hi! I'm bob"), AIMessage(content='Hi Bob! How are you doing today? Is there anything I can help you with?'), HumanMessage(content="what's my name?")]},
        next=('call_model',),
        config={'configurable': {'thread_id': '1', 'checkpoint_ns': '', 'checkpoint_id': '1f029ca3-1790-6b0a-8003-baf965b6a38f'}},
        metadata={'source': 'loop', 'writes': None, 'step': 3, 'parents': {}, 'thread_id': '1'},
        created_at='2025-05-05T16:01:23.863421+00:00',
        parent_config={...}
        tasks=(PregelTask(id='8ab4155e-6b15-b885-9ce5-bed69a2c305c', name='call_model', path=('__pregel_pull', 'call_model'), error=None, interrupts=(), state=None, result={'messages': AIMessage(content='Your name is Bob.')}),),
        interrupts=()
    ),
    StateSnapshot(
        values={'messages': [HumanMessage(content="hi! I'm bob"), AIMessage(content='Hi Bob! How are you doing today? Is there anything I can help you with?')]},
        next=('__start__',),
        config={...},
        metadata={'source': 'input', 'writes': {'__start__': {'messages': [{'role': 'user', 'content': "what's my name?"}]}}, 'step': 2, 'parents': {}, 'thread_id': '1'},
        created_at='2025-05-05T16:01:23.863173+00:00',
        parent_config={...}
        tasks=(PregelTask(id='24ba39d6-6db1-4c9b-f4c5-682aeaf38dcd', name='__start__', path=('__pregel_pull', '__start__'), error=None, interrupts=(), state=None, result={'messages': [{'role': 'user', 'content': "what's my name?"}]}),),
        interrupts=()
    ),
    StateSnapshot(
        values={'messages': [HumanMessage(content="hi! I'm bob"), AIMessage(content='Hi Bob! How are you doing today? Is there anything I can help you with?')]},
        next=(),
        config={...},
        metadata={'source': 'loop', 'writes': {'call_model': {'messages': AIMessage(content='Hi Bob! How are you doing today? Is there anything I can help you with?')}}, 'step': 1, 'parents': {}, 'thread_id': '1'},
        created_at='2025-05-05T16:01:23.862295+00:00',
        parent_config={...}
        tasks=(),
        interrupts=()
    ),
    StateSnapshot(
        values={'messages': [HumanMessage(content="hi! I'm bob")]},
        next=('call_model',),
        config={...},
        metadata={'source': 'loop', 'writes': None, 'step': 0, 'parents': {}, 'thread_id': '1'},
        created_at='2025-05-05T16:01:22.278960+00:00',
        parent_config={...}
        tasks=(PregelTask(id='8cbd75e0-3720-b056-04f7-71ac805140a0', name='call_model', path=('__pregel_pull', 'call_model'), error=None, interrupts=(), state=None, result={'messages': AIMessage(content='Hi Bob! How are you doing today? Is there anything I can help you with?')}),),
        interrupts=()
    ),
    StateSnapshot(
        values={'messages': []},
        next=('__start__',),
        config={'configurable': {'thread_id': '1', 'checkpoint_ns': '', 'checkpoint_id': '1f029ca3-0870-6ce2-bfff-1f3f14c3e565'}},
        metadata={'source': 'input', 'writes': {'__start__': {'messages': [{'role': 'user', 'content': "hi! I'm bob"}]}}, 'step': -1, 'parents': {}, 'thread_id': '1'},
        created_at='2025-05-05T16:01:22.277497+00:00',
        parent_config=None,
        tasks=(PregelTask(id='d458367b-8265-812c-18e2-33001d199ce6', name='__start__', path=('__pregel_pull', '__start__'), error=None, interrupts=(), state=None, result={'messages': [{'role': 'user', 'content': "hi! I'm bob"}]}),),
        interrupts=()
    )
]
```

### 将返回值与保存的值解耦

使用 `entrypoint.final` 将返回给调用方的值与持久化到 checkpoint 中的值解耦。这在以下情况下很有用：

* 你希望返回计算结果（例如摘要或状态），但保存一个不同的内部值以供下次调用使用。
* 你需要控制下次运行时传递给 previous 参数的内容。

```python theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
from langgraph.func import entrypoint
from langgraph.checkpoint.memory import InMemorySaver

checkpointer = InMemorySaver()

@entrypoint(checkpointer=checkpointer)
def accumulate(n: int, *, previous: int | None) -> entrypoint.final[int, int]:
    previous = previous or 0
    total = previous + n
    # Return the *previous* value to the caller but save the *new* total to the checkpoint.
    return entrypoint.final(value=previous, save=total)

config = {"configurable": {"thread_id": "my-thread"}}

print(accumulate.invoke(1, config=config))  # 0
print(accumulate.invoke(2, config=config))  # 1
print(accumulate.invoke(3, config=config))  # 3
```

### 聊天机器人示例

一个使用函数式 API 和 [`InMemorySaver`](https://reference.langchain.com/python/langgraph/checkpoints/#langgraph.checkpoint.memory.InMemorySaver) checkpointer 的简单聊天机器人示例。

该机器人能够记住之前的对话，并从上次中断的地方继续。

```python theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
from langchain.messages import BaseMessage
from langgraph.graph import add_messages
from langgraph.func import entrypoint, task
from langgraph.checkpoint.memory import InMemorySaver
from langchain_anthropic import ChatAnthropic

model = ChatAnthropic(model="claude-sonnet-4-6")

@task
def call_model(messages: list[BaseMessage]):
    response = model.invoke(messages)
    return response

checkpointer = InMemorySaver()

@entrypoint(checkpointer=checkpointer)
def workflow(inputs: list[BaseMessage], *, previous: list[BaseMessage]):
    if previous:
        inputs = add_messages(previous, inputs)

    response = call_model(inputs).result()
    return entrypoint.final(value=response, save=add_messages(inputs, response))

config = {"configurable": {"thread_id": "1"}}
input_message = {"role": "user", "content": "hi! I'm bob"}
stream = workflow.stream_events([input_message], config, version="v3")
for snapshot in stream.values:
    print(snapshot)

input_message = {"role": "user", "content": "what's my name?"}
stream = workflow.stream_events([input_message], config, version="v3")
for snapshot in stream.values:
    print(snapshot)
```

## 长期记忆

[长期记忆](/oss/python/concepts/memory#long-term-memory) 允许在不同的 **thread id** 之间存储信息。这在一次对话中了解特定用户的信息，并在另一次对话中使用这些信息时很有用。

## 工作流

* 有关如何使用函数式 API 构建工作流的更多示例，请参阅 [工作流与 agent](/oss/python/langgraph/workflows-agents) 指南。

## 与其他库集成

* [使用函数式 API 将 LangGraph 的特性添加到其他框架](/langsmith/deploy-other-frameworks)：将持久化、记忆和流式输出等 LangGraph 特性添加到其他不原生提供这些特性的 agent 框架中。

***

<div className="source-links">
  <Callout icon="terminal-2">
    通过 MCP 将[这些文档](/use-these-docs)连接到 Claude、VSCode 等，即可获得实时回答。
  </Callout>

  <Callout icon="edit">
    [在 GitHub 上编辑此页面](https://github.com/langchain-ai/docs/edit/main/src/oss/langgraph/use-functional-api.mdx) 或[提交问题](https://github.com/langchain-ai/docs/issues/new/choose)。
  </Callout>
</div>