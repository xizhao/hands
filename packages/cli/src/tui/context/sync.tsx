import type {
  Message,
  Agent,
  Provider,
  Session,
  Part,
  Config,
  Todo,
  Permission,
  SessionStatus,
  McpStatus,
} from "@opencode-ai/sdk"
import { createStore, produce, reconcile } from "solid-js/store"
import { useSDK } from "./sdk.js"
import { createSimpleContext } from "./helper.js"
import { useExit } from "./exit.js"
import { batch, onMount } from "solid-js"

function binarySearch<T>(arr: T[], target: string, key: (item: T) => string): { found: boolean; index: number } {
  let left = 0
  let right = arr.length - 1

  while (left <= right) {
    const mid = Math.floor((left + right) / 2)
    const midKey = key(arr[mid])
    if (midKey === target) return { found: true, index: mid }
    if (midKey < target) left = mid + 1
    else right = mid - 1
  }

  return { found: false, index: left }
}

interface SyncStore {
  status: "loading" | "partial" | "complete"
  provider: Provider[]
  agent: Agent[]
  command: unknown[]
  permission: { [sessionID: string]: Permission[] }
  config: Config
  session: Session[]
  session_status: { [sessionID: string]: SessionStatus }
  todo: { [sessionID: string]: Todo[] }
  message: { [sessionID: string]: Message[] }
  part: { [messageID: string]: Part[] }
  mcp: { [key: string]: McpStatus }
}

export const { use: useSync, provider: SyncProvider } = createSimpleContext({
  name: "Sync",
  init: () => {
    const [store, setStore] = createStore<SyncStore>({
      config: {},
      status: "loading",
      agent: [],
      permission: {},
      command: [],
      provider: [],
      session: [],
      session_status: {},
      todo: {},
      message: {},
      part: {},
      mcp: {},
    })

    const sdk = useSDK()
    const exit = useExit()

    sdk.event.listen((e) => {
      const event = e.details
      switch (event.type) {
        case "todo.updated":
          setStore("todo", event.properties.sessionID, event.properties.todos)
          break

        case "session.deleted": {
          const result = binarySearch(store.session, event.properties.info.id, (s) => s.id)
          if (result.found) {
            setStore(
              "session",
              produce((draft) => {
                draft.splice(result.index, 1)
              })
            )
          }
          break
        }

        case "session.updated": {
          const result = binarySearch(store.session, event.properties.info.id, (s) => s.id)
          if (result.found) {
            setStore("session", result.index, reconcile(event.properties.info))
            break
          }
          setStore(
            "session",
            produce((draft) => {
              draft.splice(result.index, 0, event.properties.info)
            })
          )
          break
        }

        case "session.status": {
          setStore("session_status", event.properties.sessionID, event.properties.status)
          break
        }

        case "message.updated": {
          const messages = store.message[event.properties.info.sessionID]
          if (!messages) {
            setStore("message", event.properties.info.sessionID, [event.properties.info])
            break
          }
          const result = binarySearch(messages, event.properties.info.id, (m) => m.id)
          if (result.found) {
            setStore("message", event.properties.info.sessionID, result.index, reconcile(event.properties.info))
            break
          }
          setStore(
            "message",
            event.properties.info.sessionID,
            produce((draft) => {
              draft.splice(result.index, 0, event.properties.info)
              if (draft.length > 100) draft.shift()
            })
          )
          break
        }

        case "message.removed": {
          const messages = store.message[event.properties.sessionID]
          if (!messages) break
          const result = binarySearch(messages, event.properties.messageID, (m) => m.id)
          if (result.found) {
            setStore(
              "message",
              event.properties.sessionID,
              produce((draft) => {
                draft.splice(result.index, 1)
              })
            )
          }
          break
        }

        case "message.part.updated": {
          const parts = store.part[event.properties.part.messageID]
          if (!parts) {
            setStore("part", event.properties.part.messageID, [event.properties.part])
            break
          }
          const result = binarySearch(parts, event.properties.part.id, (p) => p.id)
          if (result.found) {
            setStore("part", event.properties.part.messageID, result.index, reconcile(event.properties.part))
            break
          }
          setStore(
            "part",
            event.properties.part.messageID,
            produce((draft) => {
              draft.splice(result.index, 0, event.properties.part)
            })
          )
          break
        }
      }
    })

    const fullSyncedSessions = new Set<string>()

    async function bootstrap() {
      // Phase 1: Blocking - critical data needed to render
      await Promise.all([
        sdk.client.config.get({ throwOnError: true }).then((x) => setStore("config", x.data!)),
      ])
        .then(() => {
          if (store.status !== "complete") setStore("status", "partial")

          // Phase 2: Non-blocking - secondary data loaded in background
          Promise.all([
            sdk.client.session.list().then((x) =>
              setStore(
                "session",
                (x.data ?? []).toSorted((a, b) => a.id.localeCompare(b.id))
              )
            ),
            sdk.client.mcp.status().then((x) => setStore("mcp", x.data!)),
            sdk.client.session.status().then((x) => setStore("session_status", x.data!)),
          ]).then(() => {
            setStore("status", "complete")
          })
        })
        .catch(async (e) => {
          console.error("TUI bootstrap failed:", e)
          await exit(e)
        })
    }

    onMount(() => {
      bootstrap()
    })

    const result = {
      data: store,
      set: setStore,
      get status() {
        return store.status
      },
      get ready() {
        return store.status !== "loading"
      },
      session: {
        get(sessionID: string) {
          const match = binarySearch(store.session, sessionID, (s) => s.id)
          if (match.found) return store.session[match.index]
          return undefined
        },
        status(sessionID: string) {
          const session = result.session.get(sessionID)
          if (!session) return "idle"
          const messages = store.message[sessionID] ?? []
          const last = messages.at(-1)
          if (!last) return "idle"
          if (last.role === "user") return "working"
          return last.time.completed ? "idle" : "working"
        },
        async sync(sessionID: string) {
          if (fullSyncedSessions.has(sessionID)) return
          const [session, messages, todo] = await Promise.all([
            sdk.client.session.get({ path: { id: sessionID }, throwOnError: true }),
            sdk.client.session.messages({ path: { id: sessionID }, query: { limit: 100 } }),
            sdk.client.session.todo({ path: { id: sessionID } }),
          ])
          setStore(
            produce((draft) => {
              const match = binarySearch(draft.session, sessionID, (s) => s.id)
              if (match.found) draft.session[match.index] = session.data!
              if (!match.found) draft.session.splice(match.index, 0, session.data!)
              draft.todo[sessionID] = todo.data ?? []
              draft.message[sessionID] = messages.data!.map((x) => x.info)
              for (const message of messages.data!) {
                draft.part[message.info.id] = message.parts
              }
            })
          )
          fullSyncedSessions.add(sessionID)
        },
      },
      message: {
        get: (sessionID: string) => store.message[sessionID] || [],
      },
      part: {
        get: (messageID: string) => store.part[messageID] || [],
      },
      bootstrap,
    }
    return result
  },
})
