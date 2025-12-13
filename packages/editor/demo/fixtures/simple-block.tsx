// Simple block fixture for testing
export const simpleBlockSource = `import type { BlockFn } from '@hands/stdlib'

export default (async (ctx) => (
  <div className="p-4">
    <h1>Hello World</h1>
    <p>This is a simple block with some content.</p>
    <button variant="primary">Click Me</button>
  </div>
)) satisfies BlockFn
`;

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
`;

export const dataBlockSource = `import type { BlockFn } from '@hands/stdlib'

export default (async (ctx) => (
  <div className="space-y-4">
    <MetricCard title="Total Users" value={1234} description="+12% from last month" />
    <MetricCard title="Revenue" value={56789} description="+8% from last month" />
  </div>
)) satisfies BlockFn
`;

// Chart block - uses "use client" components with interactivity
export const chartBlockSource = `import type { BlockFn } from '@hands/stdlib'

export default (async (ctx) => (
  <div className="space-y-6 p-4">
    <h2 className="text-xl font-semibold">Sales Dashboard</h2>

    <div className="grid grid-cols-2 gap-4">
      <Card>
        <CardHeader>
          <CardTitle>Monthly Revenue</CardTitle>
        </CardHeader>
        <CardContent>
          <BarChart
            data={[
              { month: "Jan", revenue: 4000 },
              { month: "Feb", revenue: 3000 },
              { month: "Mar", revenue: 5000 },
              { month: "Apr", revenue: 4500 },
              { month: "May", revenue: 6000 },
              { month: "Jun", revenue: 5500 }
            ]}
            x="month"
            y="revenue"
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>User Growth</CardTitle>
        </CardHeader>
        <CardContent>
          <LineChart
            data={[
              { month: "Jan", users: 100 },
              { month: "Feb", users: 150 },
              { month: "Mar", users: 250 },
              { month: "Apr", users: 400 },
              { month: "May", users: 600 },
              { month: "Jun", users: 900 }
            ]}
            x="month"
            y="users"
          />
        </CardContent>
      </Card>
    </div>

    <div className="grid grid-cols-3 gap-4">
      <MetricCard title="Total Users" value={900} description="+50% growth" />
      <MetricCard title="Revenue" value={28000} description="YTD total" />
      <MetricCard title="Active" value={720} description="80% engagement" />
    </div>
  </div>
)) satisfies BlockFn
`;
