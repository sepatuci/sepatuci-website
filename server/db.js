import Database from 'better-sqlite3'
import { fileURLToPath } from 'url'
import path from 'path'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const db = new Database(path.join(__dirname, 'posts.db'))

db.exec(`
  CREATE TABLE IF NOT EXISTS posts (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    title          TEXT    NOT NULL,
    content        TEXT    NOT NULL,
    cluster_hash   TEXT    UNIQUE NOT NULL,
    source_titles  TEXT    NOT NULL,
    source_urls    TEXT    NOT NULL,
    source_name    TEXT    NOT NULL DEFAULT 'Hacker News',
    generated_date TEXT    NOT NULL,
    category       TEXT    NOT NULL,
    hn_score       INTEGER DEFAULT 0
  )
`)

// Migrations for any pre-existing DB that may have the old schema
for (const stmt of [
  'ALTER TABLE posts ADD COLUMN cluster_hash TEXT',
  'ALTER TABLE posts ADD COLUMN source_titles TEXT',
  'ALTER TABLE posts ADD COLUMN source_urls TEXT',
]) {
  try { db.exec(stmt) } catch (_) {}
}

export function insertPost(post) {
  return db.prepare(`
    INSERT OR IGNORE INTO posts
      (title, content, cluster_hash, source_titles, source_urls, source_name, generated_date, category, hn_score)
    VALUES
      (@title, @content, @cluster_hash, @source_titles, @source_urls, @source_name, @generated_date, @category, @hn_score)
  `).run(post)
}

export function getAllPosts() {
  return db.prepare('SELECT * FROM posts ORDER BY generated_date DESC').all()
}

export function postExists(clusterHash) {
  return !!db.prepare('SELECT id FROM posts WHERE cluster_hash = ?').get(clusterHash)
}

export function getPostById(id) {
  return db.prepare('SELECT * FROM posts WHERE id = ?').get(id)
}
