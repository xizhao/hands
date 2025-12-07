import { createMemo, For, Show, type JSX } from "solid-js"
import { TextAttributes } from "@opentui/core"
import { useTerminalDimensions } from "@opentui/solid"
import { useTheme } from "../context/theme.js"
import { useSync } from "../context/sync.js"
import { useRouteData } from "../context/route.js"
import { useSDK } from "../context/sdk.js"
import { Prompt } from "../component/prompt.js"
import { Toast } from "../ui/toast.js"
import { LeftBorder } from "../component/border.js"
import type { Message, Part } from "@opencode-ai/sdk"

export function Session(): JSX.Element {
  const route = useRouteData("session")
  const { theme } = useTheme()
  const sync = useSync()
  const sdk = useSDK()
  const dimensions = useTerminalDimensions()

  const session = createMemo(() => sync.session.get(route.sessionID))
  const messages = createMemo(() => sync.message.get(route.sessionID))
  const status = createMemo(() => sync.data.session_status[route.sessionID])
  const todos = createMemo(() => sync.data.todo[route.sessionID] || [])

  const isRunning = createMemo(() => {
    const s = status()
    return s?.type === "busy" || s?.type === "retry"
  })

  const onSubmit = async (input: string) => {
    try {
      await sdk.client.session.prompt({
        path: { id: route.sessionID },
        body: {
          parts: [{ type: "text", text: input }],
        },
      })
    } catch (e) {
      console.error("Failed to send message:", e)
    }
  }

  return (
    <box flexDirection="column" height="100%" width="100%">
      <box
        paddingLeft={2}
        paddingRight={2}
        paddingTop={1}
        paddingBottom={1}
        flexDirection="row"
        gap={2}
        border={["left"]}
        customBorderChars={LeftBorder}
        borderColor={theme.border}
        backgroundColor={theme.backgroundPanel}
        flexShrink={0}
      >
        <text fg={theme.primary} attributes={TextAttributes.BOLD}>
          hands
        </text>
        <text fg={theme.textSubtle}>│</text>
        <box flexGrow={1}>
          <text fg={theme.text}>{session()?.title || "New Session"}</text>
        </box>
        <Show when={isRunning()}>
          <text fg={theme.warning}>● running</text>
        </Show>
        <text fg={theme.textSubtle}>ctrl+n new</text>
      </box>

      <box flexDirection="row" flexGrow={1} overflow="hidden">
        <box flexDirection="column" flexGrow={1} paddingLeft={2} paddingRight={2} paddingTop={1} overflow="hidden">
          <scrollbox flexGrow={1}>
            <box flexDirection="column" gap={1}>
              <For each={messages()}>{(message) => <MessageDisplay message={message} />}</For>
              <Show when={messages().length === 0}>
                <box justifyContent="center" alignItems="center" flexGrow={1} paddingTop={2}>
                  <text fg={theme.textMuted}>Start typing to begin...</text>
                </box>
              </Show>
            </box>
          </scrollbox>

          <box paddingTop={1} paddingBottom={1} flexShrink={0}>
            <Prompt
              onSubmit={onSubmit}
              disabled={isRunning()}
              placeholder={isRunning() ? "Thinking..." : undefined}
              borderColor={isRunning() ? theme.warning : undefined}
            />
          </box>
        </box>

        <Show when={dimensions().width > 100}>
          <box
            width={36}
            border={["left"]}
            customBorderChars={LeftBorder}
            borderColor={theme.border}
            paddingLeft={2}
            paddingRight={2}
            paddingTop={1}
            paddingBottom={1}
            flexDirection="column"
            gap={2}
            flexShrink={0}
          >
            <box flexDirection="column" gap={1}>
              <text fg={theme.textMuted} attributes={TextAttributes.BOLD}>
                Status
              </text>
              <box flexDirection="row" gap={1}>
                <text fg={isRunning() ? theme.warning : theme.success}>●</text>
                <text fg={theme.text}>{status()?.type || "idle"}</text>
              </box>
            </box>

            <Show when={todos().length > 0}>
              <box flexDirection="column" gap={1}>
                <text fg={theme.textMuted} attributes={TextAttributes.BOLD}>
                  Tasks
                </text>
                <For each={todos().slice(0, 8)}>
                  {(todo) => (
                    <box flexDirection="row" gap={1}>
                      <text fg={todo.status === "completed" ? theme.success : todo.status === "in_progress" ? theme.warning : theme.textSubtle}>
                        {todo.status === "completed" ? "✓" : todo.status === "in_progress" ? "●" : "○"}
                      </text>
                      <text
                        fg={todo.status === "completed" ? theme.textSubtle : theme.text}
                      >
                        {todo.content.length > 25 ? todo.content.slice(0, 22) + "..." : todo.content}
                      </text>
                    </box>
                  )}
                </For>
                <Show when={todos().length > 8}>
                  <text fg={theme.textSubtle}>+{todos().length - 8} more</text>
                </Show>
              </box>
            </Show>

            <box flexDirection="column" gap={1}>
              <text fg={theme.textMuted} attributes={TextAttributes.BOLD}>
                Session
              </text>
              <text fg={theme.textSubtle}>{route.sessionID.slice(0, 8)}...</text>
            </box>
          </box>
        </Show>
      </box>

      <Toast />
    </box>
  )
}

function MessageDisplay(props: { message: Message }): JSX.Element {
  const { theme } = useTheme()
  const sync = useSync()

  const parts = createMemo(() => sync.part.get(props.message.id))
  const isUser = () => props.message.role === "user"
  const borderColor = () => isUser() ? theme.user : theme.agent

  return (
    <box
      flexDirection="column"
      border={["left"]}
      customBorderChars={LeftBorder}
      borderColor={borderColor()}
      paddingLeft={2}
      gap={1}
    >
      <text fg={borderColor()} attributes={TextAttributes.BOLD}>
        {isUser() ? "You" : "Hands"}
      </text>

      <box flexDirection="column" gap={1}>
        <For each={parts()}>{(part) => <PartDisplay part={part} />}</For>
        <Show when={parts().length === 0 && isUser()}>
          <text fg={theme.textMuted}>...</text>
        </Show>
      </box>
    </box>
  )
}

function PartDisplay(props: { part: Part }): JSX.Element {
  const { theme } = useTheme()

  return (
    <Show
      when={props.part.type === "text"}
      fallback={
        <Show when={props.part.type === "tool"}>
          <box
            border={["left"]}
            customBorderChars={LeftBorder}
            borderColor={theme.borderSubtle}
            paddingLeft={2}
          >
            <text fg={theme.textMuted}>
              {(props.part as { tool?: string }).tool || "tool"}
            </text>
          </box>
        </Show>
      }
    >
      <text fg={theme.text}>{(props.part as { text?: string }).text || ""}</text>
    </Show>
  )
}
