import { randomUUID } from 'node:crypto'
import type { AgentMessage, AgentMessageType, MessageConfig } from '@shared/types'
import { AgentMessageRepository } from '../db/repositories/agent-message.repository'
import { TaskDependencyRepository } from '../db/repositories/dependency.repository'
import { TaskRepository } from '../db/repositories/task.repository'
import { SessionRepository } from '../db/repositories/session.repository'
import { broadcast } from './broadcast'

const msgRepo = new AgentMessageRepository()
const depRepo = new TaskDependencyRepository()
const taskRepo = new TaskRepository()
const sessionRepo = new SessionRepository()

/** Sanitize content for prompt injection prevention (C-03 fix).
 *  Truncates long content and strips common prompt injection patterns. */
function sanitizeForPrompt(content: string): string {
  const MAX_MESSAGE_CONTENT_CHARS = 4000
  const truncated = content.length > MAX_MESSAGE_CONTENT_CHARS
    ? content.slice(0, MAX_MESSAGE_CONTENT_CHARS) + '\n[... truncated ...]'
    : content

  // Strip common prompt injection patterns
  return truncated
    .replace(/^(system|assistant|human|user):\s*/gim, '[FILTERED]: ')
    .replace(/<\|im_start\|>|<\|im_end\|>/g, '[FILTERED]')
}

/** PRD §11.4: Simple file + event message passing between agents.
 *  Sender Agent completes task → MessageBus generates message → stores in DB
 *  Receiver Session startup → MessageBus injects upstream messages as prompt prefix */
export const messageBus = {
  /** Publish a message from one session to a downstream task.
   *  Typically called when a task completes and needs to pass results to dependents. */
  async publish(
    fromSessionId: string,
    toTaskId: string,
    messageType: AgentMessageType,
    content: string
  ): Promise<AgentMessage> {
    const msg: AgentMessage = {
      id: randomUUID(),
      fromSessionId,
      taskId: toTaskId,
      timestamp: Date.now(),
      messageType,
      content,
      delivered: false
    }
    msgRepo.create(msg)
    broadcast('message-bus:published', msg)
    return msg
  },

  /** Consume all pending (undelivered) messages for a task.
   *  Called when a new session starts for a task to collect upstream results. */
  consume(taskId: string): AgentMessage[] {
    const pending = msgRepo.getPendingForTask(taskId)
    for (const msg of pending) {
      msgRepo.markDelivered(msg.id)
    }
    return pending
  },

  /** Build a prompt prefix from upstream messages to inject into a new agent's prompt.
   *  This is how PRD §11.4 implements "message passing" — by prepending context
   *  from completed upstream tasks into the downstream agent's initial prompt. */
  buildPromptPrefix(taskId: string): string {
    const messages = this.consume(taskId)
    if (messages.length === 0) return ''

    const sections: string[] = ['## Upstream Task Results\n']
    for (const msg of messages) {
      const fromTask = msg.fromSessionId
        ? sessionRepo.get(msg.fromSessionId)
        : null
      const header = fromTask
        ? `### From: ${fromTask.agentType} session (${msg.fromSessionId?.slice(0, 8)})`
        : `### From: upstream task`

      let body = ''
      switch (msg.messageType) {
        case 'text':
          body = sanitizeForPrompt(msg.content)
          break
        case 'diff':
          body = `\`\`\`diff\n${sanitizeForPrompt(msg.content)}\n\`\`\``
          break
        case 'status':
          try {
            const status = JSON.parse(msg.content) as Record<string, unknown>
            body = `Status: ${status.success ? '✅ Success' : '❌ Failed'}\nFiles: ${(status.files as string[] | undefined)?.join(', ') ?? 'N/A'}`
          } catch {
            body = sanitizeForPrompt(msg.content)
          }
          break
        case 'structured':
          body = `\`\`\`json\n${sanitizeForPrompt(msg.content)}\n\`\`\``
          break
        case 'file_path':
          body = `Output file: ${sanitizeForPrompt(msg.content)}`
          break
        case 'mixed':
          body = sanitizeForPrompt(msg.content)
          break
      }
      sections.push(`${header}\n${body}\n`)
    }
    sections.push('---\n## Your Task\n')
    return sections.join('\n')
  },

  /** When a task completes, automatically publish messages to all dependent tasks.
   *  Called by PipelineEngine or TaskManager on task completion. */
  async publishToDependents(completedTaskId: string, sessionId: string): Promise<void> {
    const dependents = depRepo.listDependents(completedTaskId)
    if (dependents.length === 0) return

    const completedTask = taskRepo.get(completedTaskId)
    if (!completedTask) return

    for (const dep of dependents) {
      // Parse the message config for this dependency
      let config: MessageConfig | null = null
      if (dep.messageConfigJson) {
        try {
          config = JSON.parse(dep.messageConfigJson) as MessageConfig
        } catch {
          // ignore parse errors
        }
      }

      // Default: send text summary + diff
      const contentTypes = config?.contentTypes ?? ['text', 'diff']

      for (const contentType of contentTypes) {
        let content = ''
        switch (contentType) {
          case 'text':
            content = `Task "${completedTask.title}" completed with status: ${completedTask.status}`
            break
          case 'diff':
            // Would need to compute diff from worktree — simplified for now
            content = `Worktree: ${completedTask.worktreePath ?? 'N/A'}\nBranch: ${completedTask.branchName ?? 'N/A'}`
            break
          case 'status':
            content = JSON.stringify({
              success: completedTask.status === 'done',
              taskTitle: completedTask.title,
              worktreePath: completedTask.worktreePath,
              branchName: completedTask.branchName
            })
            break
          case 'file_path':
            content = completedTask.worktreePath ?? ''
            break
          default:
            content = `Task "${completedTask.title}" completed`
        }

        if (content) {
          await this.publish(sessionId, dep.taskId, contentType, content)
        }
      }
    }
  },

  list(taskId?: string, delivered?: boolean): AgentMessage[] {
    return msgRepo.list(taskId, delivered)
  },

  markDelivered(messageId: string): void {
    msgRepo.markDelivered(messageId)
  }
}
