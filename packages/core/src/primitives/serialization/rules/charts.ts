/**
 * Chart Serialization Rules
 *
 * Handles MDX ↔ Plate conversion for chart elements:
 * - LineChart, BarChart, AreaChart, PieChart (Recharts-style)
 * - Chart (generic Vega-Lite spec)
 * - ScatterChart, HistogramChart, HeatmapChart, BoxPlotChart, MapChart (Vega utilities)
 */

import {
  LINE_CHART_KEY,
  BAR_CHART_KEY,
  AREA_CHART_KEY,
  PIE_CHART_KEY,
  CHART_KEY,
  SCATTER_CHART_KEY,
  HISTOGRAM_CHART_KEY,
  HEATMAP_CHART_KEY,
  BOXPLOT_CHART_KEY,
  MAP_CHART_KEY,
  type TLineChartElement,
  type TBarChartElement,
  type TAreaChartElement,
  type TPieChartElement,
  type TChartElement,
  type TScatterChartElement,
  type THistogramChartElement,
  type THeatmapChartElement,
  type TBoxPlotChartElement,
  type TMapChartElement,
  type VegaLiteSpec,
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
// Generic Chart (Vega-Lite spec)
// ============================================================================

/**
 * Generic Chart serialization rule.
 * Accepts a full Vega-Lite specification for advanced visualizations.
 *
 * MDX Example:
 * ```mdx
 * <Chart vegaSpec={{ mark: "boxplot", encoding: { x: { field: "category" }, y: { field: "value" } } }} />
 * <Chart vegaSpec={{ mark: "rect", encoding: { x: { field: "x" }, y: { field: "y" }, color: { field: "val" } } }} height={400} />
 * ```
 */
export const chartRule: MdxSerializationRule<TChartElement> = {
  tagName: "Chart",
  key: CHART_KEY,

  deserialize: (node) => {
    const props = parseAttributes(node);

    return createVoidElement<TChartElement>(CHART_KEY, {
      vegaSpec: props.vegaSpec as VegaLiteSpec,
      height: props.height as number | undefined,
    });
  },

  serialize: (element) => {
    const attrs = serializeAttributes(
      {
        vegaSpec: element.vegaSpec,
        height: element.height,
      },
      {
        include: ["vegaSpec", "height"],
        defaults: {
          height: 300,
        },
      }
    );

    return {
      type: "mdxJsxFlowElement",
      name: "Chart",
      attributes: attrs,
      children: [],
    };
  },
};

// ============================================================================
// ScatterChart
// ============================================================================

/**
 * ScatterChart serialization rule.
 *
 * MDX Example:
 * ```mdx
 * <ScatterChart xKey="age" yKey="salary" />
 * <ScatterChart xKey="x" yKey="y" colorKey="category" sizeKey="weight" />
 * ```
 */
export const scatterChartRule: MdxSerializationRule<TScatterChartElement> = {
  tagName: "ScatterChart",
  key: SCATTER_CHART_KEY,

  deserialize: (node) => {
    const props = parseAttributes(node);

    return createVoidElement<TScatterChartElement>(SCATTER_CHART_KEY, {
      xKey: props.xKey as string | undefined,
      yKey: props.yKey as string | undefined,
      colorKey: props.colorKey as string | undefined,
      sizeKey: props.sizeKey as string | undefined,
      height: props.height as number | undefined,
      showTooltip: props.showTooltip as boolean | undefined,
      colors: props.colors as string[] | undefined,
      opacity: props.opacity as number | undefined,
    });
  },

  serialize: (element) => {
    const attrs = serializeAttributes(
      {
        xKey: element.xKey,
        yKey: element.yKey,
        colorKey: element.colorKey,
        sizeKey: element.sizeKey,
        height: element.height,
        showTooltip: element.showTooltip,
        colors: element.colors,
        opacity: element.opacity,
      },
      {
        include: ["xKey", "yKey", "colorKey", "sizeKey", "height", "showTooltip", "colors", "opacity"],
        defaults: {
          showTooltip: true,
          opacity: 0.7,
        },
      }
    );

    return {
      type: "mdxJsxFlowElement",
      name: "ScatterChart",
      attributes: attrs,
      children: [],
    };
  },
};

// ============================================================================
// HistogramChart
// ============================================================================

/**
 * HistogramChart serialization rule.
 *
 * MDX Example:
 * ```mdx
 * <HistogramChart valueKey="age" />
 * <HistogramChart valueKey="price" binCount={20} color="#4c78a8" />
 * ```
 */
export const histogramChartRule: MdxSerializationRule<THistogramChartElement> = {
  tagName: "HistogramChart",
  key: HISTOGRAM_CHART_KEY,

  deserialize: (node) => {
    const props = parseAttributes(node);

    return createVoidElement<THistogramChartElement>(HISTOGRAM_CHART_KEY, {
      valueKey: props.valueKey as string | undefined,
      binCount: props.binCount as number | undefined,
      height: props.height as number | undefined,
      showTooltip: props.showTooltip as boolean | undefined,
      color: props.color as string | undefined,
    });
  },

  serialize: (element) => {
    const attrs = serializeAttributes(
      {
        valueKey: element.valueKey,
        binCount: element.binCount,
        height: element.height,
        showTooltip: element.showTooltip,
        color: element.color,
      },
      {
        include: ["valueKey", "binCount", "height", "showTooltip", "color"],
        defaults: {
          showTooltip: true,
        },
      }
    );

    return {
      type: "mdxJsxFlowElement",
      name: "HistogramChart",
      attributes: attrs,
      children: [],
    };
  },
};

// ============================================================================
// HeatmapChart
// ============================================================================

/**
 * HeatmapChart serialization rule.
 *
 * MDX Example:
 * ```mdx
 * <HeatmapChart xKey="month" yKey="weekday" valueKey="count" />
 * <HeatmapChart xKey="x" yKey="y" valueKey="intensity" colorScheme="viridis" />
 * ```
 */
export const heatmapChartRule: MdxSerializationRule<THeatmapChartElement> = {
  tagName: "HeatmapChart",
  key: HEATMAP_CHART_KEY,

  deserialize: (node) => {
    const props = parseAttributes(node);

    return createVoidElement<THeatmapChartElement>(HEATMAP_CHART_KEY, {
      xKey: props.xKey as string | undefined,
      yKey: props.yKey as string | undefined,
      valueKey: props.valueKey as string | undefined,
      height: props.height as number | undefined,
      colorScheme: props.colorScheme as string | undefined,
      showTooltip: props.showTooltip as boolean | undefined,
    });
  },

  serialize: (element) => {
    const attrs = serializeAttributes(
      {
        xKey: element.xKey,
        yKey: element.yKey,
        valueKey: element.valueKey,
        height: element.height,
        colorScheme: element.colorScheme,
        showTooltip: element.showTooltip,
      },
      {
        include: ["xKey", "yKey", "valueKey", "height", "colorScheme", "showTooltip"],
        defaults: {
          colorScheme: "blues",
          showTooltip: true,
        },
      }
    );

    return {
      type: "mdxJsxFlowElement",
      name: "HeatmapChart",
      attributes: attrs,
      children: [],
    };
  },
};

// ============================================================================
// BoxPlotChart
// ============================================================================

/**
 * BoxPlotChart serialization rule.
 *
 * MDX Example:
 * ```mdx
 * <BoxPlotChart categoryKey="department" valueKey="salary" />
 * <BoxPlotChart categoryKey="group" valueKey="score" orientation="horizontal" />
 * ```
 */
export const boxPlotChartRule: MdxSerializationRule<TBoxPlotChartElement> = {
  tagName: "BoxPlotChart",
  key: BOXPLOT_CHART_KEY,

  deserialize: (node) => {
    const props = parseAttributes(node);

    return createVoidElement<TBoxPlotChartElement>(BOXPLOT_CHART_KEY, {
      categoryKey: props.categoryKey as string | undefined,
      valueKey: props.valueKey as string | undefined,
      height: props.height as number | undefined,
      showTooltip: props.showTooltip as boolean | undefined,
      color: props.color as string | undefined,
      orientation: props.orientation as TBoxPlotChartElement["orientation"],
    });
  },

  serialize: (element) => {
    const attrs = serializeAttributes(
      {
        categoryKey: element.categoryKey,
        valueKey: element.valueKey,
        height: element.height,
        showTooltip: element.showTooltip,
        color: element.color,
        orientation: element.orientation,
      },
      {
        include: ["categoryKey", "valueKey", "height", "showTooltip", "color", "orientation"],
        defaults: {
          orientation: "vertical",
          showTooltip: true,
        },
      }
    );

    return {
      type: "mdxJsxFlowElement",
      name: "BoxPlotChart",
      attributes: attrs,
      children: [],
    };
  },
};

// ============================================================================
// MapChart
// ============================================================================

/**
 * MapChart serialization rule.
 *
 * MDX Example:
 * ```mdx
 * <MapChart mapType="choropleth" idKey="state" valueKey="population" topology="us-states" />
 * <MapChart mapType="point" latKey="lat" lonKey="lng" valueKey="magnitude" projection="mercator" topology="world" />
 * ```
 */
export const mapChartRule: MdxSerializationRule<TMapChartElement> = {
  tagName: "MapChart",
  key: MAP_CHART_KEY,

  deserialize: (node) => {
    const props = parseAttributes(node);

    return createVoidElement<TMapChartElement>(MAP_CHART_KEY, {
      mapType: props.mapType as TMapChartElement["mapType"],
      geoKey: props.geoKey as string | undefined,
      idKey: props.idKey as string | undefined,
      valueKey: props.valueKey as string | undefined,
      latKey: props.latKey as string | undefined,
      lonKey: props.lonKey as string | undefined,
      height: props.height as number | undefined,
      projection: props.projection as string | undefined,
      topology: props.topology as string | undefined,
      colorScheme: props.colorScheme as string | undefined,
      showTooltip: props.showTooltip as boolean | undefined,
    });
  },

  serialize: (element) => {
    const attrs = serializeAttributes(
      {
        mapType: element.mapType,
        geoKey: element.geoKey,
        idKey: element.idKey,
        valueKey: element.valueKey,
        latKey: element.latKey,
        lonKey: element.lonKey,
        height: element.height,
        projection: element.projection,
        topology: element.topology,
        colorScheme: element.colorScheme,
        showTooltip: element.showTooltip,
      },
      {
        include: [
          "mapType",
          "geoKey",
          "idKey",
          "valueKey",
          "latKey",
          "lonKey",
          "height",
          "projection",
          "topology",
          "colorScheme",
          "showTooltip",
        ],
        defaults: {
          mapType: "choropleth",
          topology: "us-states",
          projection: "albersUsa",
          colorScheme: "blues",
          showTooltip: true,
        },
      }
    );

    return {
      type: "mdxJsxFlowElement",
      name: "MapChart",
      attributes: attrs,
      children: [],
    };
  },
};

// ============================================================================
// Export all rules
// ============================================================================

export const chartRules = [
  lineChartRule,
  barChartRule,
  areaChartRule,
  pieChartRule,
  chartRule,
  scatterChartRule,
  histogramChartRule,
  heatmapChartRule,
  boxPlotChartRule,
  mapChartRule,
];
