import dotenv from 'dotenv'
dotenv.config()

import { insertPost, postExists } from './db.js'

const HN_TOP_STORIES = 'https://hacker-news.firebaseio.com/v0/topstories.json'
const HN_ITEM        = (id) => `https://hacker-news.firebaseio.com/v0/item/${id}.json`

const SKIP_PREFIXES = ['Ask HN', 'Show HN', 'Tell HN', 'Who is hiring']

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function inferCategory(title) {
  const t = title.toLowerCase()
  if (/fund|raise|venture|investor/.test(t))  return 'Fundraising'
  if (/founder|startup|launch|build/.test(t)) return 'Founders'
  if (/\bai\b|model|tech/.test(t))            return 'Technology'
  return 'Startups'
}

export async function runPipeline() {
  if (!process.env.OPENROUTER_API_KEY) {
    console.log('OPENROUTER_API_KEY is not set. Add it to your .env file on line 1.')
    return 0
  }

  console.log(`[Pipeline] Starting at ${new Date().toISOString()}`)

  const topIds  = await fetch(HN_TOP_STORIES).then(r => r.json())
  const ids     = topIds.slice(0, 20)
  const stories = await Promise.all(ids.map(id => fetch(HN_ITEM(id)).then(r => r.json())))

  const qualifying = stories.filter(story => {
    if (!story.url)                                          return false
    if (story.score < 100)                                   return false
    if (SKIP_PREFIXES.some(p => story.title?.startsWith(p))) return false
    if (postExists(story.url))                               return false
    return true
  })

  if (qualifying.length === 0) {
    console.log('[Pipeline] No new qualifying stories found today')
    return 0
  }

  let newPostCount = 0

  for (const story of qualifying) {
    try {
      const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://sepatuci.com',
          'X-Title': 'SEP Blog Pipeline'
        },
        body: JSON.stringify({
          model: 'tencent/hy3-preview:free',
          messages: [
            {
              role: 'system',
              content: 'You are a blog writer for Sigma Eta Pi (SEP), UCI\'s student-run entrepreneurship fraternity. Your job is to rewrite startup and entrepreneurship news into short engaging blog posts for UCI student entrepreneurs. Write in a clear energetic practical tone like a smart older sibling who has been through the startup world. Keep posts between 250-350 words. Always end with one actionable takeaway for a college student building their first startup. Return only the blog post content with no preamble, no title, and no markdown headers.'
            },
            {
              role: 'user',
              content: `Write a blog post based on this Hacker News story:\n\nTitle: ${story.title}\nSource URL: ${story.url}\nHN Score: ${story.score} upvotes`
            }
          ]
        })
      })

      const data = await response.json()

      if (!data.choices || data.choices.length === 0) {
        console.log(`[Pipeline] Unexpected response for "${story.title}":`, JSON.stringify(data))
        await delay(500)
        continue
      }

      const generatedContent = data.choices[0].message.content

      insertPost({
        title:          story.title,
        content:        generatedContent,
        source_url:     story.url,
        source_name:    'Hacker News',
        generated_date: new Date().toISOString(),
        category:       inferCategory(story.title),
        hn_score:       story.score,
      })

      console.log(`[Pipeline] Saved: "${story.title}" (▲ ${story.score})`)
      newPostCount++
    } catch (err) {
      console.error(`[Pipeline] Error processing "${story.title}": ${err.message}`)
    }

    await delay(500)
  }

  console.log(`[Pipeline] Finished at ${new Date().toISOString()}`)
  return newPostCount
}
