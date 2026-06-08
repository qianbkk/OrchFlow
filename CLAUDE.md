# CLAUDE.md

> **定位**：AI 行为总约束文件，每次会话启动时自动加载。
> 记录边界、原则与项目核心上下文；不包含可从代码直接推断的内容。
>
> **当前阶段**：Phase 0/1/2 全部实现完毕（commit `f70256a`）。38 个测试通过，typecheck + build 全绿。

---

## 配套文件职责

| 文件 | 定位 | 主要读者 |
|------|------|---------|
| `CLAUDE.md` | AI 行为约束 + 项目核心上下文 | Claude Code（每次会话自动加载） |
| `index.md` | 关键文件速查表（30+ 核心文件及一句话描述） | Claude Code（快速定位） |
| `README.md` | 项目架构、功能介绍、使用指南 | 人类开发者 |
| `AGENTS.md` | 跨工具通用编码规范 | Claude / Cursor / Codex 等 |
| `.claude/lessons.md` | 错误经验积累 | Claude Code（会话启动时加载） |
| `ORCHFLOW_PRD.md` | 产品需求文档 v1.0（2026-06-07） | 人类 + AI 共同参考 |
| `CONTRIBUTING.md` | 贡献指南 | 外部贡献者 |
| `SECURITY.md` | 安全策略 + 漏洞报告 | 安全研究者 |
| `CHANGELOG.md` | 版本变更记录 | 所有人 |

---

## 会话启动检查

**每次会话开始时，按顺序执行：**

1. 确认项目技术栈和常用命令（见下方）
2. 阅读 `.claude/lessons.md` — 了解已知陷阱和历史纠错经验
3. 涉及跨工具规范时，按需阅读 `AGENTS.md`
4. 涉及功能决策时，回看 `ORCHFLOW_PRD.md` 对应章节

---

## 项目概述

OrchFlow 是一个运行在 Windows 本地的 AI 编码 Agent 编排桌面应用，统一面板管理 Claude Code CLI、Codex CLI、GitHub Copilot CLI 的并行协作。

**已实现的核心能力**：
- 3 种 CLI Driver（Claude / Codex / Copilot）
- 4 种任务创建模式（简单/列表DAG/Agent规划/文件导入）
- 3 种协作模式（广播/分工/Pipeline DAG）
- Message Bus 跨 Agent 消息传递
- Auto-router 自动任务路由
- Kanban 看板 + Pipeline DAG 可视化
- 批量审批 + 审计日志高级过滤

---

## 技术栈

| 组件 | 版本 | 说明 |
|------|------|------|
| Electron | 42 | 桌面框架 |
| React | 19 | 前端 UI |
| TypeScript | 5.7 | 严格模式 (noUncheckedIndexedAccess) |
| Tailwind CSS | v4 | `@tailwindcss/vite` 插件 |
| Zustand | 5 | Renderer 状态管理 |
| xterm.js | 5.5 | 终端 + `@xterm/addon-fit` + `addon-web-links` |
| @lydell/node-pty | 1.2-beta | 预编译二进制，无需 VS Build Tools |
| node:sqlite | Node 22 内建 | 替代 better-sqlite3，避免 node-gyp |
| simple-git | 3.36 | Git 操作 |
| keytar | 7.9 | Windows Credential Manager |
| electron-vite | 5 | 构建工具（main/preload/renderer 三段） |
| Vitest | 3.2 | 测试框架（jsdom + node 双环境） |
| lucide-react | 0.469 | 图标库 |

- **目标平台**：Windows 10/11 64-bit（仅此一项，非跨平台）

---

## 常用命令

```powershell
# 日常开发
npm run dev              # electron-vite dev（Vite + Electron 热重载）

# 验证
npm run typecheck        # tsc --noEmit (node + web 双侧)
npm run test             # vitest run (38 tests)
npm run test:watch       # vitest watch 模式
npm run test:coverage    # 覆盖率报告

# 构建
npm run build            # electron-vite build (out/)
npm run build:win        # electron-builder --win (release-app/)
npm run build:unpack     # electron-builder --dir (不打包)

# 原生模块重建（node-pty 升级后）
npx electron-rebuild -f -w node-pty
```

---

## 架构与目录结构

```
src/
├── main/                  # Electron Main 进程
│   ├── index.ts           # 入口，sandbox: true
│   ├── ipc.ts             # ~35 个 IPC handler
│   ├── menu.ts            # 菜单 + Ctrl+Shift+S
│   ├── agents/            # 3 个 Driver + registry
│   ├── core/              # 7 个核心模块
│   ├── db/                # SQLite + 7 个 Repository
│   └── git/               # Worktree 管理
├── renderer/src/
│   ├── views/             # 5 个视图 (Sessions/Tasks/Pipeline/Audit/Settings)
│   ├── components/        # 12 个组件
│   ├── stores/            # Zustand (sessions/ui)
│   └── hooks/             # useRefreshOn
├── preload/               # contextBridge API
└── shared/                # types + events + constants
```

**请求链路**：Renderer → `window.orchflow.*` (contextBridge) → IPC Handler → Manager → Driver / Git / SQLite

**关键设计约束**：
- 所有 CLI 适配器实现 `IAgentDriver` 接口（含可选 PTY 方法），新增 CLI = 新增 Driver + 注册
- Headless 与 Interactive 模式**共享同一个 pty**，模式切换不重启进程
- 凭据通过 keytar 写入 Windows Credential Manager，**禁止明文落盘**
- `settings:get` 对 `apiKey:*` 直接 throw，必须用 `settings:apiKeyExists`
- `settings-store.setAgentConfig` 拦截敏感字段 (apiKey/token/secret/password)

---

## 核心行为准则

### 1. 验证优先

所有改动必须通过：`npm run typecheck` + `npm run test` + `npm run build`。

### 2. 安全门控不可绕过

Approval Gate、Worktree 隔离、API Key 加密是产品核心卖点，临时调试时也不允许 short-circuit。

### 3. 精准修改

- 不动 `ORCHFLOW_PRD.md`（除非用户明确要求修订）
- IPC 事件名必须在 `src/shared/events.ts` 定义，禁止字符串字面量散落
- 新建文件时，路径对齐 PRD §7.1 模块分解表

### 4. 目标驱动执行

将任务转化为可验证目标：

| 模糊请求 | 转化为可验证目标 |
|----------|----------------|
| "加个功能" | "实现 X + 写 N 个测试 + typecheck/test/build 全通过" |
| "修复 bug" | "写一个能复现 bug 的测试 → 修复 → 测试通过" |

---

## 编码约定

- TypeScript strict 模式 + `noUncheckedIndexedAccess`
- IPC 事件名集中在 `src/shared/events.ts`，禁止字面量
- 错误处理：IPC handler 抛 Error，Electron 自动序列化为 `{message}` 回传
- 路径处理：`validateUserPath()` 统一校验，所有用户路径必须经过
- React 函数组件 + hooks，Zustand 状态管理
- 新 Repository 继承 `Repository` 基类（`src/main/db/repositories/base.ts`）

---

## 禁区

- **`ORCHFLOW_PRD.md`** — 已确认的 v1.0 产品设计基线
- **`src/main/db/migrations/`** — SQLite schema 迁移，新增需创建新迁移文件
- **Worktree 目录** — 用户工作数据，不得清理/合并/删除
- **Windows Credential Manager 存储的 API Key** — 不输出、不回显、不写入日志

---

## 配套文件维护规则

| 触发条件 | 需要更新的文件 |
|---------|-------------|
| 新增/删除/重命名关键文件 | `index.md` |
| 新增/移除技术栈组件 | `CLAUDE.md` 技术栈部分 |
| 新增常用命令或命令变化 | `CLAUDE.md` 常用命令部分 |
| 重大架构变更 | `README.md` + `CLAUDE.md` 架构部分 |
| Claude 重复犯同一类错误 | `.claude/lessons.md` |
| 新增禁区或安全约束 | `CLAUDE.md` 禁区部分 |

---

*本文件目标控制在 150 行以内。每次重大架构变更后检查。*
*基于 Phase 0/1/2 全部实现后的代码状态。*
