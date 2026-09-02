# 向后兼容性

> 在生产环境中更新 LangGraph 图代码，而不破坏进行中的运行。

软件在生产环境中需要不断变化。新需求、缺陷修复和重构最终都会落到你的图代码中。由于 LangGraph 会针对现有线程已[持久化](/oss/python/langgraph/persistence)的状态运行最新部署的图，因此你发布的每一次更改，相对于现有检查点而言，实际上都是一次向后兼容的 API 变更。

与那些把运行固定在其启动时所使用代码版本上的工作流引擎不同，LangGraph 会立即将最新图应用于*每一个*线程，包括新线程以及从检查点恢复的线程。这很方便：缺陷修复可以无缝地传播到进行中的对话和代理上。但也意味着你必须仔细思考每一项更改会如何影响那些在旧版本代码下启动的运行。

需要注意三类兼容性问题，大致按你遇到它们的顺序排列：

1. [技术兼容性](#technical-compatibility)：最常见；新代码必须仍然能够针对现有 State 加载和执行。
2. [业务兼容性](#business-compatibility)：较少见；即使代码已更改，现有运行也应继续遵循旧的业务逻辑。
3. [非确定性](#non-determinism)：仅适用于[功能 API](/oss/python/langgraph/functional-api)。

<Tip>
  有关运行时默认支持哪些图拓扑和状态更改的简要总结，请参阅[图迁移](/oss/python/langgraph/graph-api#graph-migrations)。本页其余部分涵盖当更改超出该支持范围时你可以应用的模式。
</Tip>

<a id="technical-compatibility" />

## 技术兼容性

技术兼容性相当于微服务中的 API 破坏性变更。这里的"API"是图代码与[检查点器](/oss/python/langgraph/checkpointers#checkpointer-libraries)为现有线程持久化的数据之间的契约。当线程恢复时，LangGraph 会反序列化已保存的状态，按名称将其分派给某个节点，并期望该节点返回符合状态模式的值。

常见的技术性破坏：

* **重命名或删除节点**，而线程正暂停在该节点处或即将进入该节点，例如位于 [`interrupt`](https://reference.langchain.com/python/langgraph/types/interrupt) 处，或经由仍路由到旧名称的已检查点条件边。恢复时，LangGraph 无法按保存的名称找到该节点，运行随即失败。恢复运行的起点是执行停止处节点的开头，因此节点缺失将导致无处可恢复。
* **重命名或删除 State 键**，而旧检查点仍包含该键，或下游节点仍读取该键。
* **收紧迫 State 字段**，例如将 `Optional` 字段改为必填、收窄类型，或添加没有默认值的新必填字段。现有检查点将无法满足新模式。

边拓扑本身*不会*持久化在检查点中。在仍然存在的节点之间添加、移除或重路由边，对进行中的线程是安全的。根据[图迁移](/oss/python/langgraph/graph-api#graph-migrations)摘要，唯一可能破坏被中断线程的拓扑更改是重命名或删除节点。

### 推荐模式

* 添加新的状态字段时使用 `NotRequired`（或 `Optional[...] = None`），以便旧检查点仍然可以通过校验：

  ```python theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
  from typing import NotRequired
  from typing_extensions import TypedDict

  class State(TypedDict):
      messages: list
      summary: NotRequired[str]  # [!code ++]
  ```

* 将删除视为弃用。至少在一个耗用周期内保留字段在状态上的定义，即使没有节点读取它，以便现有检查点继续加载。

* 通过*先加后删*的方式重命名。将新字段或节点与旧的一起添加，在弃用窗口期内双写或同时路由到两者，然后在确认没有进行中的线程依赖旧字段或节点后将其移除。

* 使节点函数容忍未知键。`TypedDict` 在运行时忽略多余键，因此旧代码版本遗留的状态不会引发错误，除非节点显式读取缺失键。

* 在推广之前，使用[时间旅行](/oss/python/langgraph/use-time-travel)和 [`graph.get_state`](https://reference.langchain.com/python/langgraph/graphs/#langgraph.graph.state.CompiledStateGraph.get_state) 在预发布环境中抽查现有线程与新代码的兼容性。

### 检测进行中的线程

在删除节点、重命名 State 键或以其他方式做出旧线程无法容忍的更改之前，你需要知道是否有任何线程当前停留在你即将放弃的代码版本上。LangGraph 自身不维护线程状态的搜索索引，因此答案取决于你的图在哪里运行。

**如果你部署到 [LangSmith](/langsmith/deployment)。** 使用 Agent Server 的线程搜索按状态过滤。`status` 字段接受 `idle`、`busy`、`interrupted` 和 `error`，因此你可以批量查询 `interrupted` 或 `busy` 线程，并可选用元数据过滤器缩小范围。请参阅[按线程状态过滤](/langsmith/use-threads#filter-by-thread-status)和[列出线程](/langsmith/use-threads#list-threads)。

**只要 LangGraph 在运行。** 使用 [LangSmith 追踪](/oss/python/langgraph/observability)监控生产环境中哪些节点正在被进入和退出。这是判断某个节点或状态字段在任何活跃代码路径中不再可达的最可靠信号。

**当你已经拥有 `thread_id` 时。** 直接检查该单个线程：

* [`graph.get_state(config)`](https://reference.langchain.com/python/langgraph/graphs/#langgraph.graph.state.CompiledStateGraph.get_state) 返回最新检查点，包括线程暂停在哪个节点以及任何挂起的 interrupt。
* [`graph.get_state_history(config)`](https://reference.langchain.com/python/langgraph/graphs/#langgraph.graph.state.CompiledStateGraph.get_state_history) 返回该线程按时间顺序排列的完整检查点列表。

如有疑问，请将已弃用的节点或字段保留在原处，直到 Agent Server 线程列表和追踪都显示其不再有任何活动。

<a id="business-compatibility" />

## 业务兼容性

有时更改在技术上是有效的（每个现有检查点仍然可以加载，每个节点仍然可以解析），但新图的*含义*与旧图不同。新行为对新线程是正确的，但你不希望追溯性地将其应用于在旧逻辑下启动的线程。

例如，假设你的图执行 `intake → triage → respond`，你决定在 `triage` 和 `respond` 之间插入一个新的 `policy_check` 步骤：

* 已经通过 `triage` 的线程应直接继续到 `respond`（旧流程）。
* 新线程应运行完整的新流程。

推荐的模式是在线程启动时在状态上记录相关的*行为版本*，然后用[条件边](/oss/python/langgraph/graph-api#conditional-edges)对其进行分支：

```python theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
from typing import NotRequired
from typing_extensions import TypedDict

from langgraph.graph import END, START, StateGraph


class State(TypedDict):
    request: str
    flow_version: NotRequired[int]
    response: NotRequired[str]


def intake(state: State) -> dict:
    # Stamp new threads with the current flow version. Existing threads
    # that resume past `intake` keep whatever value was already saved.
    return {"flow_version": state.get("flow_version", 2)}


def triage(state: State) -> dict: ...
def policy_check(state: State) -> dict: ...
def respond(state: State) -> dict: ...


def after_triage(state: State) -> str:
    if state.get("flow_version", 1) >= 2:
        return "policy_check"
    return "respond"


builder = StateGraph(State)
builder.add_node("intake", intake)
builder.add_node("triage", triage)
builder.add_node("policy_check", policy_check)
builder.add_node("respond", respond)
builder.add_edge(START, "intake")
builder.add_edge("intake", "triage")
builder.add_conditional_edges("triage", after_triage, ["policy_check", "respond"])
builder.add_edge("policy_check", "respond")
builder.add_edge("respond", END)

graph = builder.compile()
```

在 `triage` 之后恢复的旧线程会从保存的状态中读取 `flow_version`（或回退到 v1 默认值）并跳过 `policy_check`。新线程从 `intake` 开始，被标记为 `flow_version=2`，并运行新路径。一旦所有 v1 线程完成，你就可以移除版本标志和条件边。

此模式仅在*线程启动时*、任何需要版本化的分支之前设置版本时才有效。稍后设置意味着现有线程在需要该版本时不会有它。

<a id="non-determinism" />

## 非确定性

此类别仅适用于[功能 API](/oss/python/langgraph/functional-api)，以及[图 API](/oss/python/langgraph/graph-api)**节点**内的[**任务**](/oss/python/langgraph/functional-api#task)或 [`interrupt`](https://reference.langchain.com/python/langgraph/types/interrupt) 调用。普通图 API **节点**在恢复时会[从节点函数开头重新执行](/oss/python/langgraph/graph-api#re-execution-and-idempotency)；设计副作用时应使其幂等，但除非你在该**节点**中使用**任务**或 [`interrupt`](https://reference.langchain.com/python/langgraph/types/interrupt)，否则无需保留任务调用顺序。

功能 API **入口点**会编译为单个**节点**，当运行恢复时，该节点从开头重放入口点主体，使用缓存的 [`@task`](https://reference.langchain.com/python/langgraph/func/task) 结果跳过已完成的工作。有两类更改会破坏此模型：

* **添加、移除或重新排序位于*恢复点之前*的 `@task` 调用或 [`interrupt`](https://reference.langchain.com/python/langgraph/types/interrupt) 调用。** LangGraph 会按调用在重放中的位置匹配缓存结果和恢复值，因此移动该位置可能导致错误的缓存值被重放到不同的调用上。
* **在 `@task` 之外引入非确定性操作**，例如 `time.time()`、`random.random()`，或内联在入口点主体中的网络调用。在重放时，这些操作产生的值会与首次运行时不同，从而可能改变控制流。

如需更深入的示例说明，请参阅功能 API 指南中的[确定性](/oss/python/langgraph/functional-api#determinism)和[常见陷阱](/oss/python/langgraph/functional-api#common-pitfalls)。

如果你需要对有进行中运行的 `@entrypoint` 做非平凡的代码更改，最安全的选择是：

* 在部署更改之前，让进行中的运行自然耗用完毕。
* 将所有新逻辑包装在新的 `@task` 中，这样其结果会被独立检查点化。
* 在 `langgraph.json` 中为新的行为用新的图名注册一个新入口点，并将新线程路由到它。

***

<div className="source-links">
  <Callout icon="terminal-2">
    [连接这些文档](/use-these-docs) 到 Claude、VSCode 等，通过 MCP 获得实时答案。
  </Callout>

  <Callout icon="edit">
    [在 GitHub 上编辑此页面](https://github.com/langchain-ai/docs/edit/main/src/oss/langgraph/backward-compatibility.mdx)或[提交 issue](https://github.com/langchain-ai/docs/issues/new/choose)。
  </Callout>
</div>