/** @jsxImportSource react */
import type { BlockFn, BlockMeta } from "@hands/stdlib"

export const meta: BlockMeta = {
  title: "Simple Block",
  description: "A simple test block",
  refreshable: true,
}

const SimpleBlock: BlockFn = async () => {
  return <div>Hello World</div>
}

export default SimpleBlock
