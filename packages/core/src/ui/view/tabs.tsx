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
} from "platejs/react";
import { memo, useState } from "react";

import { TABS_KEY, TAB_KEY, type TTabsElement, type TTabElement } from "../../types";

// ============================================================================
// Standalone Components
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

interface TabContextValue {
  activeTab: string;
  setActiveTab: (value: string) => void;
}

import { createContext, useContext } from "react";

const TabContext = createContext<TabContextValue | null>(null);

function useTabContext() {
  const ctx = useContext(TabContext);
  if (!ctx) throw new Error("Tab must be used within Tabs");
  return ctx;
}

/**
 * Standalone Tabs component for use outside Plate editor.
 */
export function Tabs({ defaultValue, children, className }: TabsProps) {
  const [activeTab, setActiveTab] = useState(defaultValue || "");

  // Extract tab info from children
  const tabs: { value: string; label: string }[] = [];
  const childArray = Array.isArray(children) ? children : [children];

  childArray.forEach((child: any) => {
    if (child?.props?.value && child?.props?.label) {
      tabs.push({ value: child.props.value, label: child.props.label });
    }
  });

  // Set default if not provided
  if (!activeTab && tabs.length > 0) {
    setActiveTab(tabs[0].value);
  }

  return (
    <TabContext.Provider value={{ activeTab, setActiveTab }}>
      <div className={`w-full ${className || ""}`}>
        {/* Tab triggers */}
        <div className="flex border-b border-border">
          {tabs.map((tab) => (
            <button
              key={tab.value}
              onClick={() => setActiveTab(tab.value)}
              className={`
                px-4 py-2 text-sm font-medium transition-colors
                border-b-2 -mb-px
                ${activeTab === tab.value
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground hover:border-muted"
                }
              `}
            >
              {tab.label}
            </button>
          ))}
        </div>
        {/* Tab panels */}
        <div className="pt-4">
          {children}
        </div>
      </div>
    </TabContext.Provider>
  );
}

/**
 * Individual tab panel.
 */
export function Tab({ value, children, className }: TabProps) {
  const { activeTab } = useTabContext();

  if (activeTab !== value) return null;

  return (
    <div className={className}>
      {children}
    </div>
  );
}

// ============================================================================
// Plate Plugins
// ============================================================================

function TabsElement(props: PlateElementProps) {
  const element = useElement<TTabsElement>();
  const selected = useSelected();

  return (
    <PlateElement
      {...props}
      as="div"
      className={`my-4 ${selected ? "ring-2 ring-ring ring-offset-2 rounded-lg" : ""}`}
    >
      <Tabs defaultValue={element.defaultValue}>
        {props.children}
      </Tabs>
    </PlateElement>
  );
}

function TabElement(props: PlateElementProps) {
  const element = useElement<TTabElement>();

  return (
    <PlateElement {...props} as="div">
      <Tab value={element.value} label={element.label}>
        {props.children}
      </Tab>
    </PlateElement>
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
      children: [{ text: tab.content }],
    })),
  };
}

export { TABS_KEY, TAB_KEY };
