# Index — 关键文件速查表

> Claude Code 快速定位入口；新增/删除/重命名关键文件时同步更新。

## Main 进程

| 文件 | 一句话 |
|------|--------|
| `src/main/index.ts` | 入口：app ready → DB → IPC → BrowserWindow (sandbox: true) |
| `src/main/ipc.ts` | ~35 个 IPC handler 集中注册 + validateUserPath + dialog |
| `src/main/menu.ts` | 应用菜单 + Ctrl+Shift+S 快捷键 |

### Agents

| 文件 | 一句话 |
|------|--------|
| `src/main/agents/driver.interface.ts` | `IAgentDriver` 接口（含可选 switchMode/ptyInput/ptyResize） |
| `src/main/agents/driver.registry.ts` | Driver 注册中心 + CLI 二进制检测 + 3 个真实 Driver |
| `src/main/agents/claude-code.driver.ts` | Claude CLI：PTY + stream-json 解析 + approval gate + checkpoint |
| `src/main/agents/codex.driver.ts` | Codex CLI：PTY + stdout JSON 解析 + `--approval-policy on-failure` |
| `src/main/agents/copilot.driver.ts` | Copilot CLI：`gh copilot suggest` + 文本输出解析 |
| `src/main/agents/stub.driver.ts` | 占位 Driver（可取消 subscribe），供未来 CLI 使用 |

### Core 引擎

| 文件 | 一句话 |
|------|--------|
| `src/main/core/session-manager.ts` | Session 生命周期 + keytar API key 注入 + 事件分发 |
| `src/main/core/task-manager.ts` | 任务创建（4 种模式）+ 批量创建 + 依赖管理 + 自动路由集成 |
| `src/main/core/pipeline-engine.ts` | Pipeline DAG：Kahn 拓扑排序 + 依赖满足检查 + 自动启动下游 |
| `src/main/core/auto-router.ts` | Auto-router：按 idle/负载/历史/能力评分选 Agent |
| `src/main/core/message-bus.ts` | Message Bus：publish/consume + prompt 前缀注入 + 自动发布到依赖 |
| `src/main/core/approval-gate.ts` | 高危操作分类 + 风险评估 + 5min 超时 |
| `src/main/core/checkpoint.ts` | git stash（精确 ref）+ HEAD 记录 + 回滚 + diff 预览 |
| `src/main/core/notifier.ts` | SQLite 持久化 + IPC 广播 + Windows 原生通知 |
| `src/main/core/settings-store.ts` | JSON 文件设置（敏感字段保护：拒绝 apiKey/token/secret） |
| `src/main/core/project-store.ts` | 当前项目 ID 持久化 |
| `src/main/core/broadcast.ts` | BrowserWindow 广播工具函数 |
| `src/main/core/paths.ts` | userData 路径工具 |

### Database

| 文件 | 一句话 |
|------|--------|
| `src/main/db/database.ts` | node:sqlite 单例 + WAL + FK 强制 |
| `src/main/db/migrations.ts` | schema_version + 迁移事务运行器 |
| `src/main/db/migrations/001_initial.ts` | 9 张表（含 task_dependencies + agent_messages） |
| `src/main/db/repositories/base.ts` | Repository 基类 |
| `src/main/db/repositories/task.repository.ts` | Task CRUD + status 更新 |
| `src/main/db/repositories/session.repository.ts` | Session CRUD |
| `src/main/db/repositories/dependency.repository.ts` | TaskDependency CRUD + listByProject + listDependents |
| `src/main/db/repositories/agent-message.repository.ts` | AgentMessage CRUD + getPendingForTask + markDelivered |
| `src/main/db/repositories/audit.repository.ts` | AuditEntry 查询 + 过滤 |
| `src/main/db/repositories/checkpoint.repository.ts` | Checkpoint CRUD |
| `src/main/db/repositories/notification.repository.ts` | Notification CRUD + markRead |
| `src/main/db/repositories/project.repository.ts` | Project CRUD |

### Git

| 文件 | 一句话 |
|------|--------|
| `src/main/git/worktree.ts` | worktree 创建/删除/合并（porcelain 路径推导）/diff |

## Renderer 进程

### Views (5)

| 文件 | 一句话 |
|------|--------|
| `src/renderer/src/views/SessionsView.tsx` | Agent 检测 + Session 列表 + xterm 全屏 + checkpoint timeline |
| `src/renderer/src/views/TasksView.tsx` | 项目/任务管理 + List/Kanban 切换 + ProjectPicker |
| `src/renderer/src/views/PipelineView.tsx` | DAG 可视化（SVG 缩放/平移 + 节点选择 + 状态色） |
| `src/renderer/src/views/AuditView.tsx` | 审计日志 + 6 个过滤控件 + JSON/CSV 导出 |
| `src/renderer/src/views/SettingsView.tsx` | CLI 状态 + API Key（apiKeyExists boolean） |

### Components (12)

| 文件 | 一句话 |
|------|--------|
| `src/renderer/src/components/TitleBar.tsx` | 顶部栏 |
| `src/renderer/src/components/Sidebar.tsx` | 左侧导航（5 入口 + New Task） |
| `src/renderer/src/components/TerminalPane.tsx` | xterm.js 封装（暗色主题 + fit + web-links） |
| `src/renderer/src/components/DiffViewer.tsx` | 文件级 diff + Merge/Discard/Keep |
| `src/renderer/src/components/ApprovalCenter.tsx` | 审批浮层 + Phase 0 审计模式警告 |
| `src/renderer/src/components/BatchApproval.tsx` | 批量审批面板（select by risk + bulk actions） |
| `src/renderer/src/components/NotificationCenter.tsx` | 通知中心 |
| `src/renderer/src/components/CheckpointTimeline.tsx` | Checkpoint 时间线 + rollback preview |
| `src/renderer/src/components/TaskCreateDialog.tsx` | 4-tab 任务创建（Simple/List/Plan/Import） |
| `src/renderer/src/components/KanbanBoard.tsx` | 4 列看板（HTML5 拖放） |
| `src/renderer/src/components/BroadcastCompare.tsx` | 广播结果并排对比 + diff |
| `src/renderer/src/components/ErrorBoundary.tsx` | React 错误边界 + 恢复 UI |
| `src/renderer/src/components/Modal.tsx` | 通用模态框 |
| `src/renderer/src/components/StatusPill.tsx` | 状态徽章 |

### State + Hooks

| 文件 | 一句话 |
|------|--------|
| `src/renderer/src/stores/ui.store.ts` | Zustand: activeView / sidebar / taskViewMode / activeProjectId |
| `src/renderer/src/stores/sessions.store.ts` | Zustand: Session 状态 + lines(20) + fullLines(5000) + applyEvent |
| `src/renderer/src/hooks/useRefreshOn.ts` | IPC 事件订阅 hook |

### Entry

| 文件 | 一句话 |
|------|--------|
| `src/renderer/src/App.tsx` | 根组件：ErrorBoundary + 5 视图路由 + ApprovalCenter |
| `src/renderer/src/main.tsx` | React DOM 挂载入口 |
| `src/renderer/src/index.css` | Tailwind v4 全局样式 |

## Preload

| 文件 | 一句话 |
|------|--------|
| `src/preload/index.ts` | `window.orchflow.*` API（contextBridge + RECEIVE_EVENTS 白名单） |

## Shared

| 文件 | 一句话 |
|------|--------|
| `src/shared/types.ts` | 全部类型定义（含 Pipeline/MessageBus/Batch/Plan/Import） |
| `src/shared/events.ts` | IPC 事件名常量（含 pipeline/message-bus 事件） |
| `src/shared/constants.ts` | APP_NAME + AGENT_DEFAULTS + KANBAN_COLUMNS + PIPELINE_LAYOUT + AUTO_ROUTER_WEIGHTS |

## Config + Infra

| 文件 | 一句话 |
|------|--------|
| `vitest.config.ts` | 双环境（jsdom/node） + path aliases + setupFiles |
| `electron.vite.config.ts` | main/preload/renderer 三段构建配置 |
| `electron-builder.yml` | Windows 安装包配置 |
| `.github/workflows/ci.yml` | CI: typecheck + test + build |

## Tests

| 文件 | 一句话 |
|------|--------|
| `src/shared/events.test.ts` | 事件常量完整性 (3) |
| `src/shared/constants.test.ts` | 常量值验证 (4) |
| `src/renderer/src/stores/ui.store.test.ts` | UI store 操作 (5) |
| `src/renderer/src/stores/sessions.store.test.ts` | Session store applyEvent (8) |
| `src/main/core/auto-router.test.ts` | Auto-router 评分逻辑 (5) |
| `src/main/core/pipeline-engine.test.ts` | 拓扑排序 + 依赖满足 (7) |
| `src/main/core/message-bus.test.ts` | Phase 1/2 常量验证 (6) |
