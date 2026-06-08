import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import type {
  Task, TaskCreateInput, TaskBatchCreateInput, TaskPlanInput, TaskImportInput,
  TaskStatus, MessageConfig, AgentType
} from '@shared/types'
import { TaskRepository } from '../db/repositories/task.repository'
import { SessionRepository } from '../db/repositories/session.repository'
import { AuditRepository } from '../db/repositories/audit.repository'
import { ProjectRepository } from '../db/repositories/project.repository'
import { TaskDependencyRepository } from '../db/repositories/dependency.repository'
import { sessionManager } from './session-manager'
import { messageBus } from './message-bus'
import { autoRouter } from './auto-router'
import { pipelineEngine } from './pipeline-engine'
import { ensureWorktree } from '../git/worktree'
import { broadcast } from './broadcast'

const taskRepo = new TaskRepository()
const sessionRepo = new SessionRepository()
const audit = new AuditRepository()
const projectRepo = new ProjectRepository()
const depRepo = new TaskDependencyRepository()

export const taskManager = {
  /** Create a single task (Mode A: simple description). */
  async create(input: TaskCreateInput): Promise<Task> {
    const task = taskRepo.create({ ...input, id: randomUUID() })
    const project = projectRepo.get(input.projectId)

    if (project) {
      try {
        const { worktreePath, branchName } = await ensureWorktree(project.rootPath, task.id, task.title)
        taskRepo.setWorktree(task.id, worktreePath, branchName)
        task.worktreePath = worktreePath
        task.branchName = branchName
      } catch (err) {
        console.warn(`[task-manager] worktree setup failed:`, err)
      }
    }

    // Save dependencies if provided (Mode B)
    if (input.dependsOn) {
      for (const depId of input.dependsOn) {
        const config = input.dependencyMessageConfig?.[depId]
        depRepo.add({
          taskId: task.id,
          dependsOnTaskId: depId,
          messageConfigJson: config ? JSON.stringify(config) : undefined
        })
      }
    }

    audit.log({
      timestamp: Date.now(), taskId: task.id, actor: 'user',
      actionType: 'task_create',
      actionDetailJson: JSON.stringify({ title: task.title, mode: task.mode, agentType: task.agentType }),
      approvalStatus: 'auto'
    })

    // Auto-route if no agent specified and mode is auto
    let agentType = task.agentType
    if (!agentType && input.assignmentMode === 'auto') {
      agentType = await autoRouter.selectAgent(task) ?? undefined
      if (agentType) taskRepo.updateStatus(task.id, 'assigned')
    }

    // Auto-start if agent is assigned and worktree exists
    if (agentType && task.worktreePath) {
      taskRepo.updateStatus(task.id, 'queued')
      // Build prompt with upstream message prefix (PRD §11.4)
      const prefix = messageBus.buildPromptPrefix(task.id)
      const prompt = prefix + (task.description?.trim() || task.title)
      await sessionManager.start({
        taskId: task.id, agentType, worktreePath: task.worktreePath, prompt
      })
      taskRepo.updateStatus(task.id, 'running')
    }

    return taskRepo.get(task.id)!
  },

  /** PRD §3.3.1 Mode 1: Broadcast — same task to multiple agents.
   *  PRD §3.3.1 Mode 2: Divide — sub-tasks to different agents. */
  async createBatch(input: TaskBatchCreateInput): Promise<Task[]> {
    const project = projectRepo.get(input.projectId)
    if (!project) throw new Error('Project not found')

    const createdTasks: Task[] = []

    if (input.mode === 'broadcast') {
      // Same description sent to all selected agents
      for (const agentType of input.agentTypes) {
        const task = await this.create({
          projectId: input.projectId,
          title: input.description?.split('\n')[0].slice(0, 80) ?? 'Broadcast task',
          description: input.description,
          mode: 'broadcast',
          assignmentMode: input.assignmentMode,
          agentType
        })
        createdTasks.push(task)
      }
    } else {
      // Divide mode: sub-tasks with individual descriptions
      const subtasks = input.subtasks ?? []
      for (let i = 0; i < subtasks.length; i++) {
        const sub = subtasks[i]
        const agentType = sub.agentType ?? input.agentTypes[i % input.agentTypes.length]
        const task = await this.create({
          projectId: input.projectId,
          title: sub.title,
          description: sub.description,
          mode: 'divide',
          assignmentMode: input.assignmentMode,
          agentType
        })
        createdTasks.push(task)
      }
    }

    broadcast('task:batch-created', { projectId: input.projectId, tasks: createdTasks })
    return createdTasks
  },

  /** PRD §3.2 Mode C: Agent planning — use a planning agent to decompose a goal
   *  into structured sub-tasks. The planning agent outputs JSON which we parse
   *  and create as individual tasks. */
  async createFromPlan(input: TaskPlanInput): Promise<Task[]> {
    const project = projectRepo.get(input.projectId)
    if (!project) throw new Error('Project not found')

    let planItems: Array<{ title: string; description?: string; agentType?: AgentType }> = []

    if (input.planJson) {
      // Parse pre-generated plan JSON
      try {
        const parsed = JSON.parse(input.planJson) as Array<Record<string, unknown>>
        planItems = parsed.map((item) => ({
          title: String(item.title ?? item.task ?? 'Untitled'),
          description: String(item.description ?? item.detail ?? ''),
          agentType: item.agentType as AgentType | undefined
        }))
      } catch {
        throw new Error('Invalid plan JSON format')
      }
    } else {
      // Launch planning agent to generate the plan
      const planningPrompt = `You are a task planning agent. Given the following goal, decompose it into a JSON array of sub-tasks.
Each task should have: { "title": "short title", "description": "detailed description" }
Output ONLY valid JSON array, no markdown fencing.

Goal: ${input.goal}`

      // Create a temporary session for the planning agent
      const { worktreePath } = await ensureWorktree(project.rootPath, randomUUID(), 'plan-generation')
      const planSession = await sessionManager.start({
        taskId: 'planning',
        agentType: input.planningAgent,
        worktreePath,
        prompt: planningPrompt
      })

      // Return the plan session ID — the UI will wait for it to complete
      // and then call createFromPlan again with the planJson
      return [{
        id: planSession.id,
        projectId: input.projectId,
        title: `Plan: ${input.goal.slice(0, 60)}`,
        mode: 'pipeline' as const,
        assignmentMode: 'manual' as const,
        status: 'running' as const,
        agentType: input.planningAgent,
        worktreePath,
        createdAt: Date.now(),
        persistOnClose: false
      }]
    }

    // Create tasks from the parsed plan
    const createdTasks: Task[] = []
    for (const item of planItems) {
      const task = await this.create({
        projectId: input.projectId,
        title: item.title,
        description: item.description,
        mode: 'pipeline',
        assignmentMode: 'auto',
        agentType: item.agentType
      })
      createdTasks.push(task)
    }

    broadcast('task:batch-created', { projectId: input.projectId, tasks: createdTasks })
    return createdTasks
  },

  /** PRD §3.2 Mode D: Import tasks from file (.md, .json, .txt) */
  async importFromFile(input: TaskImportInput): Promise<Task[]> {
    const project = projectRepo.get(input.projectId)
    if (!project) throw new Error('Project not found')

    const content = readFileSync(input.filePath, 'utf-8')
    let items: Array<{ title: string; description?: string }> = []

    switch (input.format) {
      case 'json':
        try {
          const parsed = JSON.parse(content) as Array<Record<string, unknown>>
          items = parsed.map((item) => ({
            title: String(item.title ?? item.task ?? 'Untitled'),
            description: String(item.description ?? item.detail ?? '')
          }))
        } catch {
          throw new Error('Invalid JSON format in imported file')
        }
        break
      case 'markdown':
        // Parse markdown headings as task titles, content below as descriptions
        items = parseMarkdownTasks(content)
        break
      case 'text':
        // Each non-empty line is a task title
        items = content.split('\n')
          .map((line) => line.trim())
          .filter(Boolean)
          .map((line) => ({ title: line }))
        break
    }

    const createdTasks: Task[] = []
    for (const item of items) {
      const task = await this.create({
        projectId: input.projectId,
        title: item.title,
        description: item.description,
        mode: 'single',
        assignmentMode: input.assignmentMode,
        agentType: input.agentType
      })
      createdTasks.push(task)
    }

    broadcast('task:batch-created', { projectId: input.projectId, tasks: createdTasks })
    return createdTasks
  },

  async cancel(taskId: string): Promise<void> {
    const task = taskRepo.get(taskId)
    if (!task) return
    const sessionList = sessionRepo.list(taskId)
    for (const s of sessionList) {
      if (s.status === 'running' || s.status === 'initializing' || s.status === 'waiting_input' || s.status === 'waiting_approval') {
        await sessionManager.stop(s.id, 'force')
      }
    }
    taskRepo.updateStatus(taskId, 'failed')
    audit.log({ timestamp: Date.now(), taskId, actor: 'user', actionType: 'task_cancel', approvalStatus: 'auto' })
  },

  async retry(taskId: string): Promise<void> {
    const task = taskRepo.get(taskId)
    if (!task) return
    if (task.status === 'running' || task.status === 'queued') return
    if (!task.agentType) {
      throw new Error('Cannot auto-retry: no agent assigned.')
    }
    if (!task.worktreePath) {
      throw new Error('Cannot auto-retry: no worktree bound to this task.')
    }
    taskRepo.updateStatus(taskId, 'queued')
    const prefix = messageBus.buildPromptPrefix(taskId)
    const prompt = prefix + (task.description?.trim() || task.title)
    await sessionManager.start({
      taskId: task.id, agentType: task.agentType,
      worktreePath: task.worktreePath, prompt
    })
    taskRepo.updateStatus(taskId, 'running')
  },

  list(filters: Parameters<TaskRepository['list']>[0]) {
    return taskRepo.list(filters)
  },

  get(id: string): Task | null {
    return taskRepo.get(id)
  },

  updateStatus(id: string, status: TaskStatus): void {
    taskRepo.updateStatus(id, status)
    // If a task completed, notify pipeline engine
    if (status === 'done' || status === 'failed') {
      const sessionList = sessionRepo.list(id)
      const lastSession = sessionList.find((s) => s.status === 'done' || s.status === 'error')
      if (lastSession) {
        void pipelineEngine.onTaskCompleted(id, lastSession.id)
      }
    }
  },

  /** Dependency management */
  addDependency(taskId: string, dependsOnTaskId: string, config?: MessageConfig): void {
    depRepo.add({
      taskId,
      dependsOnTaskId,
      messageConfigJson: config ? JSON.stringify(config) : undefined
    })
  },

  removeDependency(taskId: string, dependsOnTaskId: string): void {
    depRepo.remove(taskId, dependsOnTaskId)
  },

  getDependencies(taskId: string) {
    return depRepo.listByTask(taskId)
  }
}

/** Parse markdown content into task items.
 *  Headings (# or ##) become task titles, content below becomes description. */
function parseMarkdownTasks(content: string): Array<{ title: string; description?: string }> {
  const items: Array<{ title: string; description?: string }> = []
  const lines = content.split('\n')
  let currentTitle = ''
  let currentDesc: string[] = []

  for (const line of lines) {
    const headingMatch = line.match(/^#{1,3}\s+(.+)/)
    if (headingMatch) {
      if (currentTitle) {
        items.push({ title: currentTitle, description: currentDesc.join('\n').trim() || undefined })
      }
      currentTitle = headingMatch[1].trim()
      currentDesc = []
    } else if (line.match(/^[-*]\s+(.+)/)) {
      // List items without headings become individual tasks
      const listTitle = line.replace(/^[-*]\s+/, '').trim()
      if (listTitle) {
        items.push({ title: listTitle })
      }
    } else if (currentTitle) {
      currentDesc.push(line)
    }
  }
  if (currentTitle) {
    items.push({ title: currentTitle, description: currentDesc.join('\n').trim() || undefined })
  }
  return items
}
