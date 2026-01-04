"use client";

/**
 * @component InteractiveMap
 * @category view
 * @description Interactive MapLibre GL map with pan/zoom, markers, and popups. Uses free CARTO basemap tiles (no API key required). Supports light/dark/voyager styles.
 * @keywords map, interactive, maplibre, markers, popups, pan, zoom, geolocation, location
 * @example
 * <InteractiveMap longitude={-122.4} latitude={37.8} zoom={12} />
 * <InteractiveMap longitude={-74.006} latitude={40.7128} zoom={10} mapStyle="dark">
 *   <MapMarker longitude={-74.006} latitude={40.7128} popup="New York City" />
 *   <MapControls />
 * </InteractiveMap>
 */

import { Map, type ViewStateChangeEvent } from "react-map-gl/maplibre";
import "maplibre-gl/dist/maplibre-gl.css";
import { createContext, useContext, useMemo, useRef, useState, type ReactNode } from "react";
import type { MapRef } from "react-map-gl/maplibre";

// ============================================================================
// CARTO Basemap Styles (free, no API key required)
// ============================================================================

const BASEMAP_STYLES = {
  light: "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json",
  dark: "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json",
  voyager: "https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json",
} as const;

export type MapStyle = keyof typeof BASEMAP_STYLES;

// ============================================================================
// Map Context (for child components to access map instance)
// ============================================================================

interface MapContextValue {
  map: MapRef | null;
}

const MapContext = createContext<MapContextValue>({ map: null });

export function useMapContext() {
  return useContext(MapContext);
}

// ============================================================================
// ViewState
// ============================================================================

export interface ViewState {
  longitude: number;
  latitude: number;
  zoom: number;
  pitch?: number;
  bearing?: number;
}

// ============================================================================
// Component
// ============================================================================

export interface InteractiveMapProps {
  /** Initial/controlled longitude */
  longitude?: number;
  /** Initial/controlled latitude */
  latitude?: number;
  /** Initial/controlled zoom level (0-22) */
  zoom?: number;
  /** Pitch angle (tilt) in degrees (0-85) */
  pitch?: number;
  /** Bearing (rotation) in degrees */
  bearing?: number;
  /** Map style: "light", "dark", or "voyager" */
  mapStyle?: MapStyle;
  /** Callback when viewport changes */
  onMove?: (viewState: ViewState) => void;
  /** Additional CSS classes */
  className?: string;
  /** Map height (default: 400px) */
  height?: number | string;
  /** Map width (default: 100%) */
  width?: number | string;
  /** Disable map interactions */
  interactive?: boolean;
  /** Child components (markers, popups, layers) */
  children?: ReactNode;
}

export function InteractiveMap({
  longitude = -98.5795,
  latitude = 39.8283,
  zoom = 4,
  pitch = 0,
  bearing = 0,
  mapStyle = "light",
  onMove,
  className,
  height = 400,
  width = "100%",
  interactive = true,
  children,
}: InteractiveMapProps) {
  const mapRef = useRef<MapRef>(null);
  const [viewState, setViewState] = useState<ViewState>({
    longitude,
    latitude,
    zoom,
    pitch,
    bearing,
  });

  const handleMove = (evt: ViewStateChangeEvent) => {
    const vs = evt.viewState;
    const newViewState: ViewState = {
      longitude: vs.longitude,
      latitude: vs.latitude,
      zoom: vs.zoom,
      pitch: vs.pitch,
      bearing: vs.bearing,
    };
    setViewState(newViewState);
    onMove?.(newViewState);
  };

  const styleUrl = BASEMAP_STYLES[mapStyle];

  const contextValue = useMemo(() => ({ map: mapRef.current }), []);

  return (
    <MapContext.Provider value={contextValue}>
      <div className={className}>
        <Map
          ref={mapRef}
          {...viewState}
          onMove={handleMove}
          mapStyle={styleUrl}
          style={{
            width: typeof width === "number" ? `${width}px` : width,
            height: typeof height === "number" ? `${height}px` : height,
          }}
          interactive={interactive}
          attributionControl={false}
        >
          {children}
        </Map>
      </div>
    </MapContext.Provider>
  );
}
