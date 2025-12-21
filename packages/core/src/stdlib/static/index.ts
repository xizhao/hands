/**
 * @hands/core/stdlib/static
 *
 * Static display components - render data without user interaction.
 */

export {
  ALERT_KEY,
  Alert,
  AlertPlugin,
  type AlertProps,
  createAlertElement,
} from "./alert";
export {
  BADGE_KEY,
  Badge,
  BadgePlugin,
  type BadgeProps,
  createBadgeElement,
} from "./badge";
export {
  autoDetectColumns,
  createLiveValueElement,
  type DisplayType,
  formatCellValue,
  LIVE_VALUE_KEY,
  LiveValueDisplay,
  LiveValuePlugin,
  type LiveValueProps,
  resolveDisplayMode,
  selectDisplayType,
} from "./live-value";
export {
  createMetricElement,
  METRIC_KEY,
  Metric,
  MetricPlugin,
  type MetricProps,
} from "./metric";
export {
  createProgressElement,
  PROGRESS_KEY,
  Progress,
  ProgressPlugin,
  type ProgressProps,
} from "./progress";
