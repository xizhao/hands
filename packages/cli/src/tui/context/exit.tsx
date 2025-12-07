import { useRenderer } from "@opentui/solid"
import { createSimpleContext } from "./helper.js"

function formatError(error: unknown): string | null {
  if (error instanceof Error) {
    return `Error: ${error.message}${error.stack ? "\n" + error.stack : ""}`
  }
  if (typeof error === "string") {
    return error
  }
  return null
}

export const { use: useExit, provider: ExitProvider } = createSimpleContext({
  name: "Exit",
  init: (props: { onExit?: () => Promise<void> }) => {
    const renderer = useRenderer()
    return async (reason?: unknown) => {
      renderer.setTerminalTitle("")
      renderer.destroy()
      await props.onExit?.()
      if (reason) {
        const formatted = formatError(reason)
        if (formatted) {
          process.stderr.write(formatted + "\n")
        }
      }
      process.exit(0)
    }
  },
})
