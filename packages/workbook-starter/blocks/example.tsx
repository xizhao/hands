/**
 * Example Block
 *
 * Blocks are server-rendered React components that can query the database
 * and render data. They are embedded in pages using MDX syntax:
 *
 * <Block id="example" message="Hello!" />
 */
import type { BlockFn } from "@hands/stdlib"

interface Props {
  /** Message to display */
  message?: string
}

/**
 * Block metadata - displayed in the editor and used for discovery
 */
export const meta = {
  title: "Example Block",
  description: "A simple example block that displays a message",
  refreshable: true,
}

/**
 * The block component
 *
 * This function runs on the server and can:
 * - Query the database with ctx.db
 * - Access secrets with ctx.env
 * - Read URL params with ctx.params
 */
const ExampleBlock: BlockFn<Props> = async (props, ctx) => {
  const { message = "Hello, World!" } = props

  // Example: Query the database
  // const users = await ctx.db`SELECT * FROM users LIMIT 5`;

  return (
    <div className="p-4 border rounded-lg bg-card shadow-sm">
      <div className="flex items-center gap-2 mb-2">
        <div className="w-2 h-2 rounded-full bg-green-500" />
        <h3 className="font-semibold text-lg">Example Block</h3>
      </div>
      <p className="text-muted-foreground">{message}</p>
      <div className="mt-3 text-xs text-muted-foreground">
        Edit this block in <code className="bg-muted px-1 rounded">blocks/example.tsx</code>
      </div>
    </div>
  )
}

export default ExampleBlock
