# Functional API 概览

**Functional API** 允许你在对现有代码进行最小改动的情况下，为你的应用添加 LangGraph 的关键特性（[持久化](/oss/python/langgraph/persistence)、[记忆](/oss/python/langgraph/add-memory)、[人在回路](/oss/python/langgraph/interrupts)和[流式处理](/oss/python/langgraph/streaming)）。

它旨在将这些特性集成到可能使用标准语言原语（如 `if` 语句、`for` 循环和函数调用）进行分支和控制流的现有代码中。与许多要求将代码重构为显式管道或 DAG 的数据编排框架不同，Functional API 允许你在不强制使用严格执行模型的情况下纳入这些能力。

Functional API 使用两个关键构建块：

* **`@entrypoint`**：将函数标记为工作流的起点，封装逻辑并管理执行流程，包括处理长时间运行的任务和中断。
* **[`@task`](https://reference.langchain.com/python/langgraph/func/task)**：表示一个独立的工作单元，例如 API 调用或数据处理步骤，可以在 entrypoint 内异步执行。Task 返回一个类似 future 的对象，可以通过 `await` 等待或同步解析。

这为构建带有状态管理和流式处理的工作流提供了一种最小抽象。

<Tip>
  有关如何使用 Functional API 的信息，请参阅[使用 Functional API](/oss/python/langgraph/use-functional-api)。
</Tip>

## Functional API 与 Graph API

对于偏好更声明式方法的用户，LangGraph 的 [Graph API](/oss/python/langgraph/graph-api) 允许你使用图范式定义工作流。这两个 API 共享相同的底层运行时，因此你可以在同一个应用中将它们一起使用。

以下是一些关键区别：

* **控制流**：Functional API 不需要考虑图结构。你可以使用标准的 Python 结构来定义工作流。这通常会减少你需要编写的代码量。
* **短期记忆**：**GraphAPI** 需要声明 [**State**](/oss/python/langgraph/graph-api#state)，并且可能需要定义 [**reducers**](/oss/python/langgraph/graph-api#reducers) 来管理图状态的更新。`@entrypoint` 和 `@tasks` 不需要显式状态管理，因为它们的状态限定在函数内部，不会在函数之间共享。
* **检查点**：两个 API 都会生成和使用检查点。在 **Graph API** 中，每次 [superstep](/oss/python/langgraph/graph-api) 之后都会生成一个新的检查点。在 **Functional API** 中，当任务执行时，它们的结果会保存到与给定 entrypoint 关联的现有检查点中，而不是创建新的检查点。
* **可视化**：Graph API 可以轻松地将工作流可视化为图，这对于调试、理解工作流以及与他人分享非常有用。Functional API 不支持可视化，因为图是在运行时动态生成的。

## 示例

下面我们演示一个简单的应用程序，它撰写一篇文章并[中断](/oss/python/langgraph/interrupts)以请求人工审核。

```python theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
from langgraph.checkpoint.memory import InMemorySaver
from langgraph.func import entrypoint, task
from langgraph.types import interrupt

@task
def write_essay(topic: str) -> str:
    """Write an essay about the given topic."""
    time.sleep(1) # A placeholder for a long-running task.
    return f"An essay about topic: {topic}"

@entrypoint(checkpointer=InMemorySaver())
def workflow(topic: str) -> dict:
    """A simple workflow that writes an essay and asks for a review."""
    essay = write_essay("cat").result()
    is_approved = interrupt({
        # Any json-serializable payload provided to interrupt as argument.
        # It will be surfaced on the client side as an Interrupt when streaming data
        # from the workflow.
        "essay": essay, # The essay we want reviewed.
        # We can add any additional information that we need.
        # For example, introduce a key called "action" with some instructions.
        "action": "Please approve/reject the essay",
    })

    return {
        "essay": essay, # The essay that was generated
        "is_approved": is_approved, # Response from HIL
    }
```

<Accordion title="详细说明">
  该工作流将撰写一篇关于主题“cat”的文章，然后暂停以获取人工审核。工作流可以被无限期中断，直到提供审核为止。

  当工作流恢复时，它会从头开始执行，但由于 `writeEssay` 任务的结果已经保存，任务结果将从检查点加载，而不是重新计算。

  ```python theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
  import time

  from langchain_core.utils.uuid import uuid7
  from langgraph.checkpoint.memory import InMemorySaver
  from langgraph.func import entrypoint, task
  from langgraph.types import Command, interrupt


  @task
  def write_essay(topic: str) -> str:
      """Write an essay about the given topic."""
      time.sleep(1)  # This is a placeholder for a long-running task.
      return f"An essay about topic: {topic}"


  @entrypoint(checkpointer=InMemorySaver())
  def workflow(topic: str) -> dict:
      """A simple workflow that writes an essay and asks for a review."""
      essay = write_essay("cat").result()
      is_approved = interrupt(
          {
              # Any json-serializable payload provided to interrupt as argument.
              # It will be surfaced on the client side as an Interrupt when streaming data
              # from the workflow.
              "essay": essay,  # The essay we want reviewed.
              # We can add any additional information that we need.
              # For example, introduce a key called "action" with some instructions.
              "action": "Please approve/reject the essay",
          }
      )
      return {
          "essay": essay,  # The essay that was generated
          "is_approved": is_approved,  # Response from HIL
      }


  thread_id = str(uuid7())
  config = {"configurable": {"thread_id": thread_id}}
  stream = workflow.stream_events("cat", config, version="v3")
  _ = stream.output
  print({"write_essay": stream.interrupts[0].value["essay"]})
  print({"__interrupt__": stream.interrupts})
  # {'write_essay': 'An essay about topic: cat'}
  # {
  #   '__interrupt__': [
  #     Interrupt(
  #       value={
  #           'essay': 'An essay about topic: cat',
  #           'action': 'Please approve/reject the essay'
  #       },
  #       id='369d44b3d93d4a631ae583367ac6b5cc'
  #     )
  #   ]
  # }
  ```

  文章已撰写完毕，可以提交审核。一旦提供了审核意见，我们就可以恢复工作流：

  ```python theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
  # Get review from a user (e.g., via a UI)
  # In this case, we're using a bool, but this can be any json-serializable value.
  human_review = True

  resumed_stream = workflow.stream_events(Command(resume=human_review), config, version="v3")
  print(resumed_stream.output)
  # {'essay': 'An essay about topic: cat', 'is_approved': True}
  ```

  工作流已完成，审核意见已添加到文章中。
</Accordion>

## Entrypoint

可以使用 [`@entrypoint`](https://reference.langchain.com/python/langgraph/func/entrypoint) 装饰器从函数创建工作流。它封装工作流逻辑并管理执行流程，包括处理*长时间运行的任务*和[中断](/oss/python/langgraph/interrupts)。

### 定义

**entrypoint** 通过使用 `@entrypoint` 装饰器装饰函数来定义。

函数**必须接受单个位置参数**，该参数作为工作流的输入。如果需要传递多份数据，请使用字典作为第一个参数的输入类型。

使用 `entrypoint` 装饰函数会产生一个 [`Pregel`](https://reference.langchain.com/python/langgraph/pregel/#langgraph.pregel.Pregel.stream) 实例，它有助于管理工作流的执行（例如，处理流式输出、恢复和检查点）。

通常你需要向 `@entrypoint` 装饰器传递一个 **checkpointer** 以启用持久化，并使用诸如**人在回路**之类的特性。

<Tabs>
  <Tab title="Sync">
    ```python theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
    from langgraph.func import entrypoint

    @entrypoint(checkpointer=checkpointer)
    def my_workflow(some_input: dict) -> int:
        # some logic that may involve long-running tasks like API calls,
        # and may be interrupted for human-in-the-loop.
        ...
        return result
    ```
  </Tab>

  <Tab title="Async">
    ```python theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
    from langgraph.func import entrypoint

    @entrypoint(checkpointer=checkpointer)
    async def my_workflow(some_input: dict) -> int:
        # some logic that may involve long-running tasks like API calls,
        # and may be interrupted for human-in-the-loop
        ...
        return result
    ```
  </Tab>
</Tabs>

<Warning>
  **序列化**
  entrypoint 的**输入**和**输出**必须是 JSON 可序列化的，以支持检查点。更多详情请参阅[序列化](#serialization)一节。
</Warning>

### 可注入参数

在声明 `entrypoint` 时，你可以请求访问将在运行时自动注入的额外参数。这些参数包括：

| 参数        | 描述                                                                                                                                                                     |
| ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **previous** | 访问与给定线程的上一个 `checkpoint` 关联的状态。参阅[短期记忆](#short-term-memory)。                                                                                                |
| **store**    | 一个 \[BaseStore]\[langgraph.store.base.BaseStore] 实例。可用于[长期记忆](/oss/python/langgraph/use-functional-api#long-term-memory)。                                            |
| **writer**   | 在处理 Async Python \< 3.11 时用于访问 StreamWriter。详见[Functional API 流式处理](/oss/python/langgraph/use-functional-api#streaming)。                                         |
| **config**   | 用于访问运行时配置。有关信息请参阅 [RunnableConfig](https://python.langchain.com/docs/concepts/runnables/#runnableconfig)。                                                      |

<Warning>
  请使用适当的名称和类型注解来声明参数。
</Warning>

<Accordion title="请求可注入参数">
  ```python theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
  from langchain_core.runnables import RunnableConfig
  from langgraph.func import entrypoint
  from langgraph.store.base import BaseStore
  from langgraph.store.memory import InMemoryStore
  from langgraph.checkpoint.memory import InMemorySaver
  from langgraph.types import StreamWriter

  in_memory_checkpointer = InMemorySaver(...)
  in_memory_store = InMemoryStore(...)  # An instance of InMemoryStore for long-term memory

  @entrypoint(
      checkpointer=in_memory_checkpointer,  # Specify the checkpointer
      store=in_memory_store  # Specify the store
  )
  def my_workflow(
      some_input: dict,  # The input (e.g., passed via `invoke`)
      *,
      previous: Any = None, # For short-term memory
      store: BaseStore,  # For long-term memory
      writer: StreamWriter,  # For streaming custom data
      config: RunnableConfig  # For accessing the configuration passed to the entrypoint
  ) -> ...:
  ```
</Accordion>

### 执行

使用 [`@entrypoint`](#entrypoint) 会产生一个 [`Pregel`](https://reference.langchain.com/python/langgraph/pregel/#langgraph.pregel.Pregel.stream) 对象，可以使用 `invoke`、`ainvoke`、`stream` 和 `astream` 方法执行。

<Tabs>
  <Tab title="Invoke">
    ```python theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
    config = {
        "configurable": {
            "thread_id": "some_thread_id"
        }
    }
    my_workflow.invoke(some_input, config)  # Wait for the result synchronously
    ```
  </Tab>

  <Tab title="Async Invoke">
    ```python theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
    config = {
        "configurable": {
            "thread_id": "some_thread_id"
        }
    }
    await my_workflow.ainvoke(some_input, config)  # Await result asynchronously
    ```
  </Tab>

  <Tab title="Stream">
    ```python theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
    config = {
        "configurable": {
            "thread_id": "some_thread_id"
        }
    }

    stream = my_workflow.stream_events(some_input, config, version="v3")
    for message in stream.messages:
        for token in message.text:
            print(token, end="", flush=True)
    ```
  </Tab>

  <Tab title="Async Stream">
    ```python theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
    config = {
        "configurable": {
            "thread_id": "some_thread_id"
        }
    }

    stream = await my_workflow.astream_events(some_input, config, version="v3")
    async for message in stream.messages:
        async for token in message.text:
            print(token, end="", flush=True)
    ```
  </Tab>
</Tabs>

### 恢复

在[中断](https://reference.langchain.com/python/langgraph/types/interrupt)后恢复执行，可以通过向 [`Command`](https://reference.langchain.com/python/langgraph/types/Command) 原语传递 **resume** 值来完成。

<Tabs>
  <Tab title="Invoke">
    ```python theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
    from langgraph.types import Command

    config = {
        "configurable": {
            "thread_id": "some_thread_id"
        }
    }

    my_workflow.invoke(Command(resume=some_resume_value), config)
    ```
  </Tab>

  <Tab title="Async Invoke">
    ```python theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
    from langgraph.types import Command

    config = {
        "configurable": {
            "thread_id": "some_thread_id"
        }
    }

    await my_workflow.ainvoke(Command(resume=some_resume_value), config)
    ```
  </Tab>

  <Tab title="Stream">
    ```python theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
    from langgraph.types import Command

    config = {
        "configurable": {
            "thread_id": "some_thread_id"
        }
    }

    stream = my_workflow.stream_events(Command(resume=some_resume_value), config, version="v3")
    for message in stream.messages:
        for token in message.text:
            print(token, end="", flush=True)
    ```
  </Tab>

  <Tab title="Async Stream">
    ```python theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
    from langgraph.types import Command

    config = {
        "configurable": {
            "thread_id": "some_thread_id"
        }
    }

    stream = await my_workflow.astream_events(Command(resume=some_resume_value), config, version="v3")
    async for message in stream.messages:
        async for token in message.text:
            print(token, end="", flush=True)
    ```
  </Tab>
</Tabs>

**出错后恢复**

要在出错后恢复，请使用 `None` 和相同的 **thread id**（config）运行 `entrypoint`。

这假设底层的**错误**已被解决，执行可以顺利进行。

<Tabs>
  <Tab title="Invoke">
    ```python theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}

    config = {
        "configurable": {
            "thread_id": "some_thread_id"
        }
    }

    my_workflow.invoke(None, config)
    ```
  </Tab>

  <Tab title="Async Invoke">
    ```python theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}

    config = {
        "configurable": {
            "thread_id": "some_thread_id"
        }
    }

    await my_workflow.ainvoke(None, config)
    ```
  </Tab>

  <Tab title="Stream">
    ```python theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}

    config = {
        "configurable": {
            "thread_id": "some_thread_id"
        }
    }

    stream = my_workflow.stream_events(None, config, version="v3")
    for message in stream.messages:
        for token in message.text:
            print(token, end="", flush=True)
    ```
  </Tab>

  <Tab title="Async Stream">
    ```python theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}

    config = {
        "configurable": {
            "thread_id": "some_thread_id"
        }
    }

    stream = await my_workflow.astream_events(None, config, version="v3")
    async for message in stream.messages:
        async for token in message.text:
            print(token, end="", flush=True)
    ```
  </Tab>
</Tabs>

### 短期记忆

当使用 `checkpointer` 定义 `entrypoint` 时，它会在相同 **thread id** 的连续调用之间将信息存储在[检查点](/oss/python/langgraph/checkpointers#checkpoints)中。

这允许使用 `previous` 参数访问上一次调用的状态。

默认情况下，`previous` 参数是上一次调用的返回值。

```python theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
@entrypoint(checkpointer=checkpointer)
def my_workflow(number: int, *, previous: Any = None) -> int:
    previous = previous or 0
    return number + previous

config = {
    "configurable": {
        "thread_id": "some_thread_id"
    }
}

my_workflow.invoke(1, config)  # 1 (previous was None)
my_workflow.invoke(2, config)  # 3 (previous was 1 from the previous invocation)
```

#### `entrypoint.final`

[`entrypoint.final`](https://reference.langchain.com/python/langgraph/func/entrypoint/final) 是一种可以从 entrypoint 返回的特殊原语，允许将**保存在检查点中的值**与**entrypoint 的返回值**进行**解耦**。

第一个值是 entrypoint 的返回值，第二个值是保存在检查点中的值。类型注解为 `entrypoint.final[return_type, save_type]`。

```python theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
@entrypoint(checkpointer=checkpointer)
def my_workflow(number: int, *, previous: Any = None) -> entrypoint.final[int, int]:
    previous = previous or 0
    # This will return the previous value to the caller, saving
    # 2 * number to the checkpoint, which will be used in the next invocation
    # for the `previous` parameter.
    return entrypoint.final(value=previous, save=2 * number)

config = {
    "configurable": {
        "thread_id": "1"
    }
}

my_workflow.invoke(3, config)  # 0 (previous was None)
my_workflow.invoke(1, config)  # 6 (previous was 3 * 2 from the previous invocation)
```

## Task

**task** 表示一个独立的工作单元，例如 API 调用或数据处理步骤。它有两个关键特征：

* **异步执行**：Task 被设计为异步执行，允许多个操作并发运行而不会阻塞。
* **检查点**：Task 的结果会保存到检查点中，使工作流能够从最后保存的状态恢复。（更多详情请参阅[持久化](/oss/python/langgraph/persistence)）。

### 定义

Task 使用 `@task` 装饰器定义，该装饰器包装一个普通的 Python 函数。

```python theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
from langgraph.func import task

@task()
def slow_computation(input_value):
    # Simulate a long-running operation
    ...
    return result
```

<Warning>
  **序列化**
  task 的**输出**必须是 JSON 可序列化的，以支持检查点。
</Warning>

### 执行

**Task** 只能在 **entrypoint**、另一个 **task** 或[状态图节点](/oss/python/langgraph/graph-api#nodes)内调用。

Task *不能*直接从主应用程序代码中调用。

当你调用 **task** 时，它会*立即*返回一个 future 对象。future 是稍后可用结果的占位符。

要获取 **task** 的结果，你可以同步等待（使用 `result()`）或异步等待（使用 `await`）。

<Tabs>
  <Tab title="Synchronous Invocation">
    ```python theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
    @entrypoint(checkpointer=checkpointer)
    def my_workflow(some_input: int) -> int:
        future = slow_computation(some_input)
        return future.result()  # Wait for the result synchronously
    ```
  </Tab>

  <Tab title="Asynchronous Invocation">
    ```python theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
    @entrypoint(checkpointer=checkpointer)
    async def my_workflow(some_input: int) -> int:
        return await slow_computation(some_input)  # Await result asynchronously
    ```
  </Tab>
</Tabs>

## 何时使用 task

在以下场景中，**Task** 非常有用：

* **检查点**：当你需要将长时间运行操作的结果保存到检查点，这样在恢复工作流时就不需要重新计算。
* **人在回路**：如果你正在构建一个需要人工干预的工作流，你必须使用 **task** 来封装任何随机性（例如 API 调用），以确保工作流可以被正确恢复。更多详情请参阅[确定性](#determinism)一节。
* **并行执行**：对于 I/O 密集型任务，**task** 支持并行执行，允许多个操作并发运行而不会阻塞（例如，调用多个 API）。
* **可观测性**：将操作包装在 **task** 中提供了一种使用 [LangSmith](/langsmith/observability) 跟踪工作流进度并监控单个操作执行的方法。
* **可重试的工作**：当工作需要重试以处理失败或不一致时，**task** 提供了一种封装和管理重试逻辑的方法。

## 序列化

LangGraph 中的序列化有两个关键方面：

1. `entrypoint` 的输入和输出必须是 JSON 可序列化的。
2. `task` 的输出必须是 JSON 可序列化的。

这些要求对于启用检查点和工作流恢复是必要的。使用字典、列表、字符串、数字和布尔值等 Python 原语，以确保你的输入和输出是可序列化的。

序列化确保工作流状态（如 task 结果和中间值）可以被可靠地保存和恢复。这对于实现人在回路交互、容错和并行执行至关重要。

当工作流配置了 checkpointer 时，提供不可序列化的输入或输出将导致运行时错误。

## 确定性

当你恢复工作流运行时，代码**不会**从执行停止的**同一行代码**处恢复。执行会回到检查点边界，工作流会向前**重放**，直到再次到达暂停点。

对于 Functional API，重放从 **entrypoint** 的开头开始，而 LangGraph 从 checkpointer 恢复已完成的 [**task**](/oss/python/langgraph/functional-api#task) 和 [**subgraph**](/oss/python/langgraph/use-subgraphs) 结果，而不是重新计算它们。这保留了跨暂停记录的步骤顺序，包括长时间运行或非确定性的 **task** 输出。

要使用**人在回路**等特性，你必须将非确定性工作（例如随机值）和副作用（例如文件写入或 API 调用）放在 [**task**](/oss/python/langgraph/functional-api#task) 中。

工作流的不同运行可能产生不同的结果，但恢复**特定**线程应该重放相同的已持久化的 **task** 和 **subgraph** 结果。

为确保工作流具有确定性并且可以一致地重放，请遵循以下准则：

* **避免重复工作**：在 **entrypoint** 中，如果你串联了多个副作用（例如日志记录、文件写入或网络调用），请为每个副作用分配自己的 **task**，这样恢复时会从 checkpointer 恢复它们的输出，而不是再次运行它们。
* **封装非确定性操作**：将尝试之间可能变化的值（例如随机数或墙钟时间读取）保留在 **task** 内部，以便重放与已检查点的内容一致。
* **使用幂等操作**：关于部分 task 失败和重试，请参阅[幂等性](#idempotency)。

## 幂等性

幂等性确保多次运行同一操作会产生相同的结果。这有助于防止在某个步骤因失败而重新运行时出现重复的 API 调用和冗余处理。始终将 API 调用放在 **task** 函数中以便检查点，并将它们设计为在重新执行时具有幂等性。
这对于导致数据写入的操作尤为重要。
当工作流恢复时，LangGraph 会从检查点重放已完成的 **task** 结果。已开始但未完成的 **task** 可能会在该次恢复时再次运行，因此请将副作用设计为幂等的。使用幂等键或验证现有结果，以避免意外重复。

## 常见陷阱

### 处理副作用

将副作用（例如，写入文件、发送电子邮件）封装在 task 中，以确保它们在恢复工作流时不会被执行多次。

<Tabs>
  <Tab title="Incorrect">
    在此示例中，副作用（写入文件）直接包含在工作流中，因此在恢复工作流时会第二次执行。

    ```python theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
    @entrypoint(checkpointer=checkpointer)
    def my_workflow(inputs: dict) -> int:
        # This code will be executed a second time when resuming the workflow.
        # Which is likely not what you want.
        with open("output.txt", "w") as f:  # [!code highlight]
            f.write("Side effect executed")  # [!code highlight]
        value = interrupt("question")
        return value
    ```
  </Tab>

  <Tab title="Correct">
    在此示例中，副作用被封装在 task 中，确保恢复时执行的一致性。

    ```python theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
    from langgraph.func import task

    @task  # [!code highlight]
    def write_to_file():  # [!code highlight]
        with open("output.txt", "w") as f:
            f.write("Side effect executed")

    @entrypoint(checkpointer=checkpointer)
    def my_workflow(inputs: dict) -> int:
        # The side effect is now encapsulated in a task.
        write_to_file().result()
        value = interrupt("question")
        return value
    ```
  </Tab>
</Tabs>

### 非确定性控制流

每次可能产生不同结果的操作（例如获取当前时间或随机数）应封装在 task 中，以确保恢复时返回相同的结果。

* 在 task 中：获取随机数 (5) → 中断 → 恢复 → （再次返回 5） → ...
* 不在 task 中：获取随机数 (5) → 中断 → 恢复 → 获取新的随机数 (7) → ...

当使用带有多个 interrupt 调用的**人在回路**工作流时，这一点尤为重要。LangGraph 会为每个 task/entrypoint 维护一份 resume 值列表。当遇到 interrupt 时，它会与对应的 resume 值匹配。这种匹配严格基于**索引**，因此 resume 值的顺序应与 interrupt 的顺序一致。

如果在恢复时未能保持执行顺序，一个 [`interrupt`](https://reference.langchain.com/python/langgraph/types/interrupt) 调用可能会与错误的 `resume` 值匹配，从而导致错误的结果。

更多详情请阅读[确定性](#determinism)一节。

<Tabs>
  <Tab title="Incorrect">
    在此示例中，工作流使用当前时间来决定执行哪个 task。这是非确定性的，因为工作流的结果取决于执行它的时间。

    ```python theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
    from langgraph.func import entrypoint

    @entrypoint(checkpointer=checkpointer)
    def my_workflow(inputs: dict) -> int:
        t0 = inputs["t0"]
        t1 = time.time()  # [!code highlight]

        delta_t = t1 - t0

        if delta_t > 1:
            result = slow_task(1).result()
            value = interrupt("question")
        else:
            result = slow_task(2).result()
            value = interrupt("question")

        return {
            "result": result,
            "value": value
        }
    ```
  </Tab>

  <Tab title="Correct">
    在此示例中，工作流使用输入 `t0` 来决定执行哪个 task。这是确定性的，因为工作流的结果仅取决于输入。

    ```python theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
    import time

    from langgraph.func import task

    @task  # [!code highlight]
    def get_time() -> float:  # [!code highlight]
        return time.time()

    @entrypoint(checkpointer=checkpointer)
    def my_workflow(inputs: dict) -> int:
        t0 = inputs["t0"]
        t1 = get_time().result()  # [!code highlight]

        delta_t = t1 - t0

        if delta_t > 1:
            result = slow_task(1).result()
            value = interrupt("question")
        else:
            result = slow_task(2).result()
            value = interrupt("question")

        return {
            "result": result,
            "value": value
        }
    ```
  </Tab>
</Tabs>

## 了解更多

* [如何使用 Functional API](/oss/python/langgraph/use-functional-api)
* [Graph API 概念概览](/oss/python/langgraph/graph-api)
* [在 Graph API 和 Functional API 之间选择](/oss/python/langgraph/choosing-apis)

***

<div className="source-links">
  <Callout icon="terminal-2">
    通过 MCP 将[这些文档](/use-these-docs)连接到 Claude、VSCode 等工具，获取实时答案。
  </Callout>

  <Callout icon="edit">
    在 GitHub 上[编辑此页面](https://github.com/langchain-ai/docs/edit/main/src/oss/langgraph/functional-api.mdx)或[提交问题](https://github.com/langchain-ai/docs/issues/new/choose)。
  </Callout>
</div>