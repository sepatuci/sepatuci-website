import express from 'express'
import { getAllPosts, getPostById } from '../server/db.js'

const app  = express()
const PORT = process.env.API_PORT || 3001

app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*')
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept')
  next()
})

// GET /api/posts — all posts, newest first, hn_score included
app.get('/api/posts', (req, res) => {
  try {
    res.json(getAllPosts())
  } catch (err) {
    console.error('[API] getAllPosts error:', err.message)
    res.json([])
  }
})

// GET /api/posts/:id — single post
app.get('/api/posts/:id', (req, res) => {
  try {
    const post = getPostById(parseInt(req.params.id, 10))
    if (!post) return res.status(404).json({ error: 'Post not found' })
    res.json(post)
  } catch (err) {
    console.error('[API] getPostById error:', err.message)
    res.status(500).json({ error: 'Internal server error' })
  }
})

app.listen(PORT, () => {
  console.log(`[API] Posts server listening on port ${PORT}`)
})

export default app
