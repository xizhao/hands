import type { Story } from "@ladle/react";
import { Checkbox } from "./checkbox";

export default {
  title: "Active/Checkbox",
};

export const Default: Story = () => (
  <Checkbox name="agree" label="I agree to the terms" />
);

export const Checked: Story = () => (
  <Checkbox name="checked" defaultChecked label="Already checked" />
);

export const Required: Story = () => (
  <Checkbox name="required" required label="This is required" />
);

export const Disabled: Story = () => (
  <div className="flex flex-col gap-2">
    <Checkbox name="disabled1" disabled label="Disabled unchecked" />
    <Checkbox name="disabled2" disabled defaultChecked label="Disabled checked" />
  </div>
);

export const Group: Story = () => (
  <div className="flex flex-col gap-2">
    <Checkbox name="email" defaultChecked label="Email notifications" />
    <Checkbox name="sms" label="SMS notifications" />
    <Checkbox name="push" defaultChecked label="Push notifications" />
  </div>
);
