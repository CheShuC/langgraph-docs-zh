# 使用时间旅行

> 重放过去的执行并分叉，以探索 LangGraph 中的替代路径

## 概述

LangGraph 通过[检查点](/oss/python/langgraph/checkpointers#checkpoints)支持时间旅行：

* **[重放](#replay)**：从先前的检查点重试。
* **[分叉](#fork)**：从先前的检查点以修改后的状态分支，以探索替代路径。

两者都是通过从先前检查点恢复来实现的。检查点之前的节点不会重新执行（结果已经保存）。检查点之后的节点会重新执行，包括任何 LLM 调用、API 请求和[中断](/oss/python/langgraph/interrupts)（这些可能会产生不同的结果）。

## 重放

使用先前检查点的 config 调用图，即可从该点开始重放。

<Warning>
  重放会重新执行节点——它不只是从缓存中读取。LLM 调用、API 请求和[中断](/oss/python/langgraph/interrupts)会再次触发，并可能返回不同的结果。从最终检查点（没有 `next` 节点）重放是一个空操作。
</Warning>

<img src="https://mintcdn.com/langchain-5e9cc07a/dL5Sn6Cmy9pwtY0V/oss/images/re_play.png?fit=max&auto=format&n=dL5Sn6Cmy9pwtY0V&q=85&s=d7b34b85c106e55d181ae1f4afb50251" alt="Replay" width="2276" height="986" data-path="oss/images/re_play.png" />

使用 [`get_state_history`](https://reference.langchain.com/python/langgraph/graphs/#langgraph.graph.state.CompiledStateGraph.get_state_history) 找到您想要重放的检查点，然后使用该检查点的 config 调用 [`invoke`](https://reference.langchain.com/python/langgraph/graphs/#langgraph.graph.state.CompiledStateGraph.invoke)：

```python theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
from langgraph.graph import StateGraph, START
from langgraph.checkpoint.memory import InMemorySaver
from typing_extensions import TypedDict, NotRequired
from langchain_core.utils.uuid import uuid7

class State(TypedDict):
    topic: NotRequired[str]
    joke: NotRequired[str]


def generate_topic(state: State):
    return {"topic": "socks in the dryer"}


def write_joke(state: State):
    return {"joke": f"Why do {state['topic']} disappear? They elope!"}


checkpointer = InMemorySaver()
graph = (
    StateGraph(State)
    .add_node("generate_topic", generate_topic)
    .add_node("write_joke", write_joke)
    .add_edge(START, "generate_topic")
    .add_edge("generate_topic", "write_joke")
    .compile(checkpointer=checkpointer)
)

# Step 1: Run the graph
config = {"configurable": {"thread_id": str(uuid7())}}
result = graph.invoke({}, config)

# Step 2: Find a checkpoint to replay from
history = list(graph.get_state_history(config))
# History is in reverse chronological order
for state in history:
    print(f"next={state.next}, checkpoint_id={state.config['configurable']['checkpoint_id']}")

# Step 3: Replay from a specific checkpoint
# Find the checkpoint before write_joke
before_joke = next(s for s in history if s.next == ("write_joke",))
replay_result = graph.invoke(None, before_joke.config)
# write_joke re-executes (runs again), generate_topic does not
```

## 分叉

分叉（Fork）从过去某个检查点创建带有修改后状态的新分支。在先前检查点上调用 [`update_state`](https://reference.langchain.com/python/langgraph/graphs/#langgraph.graph.state.CompiledStateGraph.update_state) 来创建分叉，然后使用 `None` 调用 [`invoke`](https://reference.langchain.com/python/langgraph/graphs/#langgraph.graph.state.CompiledStateGraph.invoke) 以继续执行。

<img src="https://mintcdn.com/langchain-5e9cc07a/-_xGPoyjhyiDWTPJ/oss/images/checkpoints_full_story.jpg?fit=max&auto=format&n=-_xGPoyjhyiDWTPJ&q=85&s=a52016b2c44b57bd395d6e1eac47aa36" alt="Fork" width="3705" height="2598" data-path="oss/images/checkpoints_full_story.jpg" />

<Warning>
  `update_state` **不会**回滚线程。它会创建一个从指定点分支的新检查点。原始执行历史保持不变。
</Warning>

```python theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
# Find checkpoint before write_joke
history = list(graph.get_state_history(config))
before_joke = next(s for s in history if s.next == ("write_joke",))

# Fork: update state to change the topic
fork_config = graph.update_state(
    before_joke.config,
    values={"topic": "chickens"},
)

# Resume from the fork — write_joke re-executes with the new topic
fork_result = graph.invoke(None, fork_config)
print(fork_result["joke"])  # A joke about chickens, not socks
```

### 从特定节点开始

当您调用 [`update_state`](https://reference.langchain.com/python/langgraph/graphs/#langgraph.graph.state.CompiledStateGraph.update_state) 时，值会使用指定节点的写入器（包括[规约器](/oss/python/langgraph/graph-api#reducers)）来应用。检查点会记录该节点产生了这次更新，执行将从该节点的后继节点继续。

默认情况下，LangGraph 会从检查点的版本历史中推断 `as_node`。当从特定检查点分叉时，这种推断几乎总是正确的。

在以下情况下请显式指定 `as_node`：

* **并行分支**：多个节点在同一步骤中更新了状态，LangGraph 无法确定哪个是最后一个（`InvalidUpdateError`）。
* **没有执行历史**：在全新线程上设置状态（在[测试](/oss/python/langgraph/test)中很常见）。
* **跳过节点**：将 `as_node` 设置为一个更靠后的节点，使图认为该节点已经运行过。

```python theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
# graph: generate_topic -> write_joke

# Treat this update as if generate_topic produced it.
# Execution resumes at write_joke (the successor of generate_topic).
fork_config = graph.update_state(
    before_joke.config,
    values={"topic": "chickens"},
    as_node="generate_topic",
)
```

## 中断

如果您的图使用 [`interrupt`](https://reference.langchain.com/python/langgraph/types/interrupt) 进行[人机协同](/oss/python/langgraph/interrupts)工作流，那么在时间旅行期间中断总是会重新触发。包含中断的节点会重新执行，`interrupt()` 会暂停并等待新的 `Command(resume=...)`。

```python theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
from langgraph.types import interrupt, Command

class State(TypedDict):
    value: list[str]

def ask_human(state: State):
    answer = interrupt("What is your name?")
    return {"value": [f"Hello, {answer}!"]}

def final_step(state: State):
    return {"value": ["Done"]}

graph = (
    StateGraph(State)
    .add_node("ask_human", ask_human)
    .add_node("final_step", final_step)
    .add_edge(START, "ask_human")
    .add_edge("ask_human", "final_step")
    .compile(checkpointer=InMemorySaver())
)

config = {"configurable": {"thread_id": "1"}}

# First run: hits interrupt
graph.invoke({"value": []}, config)
# Resume with answer
graph.invoke(Command(resume="Alice"), config)

# Replay from before ask_human
history = list(graph.get_state_history(config))
before_ask = [s for s in history if s.next == ("ask_human",)][-1]

replay_result = graph.invoke(None, before_ask.config)
# Pauses at interrupt — waiting for new Command(resume=...)

# Fork from before ask_human
fork_config = graph.update_state(before_ask.config, {"value": ["forked"]})
fork_result = graph.invoke(None, fork_config)
# Pauses at interrupt — waiting for new Command(resume=...)

# Resume the forked interrupt with a different answer
graph.invoke(Command(resume="Bob"), fork_config)
# Result: {"value": ["forked", "Hello, Bob!", "Done"]}
```

### 多个中断

如果您的图在多个位置收集输入（例如，多步骤表单），您可以从两次中断之间分叉，以更改后面的答案，而无需重新回答之前的问题。

```python theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
def ask_name(state):
    name = interrupt("What is your name?")
    return {"value": [f"name:{name}"]}

def ask_age(state):
    age = interrupt("How old are you?")
    return {"value": [f"age:{age}"]}

# Graph: ask_name -> ask_age -> final
# After completing both interrupts:

# Fork from BETWEEN the two interrupts (after ask_name, before ask_age)
history = list(graph.get_state_history(config))
between = [s for s in history if s.next == ("ask_age",)][-1]

fork_config = graph.update_state(between.config, {"value": ["modified"]})
result = graph.invoke(None, fork_config)
# ask_name result preserved ("name:Alice")
# ask_age pauses at interrupt — waiting for new answer
```

## 子图

使用[子图](/oss/python/langgraph/use-subgraphs)进行时间旅行取决于子图是否拥有自己的检查点器。这决定了您可以进行时间旅行的检查点粒度。

<Tabs>
  <Tab title="继承的检查点器（默认）">
    默认情况下，子图继承父图的检查点器。父图将整个子图视为一个**单一的超级步骤**——整个子图执行只有一个父级检查点。从子图之前进行时间旅行会从头重新执行它。

    您无法在默认子图的*节点之间*进行时间旅行——您只能从父级进行时间旅行。

    ```python theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
    # Subgraph without its own checkpointer (default)
    subgraph = (
        StateGraph(State)
        .add_node("step_a", step_a)       # Has interrupt()
        .add_node("step_b", step_b)       # Has interrupt()
        .add_edge(START, "step_a")
        .add_edge("step_a", "step_b")
        .compile()  # No checkpointer — inherits from parent
    )

    graph = (
        StateGraph(State)
        .add_node("subgraph_node", subgraph)
        .add_edge(START, "subgraph_node")
        .compile(checkpointer=InMemorySaver())
    )

    config = {"configurable": {"thread_id": "1"}}

    # Complete both interrupts
    graph.invoke({"value": []}, config)            # Hits step_a interrupt
    graph.invoke(Command(resume="Alice"), config)  # Hits step_b interrupt
    graph.invoke(Command(resume="30"), config)     # Completes

    # Time travel from before the subgraph
    history = list(graph.get_state_history(config))
    before_sub = [s for s in history if s.next == ("subgraph_node",)][-1]

    fork_config = graph.update_state(before_sub.config, {"value": ["forked"]})
    result = graph.invoke(None, fork_config)
    # The entire subgraph re-executes from scratch
    # You cannot time travel to a point between step_a and step_b
    ```
  </Tab>

  <Tab title="子图检查点器">
    在子图上设置 `checkpointer=True`，为其提供自己的检查点历史。这会在子图**内部**的每个步骤创建检查点，使您可以从其中的特定点（例如，两次中断之间）进行时间旅行。

    使用带有 `subgraphs=True` 的 [`get_state`](https://reference.langchain.com/python/langgraph/graphs/#langgraph.graph.state.CompiledStateGraph.get_state) 访问子图自己的检查点 config，然后从中分叉：

    ```python theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
    # Subgraph with its own checkpointer
    subgraph = (
        StateGraph(State)
        .add_node("step_a", step_a)       # Has interrupt()
        .add_node("step_b", step_b)       # Has interrupt()
        .add_edge(START, "step_a")
        .add_edge("step_a", "step_b")
        .compile(checkpointer=True)  # Own checkpoint history
    )

    graph = (
        StateGraph(State)
        .add_node("subgraph_node", subgraph)
        .add_edge(START, "subgraph_node")
        .compile(checkpointer=InMemorySaver())
    )

    config = {"configurable": {"thread_id": "1"}}

    # Run until step_a interrupt
    graph.invoke({"value": []}, config)

    # Resume step_a -> hits step_b interrupt
    graph.invoke(Command(resume="Alice"), config)

    # Get the subgraph's own checkpoint (between step_a and step_b)
    parent_state = graph.get_state(config, subgraphs=True)
    sub_config = parent_state.tasks[0].state.config

    # Fork from the subgraph checkpoint
    fork_config = graph.update_state(sub_config, {"value": ["forked"]})
    result = graph.invoke(None, fork_config)
    # step_b re-executes, step_a's result is preserved
    ```
  </Tab>
</Tabs>

有关配置子图检查点器的更多信息，请参阅[子图持久化](/oss/python/langgraph/use-subgraphs#subgraph-persistence)。

***

<div className="source-links">
  <Callout icon="terminal-2">
    [Connect these docs](/use-these-docs) to Claude, VSCode, and more via MCP for real-time answers.
  </Callout>

  <Callout icon="edit">
    [Edit this page on GitHub](https://github.com/langchain-ai/docs/edit/main/src/oss/langgraph/use-time-travel.mdx) or [file an issue](https://github.com/langchain-ai/docs/issues/new/choose).
  </Callout>
</div>