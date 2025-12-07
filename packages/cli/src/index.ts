#!/usr/bin/env bun
import { spawn, type Subprocess } from "bun"
import { tui } from "./tui/index.js"

const DEFAULT_PORT = 4097

async function main() {
  const args = process.argv.slice(2)

  // Parse simple flags
  const portIndex = args.indexOf("--port")
  const port = portIndex !== -1 ? parseInt(args[portIndex + 1]) || DEFAULT_PORT : DEFAULT_PORT
  const continueSession = args.includes("-c") || args.includes("--continue")
  const help = args.includes("--help") || args.includes("-h")
  const version = args.includes("--version") || args.includes("-v")

  if (version) {
    console.log("hands v0.0.1")
    process.exit(0)
  }

  if (help) {
    console.log(`
hands - Data Apps Made Simple

Usage:
  hands [options] [prompt]

Options:
  -c, --continue    Continue the last session
  --port <number>   Port for the server (default: 4097)
  -h, --help        Show this help
  -v, --version     Show version

Examples:
  hands                         Start interactive mode
  hands "create a monitor"      Start with initial prompt
  hands -c                      Continue last session
`)
    process.exit(0)
  }

  // Get initial prompt (anything that's not a flag)
  const prompt = args.find(arg => !arg.startsWith("-") && args.indexOf(arg) !== portIndex + 1)

  const url = `http://localhost:${port}`

  console.log("Starting hands...")

  let serverProcess: Subprocess | null = null

  try {
    // Try to spawn opencode server
    serverProcess = spawn({
      cmd: ["bunx", "opencode-ai", "serve", "--port", String(port)],
      stdout: "pipe",
      stderr: "pipe",
      env: {
        ...process.env,
        HANDS_MODE: "true",
      },
    })

    // Wait for server to start
    await waitForServer(url, 10000)

    console.clear()

    // Launch TUI
    await tui({
      url,
      args: {
        prompt,
        sessionID: continueSession ? "last" : undefined,
      },
      onExit: async () => {
        if (serverProcess) {
          serverProcess.kill()
        }
      },
    })
  } catch (e) {
    // Try fallback: maybe opencode is already running?
    try {
      const res = await fetch(`${url}/health`)
      if (res.ok) {
        console.log("Connected to existing server")
        console.clear()
        await tui({
          url,
          args: {
            prompt,
            sessionID: continueSession ? "last" : undefined,
          },
        })
        return
      }
    } catch {
      // Server not running
    }

    console.error("Failed to start hands:", e)
    console.error("\nMake sure opencode-ai is installed: bun add -g opencode-ai")
    process.exit(1)
  } finally {
    if (serverProcess) {
      serverProcess.kill()
    }
  }
}

async function waitForServer(url: string, timeout: number): Promise<void> {
  const start = Date.now()
  const healthUrl = `${url}/health`

  while (Date.now() - start < timeout) {
    try {
      const res = await fetch(healthUrl)
      if (res.ok) return
    } catch {
      // Server not ready yet
    }
    await new Promise((r) => setTimeout(r, 100))
  }

  throw new Error(`Server did not start within ${timeout}ms`)
}

main()
