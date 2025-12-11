/** @jsxImportSource react */
import type { BlockFn, BlockMeta } from "@hands/stdlib"

export const meta: BlockMeta = {
  title: "Bar Chart",
  description: "A bar chart in a subfolder",
}

const BarChart: BlockFn<{ data?: string }> = async (props) => {
  return <div>Bar Chart: {props.data || "no data"}</div>
}

export default BarChart
