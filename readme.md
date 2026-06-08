# OrchFlow

> AI 编码 Agent 编排桌面应用 — 在一个 Windows GUI 面板中统一管理 Claude Code / Codex / GitHub Copilot CLI。

OrchFlow 把多个 AI 编码 CLI 集中到一个桌面应用里，让你可以：
- 同时跑多个 Agent（Claude / Codex / Copilot），实时看到各自输出
- 每个 Task 自动开 git worktree 隔离，多 Agent 改同一仓库不冲突
- 高危操作（删文件、装包、merge、force push）有审批门控
- 自动创建 Checkpoint，出问题可回滚
- 完整审计日志 + 高级过滤 + JSON/CSV 导出
- 多种协作模式：并行广播 / 分工 / Pipeline DAG

## 功能一览

| 类别 | 功能 |
|------|------|
| **Agent 接入** | Claude Code CLI · Codex CLI · GitHub Copilot CLI (`gh copilot`) |
| **任务创建** | 简单描述 · 任务列表（DAG 语法） · Agent 规划 · 文件导入 (.md/.json/.txt) |
| **协作模式** | 独立 · 并行广播（比较结果） · 分工（子任务分发） · Pipeline（依赖链） |
| **终端** | xterm.js 嵌入式 + 全屏 · Headless ↔ Interactive 模式切换 · 外部终端弹出 |
| **审批** | 风险评估 (high/medium/low) · 批量审批 · 按风险级别筛选 |
| **安全** | API Key 零明文 (keytar) · Electron sandbox · 路径沙箱 · IPC 白名单 |
| **Git** | Worktree 自动创建/销毁/Merge · Checkpoint + 回滚 · Diff 预览 |
| **可视化** | Sessions 终端 · Tasks 列表/看板 · Pipeline DAG (SVG) · 审计日志 |
| **消息总线** | Agent 间 text/diff/status/structured 传递 · 下游 prompt 自动注入 |
| **任务路由** | Auto-router 按负载/能力/历史自动分配 Agent |

## 系统要求

- Windows 10/11 (64-bit)
- Node.js 22+ (开发用；`node:sqlite` 内建模块)
- Git for Windows
- 至少一个已安装的 CLI：`@anthropic-ai/claude-code` / `@openai/codex` / GitHub CLI + Copilot 扩展

## 快速开始

```bash
# 克隆 & 安装
git clone https://github.com/qianbkk/OrchFlow.git
cd OrchFlow
npm install

# 开发模式（Vite + Electron，自动打开窗口）
npm run dev

# 类型检查
npm run typecheck

# 运行测试（38 个测试）
npm run test

# 生产构建
npm run build

# 打包 Windows 安装包
npm run build:win
```

## 项目结构

```
src/
├── main/                  # Electron Main 进程
│   ├── index.ts           # 入口，窗口创建 + sandbox 配置
│   ├── ipc.ts             # IPC handler 集中注册（~30 个 handler）
│   ├── menu.ts            # 应用菜单 + 快捷键 (Ctrl+Shift+S)
│   ├── agents/            # Agent Driver 层
│   │   ├── driver.interface.ts   # IAgentDriver 统一接口
│   │   ├── driver.registry.ts    # 注册中心 + CLI 检测
│   │   ├── claude-code.driver.ts # Claude Code 完整实现
│   │   ├── codex.driver.ts       # Codex CLI 实现
│   │   └── copilot.driver.ts     # Copilot CLI 实现
│   ├── core/              # 业务逻辑引擎
│   │   ├── session-manager.ts    # Session 生命周期
│   │   ├── task-manager.ts       # 任务创建（4 种模式）+ 批量
│   │   ├── pipeline-engine.ts    # Pipeline DAG 拓扑排序 + 执行
│   │   ├── auto-router.ts        # 自动任务路由
│   │   ├── message-bus.ts        # Agent 间消息传递
│   │   ├── approval-gate.ts      # 审批门控
│   │   ├── checkpoint.ts         # Checkpoint + 回滚
│   │   └── settings-store.ts     # 设置（敏感字段保护）
│   ├── db/                # SQLite + 迁移 + Repositories
│   │   └── repositories/  # 7 个 repository 类
│   └── git/               # Worktree 管理
├── renderer/              # React 渲染进程
│   └── src/
│       ├── views/         # 5 个视图 (Sessions/Tasks/Pipeline/Audit/Settings)
│       ├── components/    # 12 个复用组件
│       └── stores/        # Zustand 状态 (sessions/ui)
├── preload/               # contextBridge API (window.orchflow)
└── shared/                # Main + Renderer 共享 types / events / constants
```

## 架构关键点

- **统一 IAgentDriver 接口**：新增 CLI = 新增实现 + 注册到 `driver.registry.ts`
- **PTY 共享**：Headless / Interactive 模式共享同一 pty 进程，切换不中断 Agent
- **Worktree 隔离**：每个 Task 自动 `git worktree add`，独立分支
- **Pipeline DAG**：Kahn 算法拓扑排序 → 按依赖顺序执行 → 完成后传递消息给下游
- **Message Bus**：上游 Task 完成后自动注入结果到下游 Agent 的 prompt 前缀
- **Auto-router**：按 idle/running 数/历史成功率/能力匹配评分选择最佳 Agent
- **API Key 零明文**：keytar → Windows Credential Manager，`settings:get` 阻止明文回传
- **数据本地化**：所有数据在 `~/.orchflow/` + SQLite

## 安全模型

| 层 | 机制 |
|---|------|
| Renderer 沙箱 | `sandbox: true` + `contextIsolation: true` + `nodeIntegration: false` |
| IPC 白名单 | `RECEIVE_EVENTS` 限制可订阅频道 |
| 凭据隔离 | keytar → Windows Credential Manager，永不明文 |
| 路径沙箱 | `validateUserPath()` 限制在 home 目录内 |
| 进程隔离 | 每个 Task 独立 git worktree |
| 审计追踪 | 所有安全相关事件记录到 SQLite |

**已知限制**：Approval Gate 当前为审计模式（记录但不物理阻断 Agent CLI 进程）。

## 测试

```bash
npm run test          # 38 个单元测试
npm run test:watch    # 监视模式
npm run test:coverage # 覆盖率报告
```

测试覆盖：events · constants · stores (sessions/ui) · auto-router 评分 · pipeline 拓扑排序 · message-bus 常量

## 文档

| 文件 | 说明 |
|------|------|
| `ORCHFLOW_PRD.md` | 产品需求文档 v1.0 |
| `CLAUDE.md` | AI 行为约束 + 项目核心上下文 |
| `AGENTS.md` | 跨 AI 工具通用编码规范 |
| `CONTRIBUTING.md` | 贡献指南 |
| `SECURITY.md` | 安全策略 + 漏洞报告 |
| `CHANGELOG.md` | 版本变更记录 |
| `index.md` | 关键文件速查表 |

## 路线图

| Phase | 状态 | 内容 |
|-------|------|------|
| **Phase 0** MVP | ✅ 完成 | Claude Code · 单 Agent · Worktree · Approval · Checkpoint · 审计 |
| **Phase 1** 协作核心 | ✅ 完成 | Codex · 广播 · Message Bus · 看板 · 批量审批 · 任务列表 |
| **Phase 2** 全功能 | ✅ 完成 | Copilot · Pipeline DAG · Auto-router · 规划模式 · 多项目 · 高级过滤 |
| Phase 3 打磨 | 🔜 待定 | 真正 PTY 拦截 · 代码签名 · E2E 测试 · 性能优化 |

## 许可

[MIT](LICENSE)
