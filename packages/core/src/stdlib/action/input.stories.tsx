import type { Story } from "@ladle/react";
import { Input } from "./input";

export default {
  title: "Action/Input",
};

export const Default: Story = () => (
  <Input name="email" label="Email" placeholder="you@example.com" />
);

export const Masks: Story = () => (
  <div className="flex flex-col gap-4 max-w-sm">
    <Input name="phone" label="Phone" mask="phone" placeholder="(555) 123-4567" />
    <Input name="card" label="Credit Card" mask="creditCard" placeholder="4242 4242 4242 4242" />
    <Input name="date" label="Date" mask="date" placeholder="MM/DD/YYYY" />
    <Input name="currency" label="Amount" mask="currency" placeholder="$0.00" />
    <Input name="ssn" label="SSN" mask="ssn" placeholder="###-##-####" />
    <Input name="zip" label="Zip" mask="zipCode" placeholder="12345" />
    <p className="text-xs text-muted-foreground mt-2">
      Validation on blur - type invalid card number and tab out to see red border
    </p>
  </div>
);

export const CustomMask: Story = () => (
  <Input name="code" label="Product Code" mask={{ pattern: "##-####-##" }} placeholder="12-3456-78" />
);
