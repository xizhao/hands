// Simple block fixture for testing
export const simpleBlockSource = `import type { BlockFn } from '@hands/stdlib'

export default (async (ctx) => (
  <div className="p-4">
    <h1>Hello World</h1>
    <p>This is a simple block with some content.</p>
    <button variant="primary">Click Me</button>
  </div>
)) satisfies BlockFn
`

export const cardBlockSource = `import type { BlockFn } from '@hands/stdlib'

export default (async (ctx) => (
  <Card>
    <CardHeader>
      <CardTitle>Welcome</CardTitle>
      <CardDescription>A beautiful card component</CardDescription>
    </CardHeader>
    <CardContent>
      <p>This card demonstrates nested components.</p>
      <Button variant="default">Learn More</Button>
    </CardContent>
  </Card>
)) satisfies BlockFn
`

export const dataBlockSource = `import type { BlockFn } from '@hands/stdlib'

export default (async (ctx) => (
  <div className="space-y-4">
    <MetricCard title="Total Users" value={1234} description="+12% from last month" />
    <MetricCard title="Revenue" value={56789} description="+8% from last month" />
  </div>
)) satisfies BlockFn
`
