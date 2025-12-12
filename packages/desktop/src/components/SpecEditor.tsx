'use client';

/**
 * SpecEditor - Minimal Plate-based markdown editor for source specs
 *
 * A focused editor for writing/editing source specifications in markdown.
 * Supports headings, lists, code blocks (including Mermaid diagrams), and basic formatting.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  BlockquotePlugin,
  H1Plugin,
  H2Plugin,
  H3Plugin,
  HorizontalRulePlugin,
  BoldPlugin,
  CodePlugin,
  ItalicPlugin,
  StrikethroughPlugin,
} from '@platejs/basic-nodes/react';
import { CodeBlockPlugin, CodeLinePlugin, CodeSyntaxPlugin } from '@platejs/code-block/react';
import { ListPlugin } from '@platejs/list/react';
import { MarkdownPlugin } from '@platejs/markdown';
import { TrailingBlockPlugin, type Value, KEYS, NodeApi, type TCodeBlockElement } from 'platejs';
import {
  Plate,
  PlateContainer,
  PlateContent,
  ParagraphPlugin,
  usePlateEditor,
  useElement,
  useReadOnly,
  PlateElement,
  type PlateElementProps,
  type TPlateEditor,
} from 'platejs/react';
import remarkGfm from 'remark-gfm';
import { Code, Eye, TextB, TextItalic, TextStrikethrough, ListBullets, ListNumbers, Quotes, CodeBlock } from '@phosphor-icons/react';

import { cn } from '@/lib/utils';
import { BlockquoteElement } from '@/components/ui/blockquote-node';
import { H1Element, H2Element, H3Element } from '@/components/ui/heading-node';
import { HrElement } from '@/components/ui/hr-node';
import { ParagraphElement } from '@/components/ui/paragraph-node';
import {
  CodeBlockElement as BaseCodeBlockElement,
  CodeLineElement,
  CodeSyntaxLeaf,
} from '@/components/ui/code-block-node';
import { CodeLeaf } from '@/components/ui/code-node';
import { BlockList } from '@/components/ui/block-list';
import { MermaidDiagram } from '@/components/MermaidDiagram';
import { Button } from '@/components/ui/button';
import { Toolbar, ToolbarGroup, ToolbarButton } from '@/components/ui/toolbar';
import { MarkToolbarButton } from '@/components/ui/mark-toolbar-button';

/**
 * Mermaid-aware code block element
 * Shows mermaid diagrams as rendered SVG with toggle to edit code
 */
function MermaidCodeBlockElement(props: PlateElementProps) {
  const element = useElement<TCodeBlockElement>();
  const readOnly = useReadOnly();
  const [showCode, setShowCode] = useState(false);

  const isMermaid = element?.lang === 'mermaid';
  const code = (element?.children ?? [])
    .map((child) => NodeApi.string(child))
    .join('\n');

  // If not mermaid, use the base component
  if (!isMermaid) {
    return <BaseCodeBlockElement {...props} />;
  }

  // In edit mode or when showCode is true, show the code
  if (showCode || !readOnly) {
    return (
      <PlateElement
        className="group my-2 relative"
        {...props}
      >
        {/* Toggle button */}
        <div className="absolute top-1 right-1 z-10 flex gap-1">
          <Button
            size="icon"
            variant="ghost"
            className="h-6 w-6"
            onClick={() => setShowCode(!showCode)}
            contentEditable={false}
          >
            {showCode ? (
              <Eye weight="bold" className="h-3.5 w-3.5" />
            ) : (
              <Code weight="bold" className="h-3.5 w-3.5" />
            )}
          </Button>
        </div>

        {/* Code editor */}
        <pre
          className="overflow-x-auto rounded-md bg-muted pt-8 pr-4 pb-4 pl-4 font-mono text-sm leading-[normal] [tab-size:2]"
          data-plate-open-context-menu
        >
          <code>{props.children}</code>
        </pre>

        {/* Preview below in edit mode */}
        {!readOnly && code.trim() && (
          <div className="mt-2">
            <MermaidDiagram code={code} />
          </div>
        )}
      </PlateElement>
    );
  }

  // Read-only mode: show only the rendered diagram
  return (
    <PlateElement
      className="group my-2 relative"
      {...props}
    >
      <div className="hidden">{props.children}</div>
      <MermaidDiagram code={code} />
    </PlateElement>
  );
}

// Minimal plugin kit for spec editing
const SpecEditorKit = [
  // Block elements
  ParagraphPlugin.withComponent(ParagraphElement),
  H1Plugin.configure({
    node: { component: H1Element },
    rules: { break: { empty: 'reset' } },
  }),
  H2Plugin.configure({
    node: { component: H2Element },
    rules: { break: { empty: 'reset' } },
  }),
  H3Plugin.configure({
    node: { component: H3Element },
    rules: { break: { empty: 'reset' } },
  }),
  BlockquotePlugin.configure({
    node: { component: BlockquoteElement },
  }),
  HorizontalRulePlugin.withComponent(HrElement),

  // Lists - use the same pattern as list-kit
  ListPlugin.configure({
    inject: {
      targetPlugins: [
        ...KEYS.heading,
        KEYS.p,
        KEYS.blockquote,
      ],
    },
    render: {
      belowNodes: BlockList,
    },
  }),

  // Code blocks (with Mermaid support)
  CodeBlockPlugin.configure({
    node: { component: MermaidCodeBlockElement },
  }),
  CodeLinePlugin.configure({
    node: { component: CodeLineElement },
  }),
  CodeSyntaxPlugin.configure({
    node: { component: CodeSyntaxLeaf },
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

type SpecEditorType = TPlateEditor<Value, (typeof SpecEditorKit)[number]>;

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
  /** Additional toolbar content to render on the left side (before formatting buttons) */
  toolbarLeft?: React.ReactNode;
}

export function SpecEditor({
  id = 'spec-editor',
  value = '',
  onChange,
  placeholder = 'Write your spec here...',
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
    // Initialize with deserialized markdown using getApi pattern
    value: (editor) => {
      if (!value) return [{ type: 'p', children: [{ text: '' }] }];
      try {
        const markdownApi = editor.getApi(MarkdownPlugin);
        const parsed = markdownApi.markdown.deserialize(value);
        return parsed && parsed.length > 0
          ? parsed
          : [{ type: 'p', children: [{ text: '' }] }];
      } catch (err) {
        console.error('Failed to parse markdown:', err);
        return [{ type: 'p', children: [{ text: '' }] }];
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
      console.error('Failed to parse markdown on update:', err);
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
      console.error('Failed to serialize markdown:', err);
    }
  }, [editor, readOnly, onChange]);

  return (
    <Plate
      editor={editor}
      onChange={handleChange}
    >
      <PlateContainer
        className={cn(
          'relative flex flex-col w-full h-full overflow-hidden',
          // Premium card styling
          'rounded-lg border border-border/50 bg-card shadow-sm',
          className
        )}
      >
        {/* Embedded toolbar */}
        {!readOnly && (
          <Toolbar className="flex items-center gap-1 px-2 py-1.5 border-b border-border/30 bg-muted/30 shrink-0">
            {/* Left side: custom content (status chip, save/push/pull) */}
            {toolbarLeft}

            <div className="flex-1" />

            {/* Right side: formatting buttons */}
            <ToolbarGroup>
              <MarkToolbarButton nodeType="bold" tooltip="Bold (⌘B)">
                <TextB weight="bold" className="h-4 w-4" />
              </MarkToolbarButton>
              <MarkToolbarButton nodeType="italic" tooltip="Italic (⌘I)">
                <TextItalic weight="bold" className="h-4 w-4" />
              </MarkToolbarButton>
              <MarkToolbarButton nodeType="strikethrough" tooltip="Strikethrough">
                <TextStrikethrough weight="bold" className="h-4 w-4" />
              </MarkToolbarButton>
              <MarkToolbarButton nodeType="code" tooltip="Inline code">
                <Code weight="bold" className="h-4 w-4" />
              </MarkToolbarButton>
            </ToolbarGroup>
          </Toolbar>
        )}

        {/* Editor content */}
        <PlateContent
          className={cn(
            'flex-1 overflow-y-auto px-4 py-3 text-sm',
            'outline-none',
            '[&_h1]:text-xl [&_h1]:font-semibold [&_h1]:mt-4 [&_h1]:mb-2',
            '[&_h2]:text-lg [&_h2]:font-semibold [&_h2]:mt-3 [&_h2]:mb-2',
            '[&_h3]:text-base [&_h3]:font-semibold [&_h3]:mt-2 [&_h3]:mb-1',
            '[&_p]:my-1',
            '[&_ul]:my-1 [&_ol]:my-1',
            '[&_li]:my-0.5',
            '[&_pre]:bg-muted [&_pre]:rounded-md [&_pre]:p-3 [&_pre]:my-2',
            '[&_code]:bg-muted [&_code]:px-1 [&_code]:py-0.5 [&_code]:rounded [&_code]:text-xs',
            readOnly && 'cursor-default'
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
  return (
    <SpecEditor
      value={markdown}
      readOnly
      className={className}
    />
  );
}
