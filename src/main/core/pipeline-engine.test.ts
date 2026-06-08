// @vitest-environment node
import { describe, it, expect } from 'vitest'

/** Pipeline engine unit tests.
 *  Tests topological sort and dependency resolution logic without DB. */

interface SimpleTask { id: string; status: string }
type DepMap = Map<string, string[]>

function computeLevels(tasks: SimpleTask[], depMap: DepMap): Map<string, number> {
  const levels = new Map<string, number>()
  const queue: string[] = []

  for (const task of tasks) {
    const deps = depMap.get(task.id) ?? []
    if (deps.length === 0) {
      levels.set(task.id, 0)
      queue.push(task.id)
    }
  }

  while (queue.length > 0) {
    const current = queue.shift()!
    const currentLevel = levels.get(current) ?? 0

    for (const task of tasks) {
      const deps = depMap.get(task.id) ?? []
      if (deps.includes(current)) {
        const newLevel = currentLevel + 1
        const existing = levels.get(task.id) ?? 0
        if (newLevel > existing) levels.set(task.id, newLevel)
        const allDepsLeveled = deps.every((d) => levels.has(d))
        if (allDepsLeveled && !queue.includes(task.id)) queue.push(task.id)
      }
    }
  }

  for (const task of tasks) {
    if (!levels.has(task.id)) levels.set(task.id, 0)
  }

  return levels
}

function allDepsSatisfied(taskId: string, depMap: DepMap, taskStatuses: Map<string, string>): boolean {
  const deps = depMap.get(taskId) ?? []
  return deps.every((d) => taskStatuses.get(d) === 'done')
}

describe('pipeline topological sort', () => {
  it('tasks with no dependencies get level 0', () => {
    const tasks: SimpleTask[] = [{ id: 'a', status: 'created' }, { id: 'b', status: 'created' }]
    const depMap: DepMap = new Map()
    const levels = computeLevels(tasks, depMap)
    expect(levels.get('a')).toBe(0)
    expect(levels.get('b')).toBe(0)
  })

  it('linear chain: a → b → c assigns correct levels', () => {
    const tasks: SimpleTask[] = [
      { id: 'a', status: 'created' },
      { id: 'b', status: 'created' },
      { id: 'c', status: 'created' }
    ]
    const depMap: DepMap = new Map([
      ['b', ['a']],
      ['c', ['b']]
    ])
    const levels = computeLevels(tasks, depMap)
    expect(levels.get('a')).toBe(0)
    expect(levels.get('b')).toBe(1)
    expect(levels.get('c')).toBe(2)
  })

  it('diamond: a → b, a → c, b → d, c → d', () => {
    const tasks: SimpleTask[] = [
      { id: 'a', status: 'created' },
      { id: 'b', status: 'created' },
      { id: 'c', status: 'created' },
      { id: 'd', status: 'created' }
    ]
    const depMap: DepMap = new Map([
      ['b', ['a']],
      ['c', ['a']],
      ['d', ['b', 'c']]
    ])
    const levels = computeLevels(tasks, depMap)
    expect(levels.get('a')).toBe(0)
    expect(levels.get('b')).toBe(1)
    expect(levels.get('c')).toBe(1)
    expect(levels.get('d')).toBe(2)
  })

  it('isolated task gets level 0', () => {
    const tasks: SimpleTask[] = [
      { id: 'a', status: 'created' },
      { id: 'b', status: 'created' },
      { id: 'isolated', status: 'created' }
    ]
    const depMap: DepMap = new Map([['b', ['a']]])
    const levels = computeLevels(tasks, depMap)
    expect(levels.get('isolated')).toBe(0)
  })
})

describe('pipeline dependency satisfaction', () => {
  it('task with no deps is always satisfied', () => {
    const depMap: DepMap = new Map()
    const statuses = new Map<string, string>()
    expect(allDepsSatisfied('a', depMap, statuses)).toBe(true)
  })

  it('task is blocked until all deps are done', () => {
    const depMap: DepMap = new Map([['c', ['a', 'b']]])
    expect(allDepsSatisfied('c', depMap, new Map([['a', 'done'], ['b', 'running']]))).toBe(false)
    expect(allDepsSatisfied('c', depMap, new Map([['a', 'done'], ['b', 'done']]))).toBe(true)
  })

  it('task with one satisfied dep and one missing is blocked', () => {
    const depMap: DepMap = new Map([['b', ['a']]])
    expect(allDepsSatisfied('b', depMap, new Map())).toBe(false)
  })
})
