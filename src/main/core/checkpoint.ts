import { randomUUID } from 'node:crypto'
import { simpleGit } from 'simple-git'
import { existsSync } from 'node:fs'
import type { Checkpoint, CheckpointType } from '@shared/types'
import { CheckpointRepository } from '../db/repositories/checkpoint.repository'
import { AuditRepository } from '../db/repositories/audit.repository'

const repo = new CheckpointRepository()
const audit = new AuditRepository()

export const checkpointManager = {
  async create(sessionId: string, taskId: string, worktreePath: string, type: CheckpointType, description: string): Promise<Checkpoint> {
    let gitCommit: string | undefined
    let gitStash: string | undefined
    if (existsSync(worktreePath)) {
      const git = simpleGit(worktreePath)
      try {
        const status = await git.status()
        if (!status.isClean()) {
          // Stash uncommitted changes so we can restore them on rollback
          const stashResult = await git.stash(['push', '-u', '-m', `orchflow-checkpoint-${Date.now()}`])
          gitStash = stashResult
        }
        const log = await git.log({ maxCount: 1 })
        gitCommit = log.latest?.hash
      } catch (err) {
        console.warn('[checkpoint] git ops failed:', err)
      }
    }

    const cp: Checkpoint = {
      id: randomUUID(),
      sessionId,
      taskId,
      timestamp: Date.now(),
      type,
      gitCommit,
      gitStash,
      description
    }
    repo.create(cp)
    audit.log({
      timestamp: Date.now(),
      sessionId,
      taskId,
      actor: 'orchflow',
      actionType: 'checkpoint_created',
      actionDetailJson: JSON.stringify({ id: cp.id, type, description }),
      approvalStatus: 'auto'
    })
    return cp
  },

  async rollback(checkpointId: string): Promise<void> {
    const cp = repo.get(checkpointId)
    if (!cp) throw new Error(`Checkpoint not found: ${checkpointId}`)
    // Look up task's worktree from tasks repo
    const { TaskRepository } = await import('../db/repositories/task.repository')
    const tasks = new TaskRepository()
    const task = tasks.get(cp.taskId)
    if (!task?.worktreePath) throw new Error('Cannot rollback: task has no worktree path')
    if (!existsSync(task.worktreePath)) throw new Error(`Worktree missing: ${task.worktreePath}`)

    const git = simpleGit(task.worktreePath)
    if (cp.gitCommit) {
      await git.reset(['--hard', cp.gitCommit])
    }
    if (cp.gitStash) {
      try {
        await git.stash(['pop'])
      } catch (err) {
        console.warn('[checkpoint] stash pop failed:', err)
      }
    }
    audit.log({
      timestamp: Date.now(),
      taskId: cp.taskId,
      actor: 'user',
      actionType: 'checkpoint_rollback',
      actionDetailJson: JSON.stringify({ checkpointId }),
      approvalStatus: 'auto'
    })
  },

  list(sessionId: string): Checkpoint[] {
    return repo.list(sessionId)
  }
}
