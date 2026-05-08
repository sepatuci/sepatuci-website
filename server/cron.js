import dotenv from 'dotenv'
dotenv.config()

import cron from 'node-cron'
import { runPipeline } from './pipeline.js'

;(async () => {
  console.log(`[Cron] Initial run starting at ${new Date().toISOString()}`)
  try {
    const count = await runPipeline()
    console.log(`[Cron] Initial run complete — ${count} new post(s) generated`)
  } catch (err) {
    console.error('[Cron] Initial run failed:', err.message)
  }
})()

cron.schedule('0 8 * * *', async () => {
  console.log(`[Cron] Scheduled run starting at ${new Date().toISOString()}`)
  try {
    const count = await runPipeline()
    console.log(`[Cron] Scheduled run complete — ${count} new post(s) generated`)
  } catch (err) {
    console.error('[Cron] Scheduled run failed:', err.message)
  }
})

console.log('[Cron] Scheduler active — pipeline runs daily at 8 am')
