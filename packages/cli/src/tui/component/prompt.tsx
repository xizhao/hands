import { createSignal, createEffect, onMount, Show, type JSX } from "solid-js"
import { useTheme } from "../context/theme.js"
import { TextAttributes, type TextareaRenderable, type KeyBinding, type KeyEvent } from "@opentui/core"
import { LeftBorderWithCorner } from "./border.js"

export interface PromptRef {
  focus: () => void
  blur: () => void
  get: () => string
  set: (value: string) => void
  submit: () => void
}

export interface PromptProps {
  ref?: (ref: PromptRef) => void
  placeholder?: string
  hint?: JSX.Element
  onSubmit?: (value: string) => void
  disabled?: boolean
  borderColor?: string
}

const keyBindings: KeyBinding[] = [
  { name: "return", action: "submit" },
  { name: "return", ctrl: true, action: "submit" },
  { name: "return", meta: true, action: "newline" },
]

export function Prompt(props: PromptProps): JSX.Element {
  const { theme } = useTheme()
  let input: TextareaRenderable
  const [focused, setFocused] = createSignal(true)

  const submit = () => {
    if (props.disabled) return
    const v = input?.plainText?.trim()
    if (v && props.onSubmit) {
      props.onSubmit(v)
      input.clear()
    }
  }

  const ref: PromptRef = {
    focus: () => {
      setFocused(true)
      input?.focus()
    },
    blur: () => {
      setFocused(false)
      input?.blur()
    },
    get: () => input?.plainText || "",
    set: (v: string) => {
      input?.setText(v)
    },
    submit,
  }

  onMount(() => {
    props.ref?.(ref)
    input?.focus()
  })

  createEffect(() => {
    if (input) {
      input.cursorColor = props.disabled ? theme.backgroundElement : theme.primary
    }
  })

  const borderColor = () => props.borderColor || (focused() ? theme.primary : theme.border)

  const onKeyDown = (e: KeyEvent) => {
    if (props.disabled) {
      e.preventDefault()
    }
  }

  return (
    <box flexDirection="column" width="100%">
      <box
        border={["left"]}
        customBorderChars={LeftBorderWithCorner}
        borderColor={borderColor()}
        backgroundColor={theme.backgroundElement}
        paddingLeft={2}
        paddingRight={1}
        paddingTop={1}
        paddingBottom={1}
        flexDirection="column"
        gap={1}
      >
        <textarea
          ref={(r: TextareaRenderable) => {
            input = r
            setFocused(r.focused)
          }}
          placeholder={props.placeholder || "What do you want to build?"}
          textColor={theme.text}
          cursorColor={props.disabled ? theme.backgroundElement : theme.primary}
          minHeight={1}
          maxHeight={6}
          keyBindings={keyBindings}
          onSubmit={submit}
          onKeyDown={onKeyDown}
        />
        <box flexDirection="row" justifyContent="space-between">
          <box flexDirection="row" gap={1}>
            <text fg={theme.primary} attributes={TextAttributes.BOLD}>
              hands
            </text>
          </box>
          <text fg={theme.textSubtle}>enter to send</text>
        </box>
      </box>
      <Show when={props.hint}>
        <box paddingTop={1} paddingLeft={2}>
          {props.hint}
        </box>
      </Show>
    </box>
  )
}
