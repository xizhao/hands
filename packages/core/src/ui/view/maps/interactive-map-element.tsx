"use client";

/**
 * InteractiveMapElement - Plate editor integration for InteractiveMap
 *
 * Following core's component pattern:
 * - Standalone component (InteractiveMap)
 * - PlateElement wrapper
 * - Plugin registration
 * - Factory function
 */

import { createPlatePlugin, PlateElement, type PlateElementProps, useElement } from "platejs/react";
import { memo } from "react";

import {
  INTERACTIVE_MAP_KEY,
  type TInteractiveMapElement,
  type InteractiveMapMarkerData,
} from "../../../types";
import { InteractiveMap } from "./interactive-map";
import { MapMarker } from "./map-marker";
import { MapControls } from "./map-controls";

export { INTERACTIVE_MAP_KEY };
export type { TInteractiveMapElement };
export type MarkerData = InteractiveMapMarkerData;

// ============================================================================
// PlateElement
// ============================================================================

function InteractiveMapElementComponent(props: PlateElementProps) {
  const element = useElement<TInteractiveMapElement>();

  return (
    <PlateElement {...props} as="div" className="my-2 relative">
      <InteractiveMap
        longitude={element.longitude}
        latitude={element.latitude}
        zoom={element.zoom}
        mapStyle={element.mapStyle}
        height={element.height ?? 400}
      >
        {element.showControls !== false && <MapControls />}
        {element.markers?.map((marker, i) => (
          <MapMarker
            key={i}
            longitude={marker.longitude}
            latitude={marker.latitude}
            color={marker.color}
            popup={marker.popup ? <div className="p-2 text-sm">{marker.popup}</div> : undefined}
          />
        ))}
      </InteractiveMap>
      {/* Hidden children for Plate structure */}
      <span className="absolute top-0 left-0 opacity-0 pointer-events-none">{props.children}</span>
    </PlateElement>
  );
}

export const InteractiveMapElement = memo(InteractiveMapElementComponent);

// ============================================================================
// Plugin
// ============================================================================

export const InteractiveMapPlugin = createPlatePlugin({
  key: INTERACTIVE_MAP_KEY,
  node: {
    isElement: true,
    isInline: false,
    isVoid: true,
    component: InteractiveMapElement,
  },
});

// ============================================================================
// Factory
// ============================================================================

export function createInteractiveMapElement(
  options: {
    longitude?: number;
    latitude?: number;
    zoom?: number;
    mapStyle?: "light" | "dark" | "voyager";
    height?: number;
    markers?: InteractiveMapMarkerData[];
    showControls?: boolean;
  } = {}
): TInteractiveMapElement {
  return {
    type: INTERACTIVE_MAP_KEY,
    longitude: options.longitude ?? -98.5795,
    latitude: options.latitude ?? 39.8283,
    zoom: options.zoom ?? 4,
    mapStyle: options.mapStyle ?? "light",
    height: options.height ?? 400,
    markers: options.markers,
    showControls: options.showControls ?? true,
    children: [{ text: "" }],
  };
}
