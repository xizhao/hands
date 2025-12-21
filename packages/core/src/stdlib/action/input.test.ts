import { describe, expect, it } from "vitest";
import { createInputElement, INPUT_KEY } from "./input";

describe("createInputElement", () => {
  describe("basic creation", () => {
    it("creates element with required name", () => {
      const element = createInputElement("email");
      expect(element.type).toBe(INPUT_KEY);
      expect(element.name).toBe("email");
      expect(element.children).toEqual([{ text: "" }]);
    });

    it("creates element with placeholder", () => {
      const element = createInputElement("email", { placeholder: "Enter email" });
      expect(element.placeholder).toBe("Enter email");
    });

    it("creates element with label", () => {
      const element = createInputElement("email", { label: "Email Address" });
      expect(element.children).toEqual([{ text: "Email Address" }]);
    });

    it("creates element with default value", () => {
      const element = createInputElement("name", { defaultValue: "John" });
      expect(element.defaultValue).toBe("John");
    });

    it("creates required element", () => {
      const element = createInputElement("email", { required: true });
      expect(element.required).toBe(true);
    });

    it("creates element with input type", () => {
      const element = createInputElement("password", { inputType: "password" });
      expect(element.inputType).toBe("password");
    });
  });

  describe("mask patterns", () => {
    it("creates element with phone mask", () => {
      const element = createInputElement("phone", { mask: "phone" });
      expect(element.mask).toBe("phone");
    });

    it("creates element with creditCard mask", () => {
      const element = createInputElement("card", { mask: "creditCard" });
      expect(element.mask).toBe("creditCard");
    });

    it("creates element with date mask", () => {
      const element = createInputElement("dob", { mask: "date" });
      expect(element.mask).toBe("date");
    });

    it("creates element with currency mask", () => {
      const element = createInputElement("amount", { mask: "currency" });
      expect(element.mask).toBe("currency");
    });

    it("creates element with custom mask pattern", () => {
      const element = createInputElement("code", {
        mask: { pattern: "##-####-##" },
      });
      expect(element.mask).toEqual({ pattern: "##-####-##" });
    });

    it("creates element with all mask presets", () => {
      const presets = [
        "phone",
        "ssn",
        "date",
        "time",
        "creditCard",
        "creditCardExpiry",
        "zipCode",
        "zipCodeExtended",
        "currency",
        "percentage",
        "ipv4",
        "ein",
      ] as const;

      for (const mask of presets) {
        const element = createInputElement("test", { mask });
        expect(element.mask).toBe(mask);
      }
    });
  });

  describe("currency options", () => {
    it("creates element with USD currency", () => {
      const element = createInputElement("amount", {
        mask: "currency",
        currency: "USD",
      });
      expect(element.currency).toBe("USD");
    });

    it("creates element with EUR currency and locale", () => {
      const element = createInputElement("amount", {
        mask: "currency",
        currency: "EUR",
        locale: "de-DE",
      });
      expect(element.currency).toBe("EUR");
      expect(element.locale).toBe("de-DE");
    });
  });

  describe("combined options", () => {
    it("creates fully configured phone input", () => {
      const element = createInputElement("phone", {
        label: "Phone Number",
        placeholder: "(555) 123-4567",
        mask: "phone",
        required: true,
      });

      expect(element.type).toBe(INPUT_KEY);
      expect(element.name).toBe("phone");
      expect(element.children).toEqual([{ text: "Phone Number" }]);
      expect(element.placeholder).toBe("(555) 123-4567");
      expect(element.mask).toBe("phone");
      expect(element.required).toBe(true);
    });

    it("creates fully configured currency input", () => {
      const element = createInputElement("price", {
        label: "Price",
        placeholder: "€0,00",
        mask: "currency",
        currency: "EUR",
        locale: "de-DE",
      });

      expect(element.name).toBe("price");
      expect(element.mask).toBe("currency");
      expect(element.currency).toBe("EUR");
      expect(element.locale).toBe("de-DE");
    });
  });
});
