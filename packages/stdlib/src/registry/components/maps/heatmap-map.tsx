/**
 * @component heatmap-map
 * @name Heatmap Map
 * @category maps
 * @description Display density visualization on an interactive map using heatmap rendering.
 * @icon flame
 * @keywords map, heatmap, density, heat, geospatial, location, intensity
 * @example
 * <HeatmapMap
 *   data={[
 *     { lat: 37.7749, lng: -122.4194, weight: 10 },
 *     { lat: 37.7849, lng: -122.4094, weight: 20 },
 *   ]}
 *   latKey="lat"
 *   lngKey="lng"
 *   weightKey="weight"
 *   height={400}
 * />
 */
"use client";

import { HeatmapLayer } from "@deck.gl/aggregation-layers";
import { DeckGL } from "@deck.gl/react";
import * as React from "react";
import { Map } from "react-map-gl/maplibre";
import "maplibre-gl/dist/maplibre-gl.css";
import { cn } from "../../../lib/utils.js";

const DEFAULT_MAP_STYLE = "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json";

export interface HeatmapMapProps<T extends Record<string, unknown>> {
  /** Array of data points to display */
  data: T[];
  /** Key in data for latitude values */
  latKey?: keyof T;
  /** Key in data for longitude values */
  lngKey?: keyof T;
  /** Key in data for weight/intensity values (optional) */
  weightKey?: keyof T;
  /** Additional CSS classes */
  className?: string;
  /** Height of the map in pixels */
  height?: number;
  /** Radius of influence for each point in pixels */
  radiusPixels?: number;
  /** Color range for the heatmap (array of RGBA colors) */
  colorRange?: [number, number, number, number][];
  /** Intensity multiplier */
  intensity?: number;
  /** Threshold for rendering (0-1) */
  threshold?: number;
  /** Initial view state for the map */
  initialViewState?: {
    longitude: number;
    latitude: number;
    zoom: number;
    pitch?: number;
    bearing?: number;
  };
  /** MapLibre style URL */
  mapStyle?: string;
}

const DEFAULT_COLOR_RANGE: [number, number, number, number][] = [
  [1, 152, 189, 255],
  [73, 227, 206, 255],
  [216, 254, 181, 255],
  [254, 237, 177, 255],
  [254, 173, 84, 255],
  [209, 55, 78, 255],
];

export function HeatmapMap<T extends Record<string, unknown>>({
  data,
  latKey = "lat" as keyof T,
  lngKey = "lng" as keyof T,
  weightKey,
  className,
  height = 400,
  radiusPixels = 30,
  colorRange = DEFAULT_COLOR_RANGE,
  intensity = 1,
  threshold = 0.05,
  initialViewState,
  mapStyle = DEFAULT_MAP_STYLE,
}: HeatmapMapProps<T>) {
  // Auto-calculate initial view from data bounds
  const calculatedViewState = React.useMemo(() => {
    if (initialViewState) return initialViewState;
    if (!data || data.length === 0) {
      return { longitude: 0, latitude: 0, zoom: 2 };
    }

    const lats = data.map((d) => Number(d[latKey])).filter((v) => !Number.isNaN(v));
    const lngs = data.map((d) => Number(d[lngKey])).filter((v) => !Number.isNaN(v));

    if (lats.length === 0 || lngs.length === 0) {
      return { longitude: 0, latitude: 0, zoom: 2 };
    }

    return {
      longitude: (Math.min(...lngs) + Math.max(...lngs)) / 2,
      latitude: (Math.min(...lats) + Math.max(...lats)) / 2,
      zoom: 10,
    };
  }, [data, initialViewState, latKey, lngKey]);

  const layers = React.useMemo(() => {
    if (!data || data.length === 0) return [];

    return [
      new HeatmapLayer<T>({
        id: "heatmap",
        data,
        getPosition: (d) => [Number(d[lngKey]), Number(d[latKey])],
        getWeight: weightKey ? (d) => Number(d[weightKey]) : 1,
        radiusPixels,
        colorRange,
        intensity,
        threshold,
      }),
    ];
  }, [data, latKey, lngKey, weightKey, radiusPixels, colorRange, intensity, threshold]);

  // Empty state
  if (!data || data.length === 0) {
    return (
      <div
        className={cn(
          "flex items-center justify-center text-muted-foreground rounded-lg border border-dashed",
          className,
        )}
        style={{ height }}
      >
        No location data available
      </div>
    );
  }

  return (
    <div className={cn("relative w-full rounded-lg overflow-hidden", className)} style={{ height }}>
      <DeckGL initialViewState={calculatedViewState} controller layers={layers}>
        <Map mapStyle={mapStyle} />
      </DeckGL>
    </div>
  );
}
