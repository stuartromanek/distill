import { clearParseLog } from '../../utils/parse-log'

/** Dev-only: clear parse debug log. */
export default defineEventHandler(() => {
  if (process.env.NODE_ENV === 'production') {
    throw createError({ statusCode: 404 })
  }

  clearParseLog()
  return { ok: true }
})
