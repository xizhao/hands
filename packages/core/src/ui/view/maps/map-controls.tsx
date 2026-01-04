"use client";

/**
 * MapControls - Navigation controls for InteractiveMap
 *
 * Adds zoom, compass, and fullscreen controls to the map.
 */

import { NavigationControl, FullscreenControl, ScaleControl, GeolocateControl } from "react-map-gl/maplibre";

export interface MapControlsProps {
  /** Show zoom in/out buttons */
  showZoom?: boolean;
  /** Show compass/rotation control */
  showCompass?: boolean;
  /** Show fullscreen toggle */
  showFullscreen?: boolean;
  /** Show scale bar */
  showScale?: boolean;
  /** Show geolocation button */
  showGeolocate?: boolean;
  /** Position on map */
  position?: "top-left" | "top-right" | "bottom-left" | "bottom-right";
}

export function MapControls({
  showZoom = true,
  showCompass = true,
  showFullscreen = false,
  showScale = false,
  showGeolocate = false,
  position = "top-right",
}: MapControlsProps) {
  return (
    <>
      {(showZoom || showCompass) && (
        <NavigationControl
          position={position}
          showZoom={showZoom}
          showCompass={showCompass}
          visualizePitch={true}
        />
      )}
      {showFullscreen && <FullscreenControl position={position} />}
      {showScale && <ScaleControl position={position === "top-right" || position === "top-left" ? "bottom-left" : position} />}
      {showGeolocate && <GeolocateControl position={position} />}
    </>
  );
}
