import { createSignal, For, Show, type JSX } from "solid-js"
import { createSimpleContext } from "../context/helper.js"
import { useTheme } from "../context/theme.js"

export interface ToastMessage {
  id: string
  title?: string
  message: string
  variant: "info" | "success" | "warning" | "error"
  duration?: number
}

export const { use: useToast, provider: ToastProvider } = createSimpleContext({
  name: "Toast",
  init: () => {
    const [toasts, setToasts] = createSignal<ToastMessage[]>([])

    const show = (opts: Omit<ToastMessage, "id">) => {
      const id = Math.random().toString(36).slice(2)
      const toast: ToastMessage = { ...opts, id }

      setToasts((prev) => [...prev, toast])

      const duration = opts.duration ?? 3000
      if (duration > 0) {
        setTimeout(() => {
          setToasts((prev) => prev.filter((t) => t.id !== id))
        }, duration)
      }
    }

    const dismiss = (id: string) => {
      setToasts((prev) => prev.filter((t) => t.id !== id))
    }

    return {
      toasts,
      show,
      dismiss,
      error: (e: unknown) => {
        const message = e instanceof Error ? e.message : String(e)
        show({ message, variant: "error" })
      },
    }
  },
})

export function Toast(): JSX.Element {
  const { toasts } = useToast()
  const { theme } = useTheme()

  const getColor = (variant: ToastMessage["variant"]) => {
    switch (variant) {
      case "success":
        return theme.success
      case "warning":
        return theme.warning
      case "error":
        return theme.error
      default:
        return theme.info
    }
  }

  return (
    <box position="absolute" top={1} right={2} flexDirection="column" gap={1} zIndex={9999}>
      <For each={toasts()}>
        {(toast) => (
          <box
            backgroundColor={theme.backgroundPanel}
            borderStyle="rounded"
            borderColor={getColor(toast.variant)}
            paddingLeft={2}
            paddingRight={2}
            paddingTop={1}
            paddingBottom={1}
            maxWidth={60}
          >
            <box flexDirection="column">
              <Show when={toast.title}>
                <text fg={getColor(toast.variant)}>{toast.title}</text>
              </Show>
              <text fg={theme.text}>{toast.message}</text>
            </box>
          </box>
        )}
      </For>
    </box>
  )
}
