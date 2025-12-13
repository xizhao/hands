/**
 * @component scatterplot-map
 * @name Scatterplot Map
 * @category maps
 * @description Display point data on an interactive map with scatterplot visualization.
 * @icon map-pin
 * @keywords map, scatter, points, geospatial, location, coordinates
 * @example
 * <ScatterplotMap
 *   data={[
 *     { lat: 37.7749, lng: -122.4194, value: 100 },
 *     { lat: 34.0522, lng: -118.2437, value: 200 },
 *   ]}
 *   latKey="lat"
 *   lngKey="lng"
 *   radiusKey="value"
 *   height={400}
 * />
 */
"use client";

import { ScatterplotLayer } from "@deck.gl/layers";
import { DeckGL } from "@deck.gl/react";
import * as React from "react";
import { Map } from "react-map-gl/maplibre";
import "maplibre-gl/dist/maplibre-gl.css";
import { cn } from "../../../lib/utils.js";

const DEFAULT_MAP_STYLE = "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json";

export interface ScatterplotMapProps<T extends Record<string, unknown>> {
  /** Array of data points to display */
  data: T[];
  /** Key in data for latitude values */
  latKey?: keyof T;
  /** Key in data for longitude values */
  lngKey?: keyof T;
  /** Key in data for radius values (optional) */
  radiusKey?: keyof T;
  /** Additional CSS classes */
  className?: string;
  /** Height of the map in pixels */
  height?: number;
  /** Base radius when radiusKey is not used */
  radius?: number;
  /** Scale factor for radius */
  radiusScale?: number;
  /** Fill color as RGBA array [r, g, b, a] (0-255) */
  color?: [number, number, number, number];
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
  /** Callback when a point is clicked */
  onClick?: (info: { object?: T }) => void;
}

export function ScatterplotMap<T extends Record<string, unknown>>({
  data,
  latKey = "lat" as keyof T,
  lngKey = "lng" as keyof T,
  radiusKey,
  className,
  height = 400,
  radius = 100,
  radiusScale = 1,
  color = [255, 140, 0, 200],
  initialViewState,
  mapStyle = DEFAULT_MAP_STYLE,
  onClick,
}: ScatterplotMapProps<T>) {
  // Auto-calculate initial view from data bounds
  const calculatedViewState = React.useMemo(() => {
    if (initialViewState) return initialViewState;
    if (!data || data.length === 0) {
      return { longitude: 0, latitude: 0, zoom: 2 };
    }

    const lats = data.map((d) => Number(d[latKey])).filter((v) => !isNaN(v));
    const lngs = data.map((d) => Number(d[lngKey])).filter((v) => !isNaN(v));

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
      new ScatterplotLayer<T>({
        id: "scatterplot",
        data,
        pickable: !!onClick,
        opacity: 0.8,
        stroked: true,
        filled: true,
        radiusScale,
        radiusMinPixels: 3,
        radiusMaxPixels: 100,
        lineWidthMinPixels: 1,
        getPosition: (d) => [Number(d[lngKey]), Number(d[latKey])],
        getRadius: radiusKey ? (d) => Number(d[radiusKey]) : radius,
        getFillColor: color,
        getLineColor: [0, 0, 0, 100],
        onClick: onClick ? (info) => onClick({ object: info.object }) : undefined,
      }),
    ];
  }, [data, latKey, lngKey, radiusKey, radius, radiusScale, color, onClick]);

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
