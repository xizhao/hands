/**
 * @component geojson-map
 * @name GeoJSON Map
 * @category maps
 * @description Display GeoJSON features on an interactive map with customizable styling.
 * @icon map
 * @keywords map, geojson, features, polygons, lines, shapes, geospatial, boundaries
 * @example
 * <GeoJsonMap
 *   data={{
 *     type: "FeatureCollection",
 *     features: [
 *       {
 *         type: "Feature",
 *         geometry: { type: "Point", coordinates: [-122.4194, 37.7749] },
 *         properties: { name: "San Francisco" }
 *       }
 *     ]
 *   }}
 *   height={400}
 * />
 */
"use client";

import * as React from "react";
import { DeckGL } from "@deck.gl/react";
import { GeoJsonLayer } from "@deck.gl/layers";
import { Map } from "react-map-gl/maplibre";
import "maplibre-gl/dist/maplibre-gl.css";
import { cn } from "../../../lib/utils.js";

const DEFAULT_MAP_STYLE =
  "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json";

// GeoJSON types
interface GeoJsonGeometry {
  type: string;
  coordinates: number[] | number[][] | number[][][] | number[][][][];
}

interface GeoJsonFeature {
  type: "Feature";
  geometry: GeoJsonGeometry;
  properties?: Record<string, unknown>;
}

interface GeoJsonFeatureCollection {
  type: "FeatureCollection";
  features: GeoJsonFeature[];
}

type GeoJsonData = GeoJsonFeature | GeoJsonFeatureCollection;

export interface GeoJsonMapProps {
  /** GeoJSON data (Feature or FeatureCollection) */
  data: GeoJsonData;
  /** Additional CSS classes */
  className?: string;
  /** Height of the map in pixels */
  height?: number;
  /** Fill color for polygons as RGBA array */
  fillColor?: [number, number, number, number];
  /** Line color as RGBA array */
  lineColor?: [number, number, number, number];
  /** Line width in pixels */
  lineWidth?: number;
  /** Point radius in pixels */
  pointRadius?: number;
  /** Enable/disable 3D extrusion for polygons */
  extruded?: boolean;
  /** Elevation multiplier for extruded polygons */
  elevationScale?: number;
  /** Property key to use for elevation */
  elevationKey?: string;
  /** Property key to use for fill color */
  fillColorKey?: string;
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
  /** Callback when a feature is clicked */
  onClick?: (info: { object?: GeoJsonFeature }) => void;
}

// Helper to get all coordinates from GeoJSON for bounds calculation
function extractCoordinates(data: GeoJsonData): [number, number][] {
  const coords: [number, number][] = [];

  const processGeometry = (geometry: GeoJsonGeometry) => {
    const flatten = (arr: unknown[]): void => {
      for (const item of arr) {
        if (Array.isArray(item)) {
          if (typeof item[0] === "number" && typeof item[1] === "number" && item.length >= 2) {
            coords.push([item[0] as number, item[1] as number]);
          } else {
            flatten(item as unknown[]);
          }
        }
      }
    };
    flatten(geometry.coordinates as unknown[]);
  };

  if (data.type === "FeatureCollection") {
    for (const feature of data.features) {
      processGeometry(feature.geometry);
    }
  } else if (data.type === "Feature") {
    processGeometry(data.geometry);
  }

  return coords;
}

export function GeoJsonMap({
  data,
  className,
  height = 400,
  fillColor = [100, 150, 200, 180],
  lineColor = [255, 255, 255, 200],
  lineWidth = 2,
  pointRadius = 5,
  extruded = false,
  elevationScale = 1,
  elevationKey,
  fillColorKey,
  initialViewState,
  mapStyle = DEFAULT_MAP_STYLE,
  onClick,
}: GeoJsonMapProps) {
  // Auto-calculate initial view from data bounds
  const calculatedViewState = React.useMemo(() => {
    if (initialViewState) return initialViewState;

    const coords = extractCoordinates(data);
    if (coords.length === 0) {
      return { longitude: 0, latitude: 0, zoom: 2 };
    }

    const lngs = coords.map((c) => c[0]);
    const lats = coords.map((c) => c[1]);

    return {
      longitude: (Math.min(...lngs) + Math.max(...lngs)) / 2,
      latitude: (Math.min(...lats) + Math.max(...lats)) / 2,
      zoom: 10,
      pitch: extruded ? 45 : 0,
      bearing: 0,
    };
  }, [data, initialViewState, extruded]);

  const layers = React.useMemo(() => {
    const features =
      data.type === "FeatureCollection" ? data.features : [data];

    if (features.length === 0) return [];

    return [
      new GeoJsonLayer({
        id: "geojson",
        data: data as any,
        pickable: !!onClick,
        stroked: true,
        filled: true,
        extruded,
        wireframe: extruded,
        lineWidthMinPixels: 1,
        getLineWidth: lineWidth,
        getPointRadius: pointRadius,
        getFillColor: (fillColorKey
          ? (f: GeoJsonFeature) => {
              const value = f.properties?.[fillColorKey];
              // Simple color mapping - could be extended
              return typeof value === "number"
                ? [Math.min(255, value * 2), 100, 200 - Math.min(200, value), 180]
                : fillColor;
            }
          : fillColor) as any,
        getLineColor: lineColor,
        getElevation: (elevationKey
          ? (f: GeoJsonFeature) => Number(f.properties?.[elevationKey] || 0) * elevationScale
          : 0) as any,
        onClick: onClick
          ? (info) => onClick({ object: info.object as GeoJsonFeature | undefined })
          : undefined,
      }),
    ];
  }, [data, fillColor, lineColor, lineWidth, pointRadius, extruded, elevationScale, elevationKey, fillColorKey, onClick]);

  // Empty state - check for empty feature collection
  const hasFeatures =
    data.type === "FeatureCollection"
      ? data.features.length > 0
      : data.type === "Feature";

  if (!hasFeatures) {
    return (
      <div
        className={cn(
          "flex items-center justify-center text-muted-foreground rounded-lg border border-dashed",
          className
        )}
        style={{ height }}
      >
        No GeoJSON features available
      </div>
    );
  }

  return (
    <div
      className={cn("relative w-full rounded-lg overflow-hidden", className)}
      style={{ height }}
    >
      <DeckGL initialViewState={calculatedViewState} controller layers={layers}>
        <Map mapStyle={mapStyle} />
      </DeckGL>
    </div>
  );
}
