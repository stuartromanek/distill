const STORAGE_KEY = 'tidal-playlist:dry-run'

let wizardResetHandler: (() => void) | null = null

export function sleep(ms: number) {
  return new Promise<void>(resolve => setTimeout(resolve, ms))
}

export function useDryRun() {
  const isDryRunAvailable = import.meta.dev
  const dryRunEnabled = useState('dry-run-enabled', () => false)

  if (import.meta.client && isDryRunAvailable) {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (raw === '1') dryRunEnabled.value = true
    } catch {
      /* ignore */
    }
  }

  watch(dryRunEnabled, (enabled) => {
    if (!import.meta.client || !isDryRunAvailable) return
    localStorage.setItem(STORAGE_KEY, enabled ? '1' : '0')
  })

  function registerWizardReset(handler: () => void) {
    wizardResetHandler = handler
    onUnmounted(() => {
      if (wizardResetHandler === handler) {
        wizardResetHandler = null
      }
    })
  }

  function toggleDryRun() {
    if (!isDryRunAvailable) return
    dryRunEnabled.value = !dryRunEnabled.value
    wizardResetHandler?.()
  }

  return {
    isDryRunAvailable,
    dryRunEnabled: readonly(dryRunEnabled),
    toggleDryRun,
    registerWizardReset,
  }
}
