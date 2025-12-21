import type { Story } from "@ladle/react";
import { ActionCheckbox } from "./checkbox";

export default {
  title: "Active/Checkbox",
};

export const Default: Story = () => (
  <ActionCheckbox name="agree">I agree to the terms</ActionCheckbox>
);

export const Checked: Story = () => (
  <ActionCheckbox name="checked" defaultChecked>
    Already checked
  </ActionCheckbox>
);

export const Required: Story = () => (
  <ActionCheckbox name="required" required>
    This is required
  </ActionCheckbox>
);

export const Disabled: Story = () => (
  <div className="flex flex-col gap-2">
    <ActionCheckbox name="disabled1" disabled>
      Disabled unchecked
    </ActionCheckbox>
    <ActionCheckbox name="disabled2" disabled defaultChecked>
      Disabled checked
    </ActionCheckbox>
  </div>
);

export const Group: Story = () => (
  <div className="flex flex-col gap-2">
    <ActionCheckbox name="email" defaultChecked>
      Email notifications
    </ActionCheckbox>
    <ActionCheckbox name="sms">SMS notifications</ActionCheckbox>
    <ActionCheckbox name="push" defaultChecked>
      Push notifications
    </ActionCheckbox>
  </div>
);
