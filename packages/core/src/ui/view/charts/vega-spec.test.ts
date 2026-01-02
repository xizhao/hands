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
    expect(spec.encoding?.x).toMatchObject({
      field: "category",
      type: "nominal",
    });
    expect(spec.encoding?.y).toMatchObject({
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
    expect(spec.encoding?.y).toMatchObject({
      field: "value",
      type: "quantitative",
    });

    // Should have color encoding
    const colorEncoding = (spec.encoding as Record<string, unknown>).color;
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
    expect(spec.encoding?.y).toMatchObject({
      field: "value",
      type: "quantitative",
      stack: "zero",
    });

    // Should NOT have xOffset (that's for grouped bars)
    const encoding = spec.encoding as Record<string, unknown>;
    expect(encoding.xOffset).toBeUndefined();
  });

  it("creates grouped bar chart for multi-series with stacked=false", () => {
    const spec = barChartToVegaSpec({
      xKey: "month",
      yKey: ["sales", "costs"],
      stacked: false,
    });

    // Y encoding should NOT have stack
    expect(spec.encoding?.y).toMatchObject({
      field: "value",
      type: "quantitative",
    });
    expect((spec.encoding?.y as Record<string, unknown>).stack).toBeUndefined();

    // Should have xOffset for grouped bars
    const encoding = spec.encoding as Record<string, unknown>;
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

    const colorEncoding = (spec.encoding as Record<string, unknown>).color as Record<string, unknown>;
    expect(colorEncoding.legend).toEqual({});
  });

  it("hides legend when showLegend=false", () => {
    const spec = barChartToVegaSpec({
      xKey: "month",
      yKey: ["sales", "costs"],
      showLegend: false,
    });

    const colorEncoding = (spec.encoding as Record<string, unknown>).color as Record<string, unknown>;
    expect(colorEncoding.legend).toBeNull();
  });

  it("applies format strings to axes", () => {
    const spec = barChartToVegaSpec({
      xKey: "category",
      yKey: "value",
      yFormat: ".2f",
    });

    const yAxis = (spec.encoding?.y as Record<string, unknown>).axis as Record<string, unknown>;
    expect(yAxis.format).toBe(".2f");
  });

  it("creates horizontal bar chart", () => {
    const spec = barChartToVegaSpec({
      xKey: "category",
      yKey: "value",
      layout: "horizontal",
    });

    // X should be quantitative (values), Y should be nominal (categories)
    expect(spec.encoding?.x).toMatchObject({
      field: "value",
      type: "quantitative",
    });
    expect(spec.encoding?.y).toMatchObject({
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
    expect(spec.encoding?.x).toMatchObject({
      field: "value",
      type: "quantitative",
      stack: "zero",
    });

    // Should NOT have yOffset
    const encoding = spec.encoding as Record<string, unknown>;
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
    const encoding = spec.encoding as Record<string, unknown>;
    expect(encoding.yOffset).toMatchObject({
      field: "series",
      type: "nominal",
    });
  });

  it("toggles grid visibility", () => {
    const withGrid = barChartToVegaSpec({ xKey: "x", yKey: "y", showGrid: true });
    const withoutGrid = barChartToVegaSpec({ xKey: "x", yKey: "y", showGrid: false });

    const yAxisWith = (withGrid.encoding?.y as Record<string, unknown>).axis as Record<string, unknown>;
    const yAxisWithout = (withoutGrid.encoding?.y as Record<string, unknown>).axis as Record<string, unknown>;

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

    const colorEncoding = (spec.encoding as Record<string, unknown>).color as Record<string, unknown>;
    expect(colorEncoding.legend).toEqual({});
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

    expect(spec.encoding?.y).toMatchObject({
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
    expect(spec.encoding?.theta).toMatchObject({
      field: "amount",
      type: "quantitative",
      stack: true,
    });
    expect((spec.encoding as Record<string, unknown>).color).toMatchObject({
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

    const colorEncoding = (spec.encoding as Record<string, unknown>).color as Record<string, unknown>;
    expect(colorEncoding.legend).toEqual({});
  });

  it("hides legend when showLegend=false", () => {
    const spec = pieChartToVegaSpec({
      valueKey: "value",
      nameKey: "name",
      showLegend: false,
    });

    const colorEncoding = (spec.encoding as Record<string, unknown>).color as Record<string, unknown>;
    expect(colorEncoding.legend).toBeNull();
  });

  it("adds text labels when showLabels=true", () => {
    const spec = pieChartToVegaSpec({
      valueKey: "value",
      nameKey: "name",
      showLabels: true,
    });

    // Should be a layered spec with arc and text
    expect(spec.layer).toBeDefined();
    expect(spec.layer).toHaveLength(2);
    expect((spec.layer![1].mark as Record<string, unknown>).type).toBe("text");
  });
});
