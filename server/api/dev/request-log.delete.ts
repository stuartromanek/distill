import { clearRequestLog } from '../../utils/request-log'

/** Dev-only: clear request log buffer. */
export default defineEventHandler(() => {
  if (process.env.NODE_ENV === 'production') {
    throw createError({ statusCode: 404 })
  }

  clearRequestLog()
  return { ok: true }
})
