/**
 * Demo Chart Block
 *
 * A sample chart block for testing the editor sandbox.
 */
import { BarChart, Card, CardContent, CardHeader, CardTitle } from "@hands/stdlib";

const salesData = [
  { month: "Jan", revenue: 4200, orders: 120 },
  { month: "Feb", revenue: 3800, orders: 98 },
  { month: "Mar", revenue: 5100, orders: 145 },
  { month: "Apr", revenue: 4600, orders: 132 },
  { month: "May", revenue: 5800, orders: 167 },
  { month: "Jun", revenue: 6200, orders: 189 },
];

export default function DemoChart() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Monthly Revenue</CardTitle>
      </CardHeader>
      <CardContent>
        <BarChart
          data={salesData}
          x="month"
          y="revenue"
          height={300}
          showTooltip
        />
      </CardContent>
    </Card>
  );
}
