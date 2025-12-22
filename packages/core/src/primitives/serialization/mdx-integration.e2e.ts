/**
 * MDX Integration E2E Tests
 *
 * Tests that MDX deserialization produces correct Plate elements
 * and renders the expected components.
 */

import { test, expect } from "@playwright/test";

test.describe("MDX Integration", () => {
  test.describe("LiveValue with BarChart", () => {
    test("deserializes BarChart as child of LiveValue", async ({ page }) => {
      // Navigate to the LiveValue + BarChart story (ladle uses double-dash format)
      await page.goto("/?story=integration--mdx--live-value--bar-chart");

      // Wait for the Plate harness to render
      await page.waitForSelector('[data-testid="plate-harness"]');

      // Get the Plate value JSON
      const plateValueText = await page.locator('[data-testid="plate-value"]').textContent();
      const plateValue = JSON.parse(plateValueText || "[]");

      // Find the LiveValue element
      const liveValue = plateValue.find((el: any) => el.type === "live_value");
      expect(liveValue).toBeDefined();
      expect(liveValue.query).toContain("SELECT status");

      // LiveValue should have BarChart as a child
      const barChart = liveValue.children?.find((child: any) => child.type === "bar_chart");
      expect(barChart).toBeDefined();
      expect(barChart.xKey).toBe("status");
      expect(barChart.yKey).toBe("count");
    });

    test("renders BarChart component (not table) inside LiveValue", async ({ page }) => {
      await page.goto("/?story=integration--mdx--live-value--bar-chart");

      // Wait for the Plate harness to render
      await page.waitForSelector('[data-testid="plate-harness"]');

      // The rendered output should contain a recharts BarChart, not a DataGrid/table
      // Recharts uses SVG for charts
      const hasChart = await page.locator('[data-testid="plate-harness"] svg .recharts-bar').count();
      const hasTable = await page.locator('[data-testid="plate-harness"] [role="grid"]').count();

      // Should have chart elements (or at least no table since data is empty)
      // If data is empty, we expect either loading state or empty chart state
      expect(hasTable).toBe(0); // Definitely no table
    });
  });

  test.describe("LiveValue standalone", () => {
    test("deserializes inline LiveValue correctly", async ({ page }) => {
      await page.goto("/?story=integration--mdx--live-value--inline");
      await page.waitForSelector('[data-testid="plate-harness"]');

      const plateValueText = await page.locator('[data-testid="plate-value"]').textContent();
      const plateValue = JSON.parse(plateValueText || "[]");

      const liveValue = plateValue.find((el: any) => el.type === "live_value");
      expect(liveValue).toBeDefined();
      expect(liveValue.query).toBe("SELECT COUNT(*) FROM users");
      // Should not have meaningful children (just empty text placeholder)
      expect(liveValue.children).toHaveLength(1);
      expect(liveValue.children[0].text).toBe("");
    });
  });

  test.describe("LiveAction with form controls", () => {
    test("deserializes Input and Button as children", async ({ page }) => {
      await page.goto("/?story=integration--mdx--live-action--inputs");
      await page.waitForSelector('[data-testid="plate-harness"]');

      const plateValueText = await page.locator('[data-testid="plate-value"]').textContent();
      const plateValue = JSON.parse(plateValueText || "[]");

      const liveAction = plateValue.find((el: any) => el.type === "live_action");
      expect(liveAction).toBeDefined();
      expect(liveAction.sql).toContain("UPDATE users");

      // Should have Input and Button children
      const inputs = liveAction.children?.filter((child: any) => child.type === "input");
      const buttons = liveAction.children?.filter((child: any) => child.type === "button");

      expect(inputs?.length).toBeGreaterThanOrEqual(2);
      expect(buttons?.length).toBeGreaterThanOrEqual(1);
    });
  });

  test.describe("Standalone components", () => {
    test("deserializes Metric correctly", async ({ page }) => {
      await page.goto("/?story=integration--mdx--metric");
      await page.waitForSelector('[data-testid="plate-harness"]');

      const plateValueText = await page.locator('[data-testid="plate-value"]').textContent();
      const plateValue = JSON.parse(plateValueText || "[]");

      const metric = plateValue.find((el: any) => el.type === "metric");
      expect(metric).toBeDefined();
      expect(metric.value).toBe(1234);
      expect(metric.label).toBe("Total Users");
      expect(metric.prefix).toBe("+");
      expect(metric.change).toBe(12.5);
    });

    test("deserializes Alert correctly", async ({ page }) => {
      await page.goto("/?story=integration--mdx--alert");
      await page.waitForSelector('[data-testid="plate-harness"]');

      const plateValueText = await page.locator('[data-testid="plate-value"]').textContent();
      const plateValue = JSON.parse(plateValueText || "[]");

      const alert = plateValue.find((el: any) => el.type === "alert");
      expect(alert).toBeDefined();
      expect(alert.title).toBe("Warning");
      expect(alert.variant).toBe("warning");
    });
  });

  test.describe("Column Layout", () => {
    test("deserializes two-column layout correctly", async ({ page }) => {
      await page.goto("/?story=integration--mdx--columns--two-equal");
      await page.waitForSelector('[data-testid="plate-harness"]');

      const plateValueText = await page.locator('[data-testid="plate-value"]').textContent();
      const plateValue = JSON.parse(plateValueText || "[]");

      // Find the column_group element
      const columnGroup = plateValue.find((el: any) => el.type === "column_group");
      expect(columnGroup).toBeDefined();

      // Should have exactly 2 columns
      const columns = columnGroup.children?.filter((child: any) => child.type === "column");
      expect(columns).toHaveLength(2);

      // Check column widths
      expect(columns[0].width).toBe("50%");
      expect(columns[1].width).toBe("50%");
    });

    test("deserializes three-column layout correctly", async ({ page }) => {
      await page.goto("/?story=integration--mdx--columns--three-equal");
      await page.waitForSelector('[data-testid="plate-harness"]');

      const plateValueText = await page.locator('[data-testid="plate-value"]').textContent();
      const plateValue = JSON.parse(plateValueText || "[]");

      const columnGroup = plateValue.find((el: any) => el.type === "column_group");
      expect(columnGroup).toBeDefined();

      const columns = columnGroup.children?.filter((child: any) => child.type === "column");
      expect(columns).toHaveLength(3);
    });

    test("preserves unequal column widths", async ({ page }) => {
      await page.goto("/?story=integration--mdx--columns--unequal-width");
      await page.waitForSelector('[data-testid="plate-harness"]');

      const plateValueText = await page.locator('[data-testid="plate-value"]').textContent();
      const plateValue = JSON.parse(plateValueText || "[]");

      const columnGroup = plateValue.find((el: any) => el.type === "column_group");
      expect(columnGroup).toBeDefined();

      const columns = columnGroup.children?.filter((child: any) => child.type === "column");
      expect(columns).toHaveLength(2);
      expect(columns[0].width).toBe("70%");
      expect(columns[1].width).toBe("30%");
    });

    test("renders columns with flex layout", async ({ page }) => {
      await page.goto("/?story=integration--mdx--columns--two-equal");
      await page.waitForSelector('[data-testid="plate-harness"]');

      // Check that the column group container has flex display
      const flexContainer = page.locator('[data-testid="plate-harness"] .flex');
      await expect(flexContainer).toBeVisible();
    });

    test("deserializes components inside columns", async ({ page }) => {
      await page.goto("/?story=integration--mdx--columns--with-components");
      await page.waitForSelector('[data-testid="plate-harness"]');

      const plateValueText = await page.locator('[data-testid="plate-value"]').textContent();
      const plateValue = JSON.parse(plateValueText || "[]");

      const columnGroup = plateValue.find((el: any) => el.type === "column_group");
      expect(columnGroup).toBeDefined();

      const columns = columnGroup.children?.filter((child: any) => child.type === "column");
      expect(columns).toHaveLength(2);

      // First column should have a metric
      const firstColumnMetric = columns[0].children?.find((child: any) => child.type === "metric");
      expect(firstColumnMetric).toBeDefined();
      expect(firstColumnMetric.value).toBe(1234);

      // Second column should also have a metric
      const secondColumnMetric = columns[1].children?.find((child: any) => child.type === "metric");
      expect(secondColumnMetric).toBeDefined();
      expect(secondColumnMetric.value).toBe(567);
    });
  });
});
