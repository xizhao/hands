import { render, useKeyboard, useRenderer, useTerminalDimensions } from "@opentui/solid"
import { RouteProvider, useRoute } from "./context/route.js"
import { Switch, Match, ErrorBoundary, createSignal, createEffect, type JSX } from "solid-js"
import { DialogProvider, DialogContainer } from "./ui/dialog.js"
import { SDKProvider } from "./context/sdk.js"
import { SyncProvider, useSync } from "./context/sync.js"
import { ThemeProvider, useTheme } from "./context/theme.js"
import { ToastProvider } from "./ui/toast.js"
import { ExitProvider, useExit } from "./context/exit.js"
import { ArgsProvider, type TuiArgs } from "./context/args.js"
import { Home } from "./routes/home.js"
import { Session } from "./routes/session.js"

async function getTerminalBackgroundColor(): Promise<"dark" | "light"> {
  if (!process.stdin.isTTY) return "dark"

  return new Promise((resolve) => {
    let timeout: ReturnType<typeof setTimeout>

    const cleanup = () => {
      process.stdin.setRawMode(false)
      process.stdin.removeListener("data", handler)
      clearTimeout(timeout)
    }

    const handler = (data: Buffer) => {
      const str = data.toString()
      const match = str.match(/\x1b]11;([^\x07\x1b]+)/)
      if (match) {
        cleanup()
        const color = match[1]
        let r = 0,
          g = 0,
          b = 0

        if (color.startsWith("rgb:")) {
          const parts = color.substring(4).split("/")
          r = parseInt(parts[0], 16) >> 8
          g = parseInt(parts[1], 16) >> 8
          b = parseInt(parts[2], 16) >> 8
        } else if (color.startsWith("#")) {
          r = parseInt(color.substring(1, 3), 16)
          g = parseInt(color.substring(3, 5), 16)
          b = parseInt(color.substring(5, 7), 16)
        }

        const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255
        resolve(luminance > 0.5 ? "light" : "dark")
      }
    }

    process.stdin.setRawMode(true)
    process.stdin.on("data", handler)
    process.stdout.write("\x1b]11;?\x07")

    timeout = setTimeout(() => {
      cleanup()
      resolve("dark")
    }, 1000)
  })
}

export function tui(input: { url: string; args?: TuiArgs; onExit?: () => Promise<void> }): Promise<void> {
  return new Promise<void>(async (resolve) => {
    const mode = await getTerminalBackgroundColor()
    const onExit = async () => {
      await input.onExit?.()
      resolve()
    }

    render(
      () => {
        return (
          <ErrorBoundary fallback={(error, reset) => <ErrorComponent error={error} reset={reset} onExit={onExit} />}>
            <ArgsProvider sessionID={input.args?.sessionID} prompt={input.args?.prompt}>
              <ExitProvider onExit={onExit}>
                <ToastProvider>
                  <RouteProvider>
                    <SDKProvider url={input.url}>
                      <SyncProvider>
                        <ThemeProvider mode={mode}>
                          <DialogProvider>
                            <App />
                          </DialogProvider>
                        </ThemeProvider>
                      </SyncProvider>
                    </SDKProvider>
                  </RouteProvider>
                </ToastProvider>
              </ExitProvider>
            </ArgsProvider>
          </ErrorBoundary>
        )
      },
      {
        targetFps: 60,
        gatherStats: false,
        exitOnCtrlC: false,
        useKittyKeyboard: true,
      }
    )
  })
}

function App(): JSX.Element {
  const route = useRoute()
  const dimensions = useTerminalDimensions()
  const renderer = useRenderer()
  const { theme } = useTheme()
  const exit = useExit()
  const sync = useSync()

  renderer.disableStdoutInterception()

  useKeyboard((evt) => {
    if (evt.ctrl && evt.name === "c") {
      exit()
    }
    if (evt.ctrl && evt.name === "n") {
      route.navigate({ type: "home" })
    }
  })

  // Dynamic terminal title based on route
  createEffect(() => {
    if (route.data.type === "home") {
      renderer.setTerminalTitle("hands")
      return
    }
    if (route.data.type === "session") {
      const session = sync.session.get(route.data.sessionID)
      if (session?.title) {
        const title = session.title.length > 40 ? session.title.slice(0, 37) + "..." : session.title
        renderer.setTerminalTitle(`hands | ${title}`)
      } else {
        renderer.setTerminalTitle("hands")
      }
    }
  })

  return (
    <DialogContainer>
      <box width={dimensions().width} height={dimensions().height} backgroundColor={theme.background}>
        <Switch>
          <Match when={route.data.type === "home"}>
            <Home />
          </Match>
          <Match when={route.data.type === "session"}>
            <Session />
          </Match>
        </Switch>
      </box>
    </DialogContainer>
  )
}

function ErrorComponent(props: {
  error: Error
  reset: () => void
  onExit: () => Promise<void>
}): JSX.Element {
  const term = useTerminalDimensions()

  useKeyboard((evt) => {
    if (evt.ctrl && evt.name === "c") {
      props.onExit()
    }
  })

  const [copied, setCopied] = createSignal(false)

  return (
    <box flexDirection="column" gap={1} padding={2}>
      <box flexDirection="row" gap={1} alignItems="center">
        <text fg="#ef4444">Error occurred in Hands TUI</text>
      </box>
      <box flexDirection="row" gap={2} alignItems="center">
        <box onMouseUp={props.reset} backgroundColor="#334155" padding={1}>
          <text>Reset TUI</text>
        </box>
        <box onMouseUp={() => props.onExit()} backgroundColor="#334155" padding={1}>
          <text>Exit</text>
        </box>
      </box>
      <scrollbox height={Math.floor(term().height * 0.7)}>
        <text>{props.error.stack}</text>
      </scrollbox>
      <text>{props.error.message}</text>
    </box>
  )
}
