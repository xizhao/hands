/**
 * EmptyBlockView - Full-screen template picker for empty blocks
 *
 * Dynamically loads components from @hands/stdlib registry.
 * - "Empty" is the default selection (generates minimal component)
 * - Browse all stdlib components by category
 * - Live preview of selected component (no mock data)
 */

import {
  CaretRight,
  File,
  MagnifyingGlass,
  Check,
} from "@phosphor-icons/react";
import { useState, useMemo, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useSaveBlockContent } from "@/hooks/useWorkbook";
import { setChatBarHidden } from "@/hooks/useChatState";

// Import registry helpers
import {
  listComponents,
  listCategories,
  type ComponentMeta,
} from "@hands/stdlib/registry";
// Import all components from stdlib
import * as StdlibComponents from "@hands/stdlib";

// Convert kebab-case to PascalCase
function pascalCase(str: string): string {
  return str
    .split(/[-_]/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join("");
}

// Generate source code for a component
function generateSource(blockName: string, componentKey: string | null, componentMeta: ComponentMeta | null): string {
  const fnName = pascalCase(blockName);

  // Empty/blank template
  if (!componentKey || !componentMeta) {
    return `export default function ${fnName}() {
  return (
    <div className="p-4">
      <h1 className="text-lg font-semibold">${blockName}</h1>
    </div>
  );
}`;
  }

  // Component from stdlib
  const componentName = componentMeta.name.replace(/\s+/g, "");
  return `import { ${componentName} } from "@hands/stdlib";

export default function ${fnName}() {
  return <${componentName} />;
}`;
}

// Get the actual React component from stdlib exports
function getStdlibComponent(componentMeta: ComponentMeta): React.ComponentType<Record<string, unknown>> | null {
  const componentName = componentMeta.name.replace(/\s+/g, "");
  const Component = (StdlibComponents as Record<string, unknown>)[componentName];
  if (typeof Component === "function") {
    return Component as React.ComponentType<Record<string, unknown>>;
  }
  return null;
}

interface EmptyBlockViewProps {
  blockId: string;
  onInitialized?: () => void;
}

export function EmptyBlockView({ blockId, onInitialized }: EmptyBlockViewProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  // null means "Empty" (blank) is selected
  const [selectedComponentKey, setSelectedComponentKey] = useState<string | null>(null);
  const [isInitializing, setIsInitializing] = useState(false);

  const { mutateAsync: saveBlock } = useSaveBlockContent();

  // Hide chat bar while this view is mounted
  useEffect(() => {
    setChatBarHidden(true);
    return () => setChatBarHidden(false);
  }, []);

  // Extract block name from blockId (last segment if path)
  const blockName = blockId.split("/").pop() || blockId;

  // Load components and categories from stdlib registry
  const allComponents = useMemo(() => listComponents(), []);
  const categories = useMemo(() => listCategories(), []);

  // Filter components
  const filteredComponents = useMemo(() => {
    let filtered = allComponents;

    if (activeCategory) {
      filtered = filtered.filter((c) => c.category === activeCategory);
    }

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (c) =>
          c.key.includes(query) ||
          c.name.toLowerCase().includes(query) ||
          c.description.toLowerCase().includes(query) ||
          c.keywords?.some((k) => k.toLowerCase().includes(query))
      );
    }

    return filtered;
  }, [allComponents, activeCategory, searchQuery]);

  // Group components by category for display
  const groupedComponents = useMemo(() => {
    const groups = new Map<string, typeof filteredComponents>();
    for (const comp of filteredComponents) {
      const list = groups.get(comp.category) || [];
      list.push(comp);
      groups.set(comp.category, list);
    }
    return groups;
  }, [filteredComponents]);

  // Get selected component meta
  const selectedComponent = useMemo(() => {
    if (!selectedComponentKey) return null;
    return allComponents.find((c) => c.key === selectedComponentKey) || null;
  }, [selectedComponentKey, allComponents]);

  // Get category display name
  const getCategoryName = (categoryKey: string) => {
    const cat = categories.find((c) => c.key === categoryKey);
    return cat?.name || categoryKey;
  };

  const handleConfirm = async () => {
    setIsInitializing(true);
    try {
      const source = generateSource(blockName, selectedComponentKey, selectedComponent);
      await saveBlock({ blockId, source });
      onInitialized?.();
    } catch (err) {
      console.error("[EmptyBlockView] Failed to initialize block:", err);
    } finally {
      setIsInitializing(false);
    }
  };

  // Render preview of selected component
  const renderPreview = () => {
    if (!selectedComponent) {
      // Empty/blank preview
      return (
        <div className="p-4">
          <h1 className="text-lg font-semibold">{blockName}</h1>
        </div>
      );
    }

    const Component = getStdlibComponent(selectedComponent);
    if (!Component) {
      return (
        <div className="p-4 text-muted-foreground text-sm">
          Preview not available for {selectedComponent.name}
        </div>
      );
    }

    // Render component with no props (stdlib components should handle empty state)
    try {
      return <Component />;
    } catch {
      return (
        <div className="p-4 text-muted-foreground text-sm">
          Preview not available
        </div>
      );
    }
  };

  return (
    <div className="h-full flex items-center justify-center bg-black/5 dark:bg-black/40 p-4 pt-2">
      {/* Main card panel */}
      <div className="w-full max-w-5xl h-full max-h-[700px] bg-background rounded-xl border shadow-lg flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b bg-muted/30">
          <div className="flex items-center gap-3">
            <h1 className="text-sm font-semibold">Initialize Block</h1>
            <code className="text-xs bg-muted px-2 py-0.5 rounded text-muted-foreground">
              {blockId}.tsx
            </code>
          </div>
          <Button
            onClick={handleConfirm}
            disabled={isInitializing}
          >
            {isInitializing ? (
              "Creating..."
            ) : (
              <>
                <Check weight="bold" className="h-4 w-4 mr-1.5" />
                Create {selectedComponent ? `with ${selectedComponent.name}` : "Empty"}
              </>
            )}
          </Button>
        </div>

        {/* Content */}
        <div className="flex-1 flex min-h-0">
          {/* Left sidebar - component browser */}
          <div className="w-72 border-r flex flex-col bg-muted/20">
            {/* Search */}
            <div className="p-3 border-b">
              <div className="relative">
                <MagnifyingGlass className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search components..."
                  className="pl-8 h-8 text-sm"
                />
              </div>
            </div>

            {/* Category tabs */}
            <div className="px-3 py-2 border-b flex gap-1 flex-wrap">
              <button
                type="button"
                onClick={() => setActiveCategory(null)}
                className={cn(
                  "px-2 py-1 text-xs font-medium rounded transition-colors",
                  activeCategory === null
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted"
                )}
              >
                All
              </button>
              {categories.map((cat) => (
                <button
                  key={cat.key}
                  type="button"
                  onClick={() => setActiveCategory(cat.key)}
                  className={cn(
                    "px-2 py-1 text-xs font-medium rounded transition-colors",
                    activeCategory === cat.key
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted"
                  )}
                >
                  {cat.name}
                </button>
              ))}
            </div>

            {/* Component list */}
            <div className="flex-1 overflow-auto p-2">
              {/* Empty/Blank option - always first */}
              <div className="mb-3">
                <div className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider px-2 py-1">
                  Basic
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedComponentKey(null)}
                  className={cn(
                    "w-full flex items-center gap-2.5 px-2 py-2 rounded-md text-left transition-colors",
                    selectedComponentKey === null
                      ? "bg-primary/10 text-foreground"
                      : "hover:bg-muted text-muted-foreground hover:text-foreground"
                  )}
                >
                  <File
                    weight={selectedComponentKey === null ? "duotone" : "regular"}
                    className="h-4 w-4 shrink-0"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">Empty</div>
                  </div>
                  {selectedComponentKey === null && (
                    <CaretRight weight="bold" className="h-3 w-3 shrink-0 text-primary" />
                  )}
                </button>
              </div>

              {/* Grouped components from registry */}
              {Array.from(groupedComponents.entries()).map(([category, components]) => (
                <div key={category} className="mb-3">
                  <div className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider px-2 py-1">
                    {getCategoryName(category)}
                  </div>
                  {components.map((comp) => (
                    <button
                      key={comp.key}
                      type="button"
                      onClick={() => setSelectedComponentKey(comp.key)}
                      className={cn(
                        "w-full flex items-center gap-2.5 px-2 py-2 rounded-md text-left transition-colors",
                        selectedComponentKey === comp.key
                          ? "bg-primary/10 text-foreground"
                          : "hover:bg-muted text-muted-foreground hover:text-foreground"
                      )}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium truncate">{comp.name}</div>
                      </div>
                      {selectedComponentKey === comp.key && (
                        <CaretRight weight="bold" className="h-3 w-3 shrink-0 text-primary" />
                      )}
                    </button>
                  ))}
                </div>
              ))}

              {filteredComponents.length === 0 && searchQuery && (
                <div className="text-center py-8 text-sm text-muted-foreground">
                  No components found
                </div>
              )}
            </div>
          </div>

          {/* Right panel - preview */}
          <div className="flex-1 flex flex-col min-w-0">
            {/* Preview header */}
            <div className="px-5 py-4 border-b">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-muted">
                  <File weight="duotone" className="h-5 w-5 text-muted-foreground" />
                </div>
                <div>
                  <h2 className="font-semibold">
                    {selectedComponent?.name || "Empty"}
                  </h2>
                  <p className="text-sm text-muted-foreground">
                    {selectedComponent?.description || "Start with a minimal React component"}
                  </p>
                </div>
              </div>
            </div>

            {/* Preview content - render actual component */}
            <div className="flex-1 overflow-auto p-5">
              <div className="h-full flex items-start justify-center">
                <div className="w-full max-w-lg">
                  {renderPreview()}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
