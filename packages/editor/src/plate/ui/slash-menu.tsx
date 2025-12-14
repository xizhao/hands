/**
 * Slash Menu - Command menu for inserting blocks
 *
 * Structure:
 * 1. Actions - AI generation, always visible
 * 2. In-Project Blocks - Blocks from current workbook
 * 3. Template Blocks - Components from stdlib registry
 */

import { listComponents } from "@hands/stdlib/registry";
import * as icons from "lucide-react";
import { PilcrowIcon } from "lucide-react";
import type { TElement } from "platejs";
import type { PlateEditor, PlateElementProps } from "platejs/react";
import { PlateElement } from "platejs/react";
import type * as React from "react";
import { useMemo } from "react";
import {
  InlineCombobox,
  InlineComboboxContent,
  InlineComboboxGroup,
  InlineComboboxInput,
  InlineComboboxItem,
  useInlineComboboxSearchValue,
} from "./inline-combobox";

// Hands logo component
function HandsLogo({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 32 32"
      fill="currentColor"
    >
      <path d="M8 12h4v8H8zM14 10h4v10h-4zM20 14h4v6h-4z" />
    </svg>
  );
}

type SlashMenuItem = {
  icon: React.ReactNode;
  value: string;
  onSelect: (editor: PlateEditor) => void;
  description?: string;
  keywords?: string[];
  label?: string;
  alwaysShow?: boolean; // Always show regardless of filter
};

function insertStdlibComponent(
  editor: PlateEditor,
  componentName: string,
  isVoid: boolean = false,
) {
  const node: TElement = {
    type: componentName,
    children: isVoid ? [{ text: "" }] : [{ type: "p", children: [{ text: "" }] }],
    ...(isVoid ? { isVoid: true } : {}),
  };
  editor.tf.insertNodes(node);
}

/**
 * Get a Lucide icon by name (kebab-case or PascalCase)
 */
function getIcon(iconName?: string): React.ReactNode {
  if (!iconName) return <PilcrowIcon />;

  // Convert kebab-case to PascalCase for Lucide
  const pascalCase = `${iconName
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join("")}Icon`;

  const IconComponent = (icons as any)[pascalCase];
  if (IconComponent) {
    return <IconComponent />;
  }

  return <PilcrowIcon />;
}

/**
 * Build template blocks from stdlib registry
 */
function buildTemplateBlocks(): SlashMenuItem[] {
  const allComponents = listComponents();
  const items: SlashMenuItem[] = [];

  // Void components (self-closing, no children)
  const voidComponents = new Set([
    "MetricCard",
    "DataTable",
    "BarChart",
    "LineChart",
    "Avatar",
    "Badge",
    "Progress",
    "Skeleton",
    "Spinner",
    "Separator",
    "Input",
    "Textarea",
    "Checkbox",
    "Switch",
    "Slider",
    "Calendar",
  ]);

  for (const comp of allComponents) {
    if (comp.files && comp.files.length > 0) {
      // Stdlib component
      const isVoid = voidComponents.has(comp.name);
      items.push({
        icon: getIcon(comp.icon),
        label: comp.name,
        value: `stdlib:${comp.name}`,
        description: comp.description,
        keywords: [...(comp.keywords || []), comp.category],
        onSelect: (editor) => insertStdlibComponent(editor, comp.name, isVoid),
      });
    }
  }

  return items;
}

/**
 * Slash menu item component
 */
function SlashMenuItemContent({
  icon,
  label,
  value,
  description,
  variant = "default",
}: {
  icon: React.ReactNode;
  label?: string;
  value: string;
  description?: string;
  variant?: "default" | "action";
}) {
  if (variant === "action") {
    return (
      <>
        <div className="flex size-8 shrink-0 items-center justify-center rounded bg-primary/10 [&_svg]:size-4 [&_svg]:text-primary">
          {icon}
        </div>
        <div className="ml-2 flex flex-1 flex-col truncate">
          <span className="text-foreground text-sm font-medium">{label ?? value}</span>
          {description && (
            <span className="truncate text-muted-foreground text-xs">{description}</span>
          )}
        </div>
      </>
    );
  }

  return (
    <>
      <div className="flex size-8 shrink-0 items-center justify-center rounded border border-border bg-background [&_svg]:size-4 [&_svg]:text-muted-foreground">
        {icon}
      </div>
      <div className="ml-2 flex flex-1 flex-col truncate">
        <span className="text-foreground text-sm">{label ?? value}</span>
        {description && (
          <span className="truncate text-muted-foreground text-xs">{description}</span>
        )}
      </div>
    </>
  );
}

/**
 * Section component that hides when no items match filter
 */
function SlashMenuSection({
  title,
  items,
  editor,
}: {
  title: string;
  items: SlashMenuItem[];
  editor: PlateEditor;
}) {
  const searchValue = useInlineComboboxSearchValue();

  // Check if any items would be visible after filtering
  const visibleItems = useMemo(() => {
    if (!searchValue) return items;
    const search = searchValue.toLowerCase();
    return items.filter(({ value, keywords = [], label, alwaysShow }) => {
      if (alwaysShow) return true;
      const terms = [value, ...keywords, label, title].filter(Boolean);
      return terms.some((term) => term?.toLowerCase().includes(search));
    });
  }, [items, searchValue, title]);

  if (visibleItems.length === 0) return null;

  return (
    <InlineComboboxGroup>
      <div className="mt-1.5 mb-2 px-3 font-medium text-muted-foreground text-xs uppercase tracking-wider">
        {title}
      </div>
      {visibleItems.map(({ description, icon, keywords, label, value, onSelect, alwaysShow }) => (
        <InlineComboboxItem
          key={value}
          keywords={keywords}
          label={label}
          onClick={() => onSelect(editor)}
          value={value}
          // Always show items bypass filter
          {...(alwaysShow ? { "data-always-show": "true" } : {})}
        >
          <SlashMenuItemContent
            icon={icon}
            label={label}
            value={value}
            description={description}
            variant={alwaysShow ? "action" : "default"}
          />
        </InlineComboboxItem>
      ))}
    </InlineComboboxGroup>
  );
}

export function SlashInputElement(props: PlateElementProps) {
  const { children, editor, element } = props;

  // Actions - always visible
  const actions: SlashMenuItem[] = useMemo(
    () => [
      {
        icon: <HandsLogo className="size-4" />,
        label: "Make with Hands",
        value: "hands:make",
        description: "Generate a component with AI",
        keywords: ["ai", "generate", "create", "make", "hands", "build", "new"],
        alwaysShow: true,
        onSelect: (_editor) => {
          // TODO: Trigger AI generation flow
          console.log("[SlashMenu] Make with Hands selected");
        },
      },
    ],
    [],
  );

  // In-project blocks (TODO: fetch from workbook manifest)
  const projectBlocks: SlashMenuItem[] = useMemo(() => {
    // TODO: Get blocks from editor.runtimePort via manifest
    return [];
  }, []);

  // Template blocks from stdlib
  const templateBlocks = useMemo(() => buildTemplateBlocks(), []);

  return (
    <PlateElement {...props} as="span">
      <InlineCombobox element={element} trigger="/">
        <InlineComboboxInput />

        <InlineComboboxContent variant="slash">
          {/* Actions - always first */}
          <SlashMenuSection title="Actions" items={actions} editor={editor} />

          {/* In-project blocks */}
          {projectBlocks.length > 0 && (
            <SlashMenuSection title="Project Blocks" items={projectBlocks} editor={editor} />
          )}

          {/* Template blocks */}
          <SlashMenuSection title="Templates" items={templateBlocks} editor={editor} />
        </InlineComboboxContent>
      </InlineCombobox>

      {children}
    </PlateElement>
  );
}
