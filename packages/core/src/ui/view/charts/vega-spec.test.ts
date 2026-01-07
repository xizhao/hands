/**
 * Vega-Lite Spec Converter Tests
 *
 * Tests for the simplified props → Vega-Lite spec conversion functions.
 * Validates correct handling of:
 * - Single vs multi-series data
 * - Stacked vs grouped bars
 * - Legend visibility
 * - Format strings
 * - All chart options
 */

import { describe, expect, it } from "vitest";

import {
  areaChartToVegaSpec,
  barChartToVegaSpec,
  lineChartToVegaSpec,
  pieChartToVegaSpec,
} from "./vega-spec";

// Type helper for accessing VegaLite encoding properties in tests
type Encoding = Record<string, Record<string, unknown>>;

describe("barChartToVegaSpec", () => {
  it("creates basic bar chart spec", () => {
    const spec = barChartToVegaSpec({
      xKey: "category",
      yKey: "value",
    });

    expect(spec.mark).toEqual({
      type: "bar",
      cornerRadiusEnd: 4,
      tooltip: true,
    });
    const encoding = spec.encoding as Encoding;
    expect(encoding.x).toMatchObject({
      field: "category",
      type: "nominal",
    });
    expect(encoding.y).toMatchObject({
      field: "value",
      type: "quantitative",
    });
  });

  it("handles multi-series with fold transform", () => {
    const spec = barChartToVegaSpec({
      xKey: "month",
      yKey: ["sales", "costs"],
    });

    // Should have fold transform
    expect(spec.transform).toEqual([
      { fold: ["sales", "costs"], as: ["series", "value"] },
    ]);

    // Y should use "value" field (output of fold)
    const encoding = spec.encoding as Encoding;
    expect(encoding.y).toMatchObject({
      field: "value",
      type: "quantitative",
    });

    // Should have color encoding
    const colorEncoding = encoding.color;
    expect(colorEncoding).toMatchObject({
      field: "series",
      type: "nominal",
    });
  });

  it("creates stacked bar chart for multi-series with stacked=true", () => {
    const spec = barChartToVegaSpec({
      xKey: "month",
      yKey: ["sales", "costs"],
      stacked: true,
    });

    // Y encoding should have stack: "zero"
    const encoding = spec.encoding as Encoding;
    expect(encoding.y).toMatchObject({
      field: "value",
      type: "quantitative",
      stack: "zero",
    });

    // Should NOT have xOffset (that's for grouped bars)
    expect(encoding.xOffset).toBeUndefined();
  });

  it("creates grouped bar chart for multi-series with stacked=false", () => {
    const spec = barChartToVegaSpec({
      xKey: "month",
      yKey: ["sales", "costs"],
      stacked: false,
    });

    // Y encoding should NOT have stack
    const encoding = spec.encoding as Encoding;
    expect(encoding.y).toMatchObject({
      field: "value",
      type: "quantitative",
    });
    expect(encoding.y.stack).toBeUndefined();

    // Should have xOffset for grouped bars
    expect(encoding.xOffset).toMatchObject({
      field: "series",
      type: "nominal",
    });
  });

  it("shows legend when showLegend=true", () => {
    const spec = barChartToVegaSpec({
      xKey: "month",
      yKey: ["sales", "costs"],
      showLegend: true,
    });

    const encoding = spec.encoding as Encoding;
    expect(encoding.color.legend).toEqual({});
  });

  it("hides legend when showLegend=false", () => {
    const spec = barChartToVegaSpec({
      xKey: "month",
      yKey: ["sales", "costs"],
      showLegend: false,
    });

    const encoding = spec.encoding as Encoding;
    expect(encoding.color.legend).toBeNull();
  });

  it("applies format strings to axes", () => {
    const spec = barChartToVegaSpec({
      xKey: "category",
      yKey: "value",
      yFormat: ".2f",
    });

    const encoding = spec.encoding as Encoding;
    const yAxis = encoding.y.axis as Record<string, unknown>;
    expect(yAxis.format).toBe(".2f");
  });

  it("creates horizontal bar chart", () => {
    const spec = barChartToVegaSpec({
      xKey: "category",
      yKey: "value",
      layout: "horizontal",
    });

    // X should be quantitative (values), Y should be nominal (categories)
    const encoding = spec.encoding as Encoding;
    expect(encoding.x).toMatchObject({
      field: "value",
      type: "quantitative",
    });
    expect(encoding.y).toMatchObject({
      field: "category",
      type: "nominal",
    });
  });

  it("creates horizontal stacked bar chart", () => {
    const spec = barChartToVegaSpec({
      xKey: "category",
      yKey: ["a", "b"],
      layout: "horizontal",
      stacked: true,
    });

    // X should have stack: "zero"
    const encoding = spec.encoding as Encoding;
    expect(encoding.x).toMatchObject({
      field: "value",
      type: "quantitative",
      stack: "zero",
    });

    // Should NOT have yOffset
    expect(encoding.yOffset).toBeUndefined();
  });

  it("creates horizontal grouped bar chart", () => {
    const spec = barChartToVegaSpec({
      xKey: "category",
      yKey: ["a", "b"],
      layout: "horizontal",
      stacked: false,
    });

    // Should have yOffset for horizontal grouped bars
    const encoding = spec.encoding as Encoding;
    expect(encoding.yOffset).toMatchObject({
      field: "series",
      type: "nominal",
    });
  });

  it("toggles grid visibility", () => {
    const withGrid = barChartToVegaSpec({ xKey: "x", yKey: "y", showGrid: true });
    const withoutGrid = barChartToVegaSpec({ xKey: "x", yKey: "y", showGrid: false });

    const encodingWith = withGrid.encoding as Encoding;
    const encodingWithout = withoutGrid.encoding as Encoding;
    const yAxisWith = encodingWith.y.axis as Record<string, unknown>;
    const yAxisWithout = encodingWithout.y.axis as Record<string, unknown>;

    expect(yAxisWith.grid).toBe(true);
    expect(yAxisWithout.grid).toBe(false);
  });
});

describe("lineChartToVegaSpec", () => {
  it("creates basic line chart spec", () => {
    const spec = lineChartToVegaSpec({
      xKey: "date",
      yKey: "value",
    });

    expect(spec.mark).toMatchObject({
      type: "line",
      interpolate: "monotone",
      point: true,
      tooltip: true,
    });
  });

  it("handles multi-series with fold transform", () => {
    const spec = lineChartToVegaSpec({
      xKey: "date",
      yKey: ["revenue", "expenses"],
    });

    expect(spec.transform).toEqual([
      { fold: ["revenue", "expenses"], as: ["series", "value"] },
    ]);
  });

  it("applies curve interpolation", () => {
    const linear = lineChartToVegaSpec({ xKey: "x", yKey: "y", curve: "linear" });
    const step = lineChartToVegaSpec({ xKey: "x", yKey: "y", curve: "step" });
    const monotone = lineChartToVegaSpec({ xKey: "x", yKey: "y", curve: "monotone" });

    expect((linear.mark as Record<string, unknown>).interpolate).toBe("linear");
    expect((step.mark as Record<string, unknown>).interpolate).toBe("step");
    expect((monotone.mark as Record<string, unknown>).interpolate).toBe("monotone");
  });

  it("toggles dots visibility", () => {
    const withDots = lineChartToVegaSpec({ xKey: "x", yKey: "y", showDots: true });
    const withoutDots = lineChartToVegaSpec({ xKey: "x", yKey: "y", showDots: false });

    expect((withDots.mark as Record<string, unknown>).point).toBe(true);
    expect((withoutDots.mark as Record<string, unknown>).point).toBe(false);
  });

  it("shows legend for multi-series when showLegend=true", () => {
    const spec = lineChartToVegaSpec({
      xKey: "date",
      yKey: ["a", "b"],
      showLegend: true,
    });

    const encoding = spec.encoding as Encoding;
    expect(encoding.color.legend).toEqual({});
  });
});

describe("areaChartToVegaSpec", () => {
  it("creates basic area chart spec", () => {
    const spec = areaChartToVegaSpec({
      xKey: "date",
      yKey: "value",
    });

    expect(spec.mark).toMatchObject({
      type: "area",
      interpolate: "monotone",
      opacity: 0.4,
      line: true,
      tooltip: true,
    });
  });

  it("creates stacked area chart for multi-series", () => {
    const spec = areaChartToVegaSpec({
      xKey: "date",
      yKey: ["a", "b"],
      stacked: true,
    });

    const encoding = spec.encoding as Encoding;
    expect(encoding.y).toMatchObject({
      field: "value",
      type: "quantitative",
      stack: "zero",
    });
  });

  it("applies custom fill opacity", () => {
    const spec = areaChartToVegaSpec({
      xKey: "x",
      yKey: "y",
      fillOpacity: 0.8,
    });

    expect((spec.mark as Record<string, unknown>).opacity).toBe(0.8);
  });

  it("applies curve interpolation", () => {
    const step = areaChartToVegaSpec({ xKey: "x", yKey: "y", curve: "step" });
    expect((step.mark as Record<string, unknown>).interpolate).toBe("step");
  });
});

describe("pieChartToVegaSpec", () => {
  it("creates basic pie chart spec", () => {
    const spec = pieChartToVegaSpec({
      valueKey: "amount",
      nameKey: "category",
    });

    expect(spec.mark).toMatchObject({
      type: "arc",
      innerRadius: 0,
      tooltip: true,
    });
    const encoding = spec.encoding as Encoding;
    expect(encoding.theta).toMatchObject({
      field: "amount",
      type: "quantitative",
      stack: true,
    });
    expect(encoding.color).toMatchObject({
      field: "category",
      type: "nominal",
    });
  });

  it("creates donut chart with innerRadius", () => {
    const spec = pieChartToVegaSpec({
      valueKey: "value",
      nameKey: "name",
      innerRadius: 60,
    });

    expect((spec.mark as Record<string, unknown>).innerRadius).toBe(60);
  });

  it("shows legend by default", () => {
    const spec = pieChartToVegaSpec({
      valueKey: "value",
      nameKey: "name",
    });

    const encoding = spec.encoding as Encoding;
    expect(encoding.color.legend).toEqual({});
  });

  it("hides legend when showLegend=false", () => {
    const spec = pieChartToVegaSpec({
      valueKey: "value",
      nameKey: "name",
      showLegend: false,
    });

    const encoding = spec.encoding as Encoding;
    expect(encoding.color.legend).toBeNull();
  });

  it("adds text labels when showLabels=true", () => {
    const spec = pieChartToVegaSpec({
      valueKey: "value",
      nameKey: "name",
      showLabels: true,
    });

    // Should be a layered spec with arc and text
    const layer = spec.layer as Array<Record<string, unknown>>;
    expect(layer).toBeDefined();
    expect(layer).toHaveLength(2);
    expect((layer[1].mark as Record<string, unknown>).type).toBe("text");
  });
});
