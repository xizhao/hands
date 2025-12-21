import type { Story } from "@ladle/react";
import { ActionCheckbox } from "./checkbox";

export default {
  title: "Active/Checkbox",
};

export const Default: Story = () => (
  <ActionCheckbox name="agree" label="I agree to the terms" />
);

export const Checked: Story = () => (
  <ActionCheckbox name="checked" defaultChecked label="Already checked" />
);

export const Required: Story = () => (
  <ActionCheckbox name="required" required label="This is required" />
);

export const Disabled: Story = () => (
  <div className="flex flex-col gap-2">
    <ActionCheckbox name="disabled1" disabled label="Disabled unchecked" />
    <ActionCheckbox name="disabled2" disabled defaultChecked label="Disabled checked" />
  </div>
);

export const Group: Story = () => (
  <div className="flex flex-col gap-2">
    <ActionCheckbox name="email" defaultChecked label="Email notifications" />
    <ActionCheckbox name="sms" label="SMS notifications" />
    <ActionCheckbox name="push" defaultChecked label="Push notifications" />
  </div>
);
