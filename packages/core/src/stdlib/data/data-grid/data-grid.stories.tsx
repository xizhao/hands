import type { Story } from "@ladle/react";
import { DataGrid } from "./data-grid";
import { LiveValueProvider } from "../../view/charts/context";

export default {
  title: "Data/DataGrid",
};

const sampleData = [
  { id: 1, name: "Alice Johnson", email: "alice@example.com", role: "Admin", active: true },
  { id: 2, name: "Bob Smith", email: "bob@example.com", role: "User", active: true },
  { id: 3, name: "Charlie Brown", email: "charlie@example.com", role: "User", active: false },
  { id: 4, name: "Diana Ross", email: "diana@example.com", role: "Editor", active: true },
  { id: 5, name: "Eve Wilson", email: "eve@example.com", role: "User", active: true },
];

const largeData = Array.from({ length: 100 }, (_, i) => ({
  id: i + 1,
  name: `User ${i + 1}`,
  email: `user${i + 1}@example.com`,
  department: ["Engineering", "Sales", "Marketing", "Support"][i % 4],
  salary: 50000 + Math.floor(Math.random() * 50000),
  startDate: new Date(2020 + (i % 5), i % 12, (i % 28) + 1).toISOString().split("T")[0],
}));

export const Default: Story = () => (
  <DataGrid data={sampleData} height={300} />
);

export const LargeDataset: Story = () => (
  <DataGrid data={largeData} height={400} enableSearch />
);

export const CustomColumns: Story = () => (
  <DataGrid
    data={sampleData}
    columns={[
      { key: "name", label: "Full Name", width: 200 },
      { key: "email", label: "Email Address", type: "url" },
      { key: "role", label: "Role" },
      { key: "active", label: "Active", type: "checkbox" },
    ]}
    height={300}
  />
);

export const ReadOnly: Story = () => (
  <DataGrid data={sampleData} height={300} readOnly />
);

export const WithContext: Story = () => (
  <LiveValueProvider data={sampleData} isLoading={false} error={null}>
    <DataGrid height={300} />
  </LiveValueProvider>
);

export const Loading: Story = () => (
  <LiveValueProvider data={[]} isLoading={true} error={null}>
    <DataGrid height={300} />
  </LiveValueProvider>
);

const queryError = new Error("Failed to load data");

export const ErrorState: Story = () => (
  <LiveValueProvider data={[]} isLoading={false} error={queryError}>
    <DataGrid height={300} />
  </LiveValueProvider>
);

export const Empty: Story = () => <DataGrid data={[]} height={300} />;

export const WithSearch: Story = () => (
  <DataGrid data={largeData} height={400} enableSearch />
);

export const NoPaste: Story = () => (
  <DataGrid data={sampleData} height={300} enablePaste={false} />
);
