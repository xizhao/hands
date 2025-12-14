/**
 * Demo Line Chart Block
 *
 * Sample line chart for testing the editor sandbox.
 */
import { LineChart, Card, CardContent, CardHeader, CardTitle } from "@hands/stdlib";

const trafficData = [
  { date: "Mon", visitors: 1200, pageViews: 3400 },
  { date: "Tue", visitors: 1400, pageViews: 4100 },
  { date: "Wed", visitors: 1100, pageViews: 2900 },
  { date: "Thu", visitors: 1600, pageViews: 4800 },
  { date: "Fri", visitors: 1800, pageViews: 5200 },
  { date: "Sat", visitors: 900, pageViews: 2100 },
  { date: "Sun", visitors: 700, pageViews: 1800 },
];

export default function DemoLineChart() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Weekly Traffic</CardTitle>
      </CardHeader>
      <CardContent>
        <LineChart
          data={trafficData}
          x="date"
          y={["visitors", "pageViews"]}
          height={250}
          showTooltip
        />
      </CardContent>
    </Card>
  );
}
