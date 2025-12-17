/**
 * Floating Toolbar - Selection formatting toolbar
 *
 * Appears when text is selected, provides block and mark formatting buttons.
 */

import {
  CaretDown,
  Code,
  TextB,
  TextHOne,
  TextHThree,
  TextHTwo,
  TextItalic,
  TextStrikethrough,
  TextT,
  TextUnderline,
} from "@phosphor-icons/react";
import {
  useFloatingToolbar,
  useFloatingToolbarState,
  offset,
  flip,
  shift,
} from "@platejs/floating";
import {
  useEditorRef,
  useEventEditorValue,
  useMarkToolbarButton,
  useMarkToolbarButtonState,
} from "platejs/react";
import { cn } from "@/lib/utils";
import { useCallback, useState } from "react";

// ============================================================================
// Font Options
// ============================================================================

const FONT_FAMILIES = [
  { label: "Default", value: "" },
  { label: "Sans Serif", value: "ui-sans-serif, system-ui, sans-serif" },
  { label: "Serif", value: "ui-serif, Georgia, serif" },
  { label: "Mono", value: "ui-monospace, monospace" },
  { label: "Inter", value: "Inter, sans-serif" },
  { label: "Georgia", value: "Georgia, serif" },
  { label: "Arial", value: "Arial, sans-serif" },
];

const FONT_SIZES = [
  { label: "Small", value: "12px" },
  { label: "Normal", value: "" },
  { label: "Medium", value: "16px" },
  { label: "Large", value: "18px" },
  { label: "XL", value: "20px" },
  { label: "2XL", value: "24px" },
  { label: "3XL", value: "30px" },
];

// ============================================================================
// Floating Toolbar
// ============================================================================

export function FloatingToolbar() {
  const editor = useEditorRef();
  const focusedEditorId = useEventEditorValue("focus");

  const floatingToolbarState = useFloatingToolbarState({
    editorId: editor.id,
    focusedEditorId,
    floatingOptions: {
      middleware: [
        offset({ mainAxis: 12, crossAxis: -24 }),
        shift({ padding: 50 }),
        flip({
          fallbackPlacements: ["top-start", "top-end", "bottom-start", "bottom-end"],
          padding: 12,
        }),
      ],
      placement: "top-start",
    },
  });

  const { ref, props, hidden } = useFloatingToolbar(floatingToolbarState);

  if (hidden) return null;

  return (
    <div
      ref={ref}
      {...props}
      className={cn(
        "absolute z-50 flex items-center gap-0.5 rounded border bg-popover p-0.5 shadow-md",
        "animate-in fade-in-0 zoom-in-95",
      )}
    >
      {/* Header buttons */}
      <HeaderButton level={1} />
      <HeaderButton level={2} />
      <HeaderButton level={3} />

      <Separator />

      {/* Font selectors */}
      <FontFamilySelect />
      <FontSizeSelect />

      <Separator />

      {/* Mark buttons */}
      <MarkButton nodeType="bold" title="Bold (⌘B)">
        <TextB size={14} weight="bold" />
      </MarkButton>
      <MarkButton nodeType="italic" title="Italic (⌘I)">
        <TextItalic size={14} />
      </MarkButton>
      <MarkButton nodeType="underline" title="Underline (⌘U)">
        <TextUnderline size={14} />
      </MarkButton>
      <MarkButton nodeType="strikethrough" title="Strikethrough">
        <TextStrikethrough size={14} />
      </MarkButton>
      <MarkButton nodeType="code" title="Code">
        <Code size={14} />
      </MarkButton>
    </div>
  );
}

// ============================================================================
// Separator
// ============================================================================

function Separator() {
  return <div className="mx-0.5 h-4 w-px bg-border" />;
}

// ============================================================================
// Header Button
// ============================================================================

interface HeaderButtonProps {
  level: 1 | 2 | 3;
}

function HeaderButton({ level }: HeaderButtonProps) {
  const editor = useEditorRef();

  // Check if current selection is this heading level
  const isActive = editor.api.some({
    match: { type: `h${level}` },
  });

  const handleClick = useCallback(() => {
    // Toggle heading - access the transform via editor.tf
    const transforms = editor.tf as Record<string, { toggle?: () => void }>;
    const headingTransform = transforms[`h${level}`];
    if (headingTransform?.toggle) {
      headingTransform.toggle();
    }
    editor.tf.focus();
  }, [editor, level]);

  const icons = {
    1: <TextHOne size={14} weight={isActive ? "bold" : "regular"} />,
    2: <TextHTwo size={14} weight={isActive ? "bold" : "regular"} />,
    3: <TextHThree size={14} weight={isActive ? "bold" : "regular"} />,
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      title={`Heading ${level}`}
      data-state={isActive ? "on" : "off"}
      className={cn(
        "flex h-6 w-6 items-center justify-center rounded transition-colors",
        "hover:bg-accent hover:text-accent-foreground",
        isActive && "bg-accent text-accent-foreground",
      )}
    >
      {icons[level]}
    </button>
  );
}

// ============================================================================
// Font Family Select
// ============================================================================

function FontFamilySelect() {
  const editor = useEditorRef();
  const [isOpen, setIsOpen] = useState(false);

  // Get current font family from marks
  const marks = editor.api.marks() as Record<string, string> | null;
  const currentFamily = marks?.fontFamily || "";
  const currentLabel =
    FONT_FAMILIES.find((f) => f.value === currentFamily)?.label || "Font";

  const handleSelect = useCallback(
    (value: string) => {
      if (value === "") {
        // Remove the mark for default
        editor.tf.removeMark("fontFamily");
      } else {
        // Use the plugin's addMark transform
        const transforms = editor.tf as Record<
          string,
          { addMark?: (value: string) => void }
        >;
        if (transforms.fontFamily?.addMark) {
          transforms.fontFamily.addMark(value);
        }
      }
      setIsOpen(false);
      editor.tf.focus();
    },
    [editor],
  );

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          "flex h-6 items-center gap-0.5 rounded px-1.5 text-xs transition-colors",
          "hover:bg-accent hover:text-accent-foreground",
          isOpen && "bg-accent",
        )}
        title="Font Family"
      >
        <TextT size={12} />
        <span className="max-w-12 truncate">{currentLabel}</span>
        <CaretDown size={10} className="opacity-50" />
      </button>

      {isOpen && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => setIsOpen(false)}
          />
          <div
            className={cn(
              "absolute left-0 top-full z-50 mt-1 min-w-28 rounded-md border bg-popover p-0.5 shadow-lg",
              "animate-in fade-in-0 zoom-in-95",
            )}
          >
            {FONT_FAMILIES.map((font) => (
              <button
                key={font.value || "default"}
                type="button"
                onClick={() => handleSelect(font.value)}
                className={cn(
                  "flex w-full items-center rounded px-2 py-1 text-xs transition-colors",
                  "hover:bg-accent hover:text-accent-foreground",
                  currentFamily === font.value && "bg-accent/50",
                )}
                style={{ fontFamily: font.value || undefined }}
              >
                {font.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ============================================================================
// Font Size Select
// ============================================================================

function FontSizeSelect() {
  const editor = useEditorRef();
  const [isOpen, setIsOpen] = useState(false);

  // Get current font size from marks
  const marks = editor.api.marks() as Record<string, string> | null;
  const currentSize = marks?.fontSize || "";
  const currentLabel =
    FONT_SIZES.find((f) => f.value === currentSize)?.label || "Size";

  const handleSelect = useCallback(
    (value: string) => {
      if (value === "") {
        // Remove the mark for default
        editor.tf.removeMark("fontSize");
      } else {
        // Use the plugin's addMark transform
        const transforms = editor.tf as Record<
          string,
          { addMark?: (value: string) => void }
        >;
        if (transforms.fontSize?.addMark) {
          transforms.fontSize.addMark(value);
        }
      }
      setIsOpen(false);
      editor.tf.focus();
    },
    [editor],
  );

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          "flex h-6 items-center gap-0.5 rounded px-1.5 text-xs transition-colors",
          "hover:bg-accent hover:text-accent-foreground",
          isOpen && "bg-accent",
        )}
        title="Font Size"
      >
        <span className="w-8 text-left">{currentLabel}</span>
        <CaretDown size={10} className="opacity-50" />
      </button>

      {isOpen && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => setIsOpen(false)}
          />
          <div
            className={cn(
              "absolute left-0 top-full z-50 mt-1 min-w-20 rounded-md border bg-popover p-0.5 shadow-lg",
              "animate-in fade-in-0 zoom-in-95",
            )}
          >
            {FONT_SIZES.map((size) => (
              <button
                key={size.value || "default"}
                type="button"
                onClick={() => handleSelect(size.value)}
                className={cn(
                  "flex w-full items-center rounded px-2 py-1 text-xs transition-colors",
                  "hover:bg-accent hover:text-accent-foreground",
                  currentSize === size.value && "bg-accent/50",
                )}
                style={{ fontSize: size.value || undefined }}
              >
                {size.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ============================================================================
// Mark Button
// ============================================================================

interface MarkButtonProps {
  nodeType: string;
  title: string;
  children: React.ReactNode;
}

export function MarkButton({ nodeType, title, children }: MarkButtonProps) {
  const editor = useEditorRef();
  const state = useMarkToolbarButtonState({ nodeType });
  const { props } = useMarkToolbarButton(state);

  return (
    <button
      type="button"
      onClick={() => {
        props.onClick?.();
        editor.tf.focus();
      }}
      onMouseDown={props.onMouseDown}
      title={title}
      data-state={props.pressed ? "on" : "off"}
      className={cn(
        "flex h-6 w-6 items-center justify-center rounded text-sm transition-colors",
        "hover:bg-accent hover:text-accent-foreground",
        props.pressed && "bg-accent text-accent-foreground",
      )}
    >
      {children}
    </button>
  );
}
