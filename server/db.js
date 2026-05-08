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
    source_url     TEXT    UNIQUE NOT NULL,
    source_name    TEXT    NOT NULL,
    generated_date TEXT    NOT NULL,
    category       TEXT    NOT NULL,
    hn_score       INTEGER DEFAULT 0
  )
`)

// Migrate existing DB that may not have hn_score yet
try {
  db.exec('ALTER TABLE posts ADD COLUMN hn_score INTEGER DEFAULT 0')
} catch (_) {
  // column already present — ignore
}

export function insertPost(post) {
  return db.prepare(`
    INSERT OR IGNORE INTO posts
      (title, content, source_url, source_name, generated_date, category, hn_score)
    VALUES
      (@title, @content, @source_url, @source_name, @generated_date, @category, @hn_score)
  `).run(post)
}

export function getAllPosts() {
  return db.prepare('SELECT * FROM posts ORDER BY generated_date DESC').all()
}

export function postExists(sourceUrl) {
  return !!db.prepare('SELECT id FROM posts WHERE source_url = ?').get(sourceUrl)
}

export function getPostById(id) {
  return db.prepare('SELECT * FROM posts WHERE id = ?').get(id)
}
