import { useState } from 'react'
import type { Task, TaskStatus } from '@shared/types'
import { KANBAN_COLUMNS } from '@shared/constants'
import { StatusPill } from './StatusPill'

interface KanbanBoardProps {
  tasks: Task[]
  onStatusChange: (taskId: string, status: TaskStatus) => void
  onSelect: (task: Task) => void
}

const COLUMN_STATUS_MAP: Record<string, TaskStatus> = {
  queued: 'queued',
  running: 'running',
  review: 'pending_review',
  done: 'done'
}

/** PRD §4.2 View B: Kanban board with 4 columns.
 *  Uses HTML5 Drag and Drop API (no external dependency). */
export function KanbanBoard({ tasks, onStatusChange, onSelect }: KanbanBoardProps): React.JSX.Element {
  const [draggedTaskId, setDraggedTaskId] = useState<string | null>(null)
  const [dragOverColumn, setDragOverColumn] = useState<string | null>(null)

  const handleDragStart = (e: React.DragEvent, taskId: string): void => {
    setDraggedTaskId(taskId)
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', taskId)
  }

  const handleDragOver = (e: React.DragEvent, columnKey: string): void => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setDragOverColumn(columnKey)
  }

  const handleDragLeave = (): void => {
    setDragOverColumn(null)
  }

  const handleDrop = (e: React.DragEvent, columnKey: string): void => {
    e.preventDefault()
    setDragOverColumn(null)
    const taskId = e.dataTransfer.getData('text/plain')
    if (!taskId) return

    const targetStatus = COLUMN_STATUS_MAP[columnKey]
    if (targetStatus) {
      onStatusChange(taskId, targetStatus)
    }
    setDraggedTaskId(null)
  }

  const handleDragEnd = (): void => {
    setDraggedTaskId(null)
    setDragOverColumn(null)
  }

  return (
    <div className="grid grid-cols-4 gap-3 p-4">
      {KANBAN_COLUMNS.map((col) => {
        const columnTasks = tasks.filter((t) => col.statuses.includes(t.status as typeof col.statuses[number]))
        const isOver = dragOverColumn === col.key

        return (
          <div
            key={col.key}
            className={`flex flex-col rounded-lg border bg-[var(--color-bg-2)] transition-colors ${
              isOver ? 'border-[var(--color-accent)] bg-[var(--color-accent)]/5' : 'border-[var(--color-border-1)]'
            }`}
            onDragOver={(e) => handleDragOver(e, col.key)}
            onDragLeave={handleDragLeave}
            onDrop={(e) => handleDrop(e, col.key)}
          >
            {/* Column header */}
            <div className="flex items-center justify-between border-b border-[var(--color-border-1)] px-3 py-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-[var(--color-text-2)]">
                {col.label}
              </span>
              <span className="rounded-full bg-[var(--color-bg-3)] px-2 py-0.5 text-[10px] font-medium text-[var(--color-text-2)]">
                {columnTasks.length}
              </span>
            </div>

            {/* Task cards */}
            <div className="flex-1 space-y-2 overflow-auto p-2" style={{ maxHeight: 'calc(100vh - 260px)' }}>
              {columnTasks.length === 0 ? (
                <p className="py-4 text-center text-xs text-[var(--color-text-2)]">No tasks</p>
              ) : (
                columnTasks.map((task) => (
                  <div
                    key={task.id}
                    draggable
                    onDragStart={(e) => handleDragStart(e, task.id)}
                    onDragEnd={handleDragEnd}
                    onClick={() => onSelect(task)}
                    className={`cursor-grab rounded border border-[var(--color-border-1)] bg-[var(--color-bg-1)] p-2 text-sm transition-all hover:border-[var(--color-accent)]/40 active:cursor-grabbing ${
                      draggedTaskId === task.id ? 'opacity-40' : ''
                    }`}
                  >
                    <div className="mb-1 font-medium truncate">{task.title}</div>
                    <div className="flex items-center justify-between text-[10px] text-[var(--color-text-2)]">
                      <span>{task.agentType ?? 'auto'}</span>
                      <StatusPill
                        tone={
                          task.status === 'done' ? 'accent2'
                            : task.status === 'failed' || task.status === 'cancelled' ? 'danger'
                              : task.status === 'paused' ? 'warn'
                                : 'accent'
                        }
                      >
                        {task.status}
                      </StatusPill>
                    </div>
                    {task.mode !== 'single' && (
                      <div className="mt-1 text-[10px] text-[var(--color-text-2)]">
                        📋 {task.mode}
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
