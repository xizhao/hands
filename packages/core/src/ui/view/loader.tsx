"use client";

/**
 * @component Loader
 * @category static
 * @description Animated loading indicator with multiple visual styles.
 * Supports spinner, dots, bars, pulse, ring, bounce, wave, and square variants.
 * @keywords loader, loading, spinner, dots, progress, animation, wait
 * @example
 * <Loader />
 * <Loader variant="dots" size="lg" />
 * <Loader variant="bars" color="primary" label="Loading..." />
 */

import { createPlatePlugin, PlateElement, type PlateElementProps, useElement } from "platejs/react";
import { memo } from "react";

import { LOADER_KEY, type TLoaderElement } from "../../types";

// ============================================================================
// Types
// ============================================================================

export type LoaderVariant =
  | "spinner"
  | "dots"
  | "bars"
  | "pulse"
  | "ring"
  | "bounce"
  | "wave"
  | "square"
  | "hands";
export type LoaderSize = "xs" | "sm" | "md" | "lg" | "xl";
export type LoaderColor = "default" | "primary" | "secondary" | "muted";
export type LoaderSpeed = "slow" | "normal" | "fast";

// ============================================================================
// Size & Color Mappings
// ============================================================================

const sizeMap: Record<LoaderSize, { container: string; element: string; text: string }> = {
  xs: { container: "gap-0.5", element: "size-3", text: "text-[10px]" },
  sm: { container: "gap-1", element: "size-4", text: "text-xs" },
  md: { container: "gap-1.5", element: "size-6", text: "text-sm" },
  lg: { container: "gap-2", element: "size-8", text: "text-base" },
  xl: { container: "gap-2.5", element: "size-12", text: "text-lg" },
};

const colorMap: Record<LoaderColor, string> = {
  default: "text-foreground",
  primary: "text-primary",
  secondary: "text-secondary-foreground",
  muted: "text-muted-foreground",
};

const _speedMap: Record<LoaderSpeed, string> = {
  slow: "duration-1500",
  normal: "duration-1000",
  fast: "duration-500",
};

// ============================================================================
// Animation Styles (inline for portability)
// ============================================================================

const spinKeyframes = `
@keyframes loader-spin { to { transform: rotate(360deg); } }
@keyframes loader-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.3; } }
@keyframes loader-bounce { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-50%); } }
@keyframes loader-wave { 0%, 100% { transform: scaleY(0.4); } 50% { transform: scaleY(1); } }
@keyframes loader-square-rotate { 0% { transform: rotate(0deg); } 25% { transform: rotate(90deg); } 50% { transform: rotate(180deg); } 75% { transform: rotate(270deg); } 100% { transform: rotate(360deg); } }
@keyframes loader-ring-pulse { 0% { transform: scale(0.8); opacity: 1; } 100% { transform: scale(1.4); opacity: 0; } }
@keyframes loader-hands-wave { 0%, 100% { transform: rotate(-5deg) scale(1); } 50% { transform: rotate(5deg) scale(1.05); } }
`;

// ============================================================================
// Variant Components
// ============================================================================

function SpinnerLoader({
  size,
  color,
  speed,
}: {
  size: LoaderSize;
  color: LoaderColor;
  speed: LoaderSpeed;
}) {
  const s = sizeMap[size];
  const duration = speed === "slow" ? "1.5s" : speed === "fast" ? "0.5s" : "0.8s";

  return (
    <div
      className={`${s.element} ${colorMap[color]} rounded-full border-2 border-current border-t-transparent`}
      style={{ animation: `loader-spin ${duration} linear infinite` }}
    />
  );
}

function DotsLoader({
  size,
  color,
  speed,
}: {
  size: LoaderSize;
  color: LoaderColor;
  speed: LoaderSpeed;
}) {
  const s = sizeMap[size];
  const dotSize =
    size === "xs"
      ? "size-1"
      : size === "sm"
        ? "size-1.5"
        : size === "md"
          ? "size-2"
          : size === "lg"
            ? "size-2.5"
            : "size-3";
  const duration = speed === "slow" ? "1.5s" : speed === "fast" ? "0.6s" : "1s";

  return (
    <div className={`flex items-center ${s.container}`}>
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className={`${dotSize} ${colorMap[color]} rounded-full bg-current`}
          style={{
            animation: `loader-pulse ${duration} ease-in-out infinite`,
            animationDelay: `${i * 0.15}s`,
          }}
        />
      ))}
    </div>
  );
}

function BarsLoader({
  size,
  color,
  speed,
}: {
  size: LoaderSize;
  color: LoaderColor;
  speed: LoaderSpeed;
}) {
  const barHeight =
    size === "xs"
      ? "h-3"
      : size === "sm"
        ? "h-4"
        : size === "md"
          ? "h-5"
          : size === "lg"
            ? "h-6"
            : "h-8";
  const barWidth =
    size === "xs" ? "w-0.5" : size === "sm" ? "w-1" : size === "md" ? "w-1" : "w-1.5";
  const gap = size === "xs" || size === "sm" ? "gap-0.5" : "gap-1";
  const duration = speed === "slow" ? "1.2s" : speed === "fast" ? "0.5s" : "0.8s";

  return (
    <div className={`flex items-center ${gap}`}>
      {[0, 1, 2, 3, 4].map((i) => (
        <div
          key={i}
          className={`${barHeight} ${barWidth} ${colorMap[color]} bg-current rounded-full origin-bottom`}
          style={{
            animation: `loader-wave ${duration} ease-in-out infinite`,
            animationDelay: `${i * 0.1}s`,
          }}
        />
      ))}
    </div>
  );
}

function PulseLoader({
  size,
  color,
  speed,
}: {
  size: LoaderSize;
  color: LoaderColor;
  speed: LoaderSpeed;
}) {
  const s = sizeMap[size];
  const duration = speed === "slow" ? "2s" : speed === "fast" ? "0.8s" : "1.2s";

  return (
    <div
      className={`${s.element} ${colorMap[color]} rounded-full bg-current`}
      style={{ animation: `loader-pulse ${duration} ease-in-out infinite` }}
    />
  );
}

function RingLoader({
  size,
  color,
  speed,
}: {
  size: LoaderSize;
  color: LoaderColor;
  speed: LoaderSpeed;
}) {
  const s = sizeMap[size];
  const duration = speed === "slow" ? "2s" : speed === "fast" ? "0.8s" : "1.2s";

  return (
    <div className={`relative ${s.element}`}>
      <div
        className={`absolute inset-0 ${colorMap[color]} rounded-full border-2 border-current`}
        style={{ animation: `loader-ring-pulse ${duration} ease-out infinite` }}
      />
      <div
        className={`absolute inset-0 ${colorMap[color]} rounded-full border-2 border-current`}
        style={{
          animation: `loader-ring-pulse ${duration} ease-out infinite`,
          animationDelay: `${parseFloat(duration) / 2}s`,
        }}
      />
    </div>
  );
}

function BounceLoader({
  size,
  color,
  speed,
}: {
  size: LoaderSize;
  color: LoaderColor;
  speed: LoaderSpeed;
}) {
  const s = sizeMap[size];
  const dotSize =
    size === "xs"
      ? "size-1.5"
      : size === "sm"
        ? "size-2"
        : size === "md"
          ? "size-2.5"
          : size === "lg"
            ? "size-3"
            : "size-4";
  const duration = speed === "slow" ? "1s" : speed === "fast" ? "0.4s" : "0.6s";

  return (
    <div className={`flex items-end ${s.container}`}>
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className={`${dotSize} ${colorMap[color]} rounded-full bg-current`}
          style={{
            animation: `loader-bounce ${duration} ease-in-out infinite`,
            animationDelay: `${i * 0.1}s`,
          }}
        />
      ))}
    </div>
  );
}

function WaveLoader({
  size,
  color,
  speed,
}: {
  size: LoaderSize;
  color: LoaderColor;
  speed: LoaderSpeed;
}) {
  const dotSize =
    size === "xs"
      ? "size-1"
      : size === "sm"
        ? "size-1.5"
        : size === "md"
          ? "size-2"
          : size === "lg"
            ? "size-2.5"
            : "size-3";
  const gap = size === "xs" || size === "sm" ? "gap-0.5" : "gap-1";
  const duration = speed === "slow" ? "1.8s" : speed === "fast" ? "0.8s" : "1.2s";

  return (
    <div className={`flex items-center ${gap}`}>
      {[0, 1, 2, 3, 4].map((i) => (
        <div
          key={i}
          className={`${dotSize} ${colorMap[color]} rounded-full bg-current`}
          style={{
            animation: `loader-bounce ${duration} ease-in-out infinite`,
            animationDelay: `${i * 0.1}s`,
          }}
        />
      ))}
    </div>
  );
}

function SquareLoader({
  size,
  color,
  speed,
}: {
  size: LoaderSize;
  color: LoaderColor;
  speed: LoaderSpeed;
}) {
  const s = sizeMap[size];
  const squareSize =
    size === "xs"
      ? "size-2"
      : size === "sm"
        ? "size-3"
        : size === "md"
          ? "size-4"
          : size === "lg"
            ? "size-5"
            : "size-6";
  const duration = speed === "slow" ? "2s" : speed === "fast" ? "0.6s" : "1s";

  return (
    <div className={`${s.element} flex items-center justify-center`}>
      <div
        className={`${squareSize} ${colorMap[color]} bg-current rounded-sm`}
        style={{ animation: `loader-square-rotate ${duration} steps(4) infinite` }}
      />
    </div>
  );
}

function HandsLoader({
  size,
  color,
  speed,
}: {
  size: LoaderSize;
  color: LoaderColor;
  speed: LoaderSpeed;
}) {
  const iconSize =
    size === "xs" ? 12 : size === "sm" ? 16 : size === "md" ? 24 : size === "lg" ? 32 : 48;
  const duration = speed === "slow" ? "1.5s" : speed === "fast" ? "0.6s" : "1s";

  return (
    <div
      className={`${colorMap[color]} inline-flex`}
      style={{ animation: `loader-hands-wave ${duration} ease-in-out infinite` }}
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width={iconSize}
        height={iconSize}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M18 11V6a2 2 0 0 0-2-2a2 2 0 0 0-2 2" />
        <path d="M14 10V4a2 2 0 0 0-2-2a2 2 0 0 0-2 2v2" />
        <path d="M10 10.5V6a2 2 0 0 0-2-2a2 2 0 0 0-2 2v8" />
        <path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15" />
      </svg>
    </div>
  );
}

// ============================================================================
// Main Component
// ============================================================================

export interface LoaderProps {
  /** Loading animation style */
  variant?: LoaderVariant;
  /** Size of the loader */
  size?: LoaderSize;
  /** Color variant */
  color?: LoaderColor;
  /** Optional label text */
  label?: string;
  /** Animation speed */
  speed?: LoaderSpeed;
  /** Additional CSS classes */
  className?: string;
}

/**
 * Standalone Loader component for use outside Plate editor.
 */
export function Loader({
  variant = "spinner",
  size = "md",
  color = "default",
  label,
  speed = "normal",
  className,
}: LoaderProps) {
  const s = sizeMap[size];

  const LoaderComponent = {
    spinner: SpinnerLoader,
    dots: DotsLoader,
    bars: BarsLoader,
    pulse: PulseLoader,
    ring: RingLoader,
    bounce: BounceLoader,
    wave: WaveLoader,
    square: SquareLoader,
    hands: HandsLoader,
  }[variant];

  return (
    <>
      <style>{spinKeyframes}</style>
      <div
        className={`inline-flex flex-col items-center justify-center ${s.container} ${className || ""}`}
        role="status"
        aria-label={label || "Loading"}
      >
        <LoaderComponent size={size} color={color} speed={speed} />
        {label && <span className={`${s.text} ${colorMap[color]} mt-2`}>{label}</span>}
      </div>
    </>
  );
}

// ============================================================================
// Plate Plugin
// ============================================================================

function LoaderElement(props: PlateElementProps) {
  const element = useElement<TLoaderElement>();
  const { variant = "spinner", size = "md", color = "default", label, speed = "normal" } = element;

  return (
    <PlateElement {...props} as="span" className="inline-flex">
      <Loader variant={variant} size={size} color={color} label={label} speed={speed} />
      <span className="hidden">{props.children}</span>
    </PlateElement>
  );
}

/**
 * Loader Plugin - animated loading indicator.
 */
export const LoaderPlugin = createPlatePlugin({
  key: LOADER_KEY,
  node: {
    isElement: true,
    isInline: true,
    isVoid: true,
    component: memo(LoaderElement),
  },
});

// ============================================================================
// Element Factory
// ============================================================================

/**
 * Create a Loader element for insertion into editor.
 */
export function createLoaderElement(options?: {
  variant?: LoaderVariant;
  size?: LoaderSize;
  color?: LoaderColor;
  label?: string;
  speed?: LoaderSpeed;
}): TLoaderElement {
  return {
    type: LOADER_KEY,
    variant: options?.variant,
    size: options?.size,
    color: options?.color,
    label: options?.label,
    speed: options?.speed,
    children: [{ text: "" }],
  };
}

export { LOADER_KEY };
