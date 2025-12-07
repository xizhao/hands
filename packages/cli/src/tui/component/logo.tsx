import { TextAttributes } from "@opentui/core"
import { For, type JSX } from "solid-js"
import { useTheme } from "../context/theme.js"

const LOGO_LINES = [
  "╻ ╻┏━┓┏┓╻╺┳┓┏━┓",
  "┣━┫┣━┫┃┗┫ ┃┃┗━┓",
  "╹ ╹╹ ╹╹ ╹╺┻┛┗━┛",
]

const TAGLINE = "Data Apps Made Simple"

export function Logo(): JSX.Element {
  const { theme } = useTheme()

  return (
    <box flexDirection="column" alignItems="center" gap={1}>
      <box flexDirection="column">
        <For each={LOGO_LINES}>
          {(line) => (
            <text fg={theme.primary} attributes={TextAttributes.BOLD}>
              {line}
            </text>
          )}
        </For>
      </box>
      <text fg={theme.textMuted}>{TAGLINE}</text>
    </box>
  )
}

export function LogoCompact(): JSX.Element {
  const { theme } = useTheme()

  return (
    <box flexDirection="row" gap={1}>
      <text fg={theme.primary} attributes={TextAttributes.BOLD}>
        hands
      </text>
    </box>
  )
}
