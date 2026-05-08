import Database from 'better-sqlite3'
const db = new Database('./server/posts.db')
db.prepare('DELETE FROM posts').run()
console.log('All generated blog posts cleared.')
db.close()
