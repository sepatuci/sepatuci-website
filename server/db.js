import pg from 'pg'
import dotenv from 'dotenv'
dotenv.config()

const { Pool } = pg
const pool = new Pool({ connectionString: process.env.DATABASE_URL })

export async function insertPost(post) {
  const { title, content, source_urls, source_titles, source_name, generated_date, category, hn_score, cluster_hash } = post
  await pool.query(
    `INSERT INTO posts (title, content, source_urls, source_titles, source_name, generated_date, category, hn_score, cluster_hash)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     ON CONFLICT (cluster_hash) DO NOTHING`,
    [title, content, JSON.stringify(source_urls), JSON.stringify(source_titles), source_name, generated_date, category, hn_score, cluster_hash]
  )
}

export async function getAllPosts() {
  const result = await pool.query('SELECT * FROM posts ORDER BY generated_date DESC')
  return result.rows.map(row => ({
    ...row,
    source_urls:   JSON.parse(row.source_urls   || '[]'),
    source_titles: JSON.parse(row.source_titles || '[]'),
  }))
}

export async function getPostById(id) {
  const result = await pool.query('SELECT * FROM posts WHERE id = $1', [id])
  if (!result.rows[0]) return null
  return {
    ...result.rows[0],
    source_urls:   JSON.parse(result.rows[0].source_urls   || '[]'),
    source_titles: JSON.parse(result.rows[0].source_titles || '[]'),
  }
}

export async function postExists(clusterHash) {
  const result = await pool.query('SELECT 1 FROM posts WHERE cluster_hash = $1', [clusterHash])
  return result.rows.length > 0
}
