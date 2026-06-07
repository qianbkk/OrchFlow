import type { DatabaseSync } from 'node:sqlite'
import type { Migration } from '../migrations'

// PRD §6.1 — initial schema
export const migration001Initial: Migration = {
  version: 1,
  name: 'initial_schema',
  up: (db: DatabaseSync) => {
    db.exec(`
      CREATE TABLE projects (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        root_path TEXT NOT NULL,
        worktree_base_path TEXT,
        config_json TEXT,
        created_at INTEGER NOT NULL,
        last_opened_at INTEGER NOT NULL
      );

      CREATE TABLE tasks (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL REFERENCES projects(id),
        title TEXT NOT NULL,
        description TEXT,
        mode TEXT NOT NULL,
        assignment_mode TEXT NOT NULL,
        status TEXT NOT NULL,
        agent_type TEXT,
        worktree_path TEXT,
        branch_name TEXT,
        created_at INTEGER NOT NULL,
        started_at INTEGER,
        completed_at INTEGER,
        approval_policy_json TEXT,
        persist_on_close INTEGER DEFAULT 0
      );
      CREATE INDEX idx_tasks_project_status ON tasks(project_id, status);

      CREATE TABLE task_dependencies (
        task_id TEXT NOT NULL REFERENCES tasks(id),
        depends_on_task_id TEXT NOT NULL REFERENCES tasks(id),
        message_config_json TEXT,
        PRIMARY KEY (task_id, depends_on_task_id)
      );

      CREATE TABLE sessions (
        id TEXT PRIMARY KEY,
        task_id TEXT NOT NULL REFERENCES tasks(id),
        agent_type TEXT NOT NULL,
        status TEXT NOT NULL,
        pid INTEGER,
        mode TEXT NOT NULL,
        started_at INTEGER NOT NULL,
        ended_at INTEGER,
        token_usage_json TEXT
      );
      CREATE INDEX idx_sessions_task ON sessions(task_id);

      CREATE TABLE audit_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp INTEGER NOT NULL,
        session_id TEXT,
        task_id TEXT,
        actor TEXT NOT NULL,
        action_type TEXT NOT NULL,
        action_detail_json TEXT,
        risk_level TEXT,
        approval_status TEXT,
        approved_by TEXT,
        approved_at INTEGER
      );
      CREATE INDEX idx_audit_timestamp ON audit_log(timestamp);
      CREATE INDEX idx_audit_task ON audit_log(task_id);

      CREATE TABLE checkpoints (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL REFERENCES sessions(id),
        task_id TEXT NOT NULL REFERENCES tasks(id),
        timestamp INTEGER NOT NULL,
        type TEXT NOT NULL,
        git_commit TEXT,
        git_stash TEXT,
        session_state_json TEXT,
        description TEXT
      );

      CREATE TABLE agent_messages (
        id TEXT PRIMARY KEY,
        from_session_id TEXT,
        to_session_id TEXT,
        task_id TEXT,
        timestamp INTEGER NOT NULL,
        message_type TEXT NOT NULL,
        content TEXT,
        delivered INTEGER DEFAULT 0
      );

      CREATE TABLE notifications (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp INTEGER NOT NULL,
        type TEXT NOT NULL,
        title TEXT NOT NULL,
        body TEXT,
        task_id TEXT,
        session_id TEXT,
        read INTEGER DEFAULT 0,
        action_taken TEXT
      );
      CREATE INDEX idx_notif_timestamp ON notifications(timestamp);
    `)
  }
}
