# 事件流式处理

> 使用消息、状态、子图、输出和扩展的带类型投影流式传输 LangGraph 运行。

事件流式处理是大多数 LangGraph 应用代码推荐的进程内流式模型。它返回一个运行流对象，可以同时以多种方式消费。

## 快速入门

```py theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
stream = graph.stream_events({
    "messages": [{"role": "user", "content": "What is 42 * 17?"}],
}, version="v3")

for message in stream.messages:
    for token in message.text:
        print(token, end="", flush=True)

final_state = stream.output
```

要针对部署在 Agent Server 后面的图进行流式传输，请参见 [LangSmith 流式 API](/langsmith/streaming)。

## 各部分如何组合在一起

流式技术栈有两个主要层：

1. **流式处理** 从 Pregel 引擎发出原始图执行事件。
2. **事件流式处理** 规范化这些事件，通过流转换器运行它们，并暴露带类型的投影。

<div className="my-6 rounded-xl border bg-gray-50 p-4 dark:bg-gray-900">
  <div className="mx-auto max-w-2xl space-y-2 text-sm">
    <div className="rounded-lg border border-slate-300 bg-white p-3 text-center dark:border-slate-700 dark:bg-slate-950">
      <div className="font-semibold text-slate-900 dark:text-slate-100">Pregel 引擎</div>
      <div className="mt-1 text-xs text-slate-600 dark:text-slate-300">运行图步骤</div>
    </div>

    <div className="text-center text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">发出</div>

    <div className="rounded-lg border border-orange-300 bg-orange-50 p-3 text-center dark:border-orange-800 dark:bg-orange-950">
      <div className="font-semibold text-orange-900 dark:text-orange-100">原始 Pregel 事件</div>
      <div className="mt-1 text-xs text-orange-700 dark:text-orange-300"><code>updates</code>, <code>values</code>, <code>messages</code>, <code>custom</code>, <code>checkpoints</code>, <code>tasks</code>, <code>debug</code></div>
    </div>

    <div className="text-center text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">发送至</div>

    <div className="rounded-lg border border-blue-300 bg-blue-50 p-3 text-center dark:border-blue-800 dark:bg-blue-950">
      <div className="font-semibold text-blue-900 dark:text-blue-100">事件路由器</div>
      <div className="mt-1 text-xs text-blue-700 dark:text-blue-300">通过转换器管道路由每个事件</div>
    </div>

    <div className="text-center text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">级联经过</div>

    <div className="rounded-lg border border-green-300 bg-green-50 p-3 dark:border-green-800 dark:bg-green-950">
      <div className="font-semibold text-green-900 dark:text-green-100">流转换器</div>

      <div className="mt-2 grid gap-2 text-xs text-green-800 dark:text-green-200 sm:grid-cols-4">
        <div className="rounded border border-green-200 bg-white px-2 py-1 dark:border-green-800 dark:bg-green-950">ValuesTransformer</div>
        <div className="rounded border border-green-200 bg-white px-2 py-1 dark:border-green-800 dark:bg-green-950">MessagesTransformer</div>
        <div className="px-2 py-1 text-center text-green-600 dark:text-green-300">...</div>
        <div className="rounded border border-green-200 bg-white px-2 py-1 dark:border-green-800 dark:bg-green-950">自定义转换器</div>
      </div>
    </div>

    <div className="text-center text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">产生</div>

    <div className="rounded-lg border border-purple-300 bg-purple-50 p-3 text-center dark:border-purple-800 dark:bg-purple-950">
      <div className="font-semibold text-purple-900 dark:text-purple-100">事件流</div>
      <div className="mt-1 text-xs text-purple-700 dark:text-purple-300">面向应用代码的投影事件</div>
    </div>
  </div>
</div>

事件路由器是两层之间的桥梁。它接收规范化后的 Pregel 事件，并将每个事件传递给已注册的流转换器。内置转换器创建标准投影，如 `stream.messages`、`stream.values`、`stream.subgraphs` 和 `stream.output`。自定义转换器可以在 `stream.extensions` 下添加应用特定的投影。

## 事件流式处理提供什么

运行流在一个底层事件流之上暴露带类型的投影：

| 投影           | 用途                                                |
| -------------------- | -------------------------------------------------- |
| `stream`             | 迭代每个协议事件。                      |
| `stream.messages`    | 流式传输聊天模型消息和 token 增量。       |
| `stream.values`      | 迭代状态快照并等待最终值。 |
| `stream.output`      | 等待最终输出。                            |
| `stream.subgraphs`   | 发现并观察嵌套图执行。      |
| `stream.interrupts`  | 检查人机协同中断载荷。      |
| `stream.interrupted` | 检查运行是否因等待人工输入而暂停。      |
| `stream.extensions`  | 消费自定义流转换器投影。     |

多个消费者可以并发读取这些投影。读取 `stream.messages` 不会消耗 `stream.values`、`stream.subgraphs` 或 `stream.output` 所需的事件。

事件流式处理位于[流式处理](/oss/python/langgraph/streaming)之上的一层，后者通过 `stream_mode` 模式（如 `updates`、`values`、`messages`、`custom`、`checkpoints`、`tasks` 和 `debug`）暴露原始图执行事件。当您需要对这些模式进行底层访问时使用流式处理；当应用代码受益于带类型投影时使用事件流式处理。

## 流式传输消息

使用 `stream.messages` 获取聊天模型输出：

```py theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
stream = graph.stream_events(input, version="v3")

for message in stream.messages:
    text = str(message.text)
    usage = message.output.usage_metadata

    print(text)
    print(usage)
```

`message.text` 在同步代码中是可迭代的。迭代它以获得逐 token 的输出，或调用 `str(message.text)` 获得完整文本。

`message.reasoning` 暴露推理增量，`message.tool_calls` 暴露工具调用参数块。如果您需要按精确到达顺序获取文本、推理和工具调用块，请改为迭代消息流的原始事件，而不是单独迭代每个投影。

## 流式传输子图

使用 `stream.subgraphs` 观察嵌套图工作，而无需解析命名空间字符串：

```py theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
stream = graph.stream_events(input, version="v3")

for subgraph in stream.subgraphs:
    print(subgraph.graph_name, subgraph.path)

    for message in subgraph.messages:
        print(message.text)
```

`subgraph.graph_name` 是已编译图或 Agent 的 `name`。从工具分派的命名 Agent（例如，通过 Deep Agents `task` 工具调用的 `create_agent(name=...)`）会以该名称出现在这里，而打开作用域的 `lifecycle` 事件带有一个 `cause`，链接回分派它的工具调用。更多信息请参见[生命周期](#lifecycle)。

对于产品特定的流，请参见 [Deep Agents 流式处理](/oss/python/deepagents/event-streaming) 了解子 Agent 流，以及 [LangChain Agent 流式处理](/oss/python/langchain/streaming) 了解工具调用和中间件事件。

## 流式传输状态

使用 `stream.values` 在每一步之后流式传输完整的状态快照：

```py theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
stream = graph.stream_events(input, version="v3")

for snapshot in stream.values:
    print(snapshot)

final_state = stream.output
```

## 流式传输多个投影

对于异步代码中的并发消费，请使用 `astream_events` 配合 `asyncio.gather`：

```py theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
import asyncio

stream = await graph.astream_events(input, version="v3")

async def consume_messages():
    async for message in stream.messages:
        print(f"[llm] node={message.node}")

async def consume_subgraphs():
    async for subgraph in stream.subgraphs:
        print(f"[subgraph] path={subgraph.path}")

await asyncio.gather(consume_messages(), consume_subgraphs())
```

对于同步代码，请使用 `stream.interleave(...)` 以严格的到达顺序消费多个投影：

```py theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
stream = graph.stream_events(input, version="v3")

for name, item in stream.interleave("values", "messages", "subgraphs"):
    if name == "values":
        print(f"[state] keys={list(item)}")
    elif name == "messages":
        print(f"[llm] node={item.node}")
    elif name == "subgraphs":
        print(f"[subgraph] path={item.path}")
```

## 中断后恢复

当图因等待人工输入而暂停时，检查 `stream.interrupted` 和 `stream.interrupts`，然后使用 `Command` 再次调用 `stream_events(..., version="v3")` 恢复。

恢复需要一个使用检查点存储编译的图，以及一个携带线程 ID 的配置——请参见[持久化](/oss/python/langgraph/persistence)。

```py theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
from langgraph.types import Command

stream = graph.stream_events(input, version="v3")

for message in stream.messages:
    print(message.text)

if stream.interrupted:
    print(stream.interrupts)

stream = graph.stream_events(
    Command(resume={"decisions": [{"type": "approve"}]}),
    version="v3",
)
final_state = stream.output
```

## 流式传输所有协议事件

当您想要原始协议事件流时，请直接使用运行对象：

```py theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
stream = graph.stream_events({
    "messages": [{"role": "user", "content": "What is 42 * 17?"}],
}, version="v3")

for event in stream:
    namespace = event["params"]["namespace"]
    print(namespace, event["method"], event["params"]["data"])
```

每个事件都是一个 `ProtocolEvent` 信封，包装一个特定通道的载荷。转换器的 `process(event)` 接收的也是相同的形状。

```py theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
class ProtocolEvent(TypedDict):
    seq: int                    # strictly increasing within a run; use for ordering
    method: str                 # channel name: "messages", "values", "updates", "custom", "tools", "lifecycle", ...
    params: ProtocolEventParams


class ProtocolEventParams(TypedDict):
    namespace: list[str]        # path of "<name>:<runtime_id>" segments from the root graph; [] is the root
    timestamp: int              # wall-clock milliseconds; can drift, don't rely on for ordering
    data: Any                   # channel-specific payload; shape depends on `method`
```

`namespace` 是从根图到发出事件的作用域的路径。根是空数组 `[]`。每个子执行都会添加一个 `"name:runtime_id"` 段，因此子图内嵌套的工具调用看起来像 `["researcher:6f4d", "tools:91ac"]`。`:` 之前的名称是稳定的图或节点名称；后缀是每次调用的运行时 ID。当您只关心特定子树时，请自行按命名空间过滤原始事件——`stream.subgraphs` 已经为嵌套图执行做了这件事。

## 通道和事件生命周期

原始事件在通道上流动。通道名称作为事件的 `method` 出现；每个通道发出特定的事件形状。

| 通道         | 用途                                                         |
| --------------- | --------------------------------------------------------------- |
| `values`        | 完整图状态快照。                                     |
| `updates`       | 每节点状态增量。                                          |
| `messages`      | 以内容块为中心的聊天模型输出。                        |
| `tools`         | 工具调用开始、流式输出、结束和错误事件。     |
| `lifecycle`     | 运行、子图和子 Agent 状态变化。                     |
| `checkpoints`   | 用于分支和时间旅行的轻量级检查点信封。 |
| `input`         | 人机协同输入请求和响应。                 |
| `tasks`         | Pregel 任务创建和结果事件。                         |
| `custom`        | 来自图代码的用户定义载荷。                          |
| `custom:<name>` | 应用定义的流转换器输出。                  |

带类型的投影（`stream.messages`、`stream.values` 等）就是由这些通道构建的。当您直接迭代运行对象时，通道名称会作为原始事件上的 `method` 字段出现。

### 消息

`messages` 通道将输出建模为内容块。数据的 `event` 字段是以下之一：

* `message-start`
* `content-block-start`
* `content-block-delta`
* `content-block-finish`
* `message-finish`

内容块有明确的边界：一个块开始，发出零个或多个增量，然后在同一消息中的下一个块开始之前结束。这使得 token 流式传输、推理块、工具调用块和多模态内容无需特定于提供程序的格式即可显式表达。`message-finish` 可能包含 token 用量；不可恢复的模型调用失败会作为消息错误事件到达。

要直接消费原始内容块事件，而不是使用 `stream.messages` 投影：

```py theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
for event in stream:
    if event["method"] != "messages":
        continue

    data = event["params"]["data"][0]
    if not isinstance(data, dict):
        continue
    if data.get("event") != "content-block-delta":
        continue

    block = data.get("delta") or {}
    if block.get("type") == "text-delta":
        print(block.get("text", ""), end="", flush=True)
    elif block.get("type") == "reasoning-delta":
        print(f"[thinking]{block.get('reasoning', '')}", end="", flush=True)
```

### 工具

`tools` 通道暴露工具执行。数据的 `event` 字段是以下之一：

* `tool-started`
* `tool-output-delta`
* `tool-finished`
* `tool-error`

工具事件通过工具调用 ID 关联，因此一次工具执行可以连接回 `messages` 通道上发起它的工具调用内容块。

### 生命周期

`lifecycle` 通道跟踪根运行、子图和子 Agent 的状态。数据的 `event` 字段是以下之一：

* `started`
* `running`
* `completed`
* `failed`
* `interrupted`

除了 `event` 之外，生命周期数据还可能包含可选的 `graph_name`、`error` 和 `cause`，描述子作用域为何开始（父工具调用、扇出发送、边转换）。

## 构建您自己的投影

流转换器是事件流式处理中的投影层。它们观察协议事件，维护自己的状态，并暴露运行的派生视图——比如工具活动、token 总数、进度事件、构件或用于其他协议的消息。`StreamChannel` 是转换器用来发布这些视图的投影原语。

内置投影（`stream.messages`、`stream.values`、`stream.subgraphs`、`stream.output`）和产品特定投影（LangChain 的 `stream.tool_calls`、Deep Agents 的 `stream.subagents`）本身就是使用相同契约的转换器。用户转换器通过编译时或调用时注册叠加在上面，它们的投影出现在 `stream.extensions` 下。

当现有投影与应用程序所需的形状不匹配时，编写一个自定义转换器。

### 转换器如何工作

事件流式处理从 LangGraph Pregel 引擎的流式输出开始。运行时将这些块规范化为协议事件，然后一个流处理器将每个事件路由通过转换器栈。

```mermaid theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
flowchart TD
    A[Pregel modes] --> B[Events]
    B --> C[Built-in projections]
    C --> D[User transformers]
    D --> E[Run projections]
```

流处理器是一个流的中央分发器。对于每个协议事件，它会：

1. 按顺序调用每个已注册转换器的 `process(event)` 钩子。
2. 将命名 `StreamChannel` 的推送接回协议事件流。
3. 将事件存储在运行流中，除非转换器抑制它。
4. 在运行结束时对每个转换器调用 `finalize()` 或 `fail()`。

转换器是观察性的。它们不会回调图运行时。相反，它们消费事件并将派生值推入 `StreamChannel`、promise 或其他投影对象。

### 转换器形状

一个转换器实现 `StreamTransformer` 接口：

```py theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
from langgraph.stream import ProtocolEvent, StreamTransformer


class MyTransformer(StreamTransformer):
    def init(self) -> dict:
        ...

    def process(self, event: ProtocolEvent) -> bool:
        ...

    def finalize(self) -> None:
        ...

    def fail(self, err: BaseException) -> None:
        ...
```

* `init()` 创建投影对象。用户转换器投影出现在 `stream.extensions` 下。
* `process()` 观察每个协议事件。`ProtocolEvent` 形状请参见[流式传输所有协议事件](#stream-all-protocol-events)。只有当您有意想抑制原始事件时才返回 `false`。
* `finalize()` 在流成功结束后关闭或解析非通道投影。
* `fail()` 将错误传播到非通道投影。

### 声明所需的流模式

`required_stream_modes` 控制底层图在流期间发出哪些 Pregel 流模式。运行时取每个已注册转换器的 `required_stream_modes` 的并集，并将该并集作为 `stream_mode` 参数传给图的 `.stream()` 调用。**没有转换器请求的模式永远不会被发出**——声明 `("custom",)` 正是让 `custom` 事件在运行中流动的原因。

```py theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
class CustomTransformer(StreamTransformer):
    required_stream_modes = ("custom",)  # [!code highlight]

    def process(self, event: ProtocolEvent) -> bool:
        if event["method"] == "custom":
            ...
        return True
```

`process()` 接收图发出的每个事件，并负责按 `event["method"]` 过滤。声明会打开上游发出；它不会收窄 `process()` 看到的内容。有效值是 Pregel 流模式：`"messages"`、`"tools"`、`"custom"`、`"values"`、`"updates"`、`"checkpoints"`、`"tasks"`、`"debug"`。每个转换器必须声明它作用的所有模式——省略的模式不会被图发出，也永远不会到达 `process()`。

### StreamChannel

`StreamChannel` 是转换器用于流式传输值的投影原语。它总是在 `stream.extensions.<name>` 上暴露一个可迭代的流。构造函数参数决定每次 `push()` 是否也作为 `custom:<name>` 事件流入运行的主事件流——即投影的值在迭代原始协议事件时是否可见。

| 需求                                           | 使用                   |
| ---------------------------------------------- | --------------------- |
| 仅侧面通道投影                   | `StreamChannel()`     |
| 同时将每次推送流入主事件流 | `StreamChannel(name)` |

命名通道载荷必须可序列化，因为每个推送的值也会成为主流中的 `custom:<name>` 协议事件。将 promise、异步可迭代对象、类实例和其他进程内句柄保留在未命名通道中。

流处理器拥有通道生命周期。一旦 `init()` 返回一个通道，处理器会在运行结束时为您关闭或失败它。转换器只推送值。

### 示例：命名通道

向 `StreamChannel` 传递一个字符串名称，即可通过 `stream.extensions` 暴露一个流式投影，*并且*将每个推送的值作为 `custom:<name>` 协议事件转发到运行的主事件流：

```py theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
from typing import TypedDict

from langgraph.stream import ProtocolEvent, StreamChannel, StreamTransformer


class ToolActivity(TypedDict):
    name: str
    status: str


class ToolActivityTransformer(StreamTransformer):
    required_stream_modes = ("tools",)

    def __init__(self, scope: tuple[str, ...] = ()) -> None:
        super().__init__(scope)
        self.activity = StreamChannel[ToolActivity]("tool_activity")

    def init(self) -> dict:
        return {"tool_activity": self.activity}

    def process(self, event: ProtocolEvent) -> bool:
        if event["method"] != "tools":
            return True

        data = event["params"]["data"]
        if isinstance(data, dict) and data.get("tool_name") and data.get("event"):
            status = "error" if data["event"] == "tool-error" else "started"
            self.activity.push({"name": data["tool_name"], "status": status})
        return True
```

### 示例：未命名通道

没有名称时，通道只是侧面通道投影——可在 `stream.extensions` 上访问，但对迭代原始事件的消费者不可见。对于持有无法序列化到主事件流的进程内句柄（promise、异步可迭代对象、类实例）的投影，这是正确的选择。

下面的示例将未命名通道与 `get_stream_writer` 配对，让图节点发出 `custom` 通道事件，转换器随后将这些事件排入投影：

```py theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
from langgraph.config import get_stream_writer
from langgraph.stream import ProtocolEvent, StreamChannel, StreamTransformer


def node(state):
    writer = get_stream_writer()
    writer({"kind": "progress", "message": "retrieving context"})
    return state


class CustomTransformer(StreamTransformer):
    required_stream_modes = ("custom",)

    def __init__(self, scope: tuple[str, ...] = ()) -> None:
        super().__init__(scope)
        self.log = StreamChannel()

    def init(self) -> dict:
        return {"custom": self.log}

    def process(self, event: ProtocolEvent) -> bool:
        if event["method"] == "custom":
            self.log.push(event["params"]["data"])
        return True


stream = graph.stream_events(input, version="v3", transformers=[CustomTransformer])

for item in stream.extensions["custom"]:
    print(item)
```

### 示例：最终值投影

当投影不应流入主事件流时，请使用未命名流、promise 或其他进程内对象：

```py theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
from langgraph.stream import ProtocolEvent, StreamChannel, StreamTransformer


class StatsTransformer(StreamTransformer):
    required_stream_modes = ("messages",)

    def __init__(self, scope: tuple[str, ...] = ()) -> None:
        super().__init__(scope)
        self.total_tokens = 0
        self.total_tokens_log = StreamChannel[int]()

    def init(self) -> dict:
        return {"total_tokens": self.total_tokens_log}

    def process(self, event: ProtocolEvent) -> bool:
        data = event["params"]["data"]
        if isinstance(data, dict):
            usage = data.get("usage") or {}
            self.total_tokens += usage.get("output_tokens") or 0
        return True

    def finalize(self) -> None:
        self.total_tokens_log.push(self.total_tokens)
        self.total_tokens_log.close()
```

### 在调用时或编译时注册

对于本地实验，在调用时传递转换器：

```py theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
stream = graph.stream_events(
    input,
    version="v3",
    transformers=[StatsTransformer, ToolActivityTransformer],
)
```

当该图的每次运行都应产生投影时，将转换器编译到图中：

```py theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
graph = builder.compile(
    transformers=[StatsTransformer, ToolActivityTransformer],
)
```

### 内置：`ToolCallTransformer`

LangGraph 随附 `ToolCallTransformer` 作为内置转换器。注册它即可在普通的 `StateGraph` 上暴露 `stream.tool_calls`：

```py theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
from langgraph.prebuilt import ToolCallTransformer

stream = graph.stream_events(input, version="v3", transformers=[ToolCallTransformer])

for tool_call in stream.tool_calls:
    print(tool_call.tool_name, tool_call.input)
```

## 相关

LangGraph 定义了流式原语。要配合 LangChain 或 Deep Agents 使用流式处理，请查阅相关产品文档：

* [LangChain Agent 流式处理](/oss/python/langchain/event-streaming) 涵盖 ReAct 风格的 Agent 消息、工具调用和中间件更新。
* [Deep Agents 流式处理](/oss/python/deepagents/event-streaming) 涵盖子 Agent、嵌套消息和子 Agent 工具调用。
* [LangChain 前端模式](/oss/python/langchain/frontend/overview) 和 [LangGraph 前端模式](/oss/python/langgraph/frontend/overview) 展示了构建在流式状态之上的 UI 用例。
* [LangSmith 流式 API](/langsmith/streaming) 涵盖针对部署在 Agent Server 后面的图进行流式传输。

线上事件和命令格式定义在 [Agent Protocol](https://github.com/langchain-ai/agent-protocol) 仓库中，可通过 PyPI 上的 [`langchain-protocol`](https://pypi.org/project/langchain-protocol/) 和 npm 上的 [`@langchain/protocol`](https://www.npmjs.com/package/@langchain/protocol) 使用。

***

<div className="source-links">
  <Callout icon="terminal-2">
    [Connect these docs](/use-these-docs) to Claude, VSCode, and more via MCP for real-time answers.
  </Callout>

  <Callout icon="edit">
    [Edit this page on GitHub](https://github.com/langchain-ai/docs/edit/main/src/oss/langgraph/event-streaming.mdx) or [file an issue](https://github.com/langchain-ai/docs/issues/new/choose).
  </Callout>
</div>