import dotenv from 'dotenv'
dotenv.config()

import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
)

export async function insertPost(post) {
  const { title, content, source_urls, source_titles, source_name, generated_date, category, hn_score, cluster_hash } = post
  const { error } = await supabase.from('posts').insert({
    title,
    content,
    source_urls:   JSON.stringify(source_urls),
    source_titles: JSON.stringify(source_titles),
    source_name,
    generated_date,
    category,
    hn_score,
    cluster_hash,
  })
  if (error && error.code !== '23505') throw error // 23505 = unique violation (already exists)
}

export async function getAllPosts() {
  const { data, error } = await supabase
    .from('posts')
    .select('*')
    .order('generated_date', { ascending: false })
  if (error) throw error
  return (data ?? []).map(row => ({
    ...row,
    source_urls:   JSON.parse(row.source_urls   || '[]'),
    source_titles: JSON.parse(row.source_titles || '[]'),
  }))
}

export async function getPostById(id) {
  const { data, error } = await supabase
    .from('posts')
    .select('*')
    .eq('id', id)
    .single()
  if (error) return null
  return {
    ...data,
    source_urls:   JSON.parse(data.source_urls   || '[]'),
    source_titles: JSON.parse(data.source_titles || '[]'),
  }
}

export async function postExists(clusterHash) {
  const { data } = await supabase
    .from('posts')
    .select('id')
    .eq('cluster_hash', clusterHash)
    .single()
  return !!data
}
