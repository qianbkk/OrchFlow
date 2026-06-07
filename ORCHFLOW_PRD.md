# OrchFlow — 产品需求文档 & 构建指南

**项目代号**：OrchFlow  
**文档版本**：v1.0  
**目标平台**：Windows 10/11（64-bit）  
**技术框架**：Electron + TypeScript + React  
**文档日期**：2026-06-07

---

## 目录

1. [产品愿景与定位](#1-产品愿景与定位)
2. [核心概念与术语](#2-核心概念与术语)
3. [功能需求详述](#3-功能需求详述)
4. [UI/UX 规格](#4-uiux-规格)
5. [技术架构设计](#5-技术架构设计)
6. [数据模型](#6-数据模型)
7. [模块分解与接口规格](#7-模块分解与接口规格)
8. [非功能需求](#8-非功能需求)
9. [MVP 范围界定](#9-mvp-范围界定)
10. [分阶段构建指南](#10-分阶段构建指南)
11. [关键技术决策说明](#11-关键技术决策说明)
12. [风险与注意事项](#12-风险与注意事项)

---

## 1. 产品愿景与定位

### 1.1 一句话定位

OrchFlow 是一个运行在 Windows 本地的 AI 编码 Agent 编排桌面应用，让用户在一个统一的 GUI 面板中管理、协调、监控 Claude Code CLI、Codex CLI、GitHub Copilot CLI 等多个 AI 编码工具的并行协作，同时保留对每个原始 CLI 的完整交互能力。

### 1.2 核心价值主张

| 问题 | OrchFlow 的解法 |
|------|----------------|
| 多个 CLI 散落在不同终端，切换成本高 | 统一面板，一个窗口看所有 Agent |
| 多 Agent 并发修改同一文件造成冲突 | 自动 git worktree 隔离，每个任务独立分支 |
| 不知道 Agent 当前在做什么 | 实时状态流 + 操作审计日志 |
| 危险操作（删文件、大范围重构）没有保护 | 可配置审批门控 + checkpoint 回滚 |
| 无法让多个 Agent 协作完成一个大任务 | 多种协作模式：并行/分工/顺序流水线 |

### 1.3 用户画像

单人开发者，同时维护多个项目，已经在使用 Claude Code CLI 等 AI 编码工具，希望通过多 Agent 协作显著提升吞吐量，需要在高度自动化的同时保持对关键节点的控制权。

---

## 2. 核心概念与术语

| 术语 | 定义 |
|------|------|
| **Agent** | 一个具体的 AI CLI 工具实例（Claude Code / Codex / Copilot CLI） |
| **Session** | 一个正在运行的 Agent 进程实例，绑定到特定任务和 worktree |
| **Task** | 分配给一个或多个 Agent 的工作单元，有生命周期状态 |
| **Pipeline** | 多个 Task 按依赖关系组成的有向无环图（DAG） |
| **Worktree** | 每个 Task 独立的 git 工作目录（对应一个 git branch） |
| **Approval Gate** | 需要用户手动确认才能继续的检查点 |
| **Checkpoint** | Agent 操作前自动保存的状态快照，支持回滚 |
| **Message Bus** | Agent 之间传递消息/结果的中间层 |
| **Driver** | 针对每种 CLI 的统一接口适配器 |
| **Mode** | 运行模式：Headless（自动化）/ Interactive（交互终端） |

---

## 3. 功能需求详述

### 3.1 Agent 管理

#### 3.1.1 Agent 注册与配置

- 系统支持三类 Agent Driver（可扩展）：
  - **ClaudeCodeDriver**（优先级 P0）
  - **CodexDriver**（优先级 P1）
  - **CopilotDriver**（优先级 P2，可选）
- 每个 Agent 类型的配置项：
  - 可执行文件路径（自动检测或手动指定）
  - API Key / 认证配置（加密存储在 Windows Credential Manager）
  - 默认模型选择
  - 默认权限策略（允许/禁止的工具集合）
  - 默认后台驻留策略
- 系统启动时自动检测已安装的 CLI 版本，版本不满足要求时显示警告

#### 3.1.2 Agent 状态定义

每个 Session 维护以下状态机：

```
Idle ──start──→ Initializing ──ready──→ Running
                                            │
                    ┌───────────────────────┤
                    │                       ▼
                WaitingApproval ←── WaitingInput
                    │                       │
                    └──approve──→ Running ←─┘
                                     │
                    ┌────────────────┤
                    ▼                ▼
                  Error           Done
                    │                │
                    └──retry──→ Initializing
```

状态转换规则：
- `Running → WaitingInput`：检测到 Agent 输出中有交互提示（正则匹配提示符模式）
- `Running → WaitingApproval`：Agent 请求执行受保护操作
- `Done → Idle`：任务完成，Session 可复用或销毁

---

### 3.2 任务管理

#### 3.2.1 任务创建（四种输入模式）

**模式 A：简单描述**
- 单个文本框，自然语言描述
- 可选：指定目标 Agent（或由系统自动分配）
- 可选：选择协作模式（独立/分工/广播对比）

**模式 B：任务列表**
- 多行文本输入，每行一条子任务
- 支持任务间依赖声明（语法：`[task-id] > [depends-on-id]`）
- 系统解析并生成 DAG（有向无环图）

**模式C：Agent 规划模式**
- 用户输入目标描述
- 指定一个"规划 Agent"（如 Claude Code）先执行任务分解
- 规划 Agent 输出结构化任务列表（JSON 格式）
- 用户审阅/调整后，确认分发给其他执行 Agent

**模式 D：文件导入**
- 支持 `.md`（Markdown 任务列表）、`.json`（结构化任务）、`.txt` 导入
- 模板功能：常用任务结构可保存为模板，一键复用

#### 3.2.2 任务生命周期

```
Created → Queued → Assigned → Running → PendingReview → Done
                                  │                      │
                               Paused                 Failed
                                  │                      │
                               Resumed               Retrying
```

- 每个 Task 记录：创建时间、分配 Agent、开始时间、完成时间、使用 worktree 路径
- 任务间消息传递记录存入 Message Bus 历史

#### 3.2.3 任务分配模式

系统支持三种分配模式，**任务创建时可选**：

| 模式 | 描述 | 适用场景 |
|------|------|---------|
| **手动** | 用户明确指定每个任务给哪个 Agent | 对 Agent 特性有明确判断时 |
| **半自动** | 用户选择 Agent，系统管理生命周期和状态 | 日常使用默认模式 |
| **全自动** | 系统根据 Agent 状态/负载/能力自动路由 | 任务列表批量执行时 |

自动路由规则（全自动模式）：
1. Agent 当前状态为 `Idle`
2. 优先选择上次成功完成同类任务的 Agent
3. 负载均衡：优先选择当前运行任务数最少的 Agent
4. 能力过滤：根据任务 tag 和 Agent 配置的工具权限匹配

---

### 3.3 协作模式

#### 3.3.1 三种协作模式（任务级选择）

**模式 1：并行广播（Broadcast）**
- 同一任务描述发给多个 Agent 同时执行
- 各自在独立 worktree 完成
- 结束后在 Diff Comparison 视图并排对比各 Agent 的输出
- 用户选择最佳结果或手动合并

**模式 2：分工协作（Divide & Conquer）**
- 用户或规划 Agent 将大任务拆分为子任务列表
- 子任务自动分发给不同 Agent 并行执行
- 各自 worktree 隔离，完成后统一 review & merge

**模式 3：顺序流水线（Pipeline）**
- 任务 A 完成后，其输出（可配置类型）自动传递给任务 B
- 支持 DAG（非线性依赖链）
- 每个节点的"传递内容"可单独配置

#### 3.3.2 Agent 间消息传递（Message Bus）

传递内容类型（per-pair 可配置）：

| 类型 | 描述 | 示例 |
|------|------|------|
| `text` | Agent 输出的文字摘要/结论 | "测试全部通过，建议合并" |
| `diff` | 完整的 git diff 内容 | unified diff 格式 |
| `status` | 执行状态 + 输出文件路径列表 | `{ success: true, files: [...] }` |
| `structured` | JSON 格式的结构化数据 | 任务报告、分析结果 |
| `file_path` | 指向特定文件或目录的路径引用 | `/worktrees/task-3/output/report.md` |
| `mixed` | 以上类型的组合包 | 用户自定义组合 |

消息传递规则配置（每个 Agent-pair 独立）：
- 触发时机：`on_task_done` / `on_checkpoint` / `manual`
- 传递内容类型（多选）
- 接收方 Agent 如何处理（自动继续 / 等待用户确认 / 只记录）

---

### 3.4 人工审批与安全控制

#### 3.4.1 审批门控（Approval Gates）

**受保护操作列表**（默认需要确认，可配置豁免）：

| 操作类型 | 风险等级 | 默认策略 |
|---------|---------|---------|
| 删除文件/目录 | 🔴 高 | 必须确认 |
| 大范围重命名（>5 个文件）| 🔴 高 | 必须确认 |
| merge worktree 到主分支 | 🟡 中 | 必须确认（显示 diff） |
| 写入 `.env` / 配置文件 | 🟡 中 | 默认确认 |
| 安装依赖包 | 🟡 中 | 默认确认 |
| 执行 shell 命令 | 🟡 中 | 可配置 |
| 读取文件 | 🟢 低 | 自动允许 |
| 创建新文件 | 🟢 低 | 自动允许 |

配置粒度：
- **全局默认策略**：在设置中配置
- **Task 级覆盖**：创建任务时可为此任务指定不同策略
- **Agent 级覆盖**：某个 Agent 可信度高时可设置更宽松策略

#### 3.4.2 批量审批

当多个 Agent 同时请求确认时（常见于并行模式）：
- 通知中心显示待审批数量角标
- 进入"批量审批视图"：列表展示所有待审批请求
- 每条请求显示：Agent 名称、操作类型、操作详情、影响文件列表
- 支持：逐条确认/拒绝、全部批准、全部拒绝、按风险等级筛选批准

#### 3.4.3 Checkpoint 与回滚

- **自动 Checkpoint**：每次 Approval Gate 确认前自动创建（git stash + 状态快照）
- **手动 Checkpoint**：用户可随时手动打 checkpoint（快捷键 Ctrl+Shift+S）
- **回滚**：
  - 在 Session 时间线上点击任意 Checkpoint 标记
  - 显示回滚预览（将撤销哪些操作）
  - 确认后：git 回退到对应提交，Session 状态恢复到该时刻
- **暂停/撤销**：
  - 暂停：向 Agent 进程发送 SIGSTOP（或 Windows 等效）
  - 撤销：终止 Agent 进程 + 回滚到最近 Checkpoint

---

### 3.5 终端集成（CLI 直通）

#### 3.5.1 紧凑预览（常态）

面板内每个 Session 卡片显示：
- 最近 N 行输出（可配置，默认 20 行）
- 完整 ANSI 颜色渲染
- 状态指示器（Spinner / Done / Error / WaitingInput）
- 当前工具调用摘要（"正在读取 3 个文件..."）

#### 3.5.2 内嵌全屏终端

- 点击 Session 卡片上的"展开"按钮
- 在主面板内切换到全屏 xterm.js 视图
- 完整交互终端，用户可直接键盘输入
- 支持从 Headless 模式切换为 Interactive 模式（向 Agent 进程 attach pty）

#### 3.5.3 外部终端弹出

- 点击"在外部打开"按钮
- 调用 Windows Terminal / PowerShell，自动 attach 到对应 Session
- 外部终端和 GUI 面板保持输出同步（通过共享 log 文件）

---

### 3.6 审计日志

每个操作记录包含：
- 时间戳（精确到毫秒）
- 操作发起方（Agent 名称 / 用户）
- 操作类型
- 操作详情（文件路径、命令内容等）
- 审批状态（自动通过 / 用户批准 / 用户拒绝）
- 关联 Task ID 和 Session ID

日志视图功能：
- 按 Agent / Task / 操作类型过滤
- 全文搜索
- 时间范围筛选
- 导出为 JSON / CSV

---

### 3.7 通知系统

#### 触发场景：
| 事件 | Windows 通知 | 应用内角标 |
|------|:---:|:---:|
| Task 完成 | ✅ | ✅ |
| Task 失败/出错 | ✅ | ✅ |
| 需要审批 | ✅ | ✅ |
| Agent 崩溃自动重启 | ✅ | ✅ |
| Rate Limit 触发 | — | ✅ |
| Checkpoint 创建 | — | ✅ |

- Windows 通知点击后：聚焦 OrchFlow 窗口 + 跳转到对应 Session/Task
- 应用内消息中心：铃铛图标 + 未读角标，点击展开通知列表

---

### 3.8 Git Worktree 管理

- 每个 Task 创建时自动执行：
  ```
  git worktree add ../[project]-orch-[task-id] -b orch/[task-name]-[timestamp]
  ```
- Worktree 根目录：与主仓库同级，路径可在设置中配置
- Task 完成后生命周期：
  1. 显示 diff 预览（统一 diff 视图）
  2. 用户点击 "Merge" → 创建 Approval Gate → 确认后 `git merge`
  3. 或点击 "Discard" → `git worktree remove --force`
  4. 或点击 "Keep for later" → 保留 worktree，标记为 Archived

---

### 3.9 项目管理（MVP: 单项目，预留多项目扩展）

MVP 阶段：
- 启动时选择/记住一个"当前项目"（git 仓库根目录）
- 所有 Task、Session、Worktree 绑定到此项目
- 项目配置存储在 `~/.orchflow/projects/[project-id]/config.json`

多项目扩展（Phase 2）：
- 左侧项目列表切换
- 不同项目独立的 Task 列表、Agent 配置、Worktree 目录

---

## 4. UI/UX 规格

### 4.1 主窗口布局

```
┌─────────────────────────────────────────────────────────────────┐
│  [OrchFlow] [Project: my-app ▾]              [🔔3] [⚙] [─][□][✕]│
├──────┬──────────────────────────────────────────────────────────┤
│      │  [Sessions ▾] [Tasks ▾] [Pipeline ▾] [Audit ▾]          │
│ Nav  ├──────────────────────────────────────────────────────────┤
│ Bar  │                                                          │
│      │              主视图区域（可切换）                         │
│ ──── │                                                          │
│      │                                                          │
│ [+]  │                                                          │
│ New  │                                                          │
│ Task │                                                          │
│      │                                                          │
└──────┴──────────────────────────────────────────────────────────┘
```

### 4.2 四个主视图

#### 视图 A：Sessions（实时终端视图）

```
┌──────────────┬──────────────┬──────────────┐
│ Claude Code  │ Codex CLI    │ Copilot CLI  │
│ ● Running    │ ○ Idle       │ ⏸ Paused    │
│ task: fix-.. │              │ task: refac  │
├──────────────┴──────────────┴──────────────┤
│ [选中的 Session 输出预览 - 最近 20 行]      │
│ > Analyzing src/auth.ts...                  │
│ > Reading 3 files                           │
│ > Writing fix...                            │
│ [展开 ↗] [弹出外部 ⧉] [暂停 ⏸] [撤销 ✕]   │
└─────────────────────────────────────────────┘
```

#### 视图 B：Tasks（Kanban 看板）

```
┌───────────┬───────────┬───────────┬───────────┐
│  Queued   │  Running  │  Review   │   Done    │
├───────────┼───────────┼───────────┼───────────┤
│ [Task C]  │ [Task A]  │ [Task B]  │ [Task Z]  │
│ fix login │ add tests │ refactor  │ update doc│
│ → Claude  │ ● Claude  │ ⚠ Review  │ ✓ Merged  │
│           │ [Task D]  │           │           │
│ [+New]    │ add auth  │           │           │
│           │ ● Codex   │           │           │
└───────────┴───────────┴───────────┴───────────┘
```

#### 视图 C：Pipeline（流水线 DAG 视图）

可视化的 DAG 图，显示 Task 依赖关系和消息传递链路，节点颜色表示状态。

#### 视图 D：Audit（审计日志）

时间线视图 + 可筛选的操作列表。

### 4.3 关键交互细节

**任务创建对话框**（悬浮面板，不是新窗口）：
- 顶部 Tab：简单描述 / 任务列表 / Agent 规划 / 文件导入
- 底部：选择协作模式 + 分配 Agent + 高级选项（审批策略、后台常驻）

**Diff Review 视图**：
- 左右分屏：修改前 vs 修改后
- 逐文件折叠
- 行级注释（用户可标注疑问）
- 操作按钮：Merge / Discard / Keep / 回退到 Checkpoint

**批量审批对话框**：
- 列表形式，按风险等级排序（高风险置顶）
- 每行：风险图标 + Agent + 操作摘要 + [批准][拒绝] 按钮
- 顶部：[全部批准] [批准低风险] [全部拒绝]

---

## 5. 技术架构设计

### 5.1 技术栈选型

| 层次 | 技术选择 | 选型理由 |
|------|---------|---------|
| 桌面框架 | **Electron 36+** | Windows 原生支持最成熟，node-pty 生态完整，AI coding 友好 |
| 前端框架 | **React 19 + TypeScript** | 生态最大，组件库丰富，AI 生成代码质量高 |
| 前端样式 | **Tailwind CSS v4** | 无需手写 CSS，AI coding 友好 |
| 状态管理 | **Zustand** | 轻量，TypeScript 友好，无样板代码 |
| 终端组件 | **xterm.js + node-pty** | 完整 pty 支持，ANSI 渲染，Windows 兼容 |
| 数据库 | **better-sqlite3** | 同步 API，Electron 环境稳定，无需额外进程 |
| 进程通信 | **Electron IPC** (contextBridge) | 安全的 Main ↔ Renderer 通信 |
| Git 操作 | **simple-git** (Node.js) | 成熟库，Windows 路径兼容 |
| 通知 | **Electron Notification API** | 原生 Windows 系统通知 |

### 5.2 进程架构

```
┌─────────────────────────────────────────────────────────┐
│                   Electron Main Process                  │
│                                                         │
│  ┌──────────┐  ┌────────────┐  ┌──────────────────────┐│
│  │ Session  │  │   Task     │  │   Message Bus        ││
│  │ Manager  │  │  Manager   │  │   (EventEmitter)     ││
│  └────┬─────┘  └─────┬──────┘  └──────────────────────┘│
│       │               │                                  │
│  ┌────▼──────────────▼────────────────────────────┐    │
│  │              Agent Driver Layer                 │    │
│  │  ┌───────────┐ ┌──────────┐ ┌───────────────┐  │    │
│  │  │ ClaudeCode│ │  Codex   │ │    Copilot    │  │    │
│  │  │  Driver   │ │  Driver  │ │    Driver     │  │    │
│  │  └─────┬─────┘ └────┬─────┘ └───────┬───────┘  │    │
│  └────────┼─────────────┼───────────────┼──────────┘    │
│           │             │               │                │
│  ┌────────▼─────────────▼───────────────▼──────────┐    │
│  │         Child Processes (node-pty / spawn)       │    │
│  │   [claude.exe]    [codex.exe]    [copilot.exe]   │    │
│  └─────────────────────────────────────────────────┘    │
│                                                         │
│  ┌──────────────────────────────────────────────────┐   │
│  │   Infrastructure: SQLite │ Git │ Checkpoints     │   │
│  └──────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
                          │ IPC (contextBridge)
┌─────────────────────────────────────────────────────────┐
│                 Renderer Process (React)                  │
│   Sessions View │ Tasks View │ Pipeline View │ Audit     │
└─────────────────────────────────────────────────────────┘
```

### 5.3 Agent Driver 接口

所有 CLI 适配器实现统一接口：

```typescript
interface AgentDriver {
  // 生命周期
  start(config: SessionConfig): Promise<Session>
  stop(sessionId: string, mode: 'graceful' | 'force'): Promise<void>
  pause(sessionId: string): Promise<void>
  resume(sessionId: string): Promise<void>

  // 通信
  send(sessionId: string, message: string): Promise<void>
  streamOutput(sessionId: string): AsyncIterable<AgentEvent>

  // 状态
  getStatus(sessionId: string): AgentStatus
  getMetrics(sessionId: string): SessionMetrics  // token 用量、耗时等

  // 终端
  attachPty(sessionId: string): Promise<IPty>  // 返回交互式 pty
  detachPty(sessionId: string): Promise<void>

  // 工具调用拦截（审批门控）
  onToolCall(sessionId: string, handler: ToolCallHandler): void
}

interface AgentEvent {
  type: 'output' | 'tool_call' | 'tool_result' | 'status_change' | 'error' | 'done'
  timestamp: number
  content: string | ToolCallPayload | StatusChange
  sessionId: string
}
```

**各 Driver 实现方式**：

| Driver | 核心机制 | Headless 命令 |
|--------|---------|--------------|
| ClaudeCodeDriver | Claude Code 官方 TypeScript SDK | `claude -p --output-format stream-json` |
| CodexDriver | spawn 子进程 + stdout JSON 解析 | `codex -p --approval-policy=on-failure` |
| CopilotDriver | GitHub Copilot Node.js SDK（JSON-RPC） | SDK 自动管理进程 |

### 5.4 Checkpoint 机制

```typescript
interface Checkpoint {
  id: string
  sessionId: string
  taskId: string
  timestamp: number
  type: 'auto' | 'manual' | 'pre_approval'
  gitCommit: string      // worktree 当前 HEAD
  gitStash?: string      // 未提交变更的 stash ref
  sessionState: object   // Agent session 序列化状态
  description: string
}
```

自动 Checkpoint 触发点：
1. 每次 Approval Gate 弹出前
2. 每次 Agent 执行 `write_file` / `delete_file` 批操作前
3. 每次 Agent 执行 shell 命令前（如配置为需要 checkpoint）
4. 用户手动（Ctrl+Shift+S）

---

## 6. 数据模型

### 6.1 SQLite 表结构

```sql
-- 项目
CREATE TABLE projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  root_path TEXT NOT NULL,
  worktree_base_path TEXT,
  config_json TEXT,
  created_at INTEGER,
  last_opened_at INTEGER
);

-- 任务
CREATE TABLE tasks (
  id TEXT PRIMARY KEY,
  project_id TEXT REFERENCES projects(id),
  title TEXT NOT NULL,
  description TEXT,
  mode TEXT NOT NULL,           -- 'broadcast'|'divide'|'pipeline'|'single'
  assignment_mode TEXT NOT NULL, -- 'auto'|'semi'|'manual'
  status TEXT NOT NULL,          -- 'created'|'queued'|'running'|'review'|'done'|'failed'
  agent_type TEXT,               -- 'claude'|'codex'|'copilot'|null(auto)
  worktree_path TEXT,
  branch_name TEXT,
  created_at INTEGER,
  started_at INTEGER,
  completed_at INTEGER,
  approval_policy_json TEXT,     -- 此任务的审批策略覆盖
  persist_on_close INTEGER DEFAULT 0
);

-- 任务依赖关系（Pipeline DAG）
CREATE TABLE task_dependencies (
  task_id TEXT REFERENCES tasks(id),
  depends_on_task_id TEXT REFERENCES tasks(id),
  message_config_json TEXT,  -- 传递内容类型配置
  PRIMARY KEY (task_id, depends_on_task_id)
);

-- Sessions
CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  task_id TEXT REFERENCES tasks(id),
  agent_type TEXT NOT NULL,
  status TEXT NOT NULL,
  pid INTEGER,
  mode TEXT NOT NULL, -- 'headless'|'interactive'
  started_at INTEGER,
  ended_at INTEGER,
  token_usage_json TEXT
);

-- 审计日志
CREATE TABLE audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  timestamp INTEGER NOT NULL,
  session_id TEXT,
  task_id TEXT,
  actor TEXT NOT NULL,          -- agent name or 'user'
  action_type TEXT NOT NULL,    -- 'file_write'|'file_delete'|'shell'|'merge'|...
  action_detail_json TEXT,
  risk_level TEXT,              -- 'low'|'medium'|'high'
  approval_status TEXT,         -- 'auto'|'approved'|'rejected'|'pending'
  approved_by TEXT,
  approved_at INTEGER
);

-- Checkpoints
CREATE TABLE checkpoints (
  id TEXT PRIMARY KEY,
  session_id TEXT REFERENCES sessions(id),
  task_id TEXT REFERENCES tasks(id),
  timestamp INTEGER NOT NULL,
  type TEXT NOT NULL,
  git_commit TEXT,
  git_stash TEXT,
  session_state_json TEXT,
  description TEXT
);

-- Agent 间消息
CREATE TABLE agent_messages (
  id TEXT PRIMARY KEY,
  from_session_id TEXT,
  to_session_id TEXT,
  task_id TEXT,
  timestamp INTEGER,
  message_type TEXT,  -- 'text'|'diff'|'status'|'structured'|'file_path'|'mixed'
  content TEXT,
  delivered INTEGER DEFAULT 0
);

-- 通知
CREATE TABLE notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  timestamp INTEGER,
  type TEXT,
  title TEXT,
  body TEXT,
  task_id TEXT,
  session_id TEXT,
  read INTEGER DEFAULT 0,
  action_taken TEXT
);
```

---

## 7. 模块分解与接口规格

### 7.1 模块列表

```
src/
├── main/                          # Electron Main Process
│   ├── index.ts                   # 入口，窗口创建
│   ├── ipc/                       # IPC 处理器注册
│   │   ├── sessions.ipc.ts
│   │   ├── tasks.ipc.ts
│   │   ├── approval.ipc.ts
│   │   └── git.ipc.ts
│   ├── agents/                    # Agent Driver 层
│   │   ├── driver.interface.ts    # AgentDriver 接口定义
│   │   ├── claude-code.driver.ts
│   │   ├── codex.driver.ts
│   │   ├── copilot.driver.ts
│   │   └── driver.registry.ts     # Driver 注册中心
│   ├── core/
│   │   ├── session-manager.ts     # Session 生命周期管理
│   │   ├── task-manager.ts        # Task 队列和状态机
│   │   ├── pipeline-engine.ts     # DAG 解析和执行
│   │   ├── message-bus.ts         # Agent 间消息路由
│   │   ├── approval-gate.ts       # 审批门控逻辑
│   │   ├── checkpoint.ts          # Checkpoint 创建与回滚
│   │   └── auto-router.ts         # 全自动任务分配逻辑
│   ├── git/
│   │   ├── worktree.ts            # Worktree 生命周期
│   │   └── diff.ts                # Diff 生成
│   ├── db/
│   │   ├── database.ts            # SQLite 连接和迁移
│   │   └── repositories/          # 各表的 CRUD
│   └── notifications/
│       └── notifier.ts            # Windows 通知 + 应用内通知
│
├── renderer/                      # React 前端
│   ├── App.tsx
│   ├── views/
│   │   ├── SessionsView.tsx       # 终端视图
│   │   ├── TasksView.tsx          # Kanban 看板
│   │   ├── PipelineView.tsx       # DAG 视图
│   │   └── AuditView.tsx          # 审计日志
│   ├── components/
│   │   ├── SessionCard.tsx        # Agent 状态卡片
│   │   ├── TerminalPane.tsx       # xterm.js 封装
│   │   ├── DiffViewer.tsx         # Diff 对比视图
│   │   ├── ApprovalDialog.tsx     # 审批弹窗
│   │   ├── BatchApproval.tsx      # 批量审批
│   │   ├── TaskCreateDialog.tsx   # 任务创建（4种模式）
│   │   ├── NotificationCenter.tsx # 消息中心
│   │   └── CheckpointTimeline.tsx # Checkpoint 时间线
│   ├── stores/                    # Zustand stores
│   │   ├── sessions.store.ts
│   │   ├── tasks.store.ts
│   │   ├── notifications.store.ts
│   │   └── ui.store.ts
│   └── hooks/
│       ├── useAgentStream.ts      # 订阅 Agent 输出流
│       ├── useApproval.ts         # 审批状态管理
│       └── useWorktree.ts         # Worktree 状态
│
└── shared/                        # Main + Renderer 共享
    ├── types.ts                   # 所有 TypeScript 类型定义
    ├── events.ts                  # IPC 事件名称常量
    └── constants.ts
```

### 7.2 关键 IPC 接口

```typescript
// 从 Renderer 发往 Main 的调用
interface OrchFlowAPI {
  // Sessions
  sessions.list(): Promise<Session[]>
  sessions.start(config: SessionConfig): Promise<Session>
  sessions.stop(id: string, mode: 'graceful' | 'force'): Promise<void>
  sessions.pause(id: string): Promise<void>
  sessions.resume(id: string): Promise<void>
  sessions.send(id: string, message: string): Promise<void>
  sessions.attachPty(id: string): Promise<void>  // 切换到交互模式
  sessions.openExternal(id: string): Promise<void> // 弹出外部终端

  // Tasks
  tasks.create(input: TaskCreateInput): Promise<Task>
  tasks.list(filters?: TaskFilters): Promise<Task[]>
  tasks.cancel(id: string): Promise<void>
  tasks.retry(id: string): Promise<void>

  // Approval
  approval.getQueue(): Promise<ApprovalRequest[]>
  approval.approve(requestId: string): Promise<void>
  approval.reject(requestId: string): Promise<void>
  approval.batchApprove(requestIds: string[]): Promise<void>

  // Checkpoints
  checkpoints.list(sessionId: string): Promise<Checkpoint[]>
  checkpoints.create(sessionId: string, description: string): Promise<Checkpoint>
  checkpoints.rollback(checkpointId: string): Promise<void>

  // Git
  git.getDiff(worktreePath: string): Promise<DiffResult>
  git.merge(taskId: string): Promise<void>
  git.discard(taskId: string): Promise<void>

  // Audit
  audit.query(filters: AuditFilters): Promise<AuditEntry[]>
  audit.export(filters: AuditFilters, format: 'json' | 'csv'): Promise<string>
}

// 从 Main 推送到 Renderer 的事件
interface OrchFlowEvents {
  'session:output': { sessionId: string; chunk: AgentEvent }
  'session:status': { sessionId: string; status: AgentStatus }
  'task:status': { taskId: string; status: TaskStatus }
  'approval:request': ApprovalRequest
  'checkpoint:created': Checkpoint
  'notification:new': Notification
  'message-bus:delivered': AgentMessage
}
```

---

## 8. 非功能需求

### 8.1 性能

| 指标 | 目标 |
|------|------|
| 启动时间（冷启动） | < 3 秒 |
| 终端输出渲染延迟 | < 50ms |
| 同时支持 Agent Session 数 | ≥ 5 个（16GB RAM 机器） |
| 审计日志查询（10万条） | < 500ms |
| IPC 通信延迟 | < 10ms |

### 8.2 可靠性

- Agent 进程崩溃时：自动检测（pid 心跳），显示通知，提供一键重启
- OrchFlow 主进程崩溃时：`persist_on_close=true` 的 Session 在下次启动时自动恢复（记录了 pid 和 worktree 路径）
- SQLite 写入使用 WAL 模式，防止并发写入损坏

### 8.3 安全性

- API Key 存储：使用 Windows Credential Manager（通过 `keytar` npm 包），不写入明文配置文件
- Worktree 隔离：每个 Task 在独立目录，Agent 进程工作目录设置为对应 worktree
- 审批门控：高风险操作无法绕过（代码层强制，不依赖用户配置）

### 8.4 可扩展性设计原则

- 新增 Agent CLI：只需实现 `AgentDriver` 接口 + 在 `driver.registry.ts` 注册，UI 层自动支持
- 新增协作模式：在 `pipeline-engine.ts` 中注册新的执行策略，不改变其他模块
- 新增消息传递类型：在 `message-bus.ts` 中扩展类型枚举，不改变路由逻辑
- 多项目支持：数据层已加 `project_id` 外键，UI 层切换 project context 即可激活

---

## 9. MVP 范围界定

### Phase 0 MVP（可用核心）

**包含功能**：
- ✅ 单项目，Claude Code CLI 接入（Driver + Headless 模式）
- ✅ 手动任务创建（简单描述模式）
- ✅ 单 Agent 运行 + 状态显示
- ✅ xterm.js 内嵌终端（紧凑预览 + 全屏展开）
- ✅ 自动 git worktree 创建和销毁
- ✅ 基础 Approval Gate（merge diff 和 delete file 强制确认）
- ✅ 基础 Checkpoint + 回滚
- ✅ 审计日志（记录，不含高级过滤）
- ✅ Windows 系统通知

**不含功能（后续迭代）**：
- ❌ Codex / Copilot CLI 接入
- ❌ 协作模式（并行/分工/Pipeline）
- ❌ Agent 间消息传递
- ❌ 批量审批
- ❌ 全自动任务路由
- ❌ 多项目支持
- ❌ Kanban 看板视图（用列表替代）
- ❌ Pipeline DAG 视图

### Phase 1（协作核心）

- ✅ Codex CLI 接入（Driver 实现）
- ✅ 并行广播模式
- ✅ Agent 间消息传递（text + diff 类型）
- ✅ Kanban 看板视图
- ✅ 批量审批
- ✅ 任务列表输入模式

### Phase 2（全功能）

- ✅ Copilot CLI 接入
- ✅ 分工协作模式 + Pipeline DAG 模式
- ✅ Agent 规划输入模式
- ✅ 全自动任务路由
- ✅ 所有消息传递类型
- ✅ 文件导入 + 模板保存
- ✅ Pipeline DAG 可视化视图
- ✅ 外部终端弹出（调用 Windows Terminal）
- ✅ 多项目支持（架构已预留）
- ✅ 审计日志高级过滤 + 导出

---

## 10. 分阶段构建指南

### 10.1 开发环境搭建

```powershell
# 前置依赖（Windows）
# 1. Node.js 20 LTS (https://nodejs.org)
# 2. Git for Windows (https://git-scm.com/download/win)
# 3. Python 3.11 (node-gyp 依赖，Windows Build Tools 需要)
# 4. Visual Studio Build Tools 2022

# 初始化项目
mkdir orchflow && cd orchflow
npm init -y
npm install --save-dev electron@latest electron-builder
npm install --save-dev typescript ts-node @types/node
npm install --save-dev vite @vitejs/plugin-react

# 核心运行时依赖
npm install electron-store keytar better-sqlite3
npm install node-pty  # Windows 需要 Build Tools
npm install @xterm/xterm @xterm/addon-fit @xterm/addon-web-links
npm install simple-git
npm install zustand react react-dom
npm install tailwindcss

# AI SDK
npm install @anthropic-ai/claude-code  # Claude Code SDK（待确认包名）

# Windows 特定
npm install node-notifier  # Windows 系统通知备选（Electron 内置也可）
```

**`package.json` 关键配置**：
```json
{
  "main": "dist/main/index.js",
  "scripts": {
    "dev": "concurrently \"vite\" \"wait-on http://localhost:5173 && electron .\"",
    "build": "vite build && tsc -p tsconfig.main.json && electron-builder",
    "build:win": "electron-builder --win"
  },
  "build": {
    "appId": "com.orchflow.app",
    "win": {
      "target": "nsis",
      "icon": "assets/icon.ico"
    }
  }
}
```

### 10.2 Phase 0 构建顺序（建议严格遵循）

```
Week 1: 基础骨架
  ├── Day 1-2: Electron 主进程 + 渲染进程通信（IPC 骨架）
  ├── Day 3: SQLite 数据库初始化 + 迁移脚本
  ├── Day 4: React 路由 + 主窗口布局（空壳）
  └── Day 5: 简单设置页（项目路径配置，API Key 存储）

Week 2: Claude Code Driver
  ├── Day 1-2: ClaudeCodeDriver 实现（spawn + stream-json 解析）
  ├── Day 3: SessionManager（状态机 + pid 管理）
  ├── Day 4: xterm.js 集成（紧凑预览 + 全屏切换）
  └── Day 5: 基础 Sessions View（显示单个 Agent 状态）

Week 3: 任务 + 工程化
  ├── Day 1-2: TaskManager + 简单描述任务创建 UI
  ├── Day 3: git worktree 自动创建/销毁（simple-git）
  ├── Day 4: 基础 Approval Gate（merge diff 弹窗）
  └── Day 5: Diff Viewer 组件

Week 4: 安全 + 稳定性
  ├── Day 1-2: Checkpoint 创建 + 回滚逻辑
  ├── Day 3: 审计日志记录
  ├── Day 4: Windows 通知 + 应用内消息中心
  └── Day 5: 端到端测试 + Bug 修复
```

### 10.3 关键实现片段

#### Claude Code Driver（核心）

```typescript
// src/main/agents/claude-code.driver.ts
import { spawn } from 'node-pty'
import { EventEmitter } from 'events'

export class ClaudeCodeDriver implements AgentDriver {
  private sessions = new Map<string, SessionState>()

  async start(config: SessionConfig): Promise<Session> {
    const pty = spawn('claude', [
      '-p', config.task.description,
      '--output-format', 'stream-json',
      '--dangerously-skip-permissions',  // 在 worktree 隔离下安全
    ], {
      cwd: config.worktreePath,
      env: {
        ...process.env,
        ANTHROPIC_API_KEY: config.apiKey,
      },
      cols: 120,
      rows: 40,
    })

    const session: Session = {
      id: generateId(),
      taskId: config.task.id,
      agentType: 'claude',
      status: 'initializing',
      pid: pty.pid,
      mode: 'headless',
    }

    this.sessions.set(session.id, { session, pty, buffer: '' })
    this.attachOutputParser(session.id, pty)

    return session
  }

  private attachOutputParser(sessionId: string, pty: IPty) {
    const state = this.sessions.get(sessionId)!

    pty.onData((data: string) => {
      state.buffer += data

      // 尝试从 buffer 中解析完整的 JSON Lines
      const lines = state.buffer.split('\n')
      state.buffer = lines.pop() ?? ''  // 保留未完成的行

      for (const line of lines) {
        if (!line.trim()) continue
        try {
          const event = JSON.parse(line)
          this.emit(`output:${sessionId}`, this.normalizeEvent(event, sessionId))

          // 检测需要审批的工具调用
          if (event.type === 'tool_use') {
            this.checkApprovalRequired(sessionId, event)
          }
        } catch {
          // 非 JSON 行，作为原始文本输出
          this.emit(`output:${sessionId}`, {
            type: 'output',
            content: line,
            sessionId,
            timestamp: Date.now(),
          })
        }
      }
    })

    pty.onExit(({ exitCode }) => {
      this.updateStatus(sessionId, exitCode === 0 ? 'done' : 'error')
    })
  }

  async attachPty(sessionId: string): Promise<IPty> {
    // 切换到交互模式：停止自动解析，将 pty 直接暴露给 xterm.js
    const state = this.sessions.get(sessionId)!
    state.session.mode = 'interactive'
    return state.pty
  }
}
```

#### Approval Gate

```typescript
// src/main/core/approval-gate.ts
const HIGH_RISK_PATTERNS = [
  { pattern: /rm\s+-rf|rmdir/i, type: 'file_delete', risk: 'high' },
  { pattern: /git\s+push\s+.*--force/i, type: 'force_push', risk: 'high' },
  { pattern: /drop\s+table/i, type: 'db_destructive', risk: 'high' },
]

export class ApprovalGate {
  async check(sessionId: string, toolCall: ToolCall): Promise<boolean> {
    const riskLevel = this.assessRisk(toolCall)
    const policy = await this.getPolicy(sessionId)

    if (riskLevel === 'low' && policy.autoApprove.includes('low')) {
      await this.auditLog(sessionId, toolCall, 'auto')
      return true
    }

    // 创建 checkpoint 后再请求审批
    await checkpointManager.createAutoCheckpoint(sessionId, `Before ${toolCall.type}`)

    // 发送审批请求到渲染进程
    const request: ApprovalRequest = {
      id: generateId(),
      sessionId,
      toolCall,
      riskLevel,
      timestamp: Date.now(),
    }

    approvalQueue.push(request)
    this.sendToRenderer('approval:request', request)

    // 等待用户决定（带超时）
    return this.waitForDecision(request.id)
  }
}
```

### 10.4 特别注意：Windows 上的 node-pty

```powershell
# node-pty 在 Windows 上需要编译原生模块
# 确保安装了 Visual Studio Build Tools

# 如果遇到编译问题，使用预编译版本：
npm install node-pty --build-from-source

# electron-rebuild 确保 native 模块与 Electron 版本匹配
npx electron-rebuild -f -w node-pty

# package.json 中配置 electron-rebuild 钩子：
{
  "scripts": {
    "postinstall": "electron-rebuild"
  }
}
```

Windows Terminal 弹出集成：
```typescript
// 调用 Windows Terminal 并 attach 到已有进程
import { exec } from 'child_process'

export function openInWindowsTerminal(worktreePath: string, agentType: string) {
  // 方案 1: 新建 wt 标签页，启动 agent CLI（新 session）
  exec(`wt -w 0 new-tab --title "${agentType}" -d "${worktreePath}"`)

  // 方案 2: 直接 attach 到 conpty（更复杂，需要 Windows API）
  // 推荐方案 1，由用户在新终端中手动 resume session
}
```

---

## 11. 关键技术决策说明

### 11.1 为什么选 Electron 而非 Tauri（Windows 优先场景）

Tauri 在 Windows 上使用 WebView2（Edge Chromium），node-pty 需要 FFI 桥接，复杂度显著高于 Electron 原生支持。Electron 的 `node-pty` 在 Windows 上已有大量生产验证（VS Code Terminal 底层即是如此）。对于 AI coding 项目，Electron 是更低风险的选择。

### 11.2 为什么不使用 tmux

Windows 原生不支持 tmux，WSL 路径带来额外复杂度。`node-pty` 在 Windows 上通过 ConPTY（Windows 10 1809+）实现完整的伪终端支持，是更原生的解法。

### 11.3 Headless vs Interactive 模式切换策略

- 任务启动时默认 Headless（解析 stream-json，GUI 渲染状态）
- 用户点击"展开"或"接管"时，停止 JSON 解析，将同一 pty 直连 xterm.js
- 两种模式共享同一个 pty 进程，切换不会中断 Agent 运行

### 11.4 Agent 间消息传递的实现

不使用 MCP（过于复杂，且三个 CLI 支持程度不一致）。Phase 0-1 采用**简单文件 + 事件**方案：
- 发送方 Agent 完成任务 → TaskManager 生成消息对象 → 写入 `agent_messages` 表
- 接收方 Session 启动时，TaskManager 将上游消息作为"系统前缀"注入到 Agent 的初始 prompt 中
- Phase 2 考虑 Codex-as-MCP-Server 方案实现真正的动态消息传递

---

## 12. 风险与注意事项

| 风险 | 影响 | 缓解措施 |
|------|------|---------|
| Claude Code CLI 更新破坏 stream-json 格式 | 高 | 锁定 CLI 版本，添加格式版本检测，优先使用官方 SDK |
| node-pty Windows 兼容性问题 | 高 | 添加 fallback：纯 spawn + readline（无交互模式），降级可用 |
| 多 Agent 并发写入 SQLite | 中 | WAL 模式 + 串行写入队列（`better-sqlite3` 天然同步） |
| git worktree 路径含中文/空格 | 中 | 路径规范化：使用 task-id 作为目录名，不使用中文 |
| Copilot CLI SDK 变更 | 低（P2 才接入） | 接入时再评估，保持 Driver 接口隔离 |
| 用户误操作删除 worktree | 低 | Checkpoint 机制 + git reflog 保护，重要数据有多重备份 |

---

*OrchFlow PRD v1.0 — 基于 6 轮需求访谈综合生成*
*下一步：确认 Phase 0 范围，开始搭建 Electron 骨架项目*
