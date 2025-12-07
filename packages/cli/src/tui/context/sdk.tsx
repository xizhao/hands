import { createOpencodeClient, type Event } from "@opencode-ai/sdk"
import { createSimpleContext } from "./helper.js"
import { createGlobalEmitter } from "@solid-primitives/event-bus"
import { batch, onCleanup, onMount } from "solid-js"

export const { use: useSDK, provider: SDKProvider } = createSimpleContext({
  name: "SDK",
  init: (props: { url: string }) => {
    const abort = new AbortController()
    const sdk = createOpencodeClient({
      baseUrl: props.url,
      signal: abort.signal,
    })

    const emitter = createGlobalEmitter<{
      [key in Event["type"]]: Extract<Event, { type: key }>
    }>()

    onMount(async () => {
      while (true) {
        if (abort.signal.aborted) break
        const events = await sdk.event.subscribe({
          signal: abort.signal,
        })
        let queue: Event[] = []
        let timer: ReturnType<typeof setTimeout> | undefined
        let last = 0

        const flush = () => {
          if (queue.length === 0) return
          const eventsToProcess = queue
          queue = []
          timer = undefined
          last = Date.now()
          batch(() => {
            for (const event of eventsToProcess) {
              emitter.emit(event.type, event)
            }
          })
        }

        for await (const event of events.stream) {
          queue.push(event)
          const elapsed = Date.now() - last

          if (timer) continue
          if (elapsed < 16) {
            timer = setTimeout(flush, 16)
            continue
          }
          flush()
        }

        if (timer) clearTimeout(timer)
        if (queue.length > 0) {
          flush()
        }
      }
    })

    onCleanup(() => {
      abort.abort()
    })

    return { client: sdk, event: emitter }
  },
})
