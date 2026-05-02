export type ToastAction = {
  label: string
  onClick: () => void
}

export type Toast = {
  id: string
  title?: string
  message: string
  actions?: ToastAction[]
  dismissible?: boolean
}

type Listener = () => void

function createToastStore() {
  let toasts: Toast[] = []
  const listeners = new Set<Listener>()

  const emit = () => {
    for (const l of listeners) l()
  }

  const show = (input: Omit<Toast, 'id'> & { id?: string }): string => {
    const id = input.id ?? `t_${Date.now()}_${Math.random().toString(16).slice(2)}`
    const toast: Toast = { id, title: input.title, message: input.message, actions: input.actions, dismissible: input.dismissible }
    toasts = [...toasts, toast]
    emit()
    return id
  }

  const dismiss = (id: string): void => {
    const before = toasts.length
    toasts = toasts.filter((t) => t.id !== id)
    if (toasts.length !== before) emit()
  }

  const clear = (): void => {
    if (toasts.length === 0) return
    toasts = []
    emit()
  }

  const getSnapshot = (): Toast[] => toasts

  const subscribe = (listener: Listener): (() => void) => {
    listeners.add(listener)
    return () => listeners.delete(listener)
  }

  return { show, dismiss, clear, getSnapshot, subscribe }
}

export const toastStore = createToastStore()
export type ToastStore = ReturnType<typeof createToastStore>

