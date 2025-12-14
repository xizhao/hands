/**
 * Demo Table Block
 *
 * Sample data table for testing the editor sandbox.
 */
import { Card, CardContent, CardHeader, CardTitle, DataTable, Badge } from "@hands/stdlib";

interface Order {
  id: string;
  customer: string;
  amount: string;
  status: "completed" | "pending" | "cancelled";
  [key: string]: unknown;
}

const orders: Order[] = [
  { id: "ORD-001", customer: "Alice Johnson", amount: "$234.50", status: "completed" },
  { id: "ORD-002", customer: "Bob Smith", amount: "$89.00", status: "pending" },
  { id: "ORD-003", customer: "Carol White", amount: "$512.75", status: "completed" },
  { id: "ORD-004", customer: "David Brown", amount: "$67.20", status: "cancelled" },
  { id: "ORD-005", customer: "Eve Davis", amount: "$199.99", status: "pending" },
];

const statusVariant = {
  completed: "default",
  pending: "secondary",
  cancelled: "destructive",
} as const;

export default function DemoTable() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Recent Orders</CardTitle>
      </CardHeader>
      <CardContent>
        <DataTable
          data={orders}
          columns={[
            { key: "id", header: "Order ID" },
            { key: "customer", header: "Customer" },
            { key: "amount", header: "Amount", align: "right" },
            {
              key: "status",
              header: "Status",
              render: (value) => (
                <Badge variant={statusVariant[value as keyof typeof statusVariant]}>
                  {String(value)}
                </Badge>
              ),
            },
          ]}
        />
      </CardContent>
    </Card>
  );
}
