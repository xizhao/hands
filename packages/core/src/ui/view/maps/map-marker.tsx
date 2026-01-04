"use client";

/**
 * MapMarker - Pin marker for InteractiveMap
 *
 * Place markers at specific coordinates on the map.
 * Supports custom colors, click handlers, and popup content.
 */

import { Marker } from "react-map-gl/maplibre";
import { useState, type ReactNode } from "react";
import { MapPopup } from "./map-popup";

export interface MapMarkerProps {
  /** Longitude coordinate */
  longitude: number;
  /** Latitude coordinate */
  latitude: number;
  /** Marker color (CSS color value) */
  color?: string;
  /** Marker size in pixels */
  size?: number;
  /** Click handler */
  onClick?: () => void;
  /** Popup content (shown on click) */
  popup?: ReactNode;
  /** Custom marker content (replaces default pin) */
  children?: ReactNode;
  /** Anchor position */
  anchor?: "center" | "top" | "bottom" | "left" | "right" | "top-left" | "top-right" | "bottom-left" | "bottom-right";
}

function DefaultPin({ color = "#ef4444", size = 24 }: { color?: string; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      style={{ cursor: "pointer" }}
    >
      <path
        d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5a2.5 2.5 0 1 1 0-5 2.5 2.5 0 0 1 0 5z"
        fill={color}
      />
    </svg>
  );
}

export function MapMarker({
  longitude,
  latitude,
  color = "#ef4444",
  size = 24,
  onClick,
  popup,
  children,
  anchor = "bottom",
}: MapMarkerProps) {
  const [showPopup, setShowPopup] = useState(false);

  const handleClick = () => {
    if (popup) {
      setShowPopup(!showPopup);
    }
    onClick?.();
  };

  return (
    <>
      <Marker
        longitude={longitude}
        latitude={latitude}
        anchor={anchor}
        onClick={handleClick}
      >
        {children ?? <DefaultPin color={color} size={size} />}
      </Marker>
      {popup && showPopup && (
        <MapPopup
          longitude={longitude}
          latitude={latitude}
          onClose={() => setShowPopup(false)}
          offset={size / 2}
        >
          {popup}
        </MapPopup>
      )}
    </>
  );
}
