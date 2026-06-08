# Security Policy

## Supported Versions

| Version | Supported |
|---------|-----------|
| 0.1.x   | ✅ Yes    |

## Reporting a Vulnerability

**Do NOT open a public GitHub issue for security vulnerabilities.**

If you discover a security vulnerability in OrchFlow, please report it responsibly:

1. **Email**: Send details to the repository owner via GitHub profile contact
2. **GitHub Private Vulnerability Reporting**: Use the "Report a vulnerability" button on the repository's Security tab (if enabled)

### What to Include

- Description of the vulnerability
- Steps to reproduce (if applicable)
- Potential impact assessment
- Suggested fix (if you have one)

### Response Timeline

- **Acknowledgment**: Within 48 hours of receipt
- **Initial assessment**: Within 7 days
- **Resolution**: We aim to address critical vulnerabilities within 30 days

### Scope

Security concerns specific to OrchFlow include:

- **IPC boundary**: Renderer process should not be able to access filesystem, spawn processes, or read credentials beyond the whitelisted API
- **Credential storage**: API keys must remain in Windows Credential Manager (keytar), never in plaintext files or IPC payloads
- **Path traversal**: User-supplied paths must be validated against the home directory boundary
- **PTY data leakage**: Interactive terminal data should not be broadcast to unintended windows
- **Approval Gate bypass**: High-risk operations must not bypass the approval workflow

### Out of Scope

- Vulnerabilities in upstream dependencies (report to the respective project)
- Issues in the AI CLI tools themselves (Claude Code, Codex, Copilot)
- Social engineering attacks
- Denial of service against the local application

## Security Architecture

OrchFlow implements defense-in-depth:

| Layer | Mechanism |
|-------|-----------|
| Renderer sandbox | `sandbox: true` + `contextIsolation: true` + `nodeIntegration: false` |
| IPC whitelist | `RECEIVE_EVENTS` array restricts subscribable channels |
| Credential isolation | keytar → Windows Credential Manager, never plaintext |
| Path validation | `validateUserPath()` enforces home directory boundary |
| Process isolation | Each task runs in its own git worktree |
| Audit trail | All security-relevant events logged to SQLite |

### Known Limitations (Phase 0)

- **Approval Gate is audit-only**: The current implementation logs approval requests but does not physically block the Agent CLI process from executing operations. This is a known architectural limitation that will be addressed in a future phase with proper PTY-level interception.
- **Single window**: Broadcast protection assumes single-window; multi-window will need targeted send.
