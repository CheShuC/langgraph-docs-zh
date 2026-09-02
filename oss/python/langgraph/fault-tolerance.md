# 容错

> 在 LangGraph 中配置每节点超时、重试和错误处理器。

当一个节点失败时——无论是由于外部 API 缓慢、瞬时网络错误还是未处理的异常——LangGraph 为您提供了三种可组合的机制来应对：

* [**重试（Retries）**](#retries)：根据异常类型和退避设置自动重新运行失败的尝试
* [**超时（Timeouts）**](#timeouts)：限制单次尝试可以运行的时间
* [**错误处理（Error handling）**](#error-handling)：在所有重试耗尽后运行恢复函数

使用 [**`set_node_defaults`**](#graph-defaults) 为所有节点一次性配置这些机制，而不是在每个 `add_node` 调用上重复它们。

它们以固定的顺序组合：当节点尝试抛出任何异常（包括超时产生的 [`NodeTimeoutError`](https://reference.langchain.com/python/langgraph/errors/NodeTimeoutError)）时，重试策略决定是否重试。只有在重试耗尽后，错误处理器才会运行。

要在超级步边界干净地停止运行并在稍后恢复，请参见[优雅关闭](#graceful-shutdown)。

<Note>
  每节点超时和节点级错误处理器需要 `langgraph>=1.2`。
</Note>

```mermaid theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
%%{init:{'theme':'base','themeVariables':{'lineColor':'#40668D','primaryColor':'#E5F4FF','primaryTextColor':'#030710','primaryBorderColor':'#006DDD'}}}%%
flowchart LR
    start([Attempt starts]) --> exec[Run node]
    exec -->|"success"| done([Continue graph])
    exec -->|"any exception<br/>including NodeTimeoutError"| retry{retry_policy<br/>matches?}
    retry -->|"yes, attempts left"| exec
    retry -->|"exhausted or absent"| handler{error_handler?}
    handler -->|"yes"| run_handler["Invoke handler<br/>with NodeError"]
    run_handler --> route([Update state +<br/>Command goto])
    handler -->|"no"| bubble([Exception<br/>bubbles up])

    classDef process fill:#E5F4FF,stroke:#006DDD,stroke-width:2px,color:#030710
    classDef decision fill:#FDF3FF,stroke:#7E65AE,stroke-width:2px,color:#504B5F
    classDef alert fill:#F8E8E6,stroke:#B27D75,stroke-width:2px,color:#634643
    classDef output fill:#EBD0F0,stroke:#885270,stroke-width:2px,color:#441E33

    class exec,run_handler process
    class retry,handler decision
    class bubble alert
    class done,route,start output
```

## 重试

重试策略根据异常类型和退避设置自动重新运行失败的节点尝试。

将 `retry_policy=` 传给 [`add_node`](https://reference.langchain.com/python/langgraph/graph/state/StateGraph/add_node)：

```python theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
from langgraph.types import RetryPolicy

builder.add_node(
    "call_api",
    call_api,
    retry_policy=RetryPolicy(max_attempts=3),
)
```

### 默认行为

默认情况下，`retry_on` 使用 `default_retry_on`，它对**任何**异常都会重试，以下异常（及其子类）除外：

* `ValueError`
* `TypeError`
* `ArithmeticError`
* `ImportError`
* `LookupError`
* `NameError`
* `SyntaxError`
* `RuntimeError`
* `ReferenceError`
* `StopIteration`
* `StopAsyncIteration`
* `OSError`

对于来自 `requests` 和 `httpx` 等流行 HTTP 库的异常，它只对 5xx 状态码重试。[`NodeTimeoutError`](https://reference.langchain.com/python/langgraph/errors/NodeTimeoutError) 默认是可重试的。

### 参数

| 参数          | 类型                                                                          | 默认值            | 描述                                                                      |
| ------------------ | ----------------------------------------------------------------------------- | ------------------ | -------------------------------------------------------------------------------- |
| `max_attempts`     | `int`                                                                         | `3`                | 最大尝试次数，包括第一次。                                 |
| `initial_interval` | `float`                                                                       | `0.5`              | 第一次重试前的秒数。                                                  |
| `backoff_factor`   | `float`                                                                       | `2.0`              | 每次重试后应用于间隔的乘数。                             |
| `max_interval`     | `float`                                                                       | `128.0`            | 重试之间的最大秒数。                                                 |
| `jitter`           | `bool`                                                                        | `True`             | 向间隔添加随机抖动。                                               |
| `retry_on`         | `type[Exception] \| Sequence[type[Exception]] \| Callable[[Exception], bool]` | `default_retry_on` | 要重试的异常，或返回 `True` 表示可重试异常的可调用对象。 |

### 自定义重试逻辑

将可调用对象或异常类型传递给 `retry_on`。导入 `default_retry_on` 以扩展默认行为：

```python theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
from langgraph.types import RetryPolicy, default_retry_on

def custom_retry_on(exc: BaseException) -> bool:
    if isinstance(exc, MyCustomError):
        return False
    return default_retry_on(exc)

builder.add_node(
    "call_api",
    call_api,
    retry_policy=RetryPolicy(max_attempts=3, retry_on=custom_retry_on),
)
```

### 检查重试状态

在节点内使用执行信息来检查当前尝试次数。当主调用持续失败时，这对于切换到备用方案很有用：

```python theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
from langgraph.graph import StateGraph, START, END
from langgraph.runtime import Runtime
from langgraph.types import RetryPolicy
from typing_extensions import TypedDict

class State(TypedDict):
    result: str

def my_node(state: State, runtime: Runtime) -> State:
    if runtime.execution_info.node_attempt > 1:  # [!code highlight]
        return {"result": call_fallback_api()}
    return {"result": call_primary_api()}

builder = StateGraph(State)
builder.add_node("my_node", my_node, retry_policy=RetryPolicy(max_attempts=3))
builder.add_edge(START, "my_node")
builder.add_edge("my_node", END)
```

`execution_info` 暴露以下字段：

| 属性                 | 类型            | 描述                                                                            |
| ------------------------- | --------------- | -------------------------------------------------------------------------------------- |
| `node_attempt`            | `int`           | 当前尝试次数（从 1 开始）。第一次尝试为 `1`，第一次重试为 `2`，依此类推。 |
| `node_first_attempt_time` | `float \| None` | 第一次尝试开始的 Unix 时间戳。跨重试保持不变。             |
| `thread_id`               | `str \| None`   | 当前执行的线程 ID。没有检查点存储时为 `None`。                    |
| `run_id`                  | `str \| None`   | 当前执行的运行 ID。未在配置中提供时为 `None`。                  |
| `checkpoint_id`           | `str`           | 当前执行的检查点 ID。                                               |
| `task_id`                 | `str`           | 当前执行的任务 ID。                                                     |

即使没有重试策略，`execution_info` 也可用——`node_attempt` 默认为 `1`。

## 超时

<Note>
  需要 `langgraph>=1.2`。
</Note>

[`add_node`](https://reference.langchain.com/python/langgraph/graph/state/StateGraph/add_node) 上的 `timeout=` 参数限制了单个节点尝试可以运行的时间。传入数字（秒）、`timedelta` 或用于分开的运行和空闲限制的 [`TimeoutPolicy`](https://reference.langchain.com/python/langgraph/types/TimeoutPolicy)：

```python theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
from datetime import timedelta
from langgraph.types import TimeoutPolicy

# Simple wall-clock cap
builder.add_node("call_model", call_model, timeout=60)
builder.add_node("call_model", call_model, timeout=timedelta(minutes=2))

# Separate run and idle limits
builder.add_node(
    "call_model",
    call_model,
    timeout=TimeoutPolicy(run_timeout=120, idle_timeout=30),
)
```

<Warning>
  节点超时只适用于**异步**节点。带有 `timeout` 的同步节点会在编译时被拒绝。要包装阻塞 I/O，请在异步节点内使用 `asyncio.to_thread`。
</Warning>

### 运行超时

`run_timeout` 是单次尝试的硬性挂钟上限。无论节点活动如何，它都不会刷新：

```python theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
from langgraph.types import TimeoutPolicy

builder.add_node(
    "call_model",
    call_model,
    timeout=TimeoutPolicy(run_timeout=120),
)
```

超过限制时，LangGraph 会抛出 [`NodeTimeoutError`](https://reference.langchain.com/python/langgraph/errors/NodeTimeoutError)，清除失败尝试的任何写入，并让重试策略决定是否重试。

### 空闲超时

`idle_timeout` 是一个进度重置型上限。只有当节点在指定时间内停止产生可观察的进度时才会触发——与 `run_timeout` 不同，每当节点产生进度信号时时钟都会重置：

```python theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
builder.add_node(
    "call_model",
    call_model,
    timeout=TimeoutPolicy(idle_timeout=30),
)
```

您可以同时设置 `run_timeout` 和 `idle_timeout`。无论哪个先触发都会取消尝试。

#### 进度信号

在默认的 `refresh_on="auto"` 下，空闲时钟会在以下任何情况发生时重置：

* 通过 `CONFIG_KEY_SEND` 的状态写入
* 流输出（yield 的异步流块）
* 子任务调度
* 运行时流写入器调用
* 来自节点或其后代的任何 LangChain 回调事件（LLM token、工具调用、链开始/结束等）

#### 心跳模式

设置 `refresh_on="heartbeat"` 将刷新源收窄为仅显式的 `runtime.heartbeat()` 调用。当您想要一个不会被频繁通信的下级组件重置的严格空闲定义时，这很有用：

```python theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
builder.add_node(
    "call_model",
    call_model,
    timeout=TimeoutPolicy(idle_timeout=30, refresh_on="heartbeat"),
)
```

#### 手动心跳

对于不会自然发出进度信号的长时间运行工作，调用 `runtime.heartbeat()` 手动重置空闲时钟：

```python theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
from langgraph.graph import StateGraph, START, END
from langgraph.runtime import Runtime
from langgraph.types import TimeoutPolicy
from typing_extensions import TypedDict

class State(TypedDict):
    result: str

async def long_running_node(state: State, runtime: Runtime) -> State:
    for batch in fetch_batches():
        process(batch)
        runtime.heartbeat()  # [!code highlight]
    return {"result": "done"}

builder = StateGraph(State)
builder.add_node(
    "long_running_node",
    long_running_node,
    timeout=TimeoutPolicy(idle_timeout=30, refresh_on="heartbeat"),
)
builder.add_edge(START, "long_running_node")
builder.add_edge("long_running_node", END)
```

在空闲定时的尝试之外，`runtime.heartbeat()` 是一个空操作，因此您可以在任何情况下无条件调用它。

### NodeTimeoutError

当超时触发时，LangGraph 会抛出带有命中哪个限制的结构化上下文的 [`NodeTimeoutError`](https://reference.langchain.com/python/langgraph/errors/NodeTimeoutError)：

| 属性      | 类型                     | 描述                                    |
| -------------- | ------------------------ | ---------------------------------------------- |
| `node`         | `str`                    | 执行超时的节点名称。    |
| `elapsed`      | `float`                  | 超时触发前经过的秒数。      |
| `kind`         | `Literal["idle", "run"]` | 哪个超时触发。                           |
| `idle_timeout` | `float \| None`          | 配置的空闲超时（秒），如果有。 |
| `run_timeout`  | `float \| None`          | 配置的运行超时（秒），如果有。  |

`NodeTimeoutError` 默认是可重试的。将 `timeout` 与重试策略组合开箱即用——每次新尝试时超时时钟都会重置，超时的尝试的写入会在下一次重试前清除：

```python theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
from langgraph.types import RetryPolicy, TimeoutPolicy

builder.add_node(
    "call_model",
    call_model,
    timeout=TimeoutPolicy(idle_timeout=30),
    retry_policy=RetryPolicy(max_attempts=3),
)
```

### 使用 Send 的动态超时

使用 [`Send`](https://reference.langchain.com/python/langgraph/types/Send) 动态分派节点时（例如在 map-reduce 模式中），您可以直接在 `Send` 上传递超时，以针对该特定推送覆盖目标节点的静态超时：

```python theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
from langgraph.types import Send, TimeoutPolicy

def fan_out(state: OverallState):
    return [
        Send("process_item", {"item": item}, timeout=TimeoutPolicy(idle_timeout=15))
        for item in state["items"]
    ]
```

如果在 `Send` 上省略超时，则应用目标节点的超时（在 [`add_node`](https://reference.langchain.com/python/langgraph/graph/state/StateGraph/add_node) 时设置）。这让您可以在节点上设置默认超时，并为个别调用收紧它。

## 错误处理

<Note>
  需要 `langgraph>=1.2`。
</Note>

错误处理器在节点失败且所有重试耗尽后运行。它接收当前状态，并可以使用 [`Command`](https://reference.langchain.com/python/langgraph/types/Command) 更新状态或路由到不同节点。这对于补偿流程（Saga 模式）很有用，您希望优雅地恢复而不是中止整个图。

将 `error_handler=` 传给 [`add_node`](https://reference.langchain.com/python/langgraph/graph/state/StateGraph/add_node)：

```python theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
from langgraph.errors import NodeError
from langgraph.types import Command, RetryPolicy
from langgraph.graph import StateGraph, START
from typing_extensions import TypedDict

class State(TypedDict):
    status: str

def charge_payment(state: State) -> State:
    raise RuntimeError("payment gateway timeout")

def payment_error_handler(state: State, error: NodeError) -> Command:
    return Command(
        update={"status": f"compensated: {error.error}"},
        goto="finalize",
    )

def finalize(state: State) -> State:
    return state

graph = (
    StateGraph(State)
    .add_node(
        "charge_payment",
        charge_payment,
        retry_policy=RetryPolicy(max_attempts=3, retry_on=ConnectionError),
        error_handler=payment_error_handler,
    )
    .add_node("finalize", finalize)
    .add_edge(START, "charge_payment")
    .compile()
)
```

处理器只在重试策略耗尽后触发，如果没有配置重试策略则立即触发。重试策略和错误处理器保持解耦：您可以独立配置何时重试和何时补偿。

### NodeError

错误处理器通过一个类型化的 `error: NodeError` 参数接收失败上下文，该参数通过类型注解注入（与 `runtime: Runtime` 相同的模式）：

```python theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
from langgraph.errors import NodeError

def my_handler(state: State, error: NodeError) -> Command:
    print(f"Node {error.node} failed with: {error.error}")
    return Command(update={"status": "recovered"}, goto="next_step")
```

[`NodeError`](https://reference.langchain.com/python/langgraph/errors/NodeError) 是一个具有两个字段的冻结数据类：

| 属性 | 类型            | 描述                              |
| --------- | --------------- | ---------------------------------------- |
| `node`    | `str`           | 执行失败的节点名称。 |
| `error`   | `BaseException` | 失败节点抛出的异常。 |

`error: NodeError` 参数是可选加入的。不需要失败上下文的处理器可以使用更简单的签名，如 `(state)` 或 `(state, runtime)`。

### 使用 Command 路由

错误处理器可以返回一个 [`Command`](https://reference.langchain.com/python/langgraph/types/Command) 来更新状态并路由到特定节点，从而实现 Saga / 补偿模式：

```python theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
from langgraph.errors import NodeError
from langgraph.types import Command, RetryPolicy
from langgraph.graph import StateGraph, START
from typing_extensions import TypedDict

class State(TypedDict):
    status: str

def reserve_inventory(state: State) -> State:
    return {"status": "reserved"}

def charge_payment(state: State) -> State:
    raise RuntimeError("payment timeout")

def payment_error_handler(state: State, error: NodeError) -> Command:
    return Command(
        update={"status": f"compensated_after_{error.node}: {error.error}"},
        goto="finalize",
    )

def finalize(state: State) -> State:
    return state

graph = (
    StateGraph(State)
    .add_node("reserve_inventory", reserve_inventory)
    .add_node(
        "charge_payment",
        charge_payment,
        retry_policy=RetryPolicy(max_attempts=3, retry_on=ConnectionError),
        error_handler=payment_error_handler,
    )
    .add_node("finalize", finalize)
    .add_edge(START, "reserve_inventory")
    .add_edge("reserve_inventory", "charge_payment")
    .compile()
)
```

`charge_payment` 在 `ConnectionError` 上最多重试 3 次。如果重试耗尽（或错误不是 `ConnectionError`），处理器通过更新状态并路由到 `finalize` 来补偿，而不是中止图。

### 可恢复安全的失败

<Note>
  失败溯源会被检查点记录。如果图在节点失败后、处理器完成前被中断或进程崩溃，当图从其检查点恢复时，处理器会看到相同的 `NodeError` 上下文。
</Note>

### 与 `interrupt()` 的行为

<Warning>
  节点内抛出的 `interrupt()` **不会**路由到错误处理器。中断使用 `GraphBubbleUp` 机制暂停图执行以实现人机协同工作流，绕过重试策略和错误处理器。图会照常暂停。
</Warning>

### 子图失败

如果节点包装了一个子图，并且子图抛出了未处理的异常，该异常会呈现给父节点。如果父节点有错误处理器，处理器会以 `error.error` 中的子图异常触发。

## 图默认值

<Note>
  需要 `langgraph>=1.2`。
</Note>

与其在每个 `add_node` 调用上重复相同的 `retry_policy=`、`error_handler=`、`timeout=` 或 `cache_policy=`，不如使用 [`set_node_defaults`](https://reference.langchain.com/python/langgraph/graph/state/StateGraph/set_node_defaults) 在一处配置图范围的默认值：

```python theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
from langgraph.errors import NodeError
from langgraph.types import RetryPolicy, TimeoutPolicy
from langgraph.graph import StateGraph, START
from typing_extensions import TypedDict

class State(TypedDict):
    status: str

def default_error_handler(state: State, error: NodeError) -> State:
    return {"status": f"handled: {error.error}"}

graph = (
    StateGraph(State)
    .set_node_defaults(
        retry_policy=RetryPolicy(max_attempts=3),
        error_handler=default_error_handler,
        timeout=TimeoutPolicy(run_timeout=30),
    )
    .add_node("step_a", step_a)
    .add_node("step_b", step_b)
    .add_edge(START, "step_a")
    .compile()
)
```

`step_a` 和 `step_b` 现在共享相同的重试策略、错误处理器和超时，没有任何重复。

### 优先级

直接传递给 `add_node()` 的每节点值总是覆盖 `set_node_defaults()` 设置的默认值。默认值在 `compile()` 时解析，因此您可以按照任意顺序在 `add_node()` 之前或之后调用 `set_node_defaults()`：

```python theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
graph = (
    StateGraph(State)
    .set_node_defaults(error_handler=default_error_handler)
    .add_node("step_a", step_a)                                     # uses default_error_handler
    .add_node("step_b", step_b, error_handler=custom_error_handler) # uses custom_error_handler
    .add_edge(START, "step_a")
    .compile()
)
```

### 默认错误处理器

当每次图运行都映射到一个外部进程（例如后台作业行），并且任何未处理的节点失败都应将该进程标记为失败时，`error_handler` 默认值特别有价值，无需在每个 `add_node` 上重复 `error_handler=`。当某个步骤需要自己的逻辑时，每节点处理器仍然优先：

```python theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
from langgraph.errors import NodeError
from langgraph.graph import StateGraph, START
from langgraph.types import Command, RetryPolicy
from typing_extensions import TypedDict

class State(TypedDict):
    process_id: str
    status: str

def fetch_data(state: State) -> State:
    return {"status": "fetched"}

def charge_payment(state: State) -> State:
    raise RuntimeError("payment timeout")

def finalize(state: State) -> State:
    return state

def mark_process_failed(state: State, error: NodeError) -> State:
    # Persist failure on the external process row keyed by process_id.
    return {"status": f"failed at {error.node}: {error.error}"}

def refund_payment(state: State, error: NodeError) -> Command:
    return Command(
        update={"status": f"compensated after {error.node}"},
        goto="finalize",
    )

graph = (
    StateGraph(State)
    .set_node_defaults(
        retry_policy=RetryPolicy(max_attempts=3),
        error_handler=mark_process_failed,
    )
    .add_node("fetch_data", fetch_data)  # uses mark_process_failed
    .add_node(
        "charge_payment",
        charge_payment,
        error_handler=refund_payment,  # overrides the graph-wide default
    )
    .add_node("finalize", finalize)
    .add_edge(START, "fetch_data")
    .add_edge("fetch_data", "charge_payment")
    .compile()
)
```

如果 `fetch_data` 在重试后失败，`mark_process_failed` 会运行。如果 `charge_payment` 在重试后失败，`refund_payment` 会运行，因为每节点处理器覆盖了默认值。

处理器接受[错误处理](#error-handling)中描述的相同 `(state, error: NodeError)` 签名。如果您需要访问 `thread_id` 等配置值，它还接受 `RunnableConfig` 作为可选的第三个参数：

```python theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
from langchain_core.runnables import RunnableConfig

def mark_process_failed(
    state: State, error: NodeError, config: RunnableConfig
) -> State:
    thread_id = config["configurable"].get("thread_id")
    return {"status": f"failed on thread {thread_id}: {error.error}"}
```

### 适用性矩阵

并非所有默认值都适用于所有节点类型。错误处理器节点（那些通过 `add_node(error_handler=...)` 注册的节点）被排除在某些默认值之外，以防不安全的行为：

| `set_node_defaults` 参数 | 适用于常规节点 | 适用于错误处理器节点 | 原因                                                      |
| ----------------------------- | ------------------------ | ------------------------------ | ----------------------------------------------------------- |
| `retry_policy`                | ✅                        | ✅                              | 处理器应在瞬时失败时重试            |
| `timeout`                     | ✅                        | ✅                              | 卡住的处理器应像卡住的常规节点一样被取消 |
| `error_handler`               | ✅                        | ❌                              | 处理器绝不能被自身捕获                        |
| `cache_policy`                | ✅                        | ❌                              | 缓存处理器结果是不安全的                           |

### 作用域

在父图上设置的默认值**不会**被子图继承。每个图维护自己的默认值。

## 函数式 API

`@task` 和 `@entrypoint` 在函数式 API 中提供相同的 `timeout=` 和 `retry_policy=` 参数：

```python theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
from langgraph.func import entrypoint, task
from langgraph.types import RetryPolicy, TimeoutPolicy

@task(
    timeout=TimeoutPolicy(idle_timeout=30),
    retry_policy=RetryPolicy(max_attempts=3),
)
async def call_api(url: str) -> str:
    response = await fetch(url)
    return response.text

@entrypoint(timeout=60)
async def my_workflow(inputs: dict) -> str:
    result = await call_api("https://api.example.com/data")
    return result
```

行为与 `add_node` 相同：超时抛出 `NodeTimeoutError`，缓冲的写入被清除，重试策略决定是否重试。

## 优雅关闭

协作式关闭让您可以在当前超级步完成后停止正在进行的图运行，并保存一个可恢复的检查点。这对于处理 SIGTERM 信号或任何需要在丢失工作的情况下回收资源的外部监督程序很有用。

<Note>
  需要 `langgraph>=1.2`。
</Note>

创建一个 [`RunControl`](https://reference.langchain.com/python/langgraph/runtime/RunControl) 并将其作为 `control=` 传给 `invoke` 或 `stream`。从任何线程调用 `request_drain()` 以发出运行应停止的信号：

```python theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
from langgraph.runtime import RunControl
from langgraph.errors import GraphDrained

control = RunControl()

# In a signal handler or supervisor:
# control.request_drain("sigterm")

try:
    result = graph.invoke(inputs, config, control=control)
except GraphDrained as e:
    # The graph stopped early and saved a checkpoint.
    # Resume later with the same config.
    print(f"Drained: {e.reason}")
```

### 语义

Drain 是协作式的，在超级步之间运行，绝不在工作中途抢占：

| 场景                                           | 行为                                                                                      |
| -------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| 节点执行中                                 | 运行到完成。Drain 在下一个超级步生效。                                 |
| 带有重试策略的节点正在重试        | 重试循环运行到耗尽或成功。Drain 在其后生效。                         |
| 图在与 drain 相同的 tick 中自然完成 | 正常返回。检查 `control.drain_requested` 以与正常运行区分。         |
| 还有更多超级步                             | 抛出 `GraphDrained(reason)`。检查点已保存且可恢复。                             |
| 子图请求 drain                            | `GraphDrained` 通过父图向上冒泡，并在其自身的下一个超级步边界停止它。 |

### 在 drain 后恢复

使用相同的 `thread_id` 通过 `invoke(None, config)` 恢复被 drain 的运行：

```python theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
result = graph.invoke(None, config)
```

### 在节点内读取 drain 状态

通过 `runtime` 参数访问 drain 状态，以便在到达超级步边界之前调整节点行为：

```python theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
from langgraph.runtime import Runtime

async def my_node(state: State, runtime: Runtime) -> State:
    if runtime.drain_requested:
        # Skip expensive work and return a minimal result
        return {"status": "skipped", "reason": runtime.drain_reason}
    return {"status": await do_work()}
```

### SIGTERM 钩子模式

处理进程关闭的推荐模式：

```python theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
import signal
from langgraph.runtime import RunControl
from langgraph.errors import GraphDrained

control = RunControl()
signal.signal(signal.SIGTERM, lambda *_: control.request_drain("sigterm"))

try:
    result = graph.invoke(inputs, config, control=control)
except GraphDrained as e:
    log.info("graph drained: %s", e.reason)
    # Resume on next startup with the same config
```

<Note>
  `request_drain()` 不会取消正在运行的 asyncio 任务或杀死线程。要获得硬性上限，请将 drain 与优雅超时和任务取消搭配使用。
</Note>

## 限制

* **超时仅限异步**：带有 `timeout` 的同步节点在编译时会被拒绝。
* **每个节点一个处理器**：每个节点最多只能有一个 `error_handler`。
* **处理器失败会冒泡**：如果错误处理器本身抛出异常，该异常会像节点没有处理器一样传播。
* **`set_node_defaults` 不会被子图继承**：每个图独立管理自己的默认值。

***

<div className="source-links">
  <Callout icon="terminal-2">
    [Connect these docs](/use-these-docs) to Claude, VSCode, and more via MCP for real-time answers.
  </Callout>

  <Callout icon="edit">
    [Edit this page on GitHub](https://github.com/langchain-ai/docs/edit/main/src/oss/langgraph/fault-tolerance.mdx) or [file an issue](https://github.com/langchain-ai/docs/issues/new/choose).
  </Callout>
</div>