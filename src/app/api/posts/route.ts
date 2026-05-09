import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_ANON_KEY!
)

export async function GET() {
  const { data, error } = await supabase
    .from('posts')
    .select('*')
    .order('generated_date', { ascending: false })

  if (error) return Response.json({ error: error.message }, { status: 500 })

  return Response.json(
    (data ?? []).map(row => ({
      ...row,
      source_urls:   JSON.parse(row.source_urls   || '[]'),
      source_titles: JSON.parse(row.source_titles || '[]'),
    }))
  )
}
