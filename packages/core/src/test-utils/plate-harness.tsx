/**
 * Plate Test Harness
 *
 * Minimal Plate editor setup for testing MDX deserialization and rendering.
 * Used in stories and Playwright tests.
 */

"use client";

import { BaseColumnItemPlugin, BaseColumnPlugin } from "@platejs/layout";
import { MarkdownPlugin, remarkMdx } from "@platejs/markdown";
import { Plate, PlateContent, usePlateEditor } from "platejs/react";
import { SlateElement, type SlateElementProps } from "platejs/static";
import remarkGfm from "remark-gfm";
import type { TColumnElement } from "platejs";

import { serializationRules, toMarkdownPluginRules } from "../primitives/serialization";
import { MockDataProvider } from "./mock-data-provider";

// Import all stdlib plugins for rendering
import {
  LiveValuePlugin,
  LineChartPlugin,
  BarChartPlugin,
  AreaChartPlugin,
  PieChartPlugin,
  MetricPlugin,
  BadgePlugin,
  ProgressPlugin,
  AlertPlugin,
  LoaderPlugin,
} from "../ui/view";
import {
  LiveActionPlugin,
  ButtonPlugin,
  InputPlugin,
  SelectPlugin,
  CheckboxPlugin,
  TextareaPlugin,
} from "../ui/action";
import { DataGridPlugin, KanbanPlugin } from "../ui/data";

// ============================================================================
// Column Components (inline to avoid circular deps)
// ============================================================================

function ColumnElementStatic(props: SlateElementProps<TColumnElement>) {
  const { width } = props.element;
  return (
    <SlateElement
      className="border border-transparent p-1.5"
      style={{ width: width ?? "100%" }}
      {...props}
    />
  );
}

function ColumnGroupElementStatic(props: SlateElementProps) {
  return (
    <SlateElement className="my-2" {...props}>
      <div className="flex size-full gap-4 rounded">{props.children}</div>
    </SlateElement>
  );
}

// Column plugins configured with static components
const ColumnPlugin = BaseColumnPlugin.withComponent(ColumnGroupElementStatic);
const ColumnItemPlugin = BaseColumnItemPlugin.withComponent(ColumnElementStatic);

/**
 * All stdlib Plate plugins
 */
export const StdlibPlugins = [
  // View components
  LiveValuePlugin,
  LineChartPlugin,
  BarChartPlugin,
  AreaChartPlugin,
  PieChartPlugin,
  MetricPlugin,
  BadgePlugin,
  ProgressPlugin,
  AlertPlugin,
  LoaderPlugin,
  // Action components
  LiveActionPlugin,
  ButtonPlugin,
  InputPlugin,
  SelectPlugin,
  CheckboxPlugin,
  TextareaPlugin,
  // Data components
  DataGridPlugin,
  KanbanPlugin,
  // Layout components
  ColumnPlugin,
  ColumnItemPlugin,
];

/**
 * Markdown plugin configured with all stdlib serialization rules
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const TestMarkdownPlugin: any = MarkdownPlugin.configure({
  options: {
    remarkPlugins: [remarkGfm, remarkMdx],
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    rules: toMarkdownPluginRules(serializationRules) as any,
  },
});

/**
 * All plugins needed for testing (stdlib + markdown)
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const TestPlugins: any[] = [...StdlibPlugins, TestMarkdownPlugin];

interface PlateHarnessProps {
  /** MDX content to deserialize and render */
  mdx: string;
  /** Mock data for LiveValue queries */
  mockData?: Record<string, unknown>[];
  /** Additional class name */
  className?: string;
}

/**
 * Plate editor harness for testing MDX rendering.
 *
 * Deserializes MDX content and renders it using all stdlib plugins.
 */
export function PlateHarness({ mdx, mockData, className }: PlateHarnessProps) {
  // Create a stable editor that deserializes once on mount
  const editor = usePlateEditor({
    plugins: TestPlugins,
    // Let the editor deserialize the MDX
    value: (editor) => {
      if (!mdx) return [{ type: "p", children: [{ text: "" }] }];
      try {
        const api = editor.getApi(MarkdownPlugin);
        return api.markdown.deserialize(mdx);
      } catch (error) {
        console.error("Failed to deserialize MDX:", error);
        return [{ type: "p", children: [{ text: `Error: ${error}` }] }];
      }
    },
  });

  const content = (
    <Plate editor={editor}>
      <PlateContent
        className={className}
        data-testid="plate-harness"
        readOnly
      />
    </Plate>
  );

  // Wrap in MockDataProvider if mock data is provided
  if (mockData) {
    return <MockDataProvider data={mockData}>{content}</MockDataProvider>;
  }

  return content;
}

/**
 * Debug version that also shows raw Plate value
 */
export function PlateHarnessDebug({ mdx, mockData, className }: PlateHarnessProps) {
  // Create a stable editor that deserializes once on mount
  const editor = usePlateEditor({
    plugins: TestPlugins,
    // Let the editor deserialize the MDX
    value: (editor) => {
      if (!mdx) return [{ type: "p", children: [{ text: "" }] }];
      try {
        const api = editor.getApi(MarkdownPlugin);
        return api.markdown.deserialize(mdx);
      } catch (error) {
        console.error("Failed to deserialize MDX:", error);
        return [{ type: "p", children: [{ text: `Error: ${error}` }] }];
      }
    },
  });

  // Get the current value for debug display
  const value = editor.children;

  const content = (
    <div className="space-y-4">
      <div className="border rounded-md p-4">
        <h3 className="text-sm font-medium mb-2">Rendered:</h3>
        <Plate editor={editor}>
          <PlateContent
            className={className}
            data-testid="plate-harness"
            readOnly
          />
        </Plate>
      </div>

      <div className="border rounded-md p-4">
        <h3 className="text-sm font-medium mb-2">Plate Value (JSON):</h3>
        <pre
          className="text-xs overflow-auto max-h-64 bg-muted p-2 rounded"
          data-testid="plate-value"
        >
          {JSON.stringify(value, null, 2)}
        </pre>
      </div>
    </div>
  );

  // Wrap in MockDataProvider if mock data is provided
  if (mockData) {
    return <MockDataProvider data={mockData}>{content}</MockDataProvider>;
  }

  return content;
}
