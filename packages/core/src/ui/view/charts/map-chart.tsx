"use client";

/**
 * MapChart - Geographic visualization
 *
 * Supports choropleth (filled regions) and point maps.
 * Uses Vega-Lite's geographic projections.
 */

import { createPlatePlugin, PlateElement, type PlateElementProps, useElement } from "platejs/react";
import { memo } from "react";

import { MAP_CHART_KEY, type TMapChartElement, type VegaLiteSpec } from "../../../types";
import { VegaChart } from "./vega-chart";

// ============================================================================
// Built-in TopoJSON sources
// ============================================================================

const BUILT_IN_TOPOLOGIES: Record<string, string> = {
  world: "https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json",
  "us-states": "https://cdn.jsdelivr.net/npm/us-atlas@3/states-10m.json",
  "us-counties": "https://cdn.jsdelivr.net/npm/us-atlas@3/counties-10m.json",
};

// ============================================================================
// Standalone Component
// ============================================================================

export interface MapChartProps {
  /** Map type: choropleth (filled regions) or point (markers) */
  mapType?: "choropleth" | "point";
  /** Geographic feature key for joining data (e.g., "id") */
  geoKey?: string;
  /** Data key for region/point identifier */
  idKey?: string;
  /** Data key for color value */
  valueKey?: string;
  /** For point maps: latitude key */
  latKey?: string;
  /** For point maps: longitude key */
  lonKey?: string;
  /** Chart height in pixels */
  height?: number;
  /** Override data */
  data?: Record<string, unknown>[];
  /** Geographic projection */
  projection?: string;
  /** TopoJSON URL or built-in name (world, us-states, us-counties) */
  topology?: string;
  /** Color scheme for choropleth */
  colorScheme?: string;
  /** Show tooltip on hover */
  showTooltip?: boolean;
  /** Additional CSS classes */
  className?: string;
}

/**
 * Build Vega-Lite spec for choropleth map
 */
function buildChoroplethSpec(props: MapChartProps): VegaLiteSpec {
  const {
    geoKey = "id",
    idKey = "id",
    valueKey = "value",
    projection = "albersUsa",
    topology = "us-states",
    colorScheme = "blues",
  } = props;

  const topoUrl = BUILT_IN_TOPOLOGIES[topology] ?? topology;
  const featureName =
    topology === "us-counties" ? "counties" : topology === "us-states" ? "states" : "countries";

  return {
    projection: { type: projection },
    layer: [
      {
        data: {
          url: topoUrl,
          format: { type: "topojson", feature: featureName },
        },
        mark: { type: "geoshape", stroke: "white", strokeWidth: 0.5 },
        encoding: {
          color: { value: "#eee" },
        },
      },
      {
        data: {
          url: topoUrl,
          format: { type: "topojson", feature: featureName },
        },
        transform: [
          {
            lookup: geoKey,
            from: {
              data: { name: "source" },
              key: idKey,
              fields: [valueKey],
            },
          },
        ],
        mark: { type: "geoshape", stroke: "white", strokeWidth: 0.5 },
        encoding: {
          color: {
            field: valueKey,
            type: "quantitative",
            scale: { scheme: colorScheme },
          },
          tooltip:
            props.showTooltip !== false
              ? [
                  { field: geoKey, type: "nominal", title: "Region" },
                  { field: valueKey, type: "quantitative" },
                ]
              : undefined,
        },
      },
    ],
  };
}

/**
 * Build Vega-Lite spec for point map
 */
function buildPointMapSpec(props: MapChartProps): VegaLiteSpec {
  const {
    latKey = "latitude",
    lonKey = "longitude",
    valueKey = "value",
    projection = "albersUsa",
    topology = "us-states",
    colorScheme = "blues",
  } = props;

  const topoUrl = BUILT_IN_TOPOLOGIES[topology] ?? topology;
  const featureName =
    topology === "us-counties" ? "counties" : topology === "us-states" ? "states" : "countries";

  return {
    projection: { type: projection },
    layer: [
      {
        data: {
          url: topoUrl,
          format: { type: "topojson", feature: featureName },
        },
        mark: { type: "geoshape", fill: "#eee", stroke: "white", strokeWidth: 0.5 },
      },
      {
        mark: { type: "circle", opacity: 0.7 },
        encoding: {
          longitude: { field: lonKey, type: "quantitative" },
          latitude: { field: latKey, type: "quantitative" },
          size: valueKey
            ? { field: valueKey, type: "quantitative", scale: { range: [10, 500] } }
            : { value: 50 },
          color: valueKey
            ? { field: valueKey, type: "quantitative", scale: { scheme: colorScheme } }
            : { value: "#4c78a8" },
          tooltip:
            props.showTooltip !== false
              ? [
                  { field: latKey, type: "quantitative", title: "Lat" },
                  { field: lonKey, type: "quantitative", title: "Lon" },
                  ...(valueKey ? [{ field: valueKey, type: "quantitative" }] : []),
                ]
              : undefined,
        },
      },
    ],
  };
}

export function MapChart(props: MapChartProps) {
  const { mapType = "choropleth" } = props;
  const spec = mapType === "point" ? buildPointMapSpec(props) : buildChoroplethSpec(props);

  return (
    <VegaChart
      spec={spec}
      height={props.height ?? 400}
      data={props.data}
      className={props.className}
    />
  );
}

// ============================================================================
// Plate Plugin
// ============================================================================

function MapChartElement(props: PlateElementProps) {
  const element = useElement<TMapChartElement>();

  return (
    <PlateElement {...props} as="div" className="my-2 relative">
      <MapChart
        mapType={element.mapType}
        geoKey={element.geoKey}
        idKey={element.idKey}
        valueKey={element.valueKey}
        latKey={element.latKey}
        lonKey={element.lonKey}
        height={element.height}
        projection={element.projection}
        topology={element.topology}
        colorScheme={element.colorScheme}
        showTooltip={element.showTooltip}
      />
      <span className="absolute top-0 left-0 opacity-0 pointer-events-none">{props.children}</span>
    </PlateElement>
  );
}

export const MapChartPlugin = createPlatePlugin({
  key: MAP_CHART_KEY,
  node: {
    isElement: true,
    isInline: true,
    isVoid: true,
    component: memo(MapChartElement),
  },
});

export function createMapChartElement(
  options: Partial<Omit<TMapChartElement, "type" | "children">> = {},
): TMapChartElement {
  return {
    type: MAP_CHART_KEY,
    mapType: options.mapType as "choropleth" | "point" | undefined,
    geoKey: options.geoKey as string | undefined,
    idKey: options.idKey as string | undefined,
    valueKey: options.valueKey as string | undefined,
    latKey: options.latKey as string | undefined,
    lonKey: options.lonKey as string | undefined,
    height: (options.height as number | undefined) ?? 400,
    projection: options.projection as string | undefined,
    topology: options.topology as string | undefined,
    colorScheme: options.colorScheme as string | undefined,
    showTooltip: options.showTooltip as boolean | undefined,
    children: [{ text: "" }],
  };
}

export { MAP_CHART_KEY };
