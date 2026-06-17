import { getParseLog } from '../../utils/parse-log'

/** Dev-only: recent LLM parse debug snapshots for DevRequestHud. */
export default defineEventHandler(() => {
  if (process.env.NODE_ENV === 'production') {
    throw createError({ statusCode: 404 })
  }

  return getParseLog()
})
