import { useEffect, useState } from 'react'
import { FileCode, FileText, Image, File } from 'lucide-react'
interface FileChangeEvent { sessionId: string; taskId: string; filename: string; relativePath: string; size: number; timestamp: number }
interface DashboardFile extends FileChangeEvent { isGlowing: boolean }
export function WorktreeDashboard({ sessionId }: { sessionId: string }): JSX.Element {
  const [files, setFiles] = useState<DashboardFile[]>([])
  useEffect(() => {
    const off = window.orchflow.on('worktree:file-change', (event: unknown) => {
      const e = event as FileChangeEvent
      if (e.sessionId !== sessionId) return
      setFiles(prev => {
        const filtered = prev.filter(f => f.relativePath !== e.relativePath)
        const newFile: DashboardFile = { ...e, isGlowing: true }
        const next = [newFile, ...filtered].slice(0, 15)
        setTimeout(() => { setFiles(current => current.map(f => f.relativePath === e.relativePath ? { ...f, isGlowing: false } : f)) }, 2000)
        return next
      })
    })
    return () => { off() }
  }, [sessionId])
  const getIcon = (filename: string) => {
    if (/\.(ts|tsx|js|jsx)$/.test(filename)) return <FileCode className="text-yellow-400" size={16} />
    if (/\.(md|txt)$/.test(filename)) return <FileText className="text-blue-400" size={16} />
    if (/\.(png|jpg|svg)$/.test(filename)) return <Image className="text-purple-400" size={16} />
    return <File className="text-gray-400" size={16} />
  }
  if (files.length === 0) return <div className="p-4 text-center text-sm border rounded-lg bg-[var(--color-bg-2)]">AI Agent 待命中...</div>
  return (
    <div className="border rounded-lg bg-[var(--color-bg-2)] overflow-hidden">
      <div className="px-3 py-2 border-b bg-[var(--color-bg-3)] text-xs font-semibold uppercase">Worktree 实时变更</div>
      <div className="max-h-64 overflow-y-auto p-2 space-y-1">
        {files.map(file => (
          <div key={file.relativePath} className={`flex items-center gap-2 px-2 py-1.5 rounded transition-all ${file.isGlowing ? 'bg-blue-500/20 ring-1 ring-blue-400 animate-pulse' : 'hover:bg-[var(--color-bg-3)]'}`}>
            {getIcon(file.filename)}
            <span className={`text-xs truncate flex-1 ${file.isGlowing ? 'text-white font-bold' : ''}`}>{file.relativePath}</span>
            {file.isGlowing && <span className="text-[10px] bg-blue-600 text-white px-1.5 rounded-full">AI 写入中</span>}
          </div>
        ))}
      </div>
    </div>
  )
}
