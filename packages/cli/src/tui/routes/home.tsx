import { Prompt } from "../component/prompt.js"
import { createMemo, Match, Show, Switch, type JSX } from "solid-js"
import { useTheme } from "../context/theme.js"
import { Logo } from "../component/logo.js"
import { useSync } from "../context/sync.js"
import { useSDK } from "../context/sdk.js"
import { useRoute } from "../context/route.js"
import { Toast } from "../ui/toast.js"
import { VERSION } from "../version.js"

export function Home(): JSX.Element {
  const sync = useSync()
  const sdk = useSDK()
  const route = useRoute()
  const { theme } = useTheme()

  const mcp = createMemo(() => Object.keys(sync.data.mcp || {}).length > 0)
  const mcpError = createMemo(() => {
    return Object.values(sync.data.mcp || {}).some((x) => x.status === "failed")
  })

  const onSubmit = async (input: string) => {
    try {
      const res = await sdk.client.session.create({
        body: {},
      })
      if (res.data) {
        const sessionID = res.data.id
        route.navigate({ type: "session", sessionID })
        await sdk.client.session.prompt({
          path: { id: sessionID },
          body: {
            parts: [{ type: "text", text: input }],
          },
        })
      }
    } catch (e) {
      console.error("Failed to create session:", e)
    }
  }

  return (
    <>
      <box
        flexGrow={1}
        justifyContent="center"
        alignItems="center"
        paddingLeft={2}
        paddingRight={2}
        gap={1}
        flexDirection="column"
      >
        <Logo />
        <box width="100%" maxWidth={70} zIndex={1000} paddingTop={1}>
          <Prompt onSubmit={onSubmit} />
        </box>
        <Toast />
      </box>
      <box
        paddingTop={1}
        paddingBottom={1}
        paddingLeft={2}
        paddingRight={2}
        flexDirection="row"
        flexShrink={0}
        gap={2}
        borderColor={theme.borderSubtle}
      >
        <text fg={theme.textSubtle}>{process.cwd()}</text>
        <box flexGrow={1} />
        <Show when={mcp()}>
          <box gap={1} flexDirection="row" flexShrink={0}>
            <Switch>
              <Match when={mcpError()}>
                <text fg={theme.error}>●</text>
              </Match>
              <Match when={true}>
                <text fg={theme.success}>●</text>
              </Match>
            </Switch>
            <text fg={theme.textMuted}>{Object.keys(sync.data.mcp || {}).length} MCP</text>
          </box>
        </Show>
        <text fg={theme.textSubtle}>v{VERSION}</text>
      </box>
    </>
  )
}
