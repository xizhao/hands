import type { Story } from "@ladle/react";
import { ActionInput } from "./input";

export default {
  title: "Active/Input",
};

export const Default: Story = () => <ActionInput name="email" placeholder="Enter your email" />;

export const WithLabel: Story = () => (
  <ActionInput name="username" label="Username" placeholder="Enter username" />
);

export const Required: Story = () => (
  <ActionInput name="email" label="Email" placeholder="Enter email" required />
);

export const Types: Story = () => (
  <div className="flex flex-col gap-4 max-w-sm">
    <ActionInput name="text" label="Text" type="text" placeholder="Text input" />
    <ActionInput name="email" label="Email" type="email" placeholder="email@example.com" />
    <ActionInput name="password" label="Password" type="password" placeholder="Enter password" />
    <ActionInput name="number" label="Number" type="number" placeholder="0" />
  </div>
);

export const Disabled: Story = () => (
  <ActionInput name="disabled" label="Disabled Input" placeholder="Can't edit this" disabled />
);

export const WithDefaultValue: Story = () => (
  <ActionInput name="prefilled" label="Pre-filled" defaultValue="Hello world" />
);
