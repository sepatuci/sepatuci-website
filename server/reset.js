import dotenv from 'dotenv'
dotenv.config()

import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
)

const { error } = await supabase.from('posts').delete().neq('id', 0)
if (error) { console.error('Error:', error.message); process.exit(1) }
console.log('All generated blog posts cleared.')
