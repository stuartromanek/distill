import { clearTidalSession } from '../../../utils/session'

export default defineEventHandler((event) => {
  clearTidalSession(event)
  return { ok: true }
})
