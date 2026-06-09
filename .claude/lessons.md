# Claude Lessons

This file records lessons learned from code reviews, audits, and development sessions.

## Known Gotchas

### Electron
- **Preload path**: `__dirname` in main process points to `out/main`, so preload is at `../../preload/index.js` (two levels up), not `../preload`
- **CSP in dev mode**: Content Security Policy meta tags in HTML block Vite HMR inline scripts. Use `session.webRequest.onHeadersReceived` in main process for production-only CSP
- **`openDevTools({ mode: 'detach' })`**: Use this for debugging — opens DevTools in separate window

### Windows
- **Path separators**: Always use `path.sep` for directory boundary checks, not hardcoded `/`
- **`.cmd` files**: `execFile` with `shell: false` cannot spawn `.cmd` batch files on Windows. Use `exec()` instead (which always uses shell)
- **PowerShell injection**: `-Command` parses special chars. Use `-EncodedCommand` with Base64-encoded UTF-16LE script to avoid injection

### Database
- **`DatabaseSync` is synchronous**: All operations (constructor, `exec`, migrations) are synchronous, so no re-entrancy guard needed in single-threaded Node.js
- **`better-sqlite3` ghost dep**: Project uses `node:sqlite` (Node 22 built-in), not `better-sqlite3`. Don't add it to external list

### Security
- **`validateUserPath` approved paths**: Renderer can only access paths under registered project roots (via `registerApprovedPath`), not arbitrary home directory paths
- **Approval gate is audit-only**: Current implementation doesn't actually block PTY process — true blocking requires MCP Permission Server (Phase 3)
- **Timer `unref()`**: Always call `.unref()` on approval timeout timers to prevent blocking process exit

### Git
- **`mergeWorktree`**: Use `git rev-parse --git-common-dir` to find main worktree, not parsing `git worktree list` output
- **Merge conflicts**: Always `git merge --abort` on failure to leave repo clean

## Best Practices

- **Prefer `exec()` over `execFile` with `shell: true`**: Avoids DEP0190 deprecation warning
- **Broadcast PTY data to all windows**: Don't hardcode `wins[0]` — iterate all `BrowserWindow.getAllWindows()`
- **Clean up session subscriptions**: On natural session end (done/error), call cleanup to prevent memory leaks
- **Sanitize prompt injection**: Message bus content should be truncated and filtered before injecting into downstream prompts
