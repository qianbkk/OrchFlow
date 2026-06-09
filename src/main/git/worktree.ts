import { simpleGit, type SimpleGit } from 'simple-git'
import { existsSync, mkdirSync, rmSync } from 'node:fs'
import { join, dirname, basename, resolve } from 'node:path'
import type { DiffResult, DiffFile, Task } from '@shared/types'

/** Derive the worktree base directory for a project (sibling to project root). */
export function toWorktreeBasePath(projectRoot: string): string {
  // Sibling to the project: ../[project-name]-orch-worktrees
  const parent = dirname(projectRoot)
  const projectName = basename(projectRoot)
  return join(parent, `${projectName}-orch-worktrees`)
}

export async function ensureWorktree(
  projectRoot: string,
  taskId: string,
  taskTitle: string
): Promise<{ worktreePath: string; branchName: string }> {
  // Validate it's a git repo
  if (!existsSync(join(projectRoot, '.git'))) {
    throw new Error(`Not a git repository: ${projectRoot}`)
  }
  const base = toWorktreeBasePath(projectRoot)
  if (!existsSync(base)) {
    mkdirSync(base, { recursive: true })
  }
  const safeTitle = taskTitle.replace(/[^a-zA-Z0-9_-]+/g, '-').toLowerCase().slice(0, 30) || 'task'
  // PRD §3.8: `orch/[task-name]-[timestamp]`. Append taskId slice for
  // additional collision safety across same-second creates.
  const ts = new Date().toISOString().replace(/[-:T.]/g, '').slice(0, 14) // YYYYMMDDHHMMSS
  const branchName = `orch/${safeTitle}-${ts}-${taskId.slice(0, 6)}`
  const worktreePath = join(base, `${safeTitle}-${ts}-${taskId.slice(0, 6)}`)

  const git: SimpleGit = simpleGit(projectRoot)
  try {
    await git.raw(['worktree', 'add', worktreePath, '-b', branchName])
  } catch (err) {
    // If worktree already exists (retry scenario), just use it
    if (!existsSync(worktreePath)) throw err
  }
  return { worktreePath, branchName }
}

export async function removeWorktree(task: Task): Promise<void> {
  if (!task.worktreePath) return
  const git = simpleGit(task.worktreePath)
  try {
    await git.raw(['worktree', 'remove', '--force', task.worktreePath])
  } catch (err) {
    // Fallback: manual cleanup
    try {
      rmSync(task.worktreePath, { recursive: true, force: true })
      await git.raw(['worktree', 'prune'])
    } catch (err2) {
      console.error('[worktree] remove failed:', err2)
      void err
    }
  }
}

export async function discardWorktree(task: Task): Promise<void> {
  await removeWorktree(task)
}

export async function mergeWorktree(task: Task): Promise<void> {
  if (!task.worktreePath || !task.branchName) {
    throw new Error('Task has no worktree to merge')
  }

  // Use git rev-parse --git-common-dir to reliably find the main worktree,
  // rather than parsing `git worktree list` output (which had a boolean logic bug).
  const git = simpleGit(task.worktreePath)
  const commonDir = (await git.raw(['rev-parse', '--git-common-dir'])).trim()
  // commonDir is the .git directory of the main repo; its parent is the main worktree
  const mainPath = resolve(commonDir, '..')

  if (!mainPath || !existsSync(mainPath)) {
    throw new Error('Cannot determine main worktree path')
  }

  const mainGit = simpleGit(mainPath)

  try {
    await mainGit.raw(['merge', '--no-ff', task.branchName])
  } catch (mergeErr) {
    // On merge failure (conflicts), automatically abort to leave the repo clean
    try {
      await mainGit.raw(['merge', '--abort'])
    } catch (abortErr) {
      console.error('[worktree] merge --abort failed:', abortErr)
    }
    throw new Error(
      `Merge failed (conflict detected, merge aborted): ${
        mergeErr instanceof Error ? mergeErr.message : String(mergeErr)
      }`
    )
  }
}

export async function getWorktreeDiff(worktreePath: string): Promise<DiffResult> {
  const git = simpleGit(worktreePath)
  const summary = { added: 0, removed: 0, modified: 0 }
  const files: DiffFile[] = []
  try {
    const status = await git.status()
    for (const f of status.files) {
      const statusType: DiffFile['status'] =
        f.working_dir === '?' ? 'added' :
        f.working_dir === 'D' || f.index === 'D' ? 'deleted' :
        f.working_dir === 'R' ? 'renamed' : 'modified'
      const diff = await git.diff(['--', f.path]).catch(() => '')
      const stat = await git.raw(['diff', '--numstat', '--', f.path]).catch(() => '')
      const parts = stat.trim().split('\t')
      const additions = parseInt(parts[0] ?? '0', 10) || 0
      const deletions = parseInt(parts[1] ?? '0', 10) || 0
      if (statusType === 'added') summary.added++
      else if (statusType === 'deleted') summary.removed++
      else if (statusType === 'modified' || statusType === 'renamed') summary.modified++
      files.push({ path: f.path, status: statusType, additions, deletions, diff })
    }
  } catch (err) {
    console.error('[worktree] diff failed:', err)
  }
  return { worktreePath, files, summary }
}
