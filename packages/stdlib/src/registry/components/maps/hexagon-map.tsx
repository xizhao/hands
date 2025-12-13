/**
 * @component hexagon-map
 * @name Hexagon Map
 * @category maps
 * @description Display aggregated point data on an interactive map using 3D hexagonal bins.
 * @icon hexagon
 * @keywords map, hexagon, hexbin, aggregation, 3d, geospatial, location, bins
 * @example
 * <HexagonMap
 *   data={[
 *     { lat: 37.7749, lng: -122.4194 },
 *     { lat: 37.7849, lng: -122.4094 },
 *     { lat: 37.7649, lng: -122.4294 },
 *   ]}
 *   latKey="lat"
 *   lngKey="lng"
 *   height={400}
 * />
 */
"use client";

import { HexagonLayer } from "@deck.gl/aggregation-layers";
import { DeckGL } from "@deck.gl/react";
import * as React from "react";
import { Map } from "react-map-gl/maplibre";
import "maplibre-gl/dist/maplibre-gl.css";
import { cn } from "../../../lib/utils.js";

const DEFAULT_MAP_STYLE = "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json";

export interface HexagonMapProps<T extends Record<string, unknown>> {
  /** Array of data points to display */
  data: T[];
  /** Key in data for latitude values */
  latKey?: keyof T;
  /** Key in data for longitude values */
  lngKey?: keyof T;
  /** Additional CSS classes */
  className?: string;
  /** Height of the map in pixels */
  height?: number;
  /** Radius of each hexagon bin in meters */
  radius?: number;
  /** Height multiplier for elevation */
  elevationScale?: number;
  /** Enable/disable elevation (3D effect) */
  extruded?: boolean;
  /** Coverage of hexagon (0-1) */
  coverage?: number;
  /** Color range for the hexagons (array of RGB colors) */
  colorRange?: [number, number, number][];
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
  /** Callback when a hexagon is clicked */
  onClick?: (info: { object?: { points: T[] } }) => void;
}

const DEFAULT_COLOR_RANGE: [number, number, number][] = [
  [1, 152, 189],
  [73, 227, 206],
  [216, 254, 181],
  [254, 237, 177],
  [254, 173, 84],
  [209, 55, 78],
];

export function HexagonMap<T extends Record<string, unknown>>({
  data,
  latKey = "lat" as keyof T,
  lngKey = "lng" as keyof T,
  className,
  height = 400,
  radius = 1000,
  elevationScale = 4,
  extruded = true,
  coverage = 0.8,
  colorRange = DEFAULT_COLOR_RANGE,
  initialViewState,
  mapStyle = DEFAULT_MAP_STYLE,
  onClick,
}: HexagonMapProps<T>) {
  // Auto-calculate initial view from data bounds
  const calculatedViewState = React.useMemo(() => {
    if (initialViewState) return initialViewState;
    if (!data || data.length === 0) {
      return { longitude: 0, latitude: 0, zoom: 2, pitch: 45, bearing: 0 };
    }

    const lats = data.map((d) => Number(d[latKey])).filter((v) => !isNaN(v));
    const lngs = data.map((d) => Number(d[lngKey])).filter((v) => !isNaN(v));

    if (lats.length === 0 || lngs.length === 0) {
      return { longitude: 0, latitude: 0, zoom: 2, pitch: 45, bearing: 0 };
    }

    return {
      longitude: (Math.min(...lngs) + Math.max(...lngs)) / 2,
      latitude: (Math.min(...lats) + Math.max(...lats)) / 2,
      zoom: 10,
      pitch: 45,
      bearing: 0,
    };
  }, [data, initialViewState, latKey, lngKey]);

  const layers = React.useMemo(() => {
    if (!data || data.length === 0) return [];

    return [
      new HexagonLayer<T>({
        id: "hexagon",
        data,
        pickable: !!onClick,
        extruded,
        radius,
        elevationScale,
        coverage,
        colorRange,
        getPosition: (d) => [Number(d[lngKey]), Number(d[latKey])],
        onClick: (onClick
          ? (info: any) => onClick({ object: info.object as { points: T[] } | undefined })
          : undefined) as any,
      }),
    ];
  }, [data, latKey, lngKey, radius, elevationScale, extruded, coverage, colorRange, onClick]);

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
