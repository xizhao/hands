"use client";

/**
 * useMap - Hook to access map instance from child components
 *
 * Use this hook within InteractiveMap children to access
 * the map instance for programmatic control.
 */

import { useMap as useMapGL } from "react-map-gl/maplibre";
import type { MapRef } from "react-map-gl/maplibre";

interface UseMapResult {
  /** Map instance (null if not mounted) */
  map: MapRef | undefined;
  /** Fly to a location with animation */
  flyTo: (options: { longitude: number; latitude: number; zoom?: number; duration?: number }) => void;
  /** Fit bounds to show all points */
  fitBounds: (bounds: [[number, number], [number, number]], options?: { padding?: number }) => void;
  /** Get current center */
  getCenter: () => { lng: number; lat: number } | undefined;
  /** Get current zoom */
  getZoom: () => number | undefined;
}

export function useMap(): UseMapResult {
  const { current: map } = useMapGL();

  const flyTo = ({
    longitude,
    latitude,
    zoom = 12,
    duration = 1500,
  }: {
    longitude: number;
    latitude: number;
    zoom?: number;
    duration?: number;
  }) => {
    map?.flyTo({
      center: [longitude, latitude],
      zoom,
      duration,
    });
  };

  const fitBounds = (
    bounds: [[number, number], [number, number]],
    options?: { padding?: number }
  ) => {
    map?.fitBounds(bounds, {
      padding: options?.padding ?? 50,
    });
  };

  const getCenter = () => {
    const center = map?.getCenter();
    return center ? { lng: center.lng, lat: center.lat } : undefined;
  };

  const getZoom = () => {
    return map?.getZoom();
  };

  return {
    map,
    flyTo,
    fitBounds,
    getCenter,
    getZoom,
  };
}
