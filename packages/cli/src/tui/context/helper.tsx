import { createContext, Show, useContext, type ParentProps, type JSX } from "solid-js"

export function createSimpleContext<T, Props extends Record<string, unknown>>(input: {
  name: string
  init: ((input: Props) => T) | (() => T)
}) {
  const ctx = createContext<T>()

  return {
    provider: (props: ParentProps<Props>): JSX.Element => {
      const init = input.init(props as Props)
      return (
        <Show when={(init as { ready?: boolean }).ready === undefined || (init as { ready?: boolean }).ready === true}>
          <ctx.Provider value={init}>{props.children}</ctx.Provider>
        </Show>
      )
    },
    use() {
      const value = useContext(ctx)
      if (!value) throw new Error(`${input.name} context must be used within a context provider`)
      return value
    },
  }
}
