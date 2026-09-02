# 测试

在完成 LangGraph 智能体的原型设计之后，一个自然的下一步是添加测试。本指南介绍了一些在编写单元测试时可以使用的实用模式。

请注意，本指南是 LangGraph 专用的，涵盖了具有自定义结构的图场景——如果您才刚刚开始，请查看使用 LangChain 内置的 [`create_agent`](https://reference.langchain.com/python/langchain/agents/factory/create_agent) 的[测试](/oss/python/langchain/test/)。

## 前置条件

首先，确保您已安装 [`pytest`](https://docs.pytest.org/)：

```bash theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
$ pip install -U pytest
```

## 入门

由于许多 LangGraph 智能体依赖状态，一种有用的模式是：在每次需要使用图的测试之前创建图，然后在测试中使用新的检查点实例编译它。

下面的示例演示了这一点如何应用于一个简单的线性图，该图依次经过 `node1` 和 `node2`。每个节点都会更新唯一的状态键 `my_key`：

```python theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
import pytest

from typing_extensions import TypedDict
from langgraph.graph import StateGraph, START, END
from langgraph.checkpoint.memory import MemorySaver

def create_graph() -> StateGraph:
    class MyState(TypedDict):
        my_key: str

    graph = StateGraph(MyState)
    graph.add_node("node1", lambda state: {"my_key": "hello from node1"})
    graph.add_node("node2", lambda state: {"my_key": "hello from node2"})
    graph.add_edge(START, "node1")
    graph.add_edge("node1", "node2")
    graph.add_edge("node2", END)
    return graph

def test_basic_agent_execution() -> None:
    checkpointer = MemorySaver()
    graph = create_graph()
    compiled_graph = graph.compile(checkpointer=checkpointer)
    result = compiled_graph.invoke(
        {"my_key": "initial_value"},
        config={"configurable": {"thread_id": "1"}}
    )
    assert result["my_key"] == "hello from node2"
```

## 测试单个节点和边

编译后的 LangGraph 智能体会以 `graph.nodes` 的形式暴露对每个单独节点的引用。您可以利用这一点来测试智能体中的单个节点。请注意，这将绕过编译图时传入的任何检查点：

```python theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
import pytest

from typing_extensions import TypedDict
from langgraph.graph import StateGraph, START, END
from langgraph.checkpoint.memory import MemorySaver

def create_graph() -> StateGraph:
    class MyState(TypedDict):
        my_key: str

    graph = StateGraph(MyState)
    graph.add_node("node1", lambda state: {"my_key": "hello from node1"})
    graph.add_node("node2", lambda state: {"my_key": "hello from node2"})
    graph.add_edge(START, "node1")
    graph.add_edge("node1", "node2")
    graph.add_edge("node2", END)
    return graph

def test_individual_node_execution() -> None:
    # Will be ignored in this example
    checkpointer = MemorySaver()
    graph = create_graph()
    compiled_graph = graph.compile(checkpointer=checkpointer)
    # Only invoke node 1
    result = compiled_graph.nodes["node1"].invoke(
        {"my_key": "initial_value"},
    )
    assert result["my_key"] == "hello from node1"
```

## 部分执行

对于由较大图组成的智能体，您可能希望测试智能体内的部分执行路径，而不是端到端地测试整个流程。在某些情况下，将这些部分重构为[子图](/oss/python/langgraph/use-subgraphs)在语义上是有意义的，您可以像往常一样单独调用它们。

但是，如果您不想更改智能体图的整体结构，可以使用 LangGraph 的持久化机制来模拟一种状态：智能体在所需部分开始之前暂停，并在所需部分结束时再次暂停。步骤如下：

1. 使用检查点编译您的智能体（内存检查点 [`InMemorySaver`](https://reference.langchain.com/python/langgraph/checkpoints/#langgraph.checkpoint.memory.InMemorySaver) 足以用于测试）。
2. 调用智能体的 [`update_state`](/oss/python/langgraph/use-time-travel) 方法，并将 [`as_node`](/oss/python/langgraph/use-time-travel#from-a-specific-node) 参数设置为要开始测试的节点*之前*的那个节点的名称。
3. 使用与更新状态时相同的 `thread_id` 调用智能体，并将 `interrupt_after` 参数设置为要停止的节点的名称。

以下是一个仅在线性图中执行第二个和第三个节点的示例：

```python theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
import pytest

from typing_extensions import TypedDict
from langgraph.graph import StateGraph, START, END
from langgraph.checkpoint.memory import MemorySaver

def create_graph() -> StateGraph:
    class MyState(TypedDict):
        my_key: str

    graph = StateGraph(MyState)
    graph.add_node("node1", lambda state: {"my_key": "hello from node1"})
    graph.add_node("node2", lambda state: {"my_key": "hello from node2"})
    graph.add_node("node3", lambda state: {"my_key": "hello from node3"})
    graph.add_node("node4", lambda state: {"my_key": "hello from node4"})
    graph.add_edge(START, "node1")
    graph.add_edge("node1", "node2")
    graph.add_edge("node2", "node3")
    graph.add_edge("node3", "node4")
    graph.add_edge("node4", END)
    return graph

def test_partial_execution_from_node2_to_node3() -> None:
    checkpointer = MemorySaver()
    graph = create_graph()
    compiled_graph = graph.compile(checkpointer=checkpointer)
    compiled_graph.update_state(
        config={
          "configurable": {
            "thread_id": "1"
          }
        },
        # The state passed into node 2 - simulating the state at
        # the end of node 1
        values={"my_key": "initial_value"},
        # Update saved state as if it came from node 1
        # Execution will resume at node 2
        as_node="node1",
    )
    result = compiled_graph.invoke(
        # Resume execution by passing None
        None,
        config={"configurable": {"thread_id": "1"}},
        # Stop after node 3 so that node 4 doesn't run
        interrupt_after="node3",
    )
    assert result["my_key"] == "hello from node3"
```

***

<div className="source-links">
  <Callout icon="terminal-2">
    [Connect these docs](/use-these-docs) to Claude, VSCode, and more via MCP for real-time answers.
  </Callout>

  <Callout icon="edit">
    [Edit this page on GitHub](https://github.com/langchain-ai/docs/edit/main/src/oss/langgraph/test.mdx) or [file an issue](https://github.com/langchain-ai/docs/issues/new/choose).
  </Callout>
</div>