import { clearRequestLog, getRequestLog } from '../../utils/request-log'

/** Dev-only: recent upstream Tidal/LLM request log for DevRequestHud. */
export default defineEventHandler(() => {
  if (process.env.NODE_ENV === 'production') {
    throw createError({ statusCode: 404 })
  }

  return getRequestLog()
})
