# CLAUDE.md

> **定位**：AI 行为总约束文件，每次会话启动时自动加载。
> 记录边界、原则与项目核心上下文；不包含可从代码直接推断的内容。
>
> **当前阶段**：Phase 0 MVP 起步 — 仅有 PRD，未生成代码骨架。Claude Code 介入时优先围绕 PRD 落地与 Phase 0 实施辅助。

---

## 配套文件职责

| 文件 | 定位 | 主要读者 |
|------|------|---------|
| `CLAUDE.md` | AI 行为约束 + 项目核心上下文 | Claude Code（每次会话自动加载） |
| `index.md` | 关键文件速查表（10-20 个核心文件及一句话描述） | Claude Code（快速定位） |
| `readme.md` | 项目架构、功能介绍、使用指南 | 人类开发者 |
| `AGENTS.md` | 跨工具通用编码规范（适用于多 AI 工具并行的项目） | Claude / Cursor / Codex 等 |
| `.claude/lessons.md` | 错误经验积累，按症状/规则/触发条件记录 | Claude Code（会话启动时加载） |
| `ORCHFLOW_PRD.md` | 产品需求文档 & 构建指南（v1.0，2026-06-07） | 人类 + AI 共同参考 |

> **现状提示**：`index.md` / `readme.md` / `AGENTS.md` / `.claude/lessons.md` 尚未创建。Phase 0 骨架落地后按"配套文件维护规则"逐项补齐。

---

## 会话启动检查

**每次会话开始时，按顺序执行：**

1. 确认项目技术栈和常用命令（见下方）
2. 阅读 `.claude/lessons.md` — 了解已知陷阱和历史纠错经验（**当前不存在，会话中如发现可复现错误应主动创建**）
3. 涉及跨工具规范时，按需阅读 `AGENTS.md`（**当前不存在**）
4. 涉及功能决策时，回看 `ORCHFLOW_PRD.md` 对应章节，避免与已确认的产品设计冲突

---

## 项目概述

OrchFlow 是一个运行在 Windows 本地的 AI 编码 Agent 编排桌面应用，统一面板管理 Claude Code CLI、Codex CLI、GitHub Copilot CLI 的并行协作。核心价值：worktree 隔离避免多 Agent 冲突、审批门控保护高风险操作、Checkpoint 支持回滚、Message Bus 支持 Agent 间协同。MVP（Phase 0）仅做单项目 + Claude Code CLI 接入；多 CLI、协作模式、Kanban/DAG 视图依次在 Phase 1/2 引入。

---

## 技术栈

- **桌面框架**：Electron 36+
- **前端**：React 19 + TypeScript（严格模式，PRD 未指定版本，建议 5.4+）
- **样式**：Tailwind CSS v4
- **状态管理**：Zustand
- **终端**：xterm.js + node-pty（Windows 走 ConPTY，需 Build Tools 编译）
- **数据库**：better-sqlite3（WAL 模式）
- **进程通信**：Electron IPC（contextBridge）
- **Git 操作**：simple-git
- **凭据存储**：keytar（Windows Credential Manager）
- **构建工具**：Vite + electron-builder
- **AI SDK**：`@anthropic-ai/claude-code`（包名待官方发布确认）
- **目标平台**：Windows 10/11 64-bit（仅此一项，非跨平台）

> 版本兼容性 Claude 无法从代码猜测，依赖更新前必须先检查本节并同步到 index.md。

---

## 常用命令

```powershell
# Phase 0 初始化（按 PRD §10.1 执行）
npm init -y
npm install --save-dev electron@latest electron-builder typescript ts-node @types/node vite @vitejs/plugin-react
npm install electron-store keytar better-sqlite3 node-pty @xterm/xterm @xterm/addon-fit @xterm/addon-web-links simple-git zustand react react-dom tailwindcss
npm install @anthropic-ai/claude-code   # 包名待确认

# 日常开发
npm run dev         # concurrently 启动 Vite + Electron（端口 5173）

# 构建
npm run build       # vite build && tsc -p tsconfig.main.json && electron-builder
npm run build:win   # electron-builder --win

# 原生模块重建（node-pty 升级或 Electron 升级后必须执行）
npx electron-rebuild -f -w node-pty
```

> `postinstall` 钩子建议设为 `electron-rebuild`，避免每次重装漏掉原生模块重编译。

---

## 架构与目录结构

```
src/
├── main/          # Electron Main 进程 — 业务逻辑、Agent Driver、DB、Git
├── renderer/      # React 渲染进程 — 4 视图（Sessions/Tasks/Pipeline/Audit）
└── shared/        # 双进程共享 types / events / constants
```

**请求链路**：Renderer 组件 → `window.orchflow.*` (contextBridge) → IPC Handler → Main 进程内的 Manager（Session/Task/Approval/Checkpoint）→ Agent Driver / Git / SQLite

**关键设计约束**（PRD §5.2 / §5.3）：
- 所有 CLI 适配器必须实现统一 `AgentDriver` 接口（`start/stop/pause/resume/send/streamOutput/attachPty/onToolCall`），新增 CLI = 新增 Driver + 注册到 `driver.registry.ts`
- Headless 与 Interactive 模式**共享同一个 pty**，模式切换不重启 Agent 进程
- Approval Gate 必须在代码层强制（不依赖用户配置），受保护操作无法绕过
- 每个 Task 自动创建独立 worktree，路径以 `task-id` 为目录名（避免中文/空格）
- 凭据通过 keytar 写入 Windows Credential Manager，**禁止明文落盘**

---

## 核心行为准则

### 1. 三思而后行

**不要假设。不要隐藏困惑。主动暴露权衡。**

PRD 范围很大（多 Phase、多种协作模式），开始实现前：
- 明确当前是 Phase 0 / 1 / 2 哪一阶段
- 明确本任务在 PRD §10.2 周计划中的位置
- 不在 PRD 范围内的新功能，先提议后实施

### 2. 简洁优先

Phase 0 MVP 故意砍掉了 Kanban、Pipeline DAG、批量审批、协作模式、全自动路由等。**不要"提前实现"PRD 明确推迟的功能**，例如：Phase 0 用任务列表替代 Kanban，Claude 不要主动加看板。

### 3. 精准修改

- 不动 `ORCHFLOW_PRD.md`（除非用户明确要求修订）
- 不优化 Phase 0 范围之外的代码
- 新建文件时，路径严格对齐 PRD §7.1 模块分解表

### 4. 目标驱动执行

将任务转化为可验证目标：

| 模糊请求 | 转化为可验证目标 |
|----------|----------------|
| "加个 Agent Driver" | "实现 `AgentDriver` 接口 + 单元测试覆盖 start/stop/streamOutput，再接入 DriverRegistry" |
| "做审批" | "先写触发审批的工具调用测试 + 用户拒绝时 Agent 收到中断信号的测试" |

---

## 编码约定

[待填充 — Phase 0 骨架落地后补]
- TypeScript strict 模式必开（与 Electron contextBridge 配合）
- IPC 事件名集中在 `src/shared/events.ts` 常量化，禁止字符串字面量散落
- 错误处理：Main 进程统一 `AppError` 类 + IPC 回传结构化 `{code, message, detail}`
- 路径处理：使用 `path.posix` / `path.win32` 显式选择，不依赖默认行为

> 默认会被 ESLint / Prettier / tsc 强制的不写在此处。

---

## 禁区

<!-- 未经明确许可不得修改的文件或目录，说明原因 -->
- **`ORCHFLOW_PRD.md`** — 已确认的 v1.0 产品设计基线；修改需用户明确授权，并同步更新本文件
- **`migrations/`**（未来创建）— 自动生成的 SQLite schema 迁移，禁止手编
- **Worktree 目录内容**（`../[project]-orch-*`）— 属于用户工作数据，Claude 不得清理、合并、删除（即使 Agent 提示"任务完成"）
- **`~/.orchflow/`** 用户配置目录 — 不读取其他项目的 project config
- **Windows Credential Manager 存储的 API Key** — Claude 不输出、不回显、不写入日志

---

## 配套文件维护规则

| 触发条件 | 需要更新的文件 |
|---------|-------------|
| 新增/删除/重命名**关键目录**（如 src/main/agents/） | `index.md` |
| 新增/移除**技术栈组件**（新 SDK、新数据库） | `CLAUDE.md` 技术栈部分 |
| 新增**常用命令**或命令变化 | `CLAUDE.md` 常用命令部分 |
| **重大架构变更**（拆分模块、改 IPC 协议） | `readme.md` + `CLAUDE.md` 架构部分 |
| Claude **重复犯同一类错误**，经纠正后 | `.claude/lessons.md` |
| 新增**禁区或安全约束** | `CLAUDE.md` 禁区部分 |
| PRD 版本号变化 / 章节重写 | `CLAUDE.md` 引用版本号同步 |

---

## 沟通风格

- 语言：中文，技术术语保留英文原文（Driver / Worktree / Checkpoint / Pipeline 等）
- 语气：简洁直接，工具调用前不加铺垫
- 复杂变更：先引用 PRD 章节（如"按 §10.2 Week 2"）再动手
- 信息不足时：允许说"我不确定"，明确指出需要哪些信息后再继续

---

## 原则（无明确规则适用时的默认决策依据）

1. **好代码解决今天的问题**，不是提前解决明天可能不存在的问题。（呼应 Phase 0 范围严格控制）
2. **验证优先于交付**：在证明它能工作之前，不标记任务完成。
3. **透明优先于顺从**：发现与 PRD 冲突的设计冲动时，即使用户没问，也要指出"这不在 Phase 0 范围"。
4. **安全门控不可绕过**：Approval Gate、Worktree 隔离、API Key 加密是产品核心卖点，临时调试时也不允许 short-circuit。

---

## .claude/lessons.md 参考结构

> 此文件由 Claude 在纠错后自动追加，作为跨会话的错误记忆库。当前为空文件，首次出错后创建。

```markdown
## [模块名称 / 问题域]
- 症状：[Claude 曾犯的错误描述]
- 规则：[应遵循的正确做法]
- 触发：[涉及哪些文件路径或操作时需注意]
```

---

*本文件目标控制在 250 行以内。每季度或重大架构变更后检查是否仍反映项目现状。*
*当前基于 `ORCHFLOW_PRD.md` v1.0（2026-06-07）生成。*
