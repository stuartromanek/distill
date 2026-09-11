import { getSetupIssues, isSetupReady } from '../../utils/setup-status'

export default defineEventHandler(() => {
  const issues = getSetupIssues()
  return {
    ready: isSetupReady(),
    issues,
  }
})
