import type { Project } from '@shared/types'
import { Repository } from './base'

function rowToProject(row: unknown): Project {
  const r = row as Record<string, unknown>
  return {
    id: r.id as string,
    name: r.name as string,
    rootPath: r.root_path as string,
    worktreeBasePath: (r.worktree_base_path as string | null) ?? undefined,
    configJson: (r.config_json as string | null) ?? undefined,
    createdAt: r.created_at as number,
    lastOpenedAt: r.last_opened_at as number
  }
}

export class ProjectRepository extends Repository {
  list(): Project[] {
    const rows = this.db.prepare('SELECT * FROM projects ORDER BY last_opened_at DESC').all()
    return rows.map(rowToProject)
  }

  get(id: string): Project | null {
    const row = this.db.prepare('SELECT * FROM projects WHERE id = ?').get(id)
    return row ? rowToProject(row) : null
  }

  findByPath(rootPath: string): Project | null {
    const row = this.db.prepare('SELECT * FROM projects WHERE root_path = ?').get(rootPath)
    return row ? rowToProject(row) : null
  }

  upsert(project: Project): void {
    this.db
      .prepare(
        `INSERT INTO projects (id, name, root_path, worktree_base_path, config_json, created_at, last_opened_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           name=excluded.name,
           root_path=excluded.root_path,
           worktree_base_path=excluded.worktree_base_path,
           config_json=excluded.config_json,
           last_opened_at=excluded.last_opened_at`
      )
      .run(
        project.id,
        project.name,
        project.rootPath,
        project.worktreeBasePath ?? null,
        project.configJson ?? null,
        project.createdAt,
        project.lastOpenedAt
      )
  }

  touch(id: string): void {
    this.db
      .prepare('UPDATE projects SET last_opened_at = ? WHERE id = ?')
      .run(Date.now(), id)
  }

  delete(id: string): void {
    this.db.prepare('DELETE FROM projects WHERE id = ?').run(id)
  }
}
