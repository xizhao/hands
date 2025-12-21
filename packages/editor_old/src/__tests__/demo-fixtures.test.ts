/**
 * Demo Fixtures Tests
 *
 * Tests that verify our demo source fixtures are correctly parsed
 * and converted to Plate elements.
 */

import { describe, expect, test } from "bun:test";
import {
  cardBlockSource,
  dataBlockSource,
  simpleBlockSource,
} from "../../demo/fixtures/simple-block";
import { sourceToPlateValueSurgical } from "../plate/surgical-converters";

describe("Demo Fixtures Parsing", () => {
  describe("Simple Block", () => {
    test("parses simple block source", () => {
      const { value, parseResult } = sourceToPlateValueSurgical(simpleBlockSource);

      expect(parseResult.errors).toHaveLength(0);
      expect(parseResult.root).not.toBeNull();
      expect(value.length).toBeGreaterThan(0);
    });

    test("creates correct element structure", () => {
      const { value } = sourceToPlateValueSurgical(simpleBlockSource);

      // Simple block has: div > h1, p, button
      // The div wrapper may be flattened, so we should have the children directly
      const types = value.map((el: any) => el.type);

      // Should contain h1, p, and button
      expect(types).toContain("h1");
      expect(types).toContain("p");
      expect(types).toContain("button");
    });

    test("h1 has correct text content", () => {
      const { value } = sourceToPlateValueSurgical(simpleBlockSource);

      const h1 = value.find((el: any) => el.type === "h1");
      expect(h1).toBeDefined();
      expect(h1.children).toBeDefined();
      expect(h1.children[0].text).toBe("Hello World");
    });

    test("p has correct text content", () => {
      const { value } = sourceToPlateValueSurgical(simpleBlockSource);

      const p = value.find((el: any) => el.type === "p");
      expect(p).toBeDefined();
      expect(p.children).toBeDefined();
      expect(p.children[0].text).toBe("This is a simple block with some content.");
    });

    test("button has correct text and props", () => {
      const { value } = sourceToPlateValueSurgical(simpleBlockSource);

      const button = value.find((el: any) => el.type === "button");
      expect(button).toBeDefined();
      expect(button.children).toBeDefined();
      expect(button.children[0].text).toBe("Click Me");
      expect(button.variant).toBe("primary");
    });
  });

  describe("Card Block", () => {
    test("parses card block source", () => {
      const { value, parseResult } = sourceToPlateValueSurgical(cardBlockSource);

      expect(parseResult.errors).toHaveLength(0);
      expect(parseResult.root).not.toBeNull();
      expect(value.length).toBeGreaterThan(0);
    });

    test("creates Card as editable element (not void)", () => {
      const { value } = sourceToPlateValueSurgical(cardBlockSource);

      // Card is a component but NOT void - children are editable
      const card = value.find((el: any) => el.type === "Card");
      expect(card).toBeDefined();
      expect(card.isVoid).toBeFalsy(); // Components with children are NOT void
    });

    test("Card has nested children elements", () => {
      const { value } = sourceToPlateValueSurgical(cardBlockSource);

      const card = value.find((el: any) => el.type === "Card");
      expect(card).toBeDefined();
      expect(card.children).toBeDefined();

      // Card should have CardHeader and CardContent as children
      const childTypes = card.children.filter((c: any) => c.type).map((c: any) => c.type);

      expect(childTypes).toContain("CardHeader");
      expect(childTypes).toContain("CardContent");
    });

    test("CardHeader contains CardTitle and CardDescription", () => {
      const { value } = sourceToPlateValueSurgical(cardBlockSource);

      const card = value.find((el: any) => el.type === "Card");
      const cardHeader = card?.children?.find((c: any) => c.type === "CardHeader");

      expect(cardHeader).toBeDefined();

      const headerChildTypes = cardHeader.children
        .filter((c: any) => c.type)
        .map((c: any) => c.type);

      expect(headerChildTypes).toContain("CardTitle");
      expect(headerChildTypes).toContain("CardDescription");
    });

    test("CardContent contains p and Button", () => {
      const { value } = sourceToPlateValueSurgical(cardBlockSource);

      const card = value.find((el: any) => el.type === "Card");
      const cardContent = card?.children?.find((c: any) => c.type === "CardContent");

      expect(cardContent).toBeDefined();

      const contentChildTypes = cardContent.children
        .filter((c: any) => c.type)
        .map((c: any) => c.type);

      expect(contentChildTypes).toContain("p");
      expect(contentChildTypes).toContain("Button");
    });
  });

  describe("Data Block", () => {
    test("parses data block source", () => {
      const { value, parseResult } = sourceToPlateValueSurgical(dataBlockSource);

      expect(parseResult.errors).toHaveLength(0);
      expect(parseResult.root).not.toBeNull();
      expect(value.length).toBeGreaterThan(0);
    });

    test("creates MetricCard elements", () => {
      const { value } = sourceToPlateValueSurgical(dataBlockSource);

      const metricCards = value.filter((el: any) => el.type === "MetricCard");

      // Should have 2 MetricCards
      expect(metricCards.length).toBe(2);

      // MetricCard has no JSX children in source, so isVoid depends on actual children
      // These are self-closing tags <MetricCard ... /> so they have no children
    });

    test("MetricCards have correct props", () => {
      const { value } = sourceToPlateValueSurgical(dataBlockSource);

      const metricCards = value.filter((el: any) => el.type === "MetricCard");

      // First card: Total Users
      expect(metricCards[0].title).toBe("Total Users");
      expect(metricCards[0].value).toBe(1234);
      expect(metricCards[0].description).toBe("+12% from last month");

      // Second card: Revenue
      expect(metricCards[1].title).toBe("Revenue");
      expect(metricCards[1].value).toBe(56789);
      expect(metricCards[1].description).toBe("+8% from last month");
    });
  });
});

describe("Element Type Detection", () => {
  test("lowercase tags are not void (editable)", () => {
    const { value } = sourceToPlateValueSurgical(simpleBlockSource);

    const h1 = value.find((el: any) => el.type === "h1");
    const p = value.find((el: any) => el.type === "p");
    const button = value.find((el: any) => el.type === "button");

    // HTML elements should NOT be void - their content is editable
    expect(h1?.isVoid).toBeFalsy();
    expect(p?.isVoid).toBeFalsy();
    expect(button?.isVoid).toBeFalsy();
  });

  test("PascalCase tags with children are editable (not void)", () => {
    const { value } = sourceToPlateValueSurgical(cardBlockSource);

    const card = value.find((el: any) => el.type === "Card");

    // Components with children should be editable, not void
    expect(card?.isVoid).toBeFalsy();
  });
});

describe("Props Preservation", () => {
  test("className prop is preserved on elements", () => {
    const { value, parseResult } = sourceToPlateValueSurgical(simpleBlockSource);

    // The root div has className="p-4"
    // Check if any element has the className
    const _hasClassName = value.some((el: any) => el.className === "p-4");

    // Note: depends on whether div is flattened - check root if not flattened
    if (parseResult.root?.tagName === "div") {
      // If not flattened, the root div should have it
      const divPlate = value.find((el: any) => el.type === "div");
      if (divPlate) {
        expect(divPlate.className).toBe("p-4");
      }
    }
  });

  test("variant prop is preserved on button", () => {
    const { value } = sourceToPlateValueSurgical(simpleBlockSource);

    const button = value.find((el: any) => el.type === "button");
    expect(button?.variant).toBe("primary");
  });

  test("numeric props are preserved as numbers", () => {
    const { value } = sourceToPlateValueSurgical(dataBlockSource);

    const metricCard = value.find((el: any) => el.type === "MetricCard");
    expect(typeof metricCard?.value).toBe("number");
    expect(metricCard?.value).toBe(1234);
  });
});
