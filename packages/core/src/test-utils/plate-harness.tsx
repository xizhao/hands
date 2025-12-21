/**
 * Plate Test Harness
 *
 * Minimal Plate editor setup for testing MDX deserialization and rendering.
 * Used in stories and Playwright tests.
 */

"use client";

import { MarkdownPlugin, remarkMdx } from "@platejs/markdown";
import { Plate, PlateContent, usePlateEditor, type TElement } from "platejs/react";
import remarkGfm from "remark-gfm";

import { serializationRules, toMarkdownPluginRules } from "../stdlib/serialization";
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
} from "../stdlib/view";
import {
  LiveActionPlugin,
  ButtonPlugin,
  InputPlugin,
  SelectPlugin,
  CheckboxPlugin,
  TextareaPlugin,
} from "../stdlib/action";
import { DataGridPlugin, KanbanPlugin } from "../stdlib/data";

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
];

/**
 * Markdown plugin configured with all stdlib serialization rules
 */
export const TestMarkdownPlugin = MarkdownPlugin.configure({
  options: {
    remarkPlugins: [remarkGfm, remarkMdx],
    rules: toMarkdownPluginRules(serializationRules),
  },
});

/**
 * All plugins needed for testing (stdlib + markdown)
 */
export const TestPlugins = [...StdlibPlugins, TestMarkdownPlugin];

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
        return editor.api.markdown.deserialize(mdx);
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
        return editor.api.markdown.deserialize(mdx);
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
