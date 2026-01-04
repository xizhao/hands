"use client";

/**
 * MapPopup - Popup anchored to map coordinates
 *
 * Display content in a popup at specific coordinates.
 * Typically used with MapMarker but can be standalone.
 */

import { Popup } from "react-map-gl/maplibre";
import type { ReactNode } from "react";

export interface MapPopupProps {
  /** Longitude coordinate */
  longitude: number;
  /** Latitude coordinate */
  latitude: number;
  /** Close handler */
  onClose?: () => void;
  /** Popup content */
  children: ReactNode;
  /** Anchor position */
  anchor?: "top" | "bottom" | "left" | "right" | "top-left" | "top-right" | "bottom-left" | "bottom-right";
  /** Offset from anchor point [x, y] */
  offset?: number | [number, number];
  /** Show close button */
  closeButton?: boolean;
  /** Close on click outside */
  closeOnClick?: boolean;
  /** Additional CSS class */
  className?: string;
  /** Max width of popup */
  maxWidth?: string;
}

export function MapPopup({
  longitude,
  latitude,
  onClose,
  children,
  anchor = "bottom",
  offset,
  closeButton = true,
  closeOnClick = true,
  className,
  maxWidth = "240px",
}: MapPopupProps) {
  return (
    <Popup
      longitude={longitude}
      latitude={latitude}
      anchor={anchor}
      offset={offset}
      closeButton={closeButton}
      closeOnClick={closeOnClick}
      onClose={onClose}
      className={className}
      maxWidth={maxWidth}
    >
      {children}
    </Popup>
  );
}
