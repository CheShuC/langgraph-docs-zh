# 选择 Graph API 还是 Functional API

LangGraph 提供两种不同的 API 来构建智能体工作流：**Graph API** 和 **Functional API**。这两种 API 共享相同的底层运行时，可以在同一个应用程序中一起使用，但它们是为不同的使用场景和开发偏好而设计的。

本指南将帮助你根据具体需求了解何时使用每种 API。

## 快速决策指南

当你需要以下能力时，使用 **Graph API**：

* **复杂工作流可视化**，用于调试和文档
* **显式状态管理**，在多个节点之间共享数据
* **条件分支**，包含多个决策点
* **并行执行路径**，之后需要合并
* **团队协作**，可视化表示有助于理解

当你想要以下特性时，使用 **Functional API**：

* **对现有过程式代码改动最小**
* **标准控制流**（if/else、循环、函数调用）
* **函数作用域状态**，不需要显式状态管理
* **快速原型开发**，样板代码更少
* **线性工作流**，分支逻辑简单

## 详细比较

### 何时使用 Graph API

[Graph API](/oss/python/langgraph/graph-api) 采用声明式方法，由你定义节点、边和共享状态，从而创建可视化的图结构。

**1. 复杂的决策树和分支逻辑**

当你的工作流有多个依赖各种条件的决策点时，Graph API 会让这些分支显式化且易于可视化。

```python theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
# Graph API: Clear visualization of decision paths
from langgraph.graph import StateGraph
from typing import TypedDict

class AgentState(TypedDict):
    messages: list
    current_tool: str
    retry_count: int

def should_continue(state):
    if state["retry_count"] > 3:
        return "end"
    elif state["current_tool"] == "search":
        return "process_search"
    else:
        return "call_llm"

workflow = StateGraph(AgentState)
workflow.add_node("call_llm", call_llm_node)
workflow.add_node("process_search", search_node)
workflow.add_conditional_edges("call_llm", should_continue)
```

**2. 跨多个组件的状态管理**

当你需要在工作流的不同部分之间共享和协调状态时，Graph API 的显式状态管理会很有帮助。

```python theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
# Multiple nodes can access and modify shared state
class WorkflowState(TypedDict):
    user_input: str
    search_results: list
    generated_response: str
    validation_status: str

def search_node(state):
    # Access shared state
    results = search(state["user_input"])
    return {"search_results": results}

def validation_node(state):
    # Access results from previous node
    is_valid = validate(state["generated_response"])
    return {"validation_status": "valid" if is_valid else "invalid"}
```

**3. 带同步的并行处理**

当你需要并行运行多个操作然后合并其结果时，Graph API 可以自然地处理。

```python theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
# Parallel processing of multiple data sources
workflow.add_node("fetch_news", fetch_news)
workflow.add_node("fetch_weather", fetch_weather)
workflow.add_node("fetch_stocks", fetch_stocks)
workflow.add_node("combine_data", combine_all_data)

# All fetch operations run in parallel
workflow.add_edge(START, "fetch_news")
workflow.add_edge(START, "fetch_weather")
workflow.add_edge(START, "fetch_stocks")

# Combine waits for all parallel operations to complete
workflow.add_edge("fetch_news", "combine_data")
workflow.add_edge("fetch_weather", "combine_data")
workflow.add_edge("fetch_stocks", "combine_data")
```

**4. 团队开发与文档**

Graph API 的可视化特性使团队更容易理解、记录和维护复杂工作流。

```python theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
# Clear separation of concerns - each team member can work on different nodes
workflow.add_node("data_ingestion", data_team_function)
workflow.add_node("ml_processing", ml_team_function)
workflow.add_node("business_logic", product_team_function)
workflow.add_node("output_formatting", frontend_team_function)
```

### 何时使用 Functional API

[Functional API](/oss/python/langgraph/functional-api) 采用命令式方法，将 LangGraph 功能集成到标准的过程式代码中。

**1. 现有的过程式代码**

当你已有使用标准控制流的代码，并希望以最小的重构来添加 LangGraph 功能时。

```python theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
# Functional API: Minimal changes to existing code
from langgraph.func import entrypoint, task

@task
def process_user_input(user_input: str) -> dict:
    # Existing function with minimal changes
    return {"processed": user_input.lower().strip()}

@entrypoint(checkpointer=checkpointer)
def workflow(user_input: str) -> str:
    # Standard Python control flow
    processed = process_user_input(user_input).result()

    if "urgent" in processed["processed"]:
        response = handle_urgent_request(processed).result()
    else:
        response = handle_normal_request(processed).result()

    return response
```

**2. 逻辑简单的线性工作流**

当你的工作流主要是顺序执行，带有简单直接的条件逻辑时。

```python theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
@entrypoint(checkpointer=checkpointer)
def essay_workflow(topic: str) -> dict:
    # Linear flow with simple branching
    outline = create_outline(topic).result()

    if len(outline["points"]) < 3:
        outline = expand_outline(outline).result()

    draft = write_draft(outline).result()

    # Human review checkpoint
    feedback = interrupt({"draft": draft, "action": "Please review"})

    if feedback == "approve":
        final_essay = draft
    else:
        final_essay = revise_essay(draft, feedback).result()

    return {"essay": final_essay}
```

**3. 快速原型开发**

当你希望快速测试想法，而不必先定义状态模式和图结构时。

```python theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
@entrypoint(checkpointer=checkpointer)
def quick_prototype(data: dict) -> dict:
    # Fast iteration - no state schema needed
    step1_result = process_step1(data).result()
    step2_result = process_step2(step1_result).result()

    return {"final_result": step2_result}
```

**4. 函数作用域的状态管理**

当你的状态天然局限于单个函数，不需要广泛共享时。

```python theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
@task
def analyze_document(document: str) -> dict:
    # Local state management within function
    sections = extract_sections(document)
    summaries = [summarize(section) for section in sections]
    key_points = extract_key_points(summaries)

    return {
        "sections": len(sections),
        "summaries": summaries,
        "key_points": key_points
    }

@entrypoint(checkpointer=checkpointer)
def document_processor(document: str) -> dict:
    analysis = analyze_document(document).result()
    # State is passed between functions as needed
    return generate_report(analysis).result()
```

## 组合使用两种 API

你可以在同一个应用程序中同时使用这两种 API。当系统的不同部分有不同的需求时，这很有用。

```python theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
from langgraph.graph import StateGraph
from langgraph.func import entrypoint

# Complex multi-agent coordination using Graph API
coordination_graph = StateGraph(CoordinationState)
coordination_graph.add_node("orchestrator", orchestrator_node)
coordination_graph.add_node("agent_a", agent_a_node)
coordination_graph.add_node("agent_b", agent_b_node)

# Simple data processing using Functional API
@entrypoint()
def data_processor(raw_data: dict) -> dict:
    cleaned = clean_data(raw_data).result()
    transformed = transform_data(cleaned).result()
    return transformed

# Use the functional API result in the graph
def orchestrator_node(state):
    processed_data = data_processor.invoke(state["raw_data"])
    return {"processed_data": processed_data}
```

## 在 API 之间迁移

### 从 Functional 迁移到 Graph API

当你的函数式工作流变得复杂时，你可以迁移到 Graph API：

```python theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
# Before: Functional API
@entrypoint(checkpointer=checkpointer)
def complex_workflow(input_data: dict) -> dict:
    step1 = process_step1(input_data).result()

    if step1["needs_analysis"]:
        analysis = analyze_data(step1).result()
        if analysis["confidence"] > 0.8:
            result = high_confidence_path(analysis).result()
        else:
            result = low_confidence_path(analysis).result()
    else:
        result = simple_path(step1).result()

    return result

# After: Graph API
class WorkflowState(TypedDict):
    input_data: dict
    step1_result: dict
    analysis: dict
    final_result: dict

def should_analyze(state):
    return "analyze" if state["step1_result"]["needs_analysis"] else "simple_path"

def confidence_check(state):
    return "high_confidence" if state["analysis"]["confidence"] > 0.8 else "low_confidence"

workflow = StateGraph(WorkflowState)
workflow.add_node("step1", process_step1_node)
workflow.add_conditional_edges("step1", should_analyze)
workflow.add_node("analyze", analyze_data_node)
workflow.add_conditional_edges("analyze", confidence_check)
# ... add remaining nodes and edges
```

### 从 Graph 迁移到 Functional API

当你的图对于简单的线性流程而言过于复杂时：

```python theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
# Before: Over-engineered Graph API
class SimpleState(TypedDict):
    input: str
    step1: str
    step2: str
    result: str

# After: Simplified Functional API
@entrypoint(checkpointer=checkpointer)
def simple_workflow(input_data: str) -> str:
    step1 = process_step1(input_data).result()
    step2 = process_step2(step1).result()
    return finalize_result(step2).result()
```

## 总结

当你需要对工作流结构进行显式控制、复杂分支、并行处理或团队协作优势时，请选择 **Graph API**。

当你希望以最小的改动为现有代码添加 LangGraph 功能、拥有简单的线性工作流或需要快速原型开发能力时，请选择 **Functional API**。

两种 API 都提供相同的核心 LangGraph 功能（持久化、流式处理、人在回路、记忆），但以不同的编程范式打包，以适应不同的开发风格和使用场景。

***

<div className="source-links">
  <Callout icon="terminal-2">
    [通过 MCP 将这些文档连接到 Claude、VSCode 等](/use-these-docs)，获取实时解答。
  </Callout>

  <Callout icon="edit">
    [在 GitHub 上编辑此页面](https://github.com/langchain-ai/docs/edit/main/src/oss/langgraph/choosing-apis.mdx) 或[提交问题](https://github.com/langchain-ai/docs/issues/new/choose)。
  </Callout>
</div>