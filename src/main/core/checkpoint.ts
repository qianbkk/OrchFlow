import { randomUUID } from 'node:crypto'
import { simpleGit } from 'simple-git'
import { existsSync } from 'node:fs'
import type { Checkpoint, CheckpointType, DiffResult, DiffFile } from '@shared/types'
import { CheckpointRepository } from '../db/repositories/checkpoint.repository'
import { TaskRepository } from '../db/repositories/task.repository'
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
          await git.raw(['stash', 'push', '-u', '-m', `orchflow-checkpoint-${Date.now()}`])
          // Capture the actual stash ref (stash@{0}) rather than the
          // "Saved working directory..." message. Without this, rollback()
          // would pop whatever stash is on top of the stack — potentially
          // the user's own manual stash, causing data corruption.
          const stashList = await git.raw(['stash', 'list', '--format=%gd', '--max-count=1'])
          const trimmed = stashList.trim()
          if (trimmed && /^stash@\{[0-9]+\}$/.test(trimmed)) {
            gitStash = trimmed
          }
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
    const task = new TaskRepository().get(cp.taskId)
    if (!task?.worktreePath) throw new Error('Cannot rollback: task has no worktree path')
    if (!existsSync(task.worktreePath)) throw new Error(`Worktree missing: ${task.worktreePath}`)

    const git = simpleGit(task.worktreePath)
    if (cp.gitCommit) {
      await git.reset(['--hard', cp.gitCommit])
    }
    if (cp.gitStash) {
      try {
        // Use the exact stash ref captured at create time (e.g. "stash@{0}")
        // rather than a bare `git stash pop` which always pops the stack top
        // — potentially the wrong stash.
        await git.raw(['stash', 'pop', cp.gitStash])
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
  },

  /** Compute the diff between a checkpoint commit and the current HEAD of
   *  the task's worktree. This is the "what would be undone if I rolled
   *  back to this checkpoint" preview shown in the CheckpointTimeline UI
   *  before the user confirms a rollback (PRD §3.4.3). */
  async getRollbackDiff(checkpointId: string): Promise<DiffResult> {
    const cp = repo.get(checkpointId)
    if (!cp) throw new Error(`Checkpoint not found: ${checkpointId}`)
    if (!cp.gitCommit) throw new Error('Checkpoint has no git commit to diff against')
    const task = new TaskRepository().get(cp.taskId)
    if (!task?.worktreePath) throw new Error('Task has no worktree')
    if (!existsSync(task.worktreePath)) throw new Error(`Worktree missing: ${task.worktreePath}`)

    const git = simpleGit(task.worktreePath)
    const summary = { added: 0, removed: 0, modified: 0 }
    const files: DiffFile[] = []
    try {
      // `git diff <cpCommit>..HEAD` shows what would be undone by rollback
      const stat = await git.raw(['diff', '--numstat', `${cp.gitCommit}..HEAD`]).catch(() => '')
      const fullDiff = await git.raw(['diff', `${cp.gitCommit}..HEAD`]).catch(() => '')

      // Split-based parsing handles both quoted paths (spaces, Unicode) and
      // the last file (which has no subsequent `diff --git` sentinel). The
      // previous regex approach with the `m` flag truncated the last file.
      const sectionMap = new Map<string, string>()
      const sections = fullDiff.split(/(?=^diff --git )/m)
      for (const section of sections) {
        if (!section.startsWith('diff --git')) continue
        // Match header: `diff --git "a/path" "b/path"` OR `diff --git a/path b/path`
        const headerMatch = section.match(/^diff --git "?a\/(.+?)"? "?b\/(.+?)"?\s*$/m)
        if (headerMatch) sectionMap.set(headerMatch[1], section)
      }

      const fileStats = stat
        .split('\n')
        .filter((l) => l.trim())
        .map((l) => {
          const [add, del, path] = l.split('\t')
          return { path, additions: parseInt(add ?? '0', 10) || 0, deletions: parseInt(del ?? '0', 10) || 0 }
        })
      for (const fs of fileStats) {
        const fileDiff = sectionMap.get(fs.path) ?? ''
        files.push({
          path: fs.path,
          status: fs.additions > 0 && fs.deletions === 0 ? 'added' : fs.deletions > 0 && fs.additions === 0 ? 'deleted' : 'modified',
          additions: fs.additions,
          deletions: fs.deletions,
          diff: fileDiff
        })
        if (fs.additions > 0 && fs.deletions === 0) summary.added++
        else if (fs.deletions > 0 && fs.additions === 0) summary.removed++
        else summary.modified++
      }
    } catch (err) {
      console.error('[checkpoint] rollback diff failed:', err)
    }
    return { worktreePath: task.worktreePath, files, summary }
  }
}
