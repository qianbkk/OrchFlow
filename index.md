# Index — 关键文件速查表

> Claude Code 快速定位入口；新增/删除/重命名关键文件时同步更新。

## Main 进程

| 文件 | 一句话 |
|------|--------|
| `src/main/index.ts` | 入口：app ready → 打开 DB → 注册 IPC → 创建 BrowserWindow |
| `src/main/ipc.ts` | 集中注册 ~30 个 IPC handler (sessions/tasks/agents/git/audit/...) |
| `src/main/agents/driver.interface.ts` | `IAgentDriver` 接口契约（start/stop/pause/send/subscribe） |
| `src/main/agents/driver.registry.ts` | Driver 注册中心 + CLI 二进制检测（PATH/npm 全局） |
| `src/main/agents/claude-code.driver.ts` | Claude CLI 实现（@lydell/node-pty + stream-json 解析） |
| `src/main/core/session-manager.ts` | Session 生命周期 + 事件分发到 Renderer + 审计联动 |
| `src/main/core/task-manager.ts` | Task 状态机 + 自动 worktree 创建 + 自动启动 session |
| `src/main/core/approval-gate.ts` | 高危操作分类（regex 规则） + 5min 超时默认拒绝 |
| `src/main/core/checkpoint.ts` | git stash + HEAD 记录 + 回滚 |
| `src/main/core/notifier.ts` | SQLite + IPC + Windows 原生通知三件套 |
| `src/main/core/settings-store.ts` | JSON 文件持久化（不含 API key） |
| `src/main/core/project-store.ts` | 当前打开项目 ID 持久化 |
| `src/main/db/database.ts` | node:sqlite 单例 + WAL + FK 强制 |
| `src/main/db/migrations.ts` | schema_version 表 + 迁移事务运行器 |
| `src/main/db/migrations/001_initial.ts` | 7 张表初始 schema |
| `src/main/git/worktree.ts` | worktree 创建/删除/合并/diff |
| `src/preload/index.ts` | `window.orchflow.*` API 暴露（contextBridge） |

## Renderer 进程

| 文件 | 一句话 |
|------|--------|
| `src/renderer/src/App.tsx` | 根组件，路由 4 视图 + 挂载 ApprovalCenter |
| `src/renderer/src/components/TitleBar.tsx` | 顶部栏（应用名 + Project 入口 + 通知 + 设置） |
| `src/renderer/src/components/Sidebar.tsx` | 左侧导航 (Sessions/Tasks/Audit/Settings) |
| `src/renderer/src/components/TerminalPane.tsx` | xterm.js 终端封装（暗色主题、fit、web-links） |
| `src/renderer/src/components/DiffViewer.tsx` | 文件级 diff 预览 + Merge/Discard/Keep |
| `src/renderer/src/components/ApprovalCenter.tsx` | 高危操作审批浮层（右上角） |
| `src/renderer/src/components/NotificationCenter.tsx` | 通知中心（铃铛 + 未读角标） |
| `src/renderer/src/components/TaskCreateDialog.tsx` | 任务创建弹窗（标题/描述/Agent 选择） |
| `src/renderer/src/views/SessionsView.tsx` | 主视图：Agent 检测 + Session 列表 + xterm 输出 |
| `src/renderer/src/views/TasksView.tsx` | 主视图：项目/任务列表 + 打开 ProjectPicker/DiffViewer |
| `src/renderer/src/views/AuditView.tsx` | 主视图：审计日志时间线 |
| `src/renderer/src/views/SettingsView.tsx` | 主视图：CLI 状态 + API Key 输入 |
| `src/renderer/src/stores/ui.store.ts` | Zustand: 当前视图 / sidebar 折叠状态 |
| `src/renderer/src/stores/sessions.store.ts` | Zustand: Session 列表 + 缓冲输出（500 行/会话） |

## 共享

| 文件 | 一句话 |
|------|--------|
| `src/shared/types.ts` | 所有 domain types (Agent/Task/Session/Approval/Checkpoint/Audit/...) |
| `src/shared/events.ts` | IPC 事件名常量 + 接收方白名单 |
| `src/shared/constants.ts` | APP_NAME、AGENT_DEFAULTS、HIGH_RISK_TOOL_PATTERNS、keytar service 名 |
