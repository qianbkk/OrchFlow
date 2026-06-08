import { useEffect, useState, useRef } from 'react'
import type { PipelineGraph, PipelineNode } from '@shared/types'
import { PIPELINE_LAYOUT } from '@shared/constants'
import { useUiStore } from '../stores/ui.store'
import { Play, Pause, RotateCcw } from 'lucide-react'

const STATUS_COLOR: Record<string, string> = {
  created: '#6b7280',
  queued: '#8b5cf6',
  assigned: '#8b5cf6',
  running: '#3b82f6',
  paused: '#f59e0b',
  pending_review: '#f97316',
  done: '#22c55e',
  failed: '#ef4444',
  cancelled: '#6b7280'
}

/** PRD §4.2 View C: Pipeline DAG visualization.
 *  SVG-based rendering with topological layout — nodes positioned by level (x)
 *  and index within level (y), edges drawn as curved arrows. */
export function PipelineView(): React.JSX.Element {
  const projectId = useUiStore((s) => s.activeProjectId)
  const [graph, setGraph] = useState<PipelineGraph | null>(null)
  const [loading, setLoading] = useState(true)
  const [selectedNode, setSelectedNode] = useState<PipelineNode | null>(null)
  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const svgRef = useRef<SVGSVGElement>(null)
  const dragRef = useRef<{ startX: number; startY: number; panX: number; panY: number } | null>(null)

  const reload = async (): Promise<void> => {
    if (!projectId) { setLoading(false); return }
    try {
      const g = await window.orchflow.pipeline.getGraph(projectId)
      setGraph(g)
    } catch (err) {
      console.error('[PipelineView] getGraph failed:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void reload() }, [projectId])

  // Subscribe to pipeline status updates
  useEffect(() => {
    const off = window.orchflow.on('pipeline:status', () => { void reload() })
    const off2 = window.orchflow.on('pipeline:completed', () => { void reload() })
    const off3 = window.orchflow.on('pipeline:failed', () => { void reload() })
    return () => { off(); off2(); off3() }
  }, [])

  // Pan handlers
  const handleMouseDown = (e: React.MouseEvent): void => {
    if (e.button !== 0) return
    dragRef.current = { startX: e.clientX, startY: e.clientY, panX: pan.x, panY: pan.y }
  }
  const handleMouseMove = (e: React.MouseEvent): void => {
    if (!dragRef.current) return
    setPan({
      x: dragRef.current.panX + (e.clientX - dragRef.current.startX),
      y: dragRef.current.panY + (e.clientY - dragRef.current.startY)
    })
  }
  const handleMouseUp = (): void => { dragRef.current = null }

  const handleWheel = (e: React.WheelEvent): void => {
    e.preventDefault()
    setZoom((z) => Math.max(0.3, Math.min(3, z - e.deltaY * 0.001)))
  }

  const startPipeline = async (): Promise<void> => {
    if (!projectId) return
    try { await window.orchflow.pipeline.start(projectId) } catch (err) { console.error(err) }
    await reload()
  }

  const pausePipeline = async (): Promise<void> => {
    if (!projectId) return
    try { await window.orchflow.pipeline.pause(projectId) } catch (err) { console.error(err) }
  }

  if (!projectId) {
    return (
      <div className="flex h-full items-center justify-center p-6 text-center text-sm text-[var(--color-text-2)]">
        Select a project to view its pipeline DAG.
      </div>
    )
  }

  if (loading) {
    return <div className="flex h-full items-center justify-center text-sm text-[var(--color-text-2)]">Loading…</div>
  }

  if (!graph || graph.nodes.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 p-6 text-center">
        <p className="text-sm text-[var(--color-text-2)]">
          No pipeline tasks found. Create tasks with dependencies (Task List mode) to build a pipeline.
        </p>
      </div>
    )
  }

  // Compute SVG dimensions
  const maxLevel = Math.max(...graph.nodes.map((n) => n.level))
  const maxPerLevel = Math.max(
    ...Array.from({ length: maxLevel + 1 }, (_, i) =>
      graph.nodes.filter((n) => n.level === i).length
    )
  )
  const svgWidth = (maxLevel + 1) * (PIPELINE_LAYOUT.NODE_WIDTH + PIPELINE_LAYOUT.NODE_GAP_X) + PIPELINE_LAYOUT.PADDING * 2
  const svgHeight = maxPerLevel * (PIPELINE_LAYOUT.NODE_HEIGHT + PIPELINE_LAYOUT.NODE_GAP_Y) + PIPELINE_LAYOUT.PADDING * 2

  return (
    <div className="flex h-full flex-col">
      {/* Toolbar */}
      <div className="flex items-center justify-between border-b border-[var(--color-border-1)] bg-[var(--color-bg-2)] px-4 py-2">
        <div className="flex items-center gap-3">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-[var(--color-text-2)]">
            Pipeline DAG
          </h2>
          <span className={`rounded px-2 py-0.5 text-xs font-medium ${
            graph.status === 'running' ? 'bg-blue-500/20 text-blue-400'
              : graph.status === 'completed' ? 'bg-green-500/20 text-green-400'
                : graph.status === 'failed' ? 'bg-red-500/20 text-red-400'
                  : graph.status === 'paused' ? 'bg-yellow-500/20 text-yellow-400'
                    : 'bg-[var(--color-bg-3)] text-[var(--color-text-2)]'
          }`}>
            {graph.status}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={startPipeline} className="flex items-center gap-1 rounded bg-[var(--color-accent)] px-2 py-1 text-xs text-white hover:opacity-90">
            <Play size={12} /> Start
          </button>
          <button onClick={pausePipeline} className="flex items-center gap-1 rounded border border-[var(--color-border-1)] px-2 py-1 text-xs hover:bg-[var(--color-bg-3)]">
            <Pause size={12} /> Pause
          </button>
          <button onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }) }} className="rounded border border-[var(--color-border-1)] px-2 py-1 text-xs hover:bg-[var(--color-bg-3)]">
            <RotateCcw size={12} /> Reset
          </button>
          <span className="text-xs text-[var(--color-text-2)]">{Math.round(zoom * 100)}%</span>
        </div>
      </div>

      {/* DAG Canvas */}
      <div
        className="flex-1 overflow-hidden bg-[var(--color-bg-0)] cursor-grab active:cursor-grabbing"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onWheel={handleWheel}
      >
        <svg
          ref={svgRef}
          width="100%"
          height="100%"
          viewBox={`0 0 ${svgWidth} ${svgHeight}`}
          style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`, transformOrigin: '0 0' }}
        >
          <defs>
            <marker id="arrowhead" markerWidth="10" markerHeight="7" refX="10" refY="3.5" orient="auto">
              <polygon points="0 0, 10 3.5, 0 7" fill="#6b7280" />
            </marker>
          </defs>

          {/* Edges */}
          {graph.edges.map((edge, i) => {
            const from = graph.nodes.find((n) => n.taskId === edge.fromTaskId)
            const to = graph.nodes.find((n) => n.taskId === edge.toTaskId)
            if (!from || !to) return null
            const x1 = (from.x ?? 0) + PIPELINE_LAYOUT.NODE_WIDTH
            const y1 = (from.y ?? 0) + PIPELINE_LAYOUT.NODE_HEIGHT / 2
            const x2 = to.x ?? 0
            const y2 = (to.y ?? 0) + PIPELINE_LAYOUT.NODE_HEIGHT / 2
            const cx = (x1 + x2) / 2
            return (
              <path
                key={`edge-${i}`}
                d={`M ${x1} ${y1} C ${cx} ${y1}, ${cx} ${y2}, ${x2} ${y2}`}
                stroke="#6b7280"
                strokeWidth="2"
                fill="none"
                markerEnd="url(#arrowhead)"
                opacity="0.6"
              />
            )
          })}

          {/* Nodes */}
          {graph.nodes.map((node) => {
            const x = node.x ?? 0
            const y = node.y ?? 0
            const color = STATUS_COLOR[node.status] ?? '#6b7280'
            const isSelected = selectedNode?.taskId === node.taskId
            return (
              <g
                key={node.taskId}
                onClick={(e) => { e.stopPropagation(); setSelectedNode(isSelected ? null : node) }}
                className="cursor-pointer"
              >
                <rect
                  x={x} y={y}
                  width={PIPELINE_LAYOUT.NODE_WIDTH}
                  height={PIPELINE_LAYOUT.NODE_HEIGHT}
                  rx="8" ry="8"
                  fill={isSelected ? `${color}33` : '#1f2937'}
                  stroke={color}
                  strokeWidth={isSelected ? 3 : 2}
                />
                <text
                  x={x + 12} y={y + 22}
                  fill="#e5e7eb"
                  fontSize="12"
                  fontWeight="600"
                >
                  {node.task.title.slice(0, 20)}
                </text>
                <text
                  x={x + 12} y={y + 42}
                  fill="#9ca3af"
                  fontSize="10"
                >
                  {node.task.agentType ?? 'auto'} · {node.status}
                </text>
              </g>
            )
          })}
        </svg>
      </div>

      {/* Node detail panel */}
      {selectedNode && (
        <div className="border-t border-[var(--color-border-1)] bg-[var(--color-bg-2)] p-3">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-medium">{selectedNode.task.title}</h3>
              <p className="text-xs text-[var(--color-text-2)]">
                {selectedNode.task.agentType ?? 'auto'} · {selectedNode.task.status} · Level {selectedNode.level}
              </p>
            </div>
            <div className="text-xs text-[var(--color-text-2)]">
              {selectedNode.dependencies.length > 0 && (
                <span>Depends on: {selectedNode.dependencies.length} task(s)</span>
              )}
            </div>
          </div>
          {selectedNode.task.description && (
            <p className="mt-1 text-xs text-[var(--color-text-1)] line-clamp-2">{selectedNode.task.description}</p>
          )}
        </div>
      )}
    </div>
  )
}
