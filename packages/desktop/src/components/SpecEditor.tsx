"use client";

/**
 * SpecEditor - Minimal Plate-based markdown editor for source specs
 *
 * A focused editor for writing/editing source specifications in markdown.
 * Based on Potion's premium template with minimal features for spec editing.
 */

import {
  BlockquotePlugin,
  BoldPlugin,
  CodePlugin,
  H1Plugin,
  H2Plugin,
  H3Plugin,
  HorizontalRulePlugin,
  ItalicPlugin,
  StrikethroughPlugin,
} from "@platejs/basic-nodes/react";
import { ListPlugin } from "@platejs/list/react";
import { MarkdownPlugin } from "@platejs/markdown";
import { KEYS, TrailingBlockPlugin, type Value } from "platejs";
import {
  ParagraphPlugin,
  Plate,
  PlateContainer,
  PlateContent,
  type TPlateEditor,
  usePlateEditor,
} from "platejs/react";
import { useCallback, useEffect, useRef } from "react";
import remarkGfm from "remark-gfm";
import { BlockList } from "@/components/ui/block-list";
import { BlockquoteElement } from "@/components/ui/blockquote-node";
import { CodeLeaf } from "@/components/ui/code-node";
import { H1Element, H2Element, H3Element } from "@/components/ui/heading-node";
import { HrElement } from "@/components/ui/hr-node";
import { ParagraphElement } from "@/components/ui/paragraph-node";
import { cn } from "@/lib/utils";

// Minimal plugin kit for spec editing
const SpecEditorKit = [
  // Block elements
  ParagraphPlugin.withComponent(ParagraphElement),
  H1Plugin.configure({
    node: { component: H1Element },
    rules: { break: { empty: "reset" } },
  }),
  H2Plugin.configure({
    node: { component: H2Element },
    rules: { break: { empty: "reset" } },
  }),
  H3Plugin.configure({
    node: { component: H3Element },
    rules: { break: { empty: "reset" } },
  }),
  BlockquotePlugin.configure({
    node: { component: BlockquoteElement },
  }),
  HorizontalRulePlugin.withComponent(HrElement),

  // Lists
  ListPlugin.configure({
    inject: {
      targetPlugins: [...KEYS.heading, KEYS.p, KEYS.blockquote],
    },
    render: {
      belowNodes: BlockList,
    },
  }),

  // Marks
  BoldPlugin,
  ItalicPlugin,
  CodePlugin.configure({
    node: { component: CodeLeaf },
  }),
  StrikethroughPlugin,

  // Markdown support
  MarkdownPlugin.configure({
    options: {
      remarkPlugins: [remarkGfm],
    },
  }),

  // Always have a trailing block
  TrailingBlockPlugin,
];

type _SpecEditorType = TPlateEditor<Value, (typeof SpecEditorKit)[number]>;

interface SpecEditorProps {
  /** Unique identifier for this editor instance */
  id?: string;
  /** Markdown content to edit */
  value?: string;
  /** Called when content changes (returns markdown string) */
  onChange?: (markdown: string) => void;
  placeholder?: string;
  className?: string;
  readOnly?: boolean;
  /** Additional toolbar content to render on the left side */
  toolbarLeft?: React.ReactNode;
}

export function SpecEditor({
  id = "spec-editor",
  value = "",
  onChange,
  placeholder = "Write your spec here...",
  className,
  readOnly = false,
  toolbarLeft,
}: SpecEditorProps) {
  // Track if we've done initial load to avoid re-parsing on every render
  const lastValueRef = useRef<string>(value);
  const isInternalChange = useRef(false);

  // Create editor with proper markdown deserialization
  const editor = usePlateEditor({
    id,
    plugins: SpecEditorKit,
    // Initialize with deserialized markdown
    value: (editor) => {
      if (!value) return [{ type: "p", children: [{ text: "" }] }];
      try {
        const markdownApi = editor.getApi(MarkdownPlugin);
        const parsed = markdownApi.markdown.deserialize(value);
        return parsed && parsed.length > 0 ? parsed : [{ type: "p", children: [{ text: "" }] }];
      } catch (err) {
        console.error("Failed to parse markdown:", err);
        return [{ type: "p", children: [{ text: "" }] }];
      }
    },
  });

  // Handle external value changes (e.g., after git pull)
  useEffect(() => {
    // Skip if this is an internal change or value hasn't changed
    if (isInternalChange.current || value === lastValueRef.current) {
      isInternalChange.current = false;
      return;
    }

    lastValueRef.current = value;

    try {
      const markdownApi = editor.getApi(MarkdownPlugin);
      const parsed = markdownApi.markdown.deserialize(value);
      if (parsed && parsed.length > 0) {
        editor.tf.setValue(parsed);
      }
    } catch (err) {
      console.error("Failed to parse markdown on update:", err);
    }
  }, [editor, value]);

  // Handle changes - serialize to markdown and notify parent
  const handleChange = useCallback(() => {
    if (readOnly) return;

    try {
      const markdownApi = editor.getApi(MarkdownPlugin);
      const md = markdownApi.markdown.serialize();
      isInternalChange.current = true;
      lastValueRef.current = md;
      onChange?.(md);
    } catch (err) {
      console.error("Failed to serialize markdown:", err);
    }
  }, [editor, readOnly, onChange]);

  return (
    <Plate editor={editor} onChange={handleChange}>
      <PlateContainer
        className={cn(
          "relative flex flex-col w-full h-full overflow-hidden",
          "rounded-lg border border-border/50 bg-card shadow-sm",
          className,
        )}
      >
        {/* Toolbar */}
        {!readOnly && toolbarLeft && (
          <div className="flex items-center gap-1 px-2 py-1.5 border-b border-border/30 bg-muted/30 shrink-0">
            {toolbarLeft}
          </div>
        )}

        {/* Editor content */}
        <PlateContent
          className={cn(
            "flex-1 overflow-y-auto px-4 py-3 text-sm",
            "outline-none",
            "[&_h1]:text-xl [&_h1]:font-semibold [&_h1]:mt-4 [&_h1]:mb-2",
            "[&_h2]:text-lg [&_h2]:font-semibold [&_h2]:mt-3 [&_h2]:mb-2",
            "[&_h3]:text-base [&_h3]:font-semibold [&_h3]:mt-2 [&_h3]:mb-1",
            "[&_p]:my-1",
            "[&_ul]:my-1 [&_ol]:my-1",
            "[&_li]:my-0.5",
            "[&_pre]:bg-muted [&_pre]:rounded-md [&_pre]:p-3 [&_pre]:my-2",
            "[&_code]:bg-muted [&_code]:px-1 [&_code]:py-0.5 [&_code]:rounded [&_code]:text-xs",
            readOnly && "cursor-default",
          )}
          placeholder={placeholder}
          readOnly={readOnly}
          disableDefaultStyles
        />
      </PlateContainer>
    </Plate>
  );
}

/**
 * Read-only markdown renderer using the same Plate setup
 */
export function SpecViewer({ markdown, className }: { markdown: string; className?: string }) {
  return <SpecEditor value={markdown} readOnly className={className} />;
}
