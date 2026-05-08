const MAX_POSTS_PER_RUN = 3

import dotenv from 'dotenv'
dotenv.config()

import { insertPost, postExists } from './db.js'

const HN_TOP_STORIES = 'https://hacker-news.firebaseio.com/v0/topstories.json'
const HN_ITEM        = (id) => `https://hacker-news.firebaseio.com/v0/item/${id}.json`

const SKIP_PREFIXES = ['Ask HN', 'Show HN', 'Tell HN', 'Who is hiring']

const TECH_KEYWORDS = /startup|founder|venture|funding|raise|product|launch|build|tech|\bai\b|software|engineer|developer|saas|growth|investor|company|entrepreneurship|hire|scale|revenue|market/i

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function inferCategory(titles) {
  const combined = titles.join(' ').toLowerCase()
  if (/fund|raise|venture|investor/.test(combined)) return 'Fundraising'
  if (/founder|startup|launch|build/.test(combined)) return 'Founders'
  if (/\bai\b|model|tech|software/.test(combined))   return 'Technology'
  return 'Startups'
}

function getTopicGroups(title) {
  const t = title.toLowerCase()
  const groups = []
  if (/\bai\b|machine.?learning|llm|gpt|model|claude|gemini|openai/.test(t)) groups.push('AI')
  if (/fund|raise|venture|investor|seed|series|valuation/.test(t))            groups.push('Fundraising')
  if (/hire|hiring|talent|team|employee|layoff/.test(t))                       groups.push('Hiring')
  if (/product|launch|ship|build|release|v\d|update/.test(t))                 groups.push('Product')
  if (/growth|revenue|mrr|arr|scale|profit|acquisition/.test(t))              groups.push('Growth')
  if (/founder|startup|company|entrepreneur/.test(t))                          groups.push('Founders')
  if (/software|engineer|developer|code|open.?source/.test(t))                groups.push('Engineering')
  return groups.length ? groups : ['General']
}

function clusterStories(stories) {
  const clusters = []
  const used     = new Set()

  for (const story of stories) {
    if (used.has(story.id)) continue
    const groups  = getTopicGroups(story.title)
    const cluster = [story]
    used.add(story.id)

    for (const other of stories) {
      if (used.has(other.id) || cluster.length >= 5) continue
      const otherGroups = getTopicGroups(other.title)
      if (groups.some(g => otherGroups.includes(g))) {
        cluster.push(other)
        used.add(other.id)
      }
    }

    clusters.push(cluster)
  }

  return clusters
}

export async function runPipeline() {
  if (!process.env.OPENROUTER_API_KEY) {
    console.log('OPENROUTER_API_KEY is not set. Add it to your .env file on line 1.')
    return 0
  }

  console.log(`[Pipeline] Starting at ${new Date().toISOString()}`)

  // Fetch top 50 story IDs
  const topIds  = await fetch(HN_TOP_STORIES).then(r => r.json())
  const ids     = topIds.slice(0, 50)
  const stories = await Promise.all(ids.map(id => fetch(HN_ITEM(id)).then(r => r.json())))

  // Filter: score, URL, prefix, keyword relevance
  const qualifying = stories.filter(story => {
    if (!story.url || !story.title)                                  return false
    if (story.score < 100)                                           return false
    if (SKIP_PREFIXES.some(p => story.title.startsWith(p)))          return false
    if (!TECH_KEYWORDS.test(story.title))                            return false
    return true
  })

  if (qualifying.length === 0) {
    console.log('[Pipeline] No new qualifying stories found today')
    return 0
  }

  // Cluster by topic, skip clusters already processed
  const allClusters = clusterStories(qualifying)
  const newClusters = allClusters.filter(cluster => {
    const hash = cluster.map(s => s.id).sort().join(',')
    return !postExists(hash)
  })

  if (newClusters.length === 0) {
    console.log('[Pipeline] No new qualifying stories found today')
    return 0
  }

  const clustersToProcess = newClusters.slice(0, MAX_POSTS_PER_RUN)
  let newPostCount = 0

  for (const cluster of clustersToProcess) {
    const clusterHash = cluster.map(s => s.id).sort().join(',')
    const avgScore    = Math.round(cluster.reduce((sum, s) => sum + s.score, 0) / cluster.length)
    const titles      = cluster.map(s => s.title)
    const urls        = cluster.map(s => s.url)

    try {
      const prompt = `You are a blog writer for Sigma Eta Pi (SEP), UCI's student-run entrepreneurship fraternity. Based on the following related Hacker News stories, write an original long-form blog post on the unified theme they represent. This must be your own original article — not a summary of any single source. Write at least 5 full paragraphs. Cover the topic in depth with insight, nuance, and practical advice for a UCI student entrepreneur. Write in a clear energetic tone like a smart older sibling who has been through the startup world. The post must be strictly about entrepreneurship or the tech startup space — do not write about anything outside these topics. End with a concrete actionable section titled "What This Means For You" with 2–3 takeaways for a college student building their first startup. Return only the blog post content with no preamble and no markdown headers except for the final "What This Means For You" section header.

Related stories:
${cluster.map(s => `- ${s.title} (${s.score} upvotes)`).join('\n')}`

      const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
          'Content-Type':  'application/json',
          'HTTP-Referer':  'https://sepatuci.com',
          'X-Title':       'SEP Blog Pipeline',
        },
        body: JSON.stringify({
          model: 'tencent/hy3-preview:free',
          messages: [{ role: 'user', content: prompt }],
        }),
      })

      const data = await response.json()

      if (!data.choices || data.choices.length === 0) {
        console.log(`[Pipeline] Unexpected response for cluster "${titles[0]}...":`, JSON.stringify(data))
        await delay(500)
        continue
      }

      const generatedContent = data.choices[0].message.content

      // Derive a title from the shared theme — use the highest-scoring story's title
      const topStory = cluster.reduce((best, s) => s.score > best.score ? s : best)

      insertPost({
        title:          topStory.title,
        content:        generatedContent,
        cluster_hash:   clusterHash,
        source_titles:  JSON.stringify(titles),
        source_urls:    JSON.stringify(urls),
        source_name:    'Hacker News',
        generated_date: new Date().toISOString(),
        category:       inferCategory(titles),
        hn_score:       avgScore,
      })

      console.log(`[Pipeline] Saved cluster: "${topStory.title}" + ${cluster.length - 1} more (avg ▲ ${avgScore})`)
      newPostCount++
    } catch (err) {
      console.error(`[Pipeline] Error processing cluster "${titles[0]}": ${err.message}`)
    }

    await delay(500)
  }

  console.log(`[Pipeline] Finished at ${new Date().toISOString()}`)
  return newPostCount
}
