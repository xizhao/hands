import { createSignal, Show, For, type JSX } from "solid-js"
import { createSimpleContext } from "../context/helper.js"
import { useTheme } from "../context/theme.js"
import { useKeyboard, useTerminalDimensions } from "@opentui/solid"

export const { use: useDialog, provider: DialogProvider } = createSimpleContext({
  name: "Dialog",
  init: () => {
    const [stack, setStack] = createSignal<(() => JSX.Element)[]>([])

    const push = (component: () => JSX.Element) => {
      setStack((prev) => [...prev, component])
    }

    const pop = () => {
      setStack((prev) => prev.slice(0, -1))
    }

    const replace = (component: () => JSX.Element) => {
      setStack([component])
    }

    const clear = () => {
      setStack([])
    }

    return {
      stack,
      push,
      pop,
      replace,
      clear,
      get isOpen() {
        return stack().length > 0
      },
    }
  },
})

export function DialogContainer(props: { children: JSX.Element }): JSX.Element {
  const dialog = useDialog()
  const { theme } = useTheme()
  const dimensions = useTerminalDimensions()

  useKeyboard((evt) => {
    if (evt.name === "escape" && dialog.isOpen) {
      dialog.pop()
    }
  })

  return (
    <>
      {props.children}
      <Show when={dialog.isOpen}>
        <box
          position="absolute"
          top={0}
          left={0}
          width={dimensions().width}
          height={dimensions().height}
          backgroundColor="rgba(0, 0, 0, 0.6)"
          justifyContent="center"
          alignItems="center"
          zIndex={1000}
        >
          <For each={dialog.stack()}>{(Dialog) => <Dialog />}</For>
        </box>
      </Show>
    </>
  )
}

export function DialogBox(props: {
  title?: string
  children: JSX.Element
  width?: number
}): JSX.Element {
  const { theme } = useTheme()

  return (
    <box
      flexDirection="column"
      backgroundColor={theme.backgroundPanel}
      borderStyle="rounded"
      borderColor={theme.border}
      width={props.width || 60}
      maxHeight="80%"
    >
      <Show when={props.title}>
        <box paddingLeft={2} paddingRight={2} paddingTop={1} paddingBottom={1} borderStyle="single" borderColor={theme.border}>
          <text fg={theme.text}>{props.title}</text>
        </box>
      </Show>
      <box padding={2} flexDirection="column" flexGrow={1}>
        {props.children}
      </box>
    </box>
  )
}
