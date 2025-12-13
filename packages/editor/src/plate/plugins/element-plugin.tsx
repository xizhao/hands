/**
 * Unified Element Plugin
 *
 * A single plugin that handles ALL element rendering:
 * 1. HTML elements (div, span, button, etc.) - rendered via React.createElement
 * 2. Custom components (Button, Card, etc.) - rendered via RSC (React Server Components)
 *
 * ALL custom components go through RSC. This makes the editor truly dynamic -
 * it doesn't need to know what components exist ahead of time. The RSC server
 * is the single source of truth for component rendering.
 *
 * RSC INTEGRATION:
 * When RscBlockContext is available, custom components portal in RSC-rendered
 * content instead of showing placeholders. The RSC element tree is searched
 * for matching elements by component type.
 */

// Import stdlib registry for component discovery (UI hints only)
import { listComponents } from "@hands/stdlib/registry";
import { DndPlugin, useDraggable, useDropLine } from "@platejs/dnd";
import { BlockSelectionPlugin, useBlockSelected } from "@platejs/selection/react";
import { GripVertical, PlusIcon } from "lucide-react";
import type { TElement } from "platejs";
import { PathApi } from "platejs";
import { createPlatePlugin, ElementProvider, useEditorRef } from "platejs/react";
import * as React from "react";
import { useState } from "react";
import type { RenderElementProps } from "slate-react";
import { cn } from "../../lib/utils";
// RSC context for portaling in rendered content
import { useRscBlock } from "../../rsc/context";
import { Button as UIButton } from "../ui/button";

// NOTE: No direct stdlib component imports here.
// ALL custom components (stdlib or user-defined) go through RSC.
// This makes the editor truly dynamic - it doesn't need to know
// what components exist ahead of time.

// ============================================================================
// Constants
// ============================================================================

/**
 * HTML void elements - these truly have no children
 */
export const HTML_VOID_TAGS = new Set([
  "img",
  "br",
  "hr",
  "input",
  "meta",
  "link",
  "area",
  "base",
  "col",
  "embed",
  "source",
  "track",
  "wbr",
]);

/**
 * All valid HTML element tags
 */
export const HTML_ELEMENTS = new Set([
  // Block elements
  "div",
  "p",
  "span",
  "section",
  "article",
  "aside",
  "header",
  "footer",
  "main",
  "nav",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "ul",
  "ol",
  "li",
  "dl",
  "dt",
  "dd",
  "table",
  "thead",
  "tbody",
  "tfoot",
  "tr",
  "th",
  "td",
  "caption",
  "colgroup",
  "col",
  "form",
  "fieldset",
  "legend",
  "label",
  "input",
  "textarea",
  "select",
  "option",
  "optgroup",
  "figure",
  "figcaption",
  "picture",
  "img",
  "video",
  "audio",
  "source",
  "track",
  "iframe",
  "embed",
  "object",
  "param",
  "canvas",
  "svg",
  "math",
  "details",
  "summary",
  "dialog",
  "menu",
  "pre",
  "code",
  "blockquote",
  "hr",
  "br",
  "wbr",
  // Inline elements
  "a",
  "em",
  "strong",
  "small",
  "mark",
  "del",
  "ins",
  "s",
  "u",
  "b",
  "i",
  "sub",
  "sup",
  "abbr",
  "cite",
  "q",
  "dfn",
  "time",
  "data",
  "var",
  "samp",
  "kbd",
  "ruby",
  "rt",
  "rp",
  "bdi",
  "bdo",
  // Special
  "script",
  "noscript",
  "template",
  "slot",
  "style",
  "link",
  "meta",
  "base",
  "title",
  "head",
  "body",
  "html",
  // Plate internal
  "fragment",
  // HTML button (lowercase)
  "button",
]);

/**
 * Reserved Plate keys - filter these out of DOM props
 */
const RESERVED_KEYS = new Set(["type", "id", "children", "isVoid", "jsxProps"]);

// ============================================================================
// Element Classification
// ============================================================================

/**
 * Check if a tag is a custom component (not HTML)
 *
 * JSX convention:
 * - PascalCase = ALWAYS React component
 * - lowercase + not in HTML_ELEMENTS = custom element
 * - lowercase + in HTML_ELEMENTS = native HTML
 */
export function isCustomComponent(tagName: string): boolean {
  if (/^[A-Z]/.test(tagName)) return true;
  return !HTML_ELEMENTS.has(tagName);
}

/**
 * Check if an element should be void (no editable children)
 *
 * Only HTML void tags OR elements with explicit isVoid=true
 */
export function shouldBeVoid(element: TElement): boolean {
  const type = element?.type as string;

  // HTML void elements
  if (type && HTML_VOID_TAGS.has(type.toLowerCase())) {
    return true;
  }

  // Explicit isVoid flag (set by converter for self-closing components)
  if ((element as any)?.isVoid === true) {
    return true;
  }

  return false;
}

// ============================================================================
// Component Discovery (from stdlib registry, for UI hints only)
// ============================================================================

/**
 * Build the set of known stdlib component names from the registry.
 * This is used for UI hints (e.g., autocomplete) - NOT for rendering.
 * ALL component rendering goes through RSC.
 */
function buildStdlibComponentSet(): Set<string> {
  const components = listComponents();
  const names = new Set<string>();

  for (const comp of components) {
    if (comp.files && comp.files.length > 0) {
      names.add(comp.name);
    }
  }

  // Add sub-components not individually registered
  names.add("CardHeader");
  names.add("CardTitle");
  names.add("CardDescription");
  names.add("CardContent");
  names.add("CardFooter");

  return names;
}

/** Set of known stdlib component names (for UI hints) */
export const STDLIB_COMPONENTS = buildStdlibComponentSet();

/**
 * Check if a component name is a known stdlib component
 */
export function isStdlibComponent(name: string): boolean {
  return STDLIB_COMPONENTS.has(name);
}

// ============================================================================
// Element Renderers
// ============================================================================

/**
 * Extract DOM-safe props from element
 */
function getDomProps(element: any): Record<string, unknown> {
  const props: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(element)) {
    if (RESERVED_KEYS.has(key) || key.startsWith("_")) continue;
    props[key] = value;
  }
  return props;
}

// ============================================================================
// Draggable Wrapper for Custom Components
// ============================================================================

/**
 * DropLine component for drag and drop
 */
const DropLine = React.memo(function DropLine({
  className,
  ...props
}: React.ComponentProps<"div">) {
  const { dropLine } = useDropLine();

  if (!dropLine) return null;

  return (
    <div
      {...props}
      className={cn(
        "slate-dropLine",
        "absolute inset-x-0 h-0.5 opacity-100 transition-opacity",
        "bg-blue-500",
        dropLine === "top" && "-top-px",
        dropLine === "bottom" && "-bottom-px",
        className,
      )}
    />
  );
});

/**
 * Block selection overlay for custom components
 * Uses Plate's useBlockSelected hook for proper reactivity
 */
function ComponentBlockSelection() {
  const editor = useEditorRef();
  const isBlockSelected = useBlockSelected();
  const isDragging = editor.getOption(DndPlugin, "isDragging");

  if (!isBlockSelected) return null;

  return (
    <div
      className={cn(
        "pointer-events-none absolute inset-0 z-[1] rounded-[4px]",
        "bg-blue-500/15",
        "transition-opacity duration-200",
        isDragging && "opacity-0",
      )}
      data-slot="block-selection"
    />
  );
}

/**
 * Trigger slash menu on next block
 */
function triggerSlashNextBlock(
  editor: any,
  triggerText: string,
  at?: number[],
  insertAbove = false,
) {
  let _at: number[] | undefined;

  if (at) {
    const slicedPath = at.slice(0, 1);
    _at = insertAbove ? slicedPath : PathApi.next(slicedPath);
  }

  editor.tf.insertNodes(editor.api.create.block(), {
    at: _at,
    select: true,
  });
  editor.tf.insertText(triggerText);
}

/**
 * Draggable wrapper for custom components
 *
 * This provides the same drag handle UI as native Plate elements,
 * allowing custom components to be dragged and reordered.
 */
function DraggableComponentWrapper({
  element,
  children,
}: {
  element: TElement;
  children: React.ReactNode;
}) {
  const editor = useEditorRef();
  const isReadOnly = editor.dom?.readOnly;

  // Skip drag handles in read-only mode
  if (isReadOnly) {
    return <>{children}</>;
  }

  // Render the draggable version
  // Note: We always render drag handles for custom components since they're
  // typically top-level blocks. The DnD plugin handles nested elements gracefully.
  return <DraggableComponentInner element={element}>{children}</DraggableComponentInner>;
}

/**
 * Inner draggable component that uses DnD hooks
 * Separated so hooks are only called when drag is enabled
 */
function DraggableComponentInner({
  element,
  children,
}: {
  element: TElement;
  children: React.ReactNode;
}) {
  const editor = useEditorRef();

  const { isDragging, nodeRef, handleRef } = useDraggable({
    element,
    onDropHandler: (_, { dragItem }) => {
      const id = (dragItem as { id: string[] | string }).id;
      const blockSelectionApi = editor.getApi(BlockSelectionPlugin)?.blockSelection;
      if (blockSelectionApi) {
        blockSelectionApi.add(id);
      }
    },
  });

  const [isDirectHover, setIsDirectHover] = useState(false);

  return (
    <div
      className={cn("group/block relative slate-selectable", isDragging && "opacity-50")}
      onMouseEnter={(e) => {
        e.stopPropagation();
        setIsDirectHover(true);
      }}
      onMouseLeave={() => setIsDirectHover(false)}
    >
      {/* Gutter with drag handle - positioned to the left */}
      <div
        className={cn(
          "absolute -left-12 top-0 z-50 flex h-full items-start pt-0.5",
          "opacity-0 transition-opacity duration-150",
          isDirectHover && "opacity-100",
        )}
        contentEditable={false}
      >
        <div className="flex items-center gap-0.5">
          {/* Plus button to insert */}
          <UIButton
            className={cn("size-6 p-0", isDirectHover ? "opacity-100" : "opacity-0")}
            onClick={(event) => {
              event.stopPropagation();
              event.preventDefault();
              const at = editor.api.findPath(element);
              triggerSlashNextBlock(editor, "/", at, event.altKey);
            }}
            onMouseDown={() => {
              editor.tf.focus();
              editor.getApi(BlockSelectionPlugin)?.blockSelection?.clear();
            }}
            tabIndex={-1}
            variant="ghost"
          >
            <PlusIcon className="size-4 text-gray-500" />
          </UIButton>

          {/* Drag handle */}
          <UIButton
            className="size-6 p-0 cursor-grab active:cursor-grabbing"
            data-plate-prevent-deselect
            ref={handleRef}
            variant="ghost"
            onClick={(event) => {
              event.stopPropagation();
              const blockSelectionApi = editor.getApi(BlockSelectionPlugin)?.blockSelection;
              if (blockSelectionApi) {
                // Toggle selection: if already selected, clear; otherwise select this block
                const elementId = (element as any).id;
                const selectedIds =
                  blockSelectionApi.getNodes?.()?.map((entry: any) => entry[0]?.id) ?? [];
                if (selectedIds.includes(elementId)) {
                  blockSelectionApi.clear?.();
                } else {
                  blockSelectionApi.clear?.();
                  blockSelectionApi.add?.(elementId);
                }
              }
            }}
          >
            <GripVertical className="size-4 text-gray-500" />
          </UIButton>
        </div>
      </div>

      {/* Block content wrapper */}
      <div
        className="slate-blockWrapper relative"
        onContextMenu={(event) =>
          editor
            .getApi(BlockSelectionPlugin)
            ?.blockSelection?.addOnContextMenu?.({ element, event })
        }
        ref={nodeRef}
      >
        {children}
        <DropLine />
        <ComponentBlockSelection />
      </div>
    </div>
  );
}

/**
 * Unified Element Component
 *
 * Renders any element - HTML or custom component.
 * For root-level elements, uses RSC content if available (regardless of type).
 * For nested elements, renders normally (they're part of RSC output).
 */
function ElementRenderer(props: RenderElementProps) {
  const { attributes, children, element } = props;
  const type = (element as any).type as string;
  const domProps = getDomProps(element);
  const editor = useEditorRef();
  const rscBlock = useRscBlock();

  // Get element path to check if root-level
  const path = editor.api.findPath(element);
  const isRootLevel = path && path.length === 1;

  // For root-level elements with RSC available, show RSC content
  // This covers both HTML roots and custom component roots
  if (isRootLevel && rscBlock?.rscElement && !rscBlock.isLoading) {
    return (
      <RootRscPortal
        attributes={attributes}
        rscElement={rscBlock.rscElement}
        plateChildren={children}
        element={element}
      />
    );
  }

  // Custom component (PascalCase or non-HTML) - show placeholder when nested or loading
  if (isCustomComponent(type)) {
    return (
      <CustomComponentRenderer
        attributes={attributes}
        children={children}
        element={element}
        componentName={type}
        props={domProps}
      />
    );
  }

  // HTML element - render directly
  return React.createElement(
    type as keyof JSX.IntrinsicElements,
    { ...attributes, ...domProps },
    children,
  );
}

/**
 * Custom Component Renderer
 *
 * Renders custom components with structural placeholder.
 * Root-level RSC rendering is handled by ElementRenderer.
 * Nested custom components show placeholders since they're
 * already rendered as part of the parent's RSC output.
 */
function CustomComponentRenderer({
  attributes,
  children,
  element,
  componentName,
  props,
}: {
  attributes: any;
  children: React.ReactNode;
  element: TElement;
  componentName: string;
  props: Record<string, unknown>;
}) {
  const rscBlock = useRscBlock();

  return (
    <DraggableComponentWrapper element={element}>
      <StructuralComponentRenderer
        attributes={attributes}
        componentName={componentName}
        props={props}
        plateChildren={children}
        element={element}
        isLoading={rscBlock?.isLoading}
      />
    </DraggableComponentWrapper>
  );
}

/**
 * Root RSC Portal
 *
 * Renders RSC content for the root-level element with Plate's editing affordances.
 * The RSC content is the visual source of truth for the entire block.
 * Plate children are hidden since they're part of the RSC output.
 */
function RootRscPortal({
  attributes,
  rscElement,
  plateChildren,
  element,
}: {
  attributes: any;
  rscElement: React.ReactNode;
  plateChildren: React.ReactNode;
  element: TElement;
}) {
  // The RSC element is the full rendered output from the server
  // We wrap it with Plate's attributes for selection/editing support
  return (
    <div {...attributes} className="rsc-root-portal">
      {/* RSC-rendered content - this is the visual output */}
      <div contentEditable={false} className="rsc-content">
        {rscElement}
      </div>
      {/* Hidden Plate children - required for Slate document structure */}
      <div className="sr-only" aria-hidden="true">
        {plateChildren}
      </div>
    </div>
  );
}

/**
 * Structural Component Placeholder
 *
 * Shown when RSC is loading or unavailable.
 * Displays component structure with props preview.
 */
function StructuralComponentRenderer({
  attributes,
  componentName,
  props,
  plateChildren,
  element,
  isLoading,
}: {
  attributes: any;
  componentName: string;
  props: Record<string, unknown>;
  plateChildren: React.ReactNode;
  element: TElement;
  isLoading?: boolean;
}) {
  // In structural view, show a styled placeholder that indicates the component
  return (
    <div {...attributes} className="my-2">
      <div
        contentEditable={false}
        className={cn(
          "rounded-lg border border-border/50 bg-card/30 p-3",
          isLoading && "animate-pulse",
        )}
      >
        {/* Component header */}
        <div className="flex items-center gap-2 mb-2 pb-2 border-b border-border/30">
          <div className="w-5 h-5 rounded bg-primary/20 flex items-center justify-center">
            <span className="text-xs font-bold text-primary/70">{componentName.charAt(0)}</span>
          </div>
          <code className="text-xs font-mono text-muted-foreground">&lt;{componentName}&gt;</code>
          {isLoading && (
            <span className="text-xs text-muted-foreground/50 ml-auto">Loading...</span>
          )}
          {!isLoading && Object.keys(props).length > 0 && (
            <span className="text-xs text-muted-foreground/50">
              {Object.keys(props).length} props
            </span>
          )}
        </div>
        {/* Show props preview when not loading */}
        {!isLoading && Object.keys(props).length > 0 && (
          <div className="space-y-1">
            {Object.entries(props)
              .slice(0, 3)
              .map(([key, value]) => (
                <div key={key} className="flex items-center gap-2 text-xs">
                  <span className="text-muted-foreground/60">{key}:</span>
                  <span className="font-mono text-muted-foreground truncate max-w-[200px]">
                    {typeof value === "string" ? `"${value}"` : String(value)}
                  </span>
                </div>
              ))}
            {Object.keys(props).length > 3 && (
              <span className="text-xs text-muted-foreground/40">
                +{Object.keys(props).length - 3} more
              </span>
            )}
          </div>
        )}
      </div>
      {plateChildren}
    </div>
  );
}

// ============================================================================
// Fallback Renderer for Unknown Types
// ============================================================================

/**
 * Fallback element renderer for Plate.
 *
 * This is passed to PlateContent's renderElement prop to handle any element
 * types that don't have a registered plugin.
 *
 * Wraps elements with ElementProvider to enable Plate hooks like useBlockSelected.
 */
export function elementFallbackRenderer(
  props: RenderElementProps & { path?: number[] },
): React.ReactElement {
  const { element, path = [] } = props;

  // Wrap with ElementProvider so hooks like useBlockSelected work
  return (
    <ElementProvider
      element={element}
      entry={[element, path]}
      path={path}
      scope={(element as any).type ?? "default"}
    >
      <ElementRenderer {...(props as any)} />
    </ElementProvider>
  );
}

// ============================================================================
// Plugin Definition
// ============================================================================

/**
 * Unified Element Plugin
 *
 * Single plugin that:
 * 1. Extends isElement/isVoid for dynamic element detection
 * 2. Provides elementFallbackRenderer for use with PlateContent
 * 3. Registers render.aboveNodes to handle custom component wrapping
 *
 * NOTE: We use elementFallbackRenderer as the renderElement prop on PlateContent
 * to handle ALL element types dynamically. The DnD plugin's aboveNodes will
 * still wrap these elements because it runs in the plugin pipeline.
 */
export const ElementPlugin = createPlatePlugin({
  key: "element",

  extendEditor: ({ editor }) => {
    const origIsElement = editor.isElement;
    const origIsVoid = editor.isVoid;

    // Any object with type + children is an element
    editor.isElement = (value: any) => {
      if (value && typeof value === "object" && "type" in value && "children" in value) {
        return true;
      }
      return origIsElement(value);
    };

    // Only HTML void tags OR explicit isVoid flag
    editor.isVoid = (element: TElement) => {
      return shouldBeVoid(element) || origIsVoid(element);
    };

    return editor;
  },
});

export default ElementPlugin;
