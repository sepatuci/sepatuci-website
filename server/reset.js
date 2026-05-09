import pg from 'pg'
import dotenv from 'dotenv'
dotenv.config()

const { Pool } = pg
const pool = new Pool({ connectionString: process.env.DATABASE_URL })
await pool.query('DELETE FROM posts')
console.log('All generated blog posts cleared.')
await pool.end()
