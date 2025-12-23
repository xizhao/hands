"use client";

/**
 * @component Tabs
 * @category view
 * @description Tabbed navigation for organizing content into switchable panels.
 * Use for dashboards, settings pages, or any content that benefits from tab navigation.
 * @keywords tabs, navigation, panels, switch, organize, sections
 * @example
 * <Tabs defaultValue="overview">
 *   <Tab value="overview" label="Overview">Overview content here</Tab>
 *   <Tab value="metrics" label="Metrics">Metrics and charts</Tab>
 *   <Tab value="settings" label="Settings">Configuration options</Tab>
 * </Tabs>
 */

import {
  createPlatePlugin,
  PlateElement,
  type PlateElementProps,
  useElement,
  useSelected,
  useEditorRef,
  useReadOnly,
} from "platejs/react";
import { memo, Children, isValidElement, useState, useRef, useEffect } from "react";
import { Plus, X } from "lucide-react";
import type { Path } from "platejs";

import {
  Tabs as ShadcnTabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from "../components/tabs";
import { TABS_KEY, TAB_KEY, type TTabsElement, type TTabElement, type ComponentMeta } from "../../types";
import { cn } from "../lib/utils";

// ============================================================================
// Standalone Components (for MDX rendering outside Plate)
// ============================================================================

export interface TabsProps {
  /** Default active tab value */
  defaultValue?: string;
  /** Tab panels */
  children: React.ReactNode;
  /** Additional CSS classes */
  className?: string;
}

export interface TabProps {
  /** Unique value for this tab */
  value: string;
  /** Display label for the tab trigger */
  label: string;
  /** Tab content */
  children: React.ReactNode;
  /** Additional CSS classes */
  className?: string;
}

/**
 * Standalone Tabs component for use in MDX (outside Plate editor).
 * Wraps shadcn Tabs with our simplified <Tab value="..." label="..."> API.
 */
export function Tabs({ defaultValue, children, className }: TabsProps) {
  // Extract tab info from children
  const tabs: { value: string; label: string }[] = [];
  const childArray = Children.toArray(children);

  childArray.forEach((child) => {
    if (isValidElement<TabProps>(child) && child.props.value && child.props.label) {
      tabs.push({ value: child.props.value, label: child.props.label });
    }
  });

  const effectiveDefault = defaultValue || tabs[0]?.value || "";

  return (
    <ShadcnTabs defaultValue={effectiveDefault} className={className}>
      <TabsList>
        {tabs.map((tab) => (
          <TabsTrigger key={tab.value} value={tab.value}>
            {tab.label}
          </TabsTrigger>
        ))}
      </TabsList>
      {childArray.map((child) => {
        if (isValidElement<TabProps>(child) && child.props.value) {
          return (
            <TabsContent key={child.props.value} value={child.props.value}>
              {child.props.children}
            </TabsContent>
          );
        }
        return null;
      })}
    </ShadcnTabs>
  );
}

/**
 * @component Tab
 * @category view
 * @description Individual tab panel inside a Tabs container. Must be a direct child of Tabs.
 * @keywords tab, panel, content, section
 * @example
 * <Tab value="overview" label="Overview">Overview content here</Tab>
 */
export function Tab({ value, label, children, className }: TabProps) {
  // This component is only used for prop extraction by parent Tabs.
  // The actual rendering is done by Tabs using TabsContent.
  return <div data-tab-value={value} data-tab-label={label} className={className}>{children}</div>;
}

// ============================================================================
// Plate Tab Transforms
// ============================================================================

function generateTabId(): string {
  return `tab-${Math.random().toString(36).slice(2, 8)}`;
}

function createTabNode(label: string): TTabElement {
  const value = generateTabId();
  return {
    type: TAB_KEY,
    value,
    label,
    children: [{ type: "p", children: [{ text: "" }] }],
  };
}

// ============================================================================
// Editable Tab Trigger
// ============================================================================

interface EditableTabTriggerProps {
  tab: { value: string; label: string };
  isActive: boolean;
  onSelect: () => void;
  onLabelChange: (newLabel: string) => void;
  onDelete: () => void;
  canDelete: boolean;
  readOnly: boolean;
}

function EditableTabTrigger({
  tab,
  isActive,
  onSelect,
  onLabelChange,
  onDelete,
  canDelete,
  readOnly,
}: EditableTabTriggerProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(tab.label);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  const handleDoubleClick = (e: React.MouseEvent) => {
    if (readOnly) return;
    e.preventDefault();
    e.stopPropagation();
    setEditValue(tab.label);
    setIsEditing(true);
  };

  const handleBlur = () => {
    setIsEditing(false);
    if (editValue.trim() && editValue !== tab.label) {
      onLabelChange(editValue.trim());
    } else {
      setEditValue(tab.label);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleBlur();
    } else if (e.key === "Escape") {
      setEditValue(tab.label);
      setIsEditing(false);
    }
  };

  return (
    <div
      className={cn(
        "group/tab relative inline-flex items-center gap-1",
        "rounded-md px-3 py-1 text-sm font-medium transition-all",
        "ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        isActive
          ? "bg-background text-foreground shadow"
          : "text-muted-foreground hover:text-foreground hover:bg-muted/50",
        !readOnly && "cursor-pointer"
      )}
      onClick={onSelect}
      onDoubleClick={handleDoubleClick}
    >
      {isEditing ? (
        <input
          ref={inputRef}
          type="text"
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
          onClick={(e) => e.stopPropagation()}
          className="w-20 bg-transparent outline-none text-sm"
        />
      ) : (
        <span>{tab.label}</span>
      )}
      {!readOnly && canDelete && !isEditing && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          className={cn(
            "ml-1 p-0.5 rounded opacity-0 group-hover/tab:opacity-100",
            "hover:bg-destructive/20 hover:text-destructive",
            "transition-opacity"
          )}
        >
          <X className="size-3" />
        </button>
      )}
    </div>
  );
}

// ============================================================================
// Plate Plugins
// ============================================================================

function TabsElement(props: PlateElementProps) {
  const editor = useEditorRef();
  const element = useElement<TTabsElement>();
  const selected = useSelected();
  const readOnly = useReadOnly();
  const [activeTab, setActiveTab] = useState<string | null>(null);

  // Extract tab info from Plate element children (Slate nodes)
  const tabs: Array<{ value: string; label: string; index: number }> = [];
  element.children.forEach((child, index) => {
    if (child.type === TAB_KEY) {
      const tabChild = child as TTabElement;
      if (tabChild.value && tabChild.label) {
        tabs.push({ value: tabChild.value, label: tabChild.label, index });
      }
    }
  });

  const effectiveActive = activeTab || element.defaultValue || tabs[0]?.value || "";

  // Get the path to this element
  const getElementPath = (): Path | undefined => {
    try {
      return editor.api.findPath(element);
    } catch {
      return undefined;
    }
  };

  const handleAddTab = () => {
    const path = getElementPath();
    if (!path) return;

    const newTab = createTabNode(`Tab ${tabs.length + 1}`);
    const insertPath = [...path, tabs.length];

    editor.tf.insertNodes(newTab, { at: insertPath });
    setActiveTab(newTab.value);
  };

  const handleDeleteTab = (tabIndex: number, tabValue: string) => {
    if (tabs.length <= 1) return; // Keep at least one tab

    const path = getElementPath();
    if (!path) return;

    const deletePath = [...path, tabIndex];
    editor.tf.removeNodes({ at: deletePath });

    // Switch to another tab if we deleted the active one
    if (activeTab === tabValue) {
      const newActiveIndex = tabIndex === 0 ? 0 : tabIndex - 1;
      const newActiveTab = tabs[newActiveIndex === tabIndex ? newActiveIndex + 1 : newActiveIndex];
      if (newActiveTab) {
        setActiveTab(newActiveTab.value);
      }
    }
  };

  const handleLabelChange = (tabIndex: number, newLabel: string) => {
    const path = getElementPath();
    if (!path) return;

    const tabPath = [...path, tabIndex];
    editor.tf.setNodes({ label: newLabel } as Partial<TTabElement>, { at: tabPath });
  };

  return (
    <PlateElement
      {...props}
      as="div"
      className={cn(
        "my-4",
        selected && !readOnly && "ring-1 ring-primary/30 ring-offset-2 rounded-lg"
      )}
    >
      <ShadcnTabs value={effectiveActive} onValueChange={setActiveTab}>
        <div className="flex items-center gap-1">
          <TabsList className="h-auto p-1">
            {tabs.map((tab) => (
              <EditableTabTrigger
                key={tab.value}
                tab={tab}
                isActive={effectiveActive === tab.value}
                onSelect={() => setActiveTab(tab.value)}
                onLabelChange={(newLabel) => handleLabelChange(tab.index, newLabel)}
                onDelete={() => handleDeleteTab(tab.index, tab.value)}
                canDelete={tabs.length > 1}
                readOnly={readOnly}
              />
            ))}
          </TabsList>
          {!readOnly && (
            <button
              onClick={handleAddTab}
              onMouseDown={(e) => e.preventDefault()}
              className={cn(
                "p-1.5 rounded-md",
                "text-muted-foreground hover:text-foreground hover:bg-muted",
                "transition-colors"
              )}
              title="Add tab"
            >
              <Plus className="size-4" />
            </button>
          )}
        </div>
        {props.children}
      </ShadcnTabs>
    </PlateElement>
  );
}

function TabElement(props: PlateElementProps) {
  const element = useElement<TTabElement>();

  return (
    <TabsContent value={element.value} asChild>
      <PlateElement {...props} as="div" className="mt-2">
        {props.children}
      </PlateElement>
    </TabsContent>
  );
}

/**
 * Tabs Plugin - tabbed navigation container.
 */
export const TabsPlugin = createPlatePlugin({
  key: TABS_KEY,
  node: {
    isElement: true,
    isInline: false,
    isVoid: false,
    component: memo(TabsElement),
  },
});

/**
 * Tab Plugin - individual tab panel.
 */
export const TabPlugin = createPlatePlugin({
  key: TAB_KEY,
  node: {
    isElement: true,
    isInline: false,
    isVoid: false,
    component: memo(TabElement),
  },
});

// ============================================================================
// Element Factories
// ============================================================================

/**
 * Create a Tabs element for insertion into editor.
 */
export function createTabsElement(
  tabs: Array<{ value: string; label: string; content: string }>,
  options?: { defaultValue?: string }
): TTabsElement {
  return {
    type: TABS_KEY,
    defaultValue: options?.defaultValue || tabs[0]?.value,
    children: tabs.map((tab) => ({
      type: TAB_KEY,
      value: tab.value,
      label: tab.label,
      children: [{ type: "p", children: [{ text: tab.content }] }],
    })),
  };
}

export { TABS_KEY, TAB_KEY };

// Re-export shadcn primitives for advanced usage
export { TabsList, TabsTrigger, TabsContent };

// ============================================================================
// Component Metadata (for validation/linting)
// ============================================================================

export const TabsMeta: ComponentMeta = {
  category: "view",
  requiredProps: [],
  propRules: {},
  constraints: {
    requireChild: ["Tab"],
  },
};

export const TabMeta: ComponentMeta = {
  category: "view",
  requiredProps: ["value", "label"],
  propRules: {},
  constraints: {
    requireParent: ["Tabs"],
  },
};
