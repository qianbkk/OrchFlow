import type { AgentType, Task } from '@shared/types'
import { TaskRepository } from '../db/repositories/task.repository'
import { SessionRepository } from '../db/repositories/session.repository'
import { AUTO_ROUTER_WEIGHTS } from '@shared/constants'
import { detectInstalledAgents } from '../agents/driver.registry'

const taskRepo = new TaskRepository()
const sessionRepo = new SessionRepository()

/** PRD §3.2.3: Automatic task routing — assigns tasks to agents based on
 *  status, load, capability matching, and historical success. */
export const autoRouter = {
  /** Score each available agent for a task and return the best match.
   *  Returns null if no agents are available. */
  async selectAgent(task: Task, availableAgents?: AgentType[]): Promise<AgentType | null> {
    const detected = await detectInstalledAgents()
    const installed = detected.filter((a) => a.installed)
    if (installed.length === 0) return null

    const candidates = availableAgents
      ? installed.filter((a) => availableAgents.includes(a.type))
      : installed
    if (candidates.length === 0) return null

    // Get all tasks in the project to compute load
    const projectTasks = taskRepo.list({ projectId: task.projectId })
    const allSessions = sessionRepo.list()

    let bestAgent: AgentType | null = null
    let bestScore = -Infinity

    for (const agent of candidates) {
      let score = 0

      // Count running sessions for this agent in this project
      const agentSessions = allSessions.filter(
        (s) => s.agentType === agent.type && s.status === 'running'
      )
      const runningCount = agentSessions.length

      // Idle bonus: no running sessions → big bonus
      if (runningCount === 0) {
        score += AUTO_ROUTER_WEIGHTS.IDLE_BONUS
      } else {
        // Penalty per running session
        score -= runningCount * AUTO_ROUTER_WEIGHTS.RUNNING_PENALTY
      }

      // Capability match: check if agent has handled similar tasks before
      const similarDone = projectTasks.filter(
        (t) => t.agentType === agent.type && t.status === 'done'
      )
      if (similarDone.length > 0) {
        score += AUTO_ROUTER_WEIGHTS.LAST_SUCCESS_BONUS
      }

      // Check if agent is currently idle (has no assigned tasks in running/queued state)
      const activeTasks = projectTasks.filter(
        (t) => t.agentType === agent.type &&
          (t.status === 'running' || t.status === 'queued' || t.status === 'assigned')
      )
      if (activeTasks.length === 0) {
        score += AUTO_ROUTER_WEIGHTS.CAPABILITY_MATCH_BONUS
      }

      if (score > bestScore) {
        bestScore = score
        bestAgent = agent.type
      }
    }

    return bestAgent
  },

  /** Get a summary of agent load for the UI */
  async getAgentLoad(projectId: string): Promise<Record<AgentType, { running: number; queued: number; idle: boolean }>> {
    const detected = await detectInstalledAgents()
    const tasks = taskRepo.list({ projectId })
    const sessions = sessionRepo.list()

    const result = {} as Record<AgentType, { running: number; queued: number; idle: boolean }>

    for (const agent of detected) {
      const running = sessions.filter(
        (s) => s.agentType === agent.type && s.status === 'running'
      ).length
      const queued = tasks.filter(
        (t) => t.agentType === agent.type &&
          (t.status === 'queued' || t.status === 'assigned')
      ).length
      result[agent.type] = { running, queued, idle: running === 0 && queued === 0 }
    }

    return result
  }
}
