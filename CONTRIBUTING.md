# Contributing to OrchFlow

Thank you for your interest in contributing! OrchFlow is a Windows desktop application for orchestrating AI coding agents. This guide will help you get started.

## Development Setup

### Prerequisites

- **Windows 10/11** (64-bit) — the only supported platform
- **Node.js 22+** (we use `node:sqlite` built-in module)
- **Git for Windows**
- **At least one AI CLI installed**: `@anthropic-ai/claude-code`, `@openai/codex`, or GitHub CLI with Copilot extension

### Getting Started

```bash
# Clone and install
git clone https://github.com/qianbkk/OrchFlow.git
cd OrchFlow
npm install

# Development mode (Vite + Electron, auto-opens window)
npm run dev

# Type checking (main + renderer)
npm run typecheck

# Run tests
npm run test

# Production build
npm run build

# Package as Windows installer
npm run build:win
```

### Project Architecture

```
src/
├── main/          # Electron Main process — business logic, Agent drivers, DB, Git
├── renderer/      # React renderer — 5 views (Sessions/Tasks/Pipeline/Audit/Settings)
├── preload/       # contextBridge API (window.orchflow)
└── shared/        # Types, events, constants shared between main + renderer
```

Key patterns:
- **IPC**: All Main↔Renderer communication goes through `ipcMain.handle` / `ipcRenderer.invoke`
- **Types**: Shared types in `src/shared/types.ts` — any change must compile on both sides
- **Events**: IPC event names centralized in `src/shared/events.ts` — no string literals
- **Drivers**: New CLI = implement `IAgentDriver` interface + register in `driver.registry.ts`
- **State**: Zustand stores in renderer, plain modules in main process

## Pull Request Guidelines

1. **TypeScript strict mode** is enforced — `npm run typecheck` must pass
2. **All tests must pass** — `npm run test` (currently 38 tests)
3. **No `as never` type casts** in IPC handlers — use proper types or runtime validation
4. **IPC event names** must be defined in `src/shared/events.ts`, never inline strings
5. **API keys** must never appear in logs, settings.json, or IPC payloads — use keytar
6. **Path validation**: any user-supplied path must go through `validateUserPath()` in ipc.ts

### Commit Messages

Use conventional commit format:
```
feat(scope): description
fix(scope): description
refactor(scope): description
test(scope): description
docs(scope): description
```

## Code Style

- TypeScript strict mode (no implicit any, noUncheckedIndexedAccess)
- Functional React components with hooks
- Zustand for renderer state management
- Async/await over callbacks
- Explicit error handling (no swallowed errors)

## Reporting Issues

See [bug report template](.github/ISSUE_TEMPLATE/bug_report.md) and [feature request template](.github/ISSUE_TEMPLATE/feature_request.md).

For security vulnerabilities, please see [SECURITY.md](SECURITY.md).

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
