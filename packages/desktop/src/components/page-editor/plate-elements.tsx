/**
 * Plate Element Components
 *
 * Real styled element components for the Plate editor.
 */

import { PlateElement, type PlateElementProps } from "platejs/react";
import { cn } from "@/lib/utils";

export function ParagraphElement({ className, children, ...props }: PlateElementProps) {
  // Use div instead of p to avoid hydration errors with Plate's Draggable wrapper
  // which adds div elements around content (div cannot be a descendant of p)
  return (
    <PlateElement className={cn("m-0 py-1 text-base leading-7", className)} {...props}>
      {children}
    </PlateElement>
  );
}

export function H1Element({ className, children, ...props }: PlateElementProps) {
  return (
    <PlateElement
      as="h1"
      className={cn("mt-6 mb-2 text-3xl font-bold tracking-tight", className)}
      {...props}
    >
      {children}
    </PlateElement>
  );
}

export function H2Element({ className, children, ...props }: PlateElementProps) {
  return (
    <PlateElement
      as="h2"
      className={cn("mt-5 mb-2 text-2xl font-semibold tracking-tight", className)}
      {...props}
    >
      {children}
    </PlateElement>
  );
}

export function H3Element({ className, children, ...props }: PlateElementProps) {
  return (
    <PlateElement
      as="h3"
      className={cn("mt-4 mb-2 text-xl font-semibold tracking-tight", className)}
      {...props}
    >
      {children}
    </PlateElement>
  );
}

export function BlockquoteElement({ className, children, ...props }: PlateElementProps) {
  return (
    <PlateElement
      as="blockquote"
      className={cn("my-2 border-l-2 border-gray-600 pl-4 italic text-gray-400", className)}
      {...props}
    >
      {children}
    </PlateElement>
  );
}

export function HrElement({ className, children, ...props }: PlateElementProps) {
  return (
    <PlateElement className={cn("my-4", className)} {...props}>
      <hr className="border-t border-gray-700" />
      {children}
    </PlateElement>
  );
}
