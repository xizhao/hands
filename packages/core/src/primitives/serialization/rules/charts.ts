/**
 * Chart Serialization Rules
 *
 * Handles MDX ↔ Plate conversion for chart elements:
 * - LineChart
 * - BarChart
 * - AreaChart
 * - PieChart
 */

import {
  LINE_CHART_KEY,
  BAR_CHART_KEY,
  AREA_CHART_KEY,
  PIE_CHART_KEY,
  type TLineChartElement,
  type TBarChartElement,
  type TAreaChartElement,
  type TPieChartElement,
} from "../../../types";
import type { MdxSerializationRule } from "../types";
import { parseAttributes, serializeAttributes, createVoidElement } from "../helpers";

// ============================================================================
// LineChart
// ============================================================================

/**
 * LineChart serialization rule.
 *
 * MDX Example:
 * ```mdx
 * <LineChart xKey="date" yKey="value" height={300} />
 * <LineChart xKey="month" yKey={["revenue", "expenses"]} curve="monotone" />
 * ```
 */
export const lineChartRule: MdxSerializationRule<TLineChartElement> = {
  tagName: "LineChart",
  key: LINE_CHART_KEY,

  deserialize: (node) => {
    const props = parseAttributes(node);

    return createVoidElement<TLineChartElement>(LINE_CHART_KEY, {
      xKey: props.xKey as string | undefined,
      yKey: props.yKey as string | string[] | undefined,
      height: props.height as number | undefined,
      showLegend: props.showLegend as boolean | undefined,
      showGrid: props.showGrid as boolean | undefined,
      showTooltip: props.showTooltip as boolean | undefined,
      colors: props.colors as string[] | undefined,
      curve: props.curve as TLineChartElement["curve"],
      showDots: props.showDots as boolean | undefined,
    });
  },

  serialize: (element) => {
    const attrs = serializeAttributes(
      {
        xKey: element.xKey,
        yKey: element.yKey,
        height: element.height,
        showLegend: element.showLegend,
        showGrid: element.showGrid,
        showTooltip: element.showTooltip,
        colors: element.colors,
        curve: element.curve,
        showDots: element.showDots,
      },
      {
        include: [
          "xKey",
          "yKey",
          "height",
          "showLegend",
          "showGrid",
          "showTooltip",
          "colors",
          "curve",
          "showDots",
        ],
        defaults: {
          curve: "linear",
          showDots: true,
          showTooltip: true,
          showGrid: true,
        },
      }
    );

    return {
      type: "mdxJsxFlowElement",
      name: "LineChart",
      attributes: attrs,
      children: [],
    };
  },
};

// ============================================================================
// BarChart
// ============================================================================

/**
 * BarChart serialization rule.
 *
 * MDX Example:
 * ```mdx
 * <BarChart xKey="category" yKey="value" height={400} />
 * <BarChart xKey="month" yKey={["sales", "costs"]} stacked />
 * ```
 */
export const barChartRule: MdxSerializationRule<TBarChartElement> = {
  tagName: "BarChart",
  key: BAR_CHART_KEY,

  deserialize: (node) => {
    const props = parseAttributes(node);

    return createVoidElement<TBarChartElement>(BAR_CHART_KEY, {
      xKey: props.xKey as string | undefined,
      yKey: props.yKey as string | string[] | undefined,
      height: props.height as number | undefined,
      showLegend: props.showLegend as boolean | undefined,
      showGrid: props.showGrid as boolean | undefined,
      showTooltip: props.showTooltip as boolean | undefined,
      colors: props.colors as string[] | undefined,
      stacked: props.stacked as boolean | undefined,
      layout: props.layout as TBarChartElement["layout"],
    });
  },

  serialize: (element) => {
    const attrs = serializeAttributes(
      {
        xKey: element.xKey,
        yKey: element.yKey,
        height: element.height,
        showLegend: element.showLegend,
        showGrid: element.showGrid,
        showTooltip: element.showTooltip,
        colors: element.colors,
        stacked: element.stacked,
        layout: element.layout,
      },
      {
        include: [
          "xKey",
          "yKey",
          "height",
          "showLegend",
          "showGrid",
          "showTooltip",
          "colors",
          "stacked",
          "layout",
        ],
        defaults: {
          stacked: false,
          layout: "vertical",
          showTooltip: true,
          showGrid: true,
        },
      }
    );

    return {
      type: "mdxJsxFlowElement",
      name: "BarChart",
      attributes: attrs,
      children: [],
    };
  },
};

// ============================================================================
// AreaChart
// ============================================================================

/**
 * AreaChart serialization rule.
 *
 * MDX Example:
 * ```mdx
 * <AreaChart xKey="date" yKey="value" height={300} fillOpacity={0.5} />
 * <AreaChart xKey="month" yKey={["revenue", "expenses"]} stacked curve="monotone" />
 * ```
 */
export const areaChartRule: MdxSerializationRule<TAreaChartElement> = {
  tagName: "AreaChart",
  key: AREA_CHART_KEY,

  deserialize: (node) => {
    const props = parseAttributes(node);

    return createVoidElement<TAreaChartElement>(AREA_CHART_KEY, {
      xKey: props.xKey as string | undefined,
      yKey: props.yKey as string | string[] | undefined,
      height: props.height as number | undefined,
      showLegend: props.showLegend as boolean | undefined,
      showGrid: props.showGrid as boolean | undefined,
      showTooltip: props.showTooltip as boolean | undefined,
      colors: props.colors as string[] | undefined,
      curve: props.curve as TAreaChartElement["curve"],
      stacked: props.stacked as boolean | undefined,
      fillOpacity: props.fillOpacity as number | undefined,
    });
  },

  serialize: (element) => {
    const attrs = serializeAttributes(
      {
        xKey: element.xKey,
        yKey: element.yKey,
        height: element.height,
        showLegend: element.showLegend,
        showGrid: element.showGrid,
        showTooltip: element.showTooltip,
        colors: element.colors,
        curve: element.curve,
        stacked: element.stacked,
        fillOpacity: element.fillOpacity,
      },
      {
        include: [
          "xKey",
          "yKey",
          "height",
          "showLegend",
          "showGrid",
          "showTooltip",
          "colors",
          "curve",
          "stacked",
          "fillOpacity",
        ],
        defaults: {
          curve: "linear",
          stacked: false,
          fillOpacity: 0.3,
          showTooltip: true,
          showGrid: true,
        },
      }
    );

    return {
      type: "mdxJsxFlowElement",
      name: "AreaChart",
      attributes: attrs,
      children: [],
    };
  },
};

// ============================================================================
// PieChart
// ============================================================================

/**
 * PieChart serialization rule.
 *
 * MDX Example:
 * ```mdx
 * <PieChart valueKey="value" nameKey="category" height={300} />
 * <PieChart valueKey="amount" nameKey="label" innerRadius={60} />
 * ```
 */
export const pieChartRule: MdxSerializationRule<TPieChartElement> = {
  tagName: "PieChart",
  key: PIE_CHART_KEY,

  deserialize: (node) => {
    const props = parseAttributes(node);

    return createVoidElement<TPieChartElement>(PIE_CHART_KEY, {
      valueKey: props.valueKey as string | undefined,
      nameKey: props.nameKey as string | undefined,
      height: props.height as number | undefined,
      innerRadius: props.innerRadius as number | undefined,
      showLegend: props.showLegend as boolean | undefined,
      showLabels: props.showLabels as boolean | undefined,
      colors: props.colors as string[] | undefined,
    });
  },

  serialize: (element) => {
    const attrs = serializeAttributes(
      {
        valueKey: element.valueKey,
        nameKey: element.nameKey,
        height: element.height,
        innerRadius: element.innerRadius,
        showLegend: element.showLegend,
        showLabels: element.showLabels,
        colors: element.colors,
      },
      {
        include: [
          "valueKey",
          "nameKey",
          "height",
          "innerRadius",
          "showLegend",
          "showLabels",
          "colors",
        ],
        defaults: {
          innerRadius: 0,
          showLegend: true,
          showLabels: false,
        },
      }
    );

    return {
      type: "mdxJsxFlowElement",
      name: "PieChart",
      attributes: attrs,
      children: [],
    };
  },
};

// ============================================================================
// Export all rules
// ============================================================================

export const chartRules = [lineChartRule, barChartRule, areaChartRule, pieChartRule];
