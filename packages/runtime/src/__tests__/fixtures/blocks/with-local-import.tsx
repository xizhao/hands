/** @jsxImportSource react */
import type { BlockFn, BlockMeta } from "@hands/stdlib"
import { formatValue } from "../lib/helpers"

export const meta: BlockMeta = {
  title: "With Local Import",
  description: "A block that imports a local utility",
}

const WithLocalImport: BlockFn<{ value?: number }> = async (props) => {
  const formatted = formatValue(props.value ?? 42)
  return <div>Formatted: {formatted}</div>
}

export default WithLocalImport
