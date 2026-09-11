type ToastVariant = 'info' | 'error'

export type AppToast = {
  id: string
  message: string
  variant: ToastVariant
  href?: string
  linkLabel?: string
}

export type ShowToastOptions = {
  href?: string
  linkLabel?: string
}

export function useToast() {
  const toasts = useState<AppToast[]>('app-toasts', () => [])

  function dismissToast(id: string) {
    toasts.value = toasts.value.filter(toast => toast.id !== id)
  }

  function showToast(
    message: string,
    variant: ToastVariant = 'info',
    options: ShowToastOptions = {},
  ) {
    const id = crypto.randomUUID()
    toasts.value = [...toasts.value, {
      id,
      message,
      variant,
      href: options.href,
      linkLabel: options.linkLabel,
    }]

    if (import.meta.client) {
      window.setTimeout(() => dismissToast(id), 4500)
    }
  }

  return {
    toasts,
    showToast,
    dismissToast,
  }
}
