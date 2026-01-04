/**
 * Interactive Map Components
 *
 * MapLibre GL based interactive maps with pan/zoom, markers, popups.
 * Complements the static Vega-Lite MapChart.
 */

export { InteractiveMap, type InteractiveMapProps } from "./interactive-map";
export { MapMarker, type MapMarkerProps } from "./map-marker";
export { MapPopup, type MapPopupProps } from "./map-popup";
export { MapControls, type MapControlsProps } from "./map-controls";
export { useMap } from "./use-map";
export {
  InteractiveMapPlugin,
  InteractiveMapElement,
  createInteractiveMapElement,
  INTERACTIVE_MAP_KEY,
} from "./interactive-map-element";
