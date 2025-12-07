import { createSimpleContext } from "./helper.js"

export interface TuiArgs {
  sessionID?: string
  prompt?: string
}

export const { use: useArgs, provider: ArgsProvider } = createSimpleContext({
  name: "Args",
  init: (props: TuiArgs) => {
    return props
  },
})
