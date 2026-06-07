# AGENTS.md — 跨工具编码规范

> 适用于多 AI 工具协作的项目（Claude / Cursor / Codex）。
> 与 `CLAUDE.md` 不同：CLAUDE.md 是 Claude Code 专属行为约束，本文件是所有 AI 工具共享的代码风格基线。

## 语言与注释

- **代码语言**：TypeScript（strict 模式由 tsconfig 强制）
- **注释语言**：中文（项目面向中文用户；术语保留英文）
- **行内注释**：只在解释"为什么"时不明显时写；不写废话注释

## 文件组织

- 单文件不超过 400 行（超出时考虑拆分子模块）
- 一个类/Manager 一个文件
- Repositories 单表一文件

## 命名

- 类/类型：`PascalCase`
- 函数/变量：`camelCase`
- 常量：`SCREAMING_SNAKE_CASE`（仅在 `constants.ts` 或模块顶部）
- 文件：`kebab-case.ts`（除非是 React 组件用 `PascalCase.tsx`）

## IPC 通信

- 所有跨进程调用通过 `window.orchflow.*` (Renderer) → `ipcMain.handle` (Main)
- 事件名集中在 `src/shared/events.ts` 常量化
- 接收方在 preload `on()` API 中按白名单过滤

## 错误处理

- Main 进程错误：`throw new Error(\`context: ${msg}\`)`，IPC 序列化给 Renderer
- Renderer 错误：`try/catch` + `console.error` + UI toast（Phase 0 简化为 console）

## 状态管理

- Renderer 全局状态用 Zustand（不用 Redux/MobX）
- Local 状态用 React `useState`/`useRef`
- Server-state（DB 派生）通过 IPC 调用拉取，不在 Renderer 缓存超过会话级

## 不要做的事

- ❌ 不要把 API Key 写到配置文件或日志
- ❌ 不要绕过 Approval Gate（即使调试时）
- ❌ 不要直接编辑 `out/` 目录（构建产物）
- ❌ 不要在 commit 中包含 `node_modules/`、`out/`、`release-app/`
- ❌ 不要"提前实现"Phase 1+ 的功能（详见 PRD §9）

## 提交前自检

- [ ] `npm run typecheck` 通过
- [ ] `npm run build` 通过
- [ ] 提交信息用 `feat/fix/chore/refactor:` 前缀
- [ ] 涉及架构变更时同步更新 `index.md` / `readme.md` / `CLAUDE.md`
