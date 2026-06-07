# OrchFlow

> AI 编码 Agent 编排桌面应用 — 在一个 Windows GUI 面板中统一管理 Claude Code / Codex / GitHub Copilot CLI。

OrchFlow 把多个 AI 编码 CLI 集中到一个桌面应用里，让你可以：
- 同时跑多个 Agent，实时看到各自输出
- 每个 Task 自动开 git worktree 隔离，多 Agent 改同一仓库不冲突
- 高危操作（删文件、装包、merge、force push）有审批门控
- 自动创建 Checkpoint，出问题可回滚
- 完整审计日志（时间、Agent、操作、是否被人工审批）

## 当前阶段：Phase 0 MVP

| 已实现 | Phase 1+ 待实现 |
|---|---|
| Claude Code CLI 接入（Headless） | Codex / Copilot CLI 接入 |
| 手动任务创建（简单描述） | 任务列表 / Agent 规划 / 文件导入 |
| 单 Agent 任务 + 实时终端 | 并行广播 / 分工 / Pipeline 模式 |
| Worktree 自动创建/销毁/Merge/Discard | Agent 间 Message Bus |
| 基础 Approval Gate | 批量审批 |
| Checkpoint 创建 + 回滚 | 手动 checkpoint 快捷键 |
| 审计日志 + Windows 通知 | 多项目、Pipeline DAG 视图 |

详见 [`ORCHFLOW_PRD.md`](./ORCHFLOW_PRD.md)。

## 系统要求

- Windows 10/11 (64-bit)
- Node.js 20+ (开发用；运行时无需)
- Git for Windows
- 至少一个已安装的 CLI：`@anthropic-ai/claude-code` / `@openai/codex` / `@github/copilot`

## 开发

```bash
# 安装依赖（首次会下载 electron 二进制，可能需要几分钟）
npm install

# 开发模式：启动 Vite + Electron，自动打开窗口
npm run dev

# 类型检查（main + renderer 两侧）
npm run typecheck

# 生产构建（产物在 out/）
npm run build

# 打包为 Windows 安装包（产物在 release-app/）
npm run build:win
```

## 项目结构

```
src/
├── main/                  # Electron Main 进程
│   ├── index.ts           # 入口
│   ├── ipc.ts             # IPC handler 集中注册
│   ├── agents/            # Agent Driver 层 (Claude / Codex / Copilot)
│   ├── core/              # Session / Task / Approval / Checkpoint / Settings
│   ├── db/                # SQLite + 迁移 + Repositories
│   └── git/               # Worktree 管理
├── renderer/              # React 渲染进程
│   └── src/
│       ├── views/         # Sessions / Tasks / Audit / Settings
│       ├── components/    # 复用组件 (TerminalPane, DiffViewer, ...)
│       └── stores/        # Zustand 状态
└── shared/                # Main + Renderer 共享 types / events / constants
```

## 架构关键点

- **统一 AgentDriver 接口**：新增 CLI = 新增 `IAgentDriver` 实现 + 在 `driver.registry.ts` 注册
- **Worktree 隔离**：每个 Task 自动 `git worktree add ../<project>-orch-worktrees/<task>`
- **审批门控不可绕过**：高危操作（rm -rf / force push / drop table / 装包）必触发 `ApprovalCenter` 弹层
- **API Key 零明文**：通过 keytar 写入 Windows Credential Manager
- **PTY 共享**：Headless 模式与 Interactive 模式共享同一 pty 进程，切换不中断 Agent
- **数据本地化**：所有数据（DB、settings、worktree、checkpoint stash）都在 `~/.orchflow/`

## 关键文件速查

详见 [`index.md`](./index.md)（每次新增/删除关键文件时更新）。

## 已知限制

- 当前仅在 Windows 上验证（PRD 目标平台）
- Codex / Copilot CLI 复用 ClaudeCodeDriver 的进程管理骨架，实际 stream-json 协议待 Phase 1/2 验证
- Approval Gate 由 ClaudeCodeDriver 在 `tool_call` 事件中调用 `approvalGate.request()`，**当前未挂入真实的 stream-json 协议层**（driver 只在解析时识别 `tool_use` 事件并 emit，approval 调用代码待 Phase 1 接入）
- 外部终端（Windows Terminal tab）需要用户机器已安装 `wt.exe`

## 许可

MIT
