import type { Story } from "@ladle/react";
import { Alert } from "./alert";

export default {
  title: "Static/Alert",
};

export const Default: Story = () => <Alert>This is an informational message.</Alert>;

export const WithTitle: Story = () => (
  <Alert title="Heads up!">This is an informational message with a title.</Alert>
);

export const Variants: Story = () => (
  <div className="flex flex-col gap-4 max-w-md">
    <Alert title="Info">This is a default informational alert.</Alert>
    <Alert variant="success" title="Success!">
      Your changes have been saved successfully.
    </Alert>
    <Alert variant="warning" title="Warning">
      Please review your input before continuing.
    </Alert>
    <Alert variant="destructive" title="Error">
      Something went wrong. Please try again.
    </Alert>
  </div>
);

export const WithoutTitle: Story = () => (
  <div className="flex flex-col gap-4 max-w-md">
    <Alert>A simple informational message.</Alert>
    <Alert variant="success">Operation completed successfully.</Alert>
    <Alert variant="warning">This action cannot be undone.</Alert>
    <Alert variant="destructive">Failed to save changes.</Alert>
  </div>
);
