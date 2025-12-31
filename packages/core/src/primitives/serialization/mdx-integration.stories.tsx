/**
 * MDX Integration Tests
 *
 * E2E stories for testing MDX → Plate → Render pipeline.
 * These are used with Playwright to verify deserialization works correctly.
 */

import type { Story } from "@ladle/react";
import { PlateHarnessDebug } from "../../test-utils/plate-harness";

export default {
  title: "Integration/MDX",
};

// ============================================================================
// LiveValue Tests
// ============================================================================

export const LiveValueInline: Story = () => (
  <PlateHarnessDebug mdx={`<LiveValue query="SELECT COUNT(*) FROM users" />`} />
);
LiveValueInline.storyName = "LiveValue - Inline";

export const LiveValueTable: Story = () => (
  <PlateHarnessDebug mdx={`<LiveValue query="SELECT * FROM users" display="table" />`} />
);
LiveValueTable.storyName = "LiveValue - Table";

// ============================================================================
// LiveValue with Chart Children
// ============================================================================

const mockChartData = [
  { status: "Done", count: 42 },
  { status: "In Progress", count: 28 },
  { status: "Pending", count: 15 },
  { status: "Blocked", count: 7 },
];

export const LiveValueWithBarChart: Story = () => (
  <PlateHarnessDebug
    mdx={`<LiveValue query="SELECT status, COUNT(*) as count FROM features GROUP BY status">
  <BarChart title="Features by Status" xKey="status" yKey="count" />
</LiveValue>`}
    mockData={mockChartData}
  />
);
LiveValueWithBarChart.storyName = "LiveValue + BarChart";

const mockLineData = [
  { date: "Jan", revenue: 4000 },
  { date: "Feb", revenue: 3000 },
  { date: "Mar", revenue: 5000 },
  { date: "Apr", revenue: 4500 },
  { date: "May", revenue: 6000 },
];

export const LiveValueWithLineChart: Story = () => (
  <PlateHarnessDebug
    mdx={`<LiveValue query="SELECT date, revenue FROM sales ORDER BY date">
  <LineChart xKey="date" yKey="revenue" />
</LiveValue>`}
    mockData={mockLineData}
  />
);
LiveValueWithLineChart.storyName = "LiveValue + LineChart";

const mockAreaData = [
  { month: "Jan", value: 100 },
  { month: "Feb", value: 150 },
  { month: "Mar", value: 120 },
  { month: "Apr", value: 200 },
  { month: "May", value: 180 },
];

export const LiveValueWithAreaChart: Story = () => (
  <PlateHarnessDebug
    mdx={`<LiveValue query="SELECT month, value FROM metrics">
  <AreaChart xKey="month" yKey="value" fillOpacity={0.5} />
</LiveValue>`}
    mockData={mockAreaData}
  />
);
LiveValueWithAreaChart.storyName = "LiveValue + AreaChart";

const mockPieData = [
  { category: "Electronics", amount: 400 },
  { category: "Clothing", amount: 300 },
  { category: "Food", amount: 200 },
  { category: "Other", amount: 100 },
];

export const LiveValueWithPieChart: Story = () => (
  <PlateHarnessDebug
    mdx={`<LiveValue query="SELECT category, amount FROM breakdown">
  <PieChart valueKey="amount" nameKey="category" />
</LiveValue>`}
    mockData={mockPieData}
  />
);
LiveValueWithPieChart.storyName = "LiveValue + PieChart";

// ============================================================================
// Standalone Charts (for comparison)
// ============================================================================

export const StandaloneBarChart: Story = () => (
  <PlateHarnessDebug mdx={`<BarChart xKey="category" yKey="value" height={300} />`} />
);
StandaloneBarChart.storyName = "Standalone BarChart";

// ============================================================================
// Form Components
// ============================================================================

export const LiveActionWithInputs: Story = () => (
  <PlateHarnessDebug
    mdx={`<LiveAction sql="UPDATE users SET name = {{name}}, email = {{email}} WHERE id = 1">
  <Input name="name" placeholder="Enter name">Name</Input>
  <Input name="email" type="email" placeholder="Enter email">Email</Input>
  <Button>Save Changes</Button>
</LiveAction>`}
  />
);
LiveActionWithInputs.storyName = "LiveAction + Inputs";

export const LiveActionWithSelect: Story = () => (
  <PlateHarnessDebug
    mdx={`<LiveAction sql="UPDATE tasks SET status = {{status}} WHERE id = 1">
  <Select name="status" options={[{value: "pending", label: "Pending"}, {value: "done", label: "Done"}]}>Status</Select>
  <Button variant="default">Update</Button>
</LiveAction>`}
  />
);
LiveActionWithSelect.storyName = "LiveAction + Select";

// ============================================================================
// View Components
// ============================================================================

export const MetricComponent: Story = () => (
  <PlateHarnessDebug mdx={`<Metric value={1234} label="Total Users" prefix="+" change={12.5} />`} />
);
MetricComponent.storyName = "Metric";

export const AlertComponent: Story = () => (
  <PlateHarnessDebug
    mdx={`<Alert title="Warning" variant="warning">

Please review before continuing.

</Alert>`}
  />
);
AlertComponent.storyName = "Alert";

export const BadgeComponent: Story = () => (
  <PlateHarnessDebug mdx={`<Badge variant="success">Completed</Badge>`} />
);
BadgeComponent.storyName = "Badge";

export const ProgressComponent: Story = () => (
  <PlateHarnessDebug mdx={`<Progress value={75} max={100} showValue />`} />
);
ProgressComponent.storyName = "Progress";

// ============================================================================
// Complex Nesting
// ============================================================================

export const ComplexNested: Story = () => (
  <PlateHarnessDebug
    mdx={`## Dashboard

<LiveValue query="SELECT COUNT(*) as count FROM users" />

<LiveValue query="SELECT status, COUNT(*) as count FROM tasks GROUP BY status">
  <BarChart xKey="status" yKey="count" height={200} />
</LiveValue>

<LiveAction sql="INSERT INTO tasks (title) VALUES ({{title}})">
  <Input name="title" placeholder="Task title">New Task</Input>
  <Button>Add Task</Button>
</LiveAction>`}
  />
);
ComplexNested.storyName = "Complex Dashboard";

// ============================================================================
// Column Layout Tests
// ============================================================================

export const ColumnsTwoEqual: Story = () => (
  <PlateHarnessDebug
    mdx={`<Columns>
  <Column width="50%">

Left column content

  </Column>
  <Column width="50%">

Right column content

  </Column>
</Columns>`}
  />
);
ColumnsTwoEqual.storyName = "Columns - Two Equal";

export const ColumnsThreeEqual: Story = () => (
  <PlateHarnessDebug
    mdx={`<Columns>
  <Column width="33.333%">

First column

  </Column>
  <Column width="33.333%">

Second column

  </Column>
  <Column width="33.334%">

Third column

  </Column>
</Columns>`}
  />
);
ColumnsThreeEqual.storyName = "Columns - Three Equal";

export const ColumnsUnequal: Story = () => (
  <PlateHarnessDebug
    mdx={`<Columns>
  <Column width="70%">

Wide column with more content

  </Column>
  <Column width="30%">

Narrow

  </Column>
</Columns>`}
  />
);
ColumnsUnequal.storyName = "Columns - Unequal Width";

export const ColumnsWithComponents: Story = () => (
  <PlateHarnessDebug
    mdx={`<Columns>
  <Column width="50%">

<Metric value={1234} label="Users" />

  </Column>
  <Column width="50%">

<Metric value={567} label="Orders" />

  </Column>
</Columns>`}
  />
);
ColumnsWithComponents.storyName = "Columns - With Components";
