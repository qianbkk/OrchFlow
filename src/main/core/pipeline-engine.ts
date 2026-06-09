import type { PipelineGraph, PipelineNode, PipelineEdge, PipelineStatus, Task } from '@shared/types'
import { TaskRepository } from '../db/repositories/task.repository'
import { TaskDependencyRepository } from '../db/repositories/dependency.repository'
import { messageBus } from './message-bus'
import { sessionManager } from './session-manager'
import { broadcast } from './broadcast'

const taskRepo = new TaskRepository()
const depRepo = new TaskDependencyRepository()

/** Per-project pipeline state */
const pipelineStates = new Map<string, { status: PipelineStatus; running: boolean }>()

/** Maximum concurrent PTY sessions per project to prevent resource exhaustion. */
const MAX_CONCURRENT_TASKS = 3
const runningTaskCount = new Map<string, number>()

/** Actually start a task: build prompt with upstream messages and launch session.
 *  Respects MAX_CONCURRENT_TASKS — tasks exceeding the limit stay 'queued'
 *  and are picked up when a running task completes. */
async function startTask(task: Task): Promise<void> {
  if (!task.agentType) {
    console.warn(`[pipeline] task ${task.id} has no agent assigned, skipping`)
    return
  }
  if (!task.worktreePath) {
    console.warn(`[pipeline] task ${task.id} has no worktree, skipping`)
    return
  }

  // Concurrency guard: keep at most MAX_CONCURRENT_TASKS sessions per project
  const running = runningTaskCount.get(task.projectId) ?? 0
  if (running >= MAX_CONCURRENT_TASKS) {
    return // Stay in current status, will be picked up by releaseSlotAndStartNext
  }

  runningTaskCount.set(task.projectId, running + 1)
  taskRepo.updateStatus(task.id, 'queued')
  const prefix = messageBus.buildPromptPrefix(task.id)
  const prompt = prefix + (task.description?.trim() || task.title)
  try {
    await sessionManager.start({
      taskId: task.id,
      agentType: task.agentType,
      worktreePath: task.worktreePath,
      prompt
    })
    taskRepo.updateStatus(task.id, 'running')
    broadcast('pipeline:status', { projectId: task.projectId, taskStarted: task.id })
  } catch (err) {
    console.error(`[pipeline] failed to start task ${task.id}:`, err)
    const cur = runningTaskCount.get(task.projectId) ?? 1
    runningTaskCount.set(task.projectId, Math.max(0, cur - 1))
    taskRepo.updateStatus(task.id, 'failed')
  }
}

/** Called when a task finishes — decrements running count and starts queued tasks
 *  that were waiting for a concurrency slot. Uses fire-and-forget since queued
 *  tasks are independent PTY spawns. */
function releaseSlotAndStartNext(projectId: string): void {
  const cur = runningTaskCount.get(projectId) ?? 1
  runningTaskCount.set(projectId, Math.max(0, cur - 1))

  // Fire-and-forget queued tasks — startTask self-guards with concurrency check.
  // Catch errors to prevent unhandled promise rejections (ERR-pipeline-faf).
  const queued = taskRepo.list({ projectId, status: 'queued' })
  for (const qt of queued) {
    void startTask(qt).catch((err) => {
      console.error(`[pipeline] unhandled error starting queued task ${qt.id}:`, err)
    })
  }
}

/** PRD §3.3.1 Mode 3: Sequential Pipeline — tasks execute in dependency order.
 *  When a task completes, its results are passed to downstream tasks via MessageBus,
 *  and if all upstream dependencies are satisfied, the downstream task auto-starts. */
export const pipelineEngine = {
  /** Start executing the pipeline for a project.
   *  Finds all tasks with dependencies, topologically sorts them,
   *  and starts root tasks (those with no dependencies). */
  async start(projectId: string): Promise<void> {
    const existing = pipelineStates.get(projectId)
    if (existing?.running) {
      throw new Error('Pipeline already running for this project')
    }
    pipelineStates.set(projectId, { status: 'running', running: true })
    broadcast('pipeline:started', { projectId })

    const tasks = taskRepo.list({ projectId })
    const allDeps = depRepo.listByProject(projectId)

    // Build adjacency info
    const depMap = new Map<string, string[]>() // taskId -> depends on
    const dependentMap = new Map<string, string[]>() // taskId -> depended on by
    for (const dep of allDeps) {
      const existing2 = depMap.get(dep.taskId) ?? []
      existing2.push(dep.dependsOnTaskId)
      depMap.set(dep.taskId, existing2)
      const depExisting = dependentMap.get(dep.dependsOnTaskId) ?? []
      depExisting.push(dep.taskId)
      dependentMap.set(dep.dependsOnTaskId, depExisting)
    }

    // Find root tasks (no dependencies)
    const rootTasks = tasks.filter((t) => !(depMap.get(t.id)?.length))

    // Start root tasks
    for (const task of rootTasks) {
      if (task.status === 'created' || task.status === 'queued') {
        await startTask(task)
      }
    }

    broadcast('pipeline:status', { projectId, status: 'running' })
  },

  /** Called when a task completes — checks downstream tasks and starts
   *  any whose dependencies are all satisfied. Also releases a concurrency slot
   *  and starts queued tasks that were waiting. */
  async onTaskCompleted(taskId: string, sessionId: string): Promise<void> {
    const task = taskRepo.get(taskId)
    if (!task) return

    // Release concurrency slot and start queued tasks (fire-and-forget)
    releaseSlotAndStartNext(task.projectId)

    // Publish messages to dependent tasks
    await messageBus.publishToDependents(taskId, sessionId)

    // Find tasks that depend on this one
    const dependents = depRepo.listDependents(taskId)

    for (const dep of dependents) {
      const downstreamTask = taskRepo.get(dep.taskId)
      if (!downstreamTask) continue

      // Check if ALL dependencies of the downstream task are satisfied
      const allDeps = depRepo.listByTask(dep.taskId)
      const allSatisfied = allDeps.every((d) => {
        const upstreamTask = taskRepo.get(d.dependsOnTaskId)
        return upstreamTask?.status === 'done'
      })

      if (allSatisfied && (downstreamTask.status === 'created' || downstreamTask.status === 'queued')) {
        await startTask(downstreamTask)
      }
    }

    // Check if the entire pipeline is complete
    const projectTasks = taskRepo.list({ projectId: task.projectId })
    const allDone = projectTasks.every((t) =>
      t.status === 'done' || t.status === 'failed' || t.status === 'cancelled'
    )
    if (allDone) {
      const state = pipelineStates.get(task.projectId)
      if (state) {
        state.status = projectTasks.some((t) => t.status === 'failed') ? 'failed' : 'completed'
        state.running = false
        broadcast(state.status === 'failed' ? 'pipeline:failed' : 'pipeline:completed', {
          projectId: task.projectId
        })
      }
    }
  },

  /** Pause the pipeline — prevents new tasks from auto-starting */
  async pause(projectId: string): Promise<void> {
    const state = pipelineStates.get(projectId)
    if (state) {
      state.status = 'paused'
      state.running = false
      broadcast('pipeline:status', { projectId, status: 'paused' })
    }
  },

  /** Resume the pipeline */
  async resume(projectId: string): Promise<void> {
    const state = pipelineStates.get(projectId)
    if (state && state.status === 'paused') {
      state.status = 'running'
      state.running = true
      broadcast('pipeline:status', { projectId, status: 'running' })
    }
  },

  /** Get the current pipeline status */
  getStatus(projectId: string): PipelineStatus {
    return pipelineStates.get(projectId)?.status ?? 'idle'
  },

  /** Build the DAG graph for visualization (PRD §4.2 View C) */
  getGraph(projectId: string): PipelineGraph {
    const tasks = taskRepo.list({ projectId })
    const allDeps = depRepo.listByProject(projectId)

    // Build adjacency maps
    const depMap = new Map<string, string[]>()
    for (const dep of allDeps) {
      const existing = depMap.get(dep.taskId) ?? []
      existing.push(dep.dependsOnTaskId)
      depMap.set(dep.taskId, existing)
    }

    // Compute topological levels using BFS
    const levels = computeTopologicalLevels(tasks, depMap)

    // Build nodes
    const nodes: PipelineNode[] = tasks.map((task) => ({
      taskId: task.id,
      task,
      dependencies: depMap.get(task.id) ?? [],
      status: task.status,
      level: levels.get(task.id) ?? 0
    }))

    // Assign x/y positions based on level
    const levelCounts = new Map<number, number>()
    for (const node of nodes) {
      const count = levelCounts.get(node.level) ?? 0
      node.x = node.level * 260
      node.y = count * 100
      levelCounts.set(node.level, count + 1)
    }

    // Build edges
    const edges: PipelineEdge[] = allDeps.map((dep) => {
      let messageConfig: import('@shared/types').MessageConfig | undefined
      if (dep.messageConfigJson) {
        try { messageConfig = JSON.parse(dep.messageConfigJson) } catch { /* ignore */ }
      }
      return { fromTaskId: dep.dependsOnTaskId, toTaskId: dep.taskId, messageConfig }
    })

    return {
      nodes,
      edges,
      status: this.getStatus(projectId)
    }
  }
}

/** Compute topological level for each task using Kahn's algorithm.
 *  Level 0 = no dependencies (root tasks)
 *  Level N = max(level of dependencies) + 1 */
function computeTopologicalLevels(
  tasks: import('@shared/types').Task[],
  depMap: Map<string, string[]>
): Map<string, number> {
  const levels = new Map<string, number>()

  // Initialize: tasks with no dependencies get level 0
  const queue: string[] = []
  for (const task of tasks) {
    const deps = depMap.get(task.id) ?? []
    if (deps.length === 0) {
      levels.set(task.id, 0)
      queue.push(task.id)
    }
  }

  // BFS: propagate levels forward
  while (queue.length > 0) {
    const current = queue.shift()!
    const currentLevel = levels.get(current) ?? 0

    // Find all tasks that depend on current
    for (const task of tasks) {
      const deps = depMap.get(task.id) ?? []
      if (deps.includes(current)) {
        const newLevel = currentLevel + 1
        const existing = levels.get(task.id) ?? 0
        if (newLevel > existing) {
          levels.set(task.id, newLevel)
        }
        // If all dependencies have levels assigned, add to queue
        const allDepsLeveled = deps.every((d) => levels.has(d))
        if (allDepsLeveled && !queue.includes(task.id)) {
          queue.push(task.id)
        }
      }
    }
  }

  // Handle any remaining tasks (cycles or disconnected)
  for (const task of tasks) {
    if (!levels.has(task.id)) {
      levels.set(task.id, 0)
    }
  }

  return levels
}
