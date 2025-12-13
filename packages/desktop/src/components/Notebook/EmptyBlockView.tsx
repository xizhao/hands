/**
 * EmptyBlockView - Two-step block initialization
 *
 * Step 1: Choose between "Initialize Empty" or "Browse Template Library"
 * Step 2: If browsing, show full template picker with back button
 */

import {
  ArrowLeft,
  CaretRight,
  File,
  MagnifyingGlass,
  Check,
  SquaresFour,
} from "@phosphor-icons/react";
import { useState, useMemo, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useSaveBlockContent } from "@/hooks/useWorkbook";
import { setChatBarHidden } from "@/hooks/useChatState";

// Import registry data and previews separately to avoid SSR issues
import { registry } from "@hands/stdlib/registry";
import { previews } from "@hands/stdlib/previews";

// Types for registry
interface ComponentMeta {
  name: string;
  category: string;
  description: string;
  files: readonly string[];
  dependencies: readonly string[];
  icon?: string;
  keywords?: readonly string[];
  example?: string;
}

interface CategoryMeta {
  name: string;
  description: string;
}

// Helper functions
function listComponents(category?: string) {
  return Object.entries(registry.components)
    .filter(([_, comp]) => !category || comp.category === category)
    .map(([key, comp]) => ({ key, ...comp }));
}

function listCategories() {
  return Object.entries(registry.categories).map(([key, cat]) => ({ key, ...cat }));
}

// Convert kebab-case to PascalCase
function pascalCase(str: string): string {
  return str
    .split(/[-_]/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join("");
}

// Extract component names used in example code for imports
function extractComponentNames(code: string): string[] {
  // Match JSX component tags like <ComponentName or <ComponentName>
  const matches = code.match(/<([A-Z][A-Za-z0-9]*)/g) || [];
  const names = matches.map(m => m.slice(1)); // Remove leading <
  return [...new Set(names)]; // Deduplicate
}

// Generate source code for a component
function generateSource(
  blockName: string,
  componentKey: string | null,
  componentMeta: ComponentMeta | null
): string {
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

  // If we have example code, use it
  if (componentMeta.example) {
    const componentNames = extractComponentNames(componentMeta.example);
    const imports = componentNames.length > 0
      ? `import { ${componentNames.join(", ")} } from "@hands/stdlib";\n\n`
      : "";

    return `${imports}export default function ${fnName}() {
  return (
    ${componentMeta.example}
  );
}`;
  }

  // Fallback: Component from stdlib without example
  const componentName = componentMeta.name.replace(/\s+/g, "");
  return `import { ${componentName} } from "@hands/stdlib";

export default function ${fnName}() {
  return <${componentName} />;
}`;
}


interface EmptyBlockViewProps {
  blockId: string;
  onInitialized?: () => void;
}

type ViewMode = "initial" | "browse";

export function EmptyBlockView({ blockId, onInitialized }: EmptyBlockViewProps) {
  const [viewMode, setViewMode] = useState<ViewMode>("initial");
  const [searchQuery, setSearchQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
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

  const handleInitializeEmpty = async () => {
    setIsInitializing(true);
    try {
      const source = generateSource(blockName, null, null);
      await saveBlock({ blockId, source });
      onInitialized?.();
    } catch (err) {
      console.error("[EmptyBlockView] Failed to initialize block:", err);
    } finally {
      setIsInitializing(false);
    }
  };

  const handleConfirmTemplate = async () => {
    if (!selectedComponentKey) return;
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

  const handleBack = () => {
    setViewMode("initial");
    setSelectedComponentKey(null);
    setSearchQuery("");
    setActiveCategory(null);
  };

  // Render live preview of selected component
  const renderPreview = () => {
    if (!selectedComponentKey) {
      return (
        <div className="p-4 text-muted-foreground text-sm">
          Select a template to preview
        </div>
      );
    }

    // Get the preview component from generated previews
    const PreviewComponent = previews[selectedComponentKey];
    if (PreviewComponent) {
      return (
        <div className="rounded-lg border bg-background p-6">
          <PreviewComponent />
        </div>
      );
    }

    return (
      <div className="p-4 text-muted-foreground text-sm">
        No preview available for {selectedComponent?.name}
      </div>
    );
  };

  // Initial choice view
  if (viewMode === "initial") {
    return (
      <div className="h-full flex items-center justify-center bg-black/5 dark:bg-black/40 p-4">
        <div className="w-full max-w-md">
          <div className="text-center mb-6">
            <h1 className="text-lg font-semibold mb-1">Initialize Block</h1>
            <p className="text-sm text-muted-foreground">{blockName}</p>
          </div>

          <div className="space-y-3">
            {/* Initialize Empty */}
            <button
              type="button"
              onClick={handleInitializeEmpty}
              disabled={isInitializing}
              className="w-full flex items-center gap-4 p-4 bg-background rounded-xl border hover:border-primary/50 hover:bg-accent/50 transition-colors text-left group"
            >
              <div className="p-3 rounded-lg bg-muted group-hover:bg-primary/10">
                <File weight="duotone" className="h-6 w-6 text-muted-foreground group-hover:text-primary" />
              </div>
              <div className="flex-1">
                <div className="font-medium">Start Empty</div>
                <div className="text-sm text-muted-foreground">
                  Begin with a blank canvas
                </div>
              </div>
              <CaretRight weight="bold" className="h-4 w-4 text-muted-foreground group-hover:text-primary" />
            </button>

            {/* Browse Templates */}
            <button
              type="button"
              onClick={() => setViewMode("browse")}
              disabled={isInitializing}
              className="w-full flex items-center gap-4 p-4 bg-background rounded-xl border hover:border-primary/50 hover:bg-accent/50 transition-colors text-left group"
            >
              <div className="p-3 rounded-lg bg-muted group-hover:bg-primary/10">
                <SquaresFour weight="duotone" className="h-6 w-6 text-muted-foreground group-hover:text-primary" />
              </div>
              <div className="flex-1">
                <div className="font-medium">Browse Templates</div>
                <div className="text-sm text-muted-foreground">
                  Start from a pre-built component
                </div>
              </div>
              <CaretRight weight="bold" className="h-4 w-4 text-muted-foreground group-hover:text-primary" />
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Template browser view
  return (
    <div className="h-full flex items-center justify-center bg-black/5 dark:bg-black/40 p-4 pt-2">
      {/* Main card panel */}
      <div className="w-full max-w-5xl h-full max-h-[700px] bg-background rounded-xl border shadow-lg flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b bg-muted/30">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleBack}
              className="p-1.5 -ml-1.5 rounded-md hover:bg-muted transition-colors"
            >
              <ArrowLeft weight="bold" className="h-4 w-4" />
            </button>
            <h1 className="text-sm font-semibold">Choose a Template</h1>
            <span className="text-xs text-muted-foreground">
              {blockName}
            </span>
          </div>
          <Button
            onClick={handleConfirmTemplate}
            disabled={isInitializing || !selectedComponentKey}
          >
            {isInitializing ? (
              "Creating..."
            ) : (
              <>
                <Check weight="bold" className="h-4 w-4 mr-1.5" />
                Create {selectedComponent ? `with ${selectedComponent.name}` : ""}
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
                  placeholder="Search templates..."
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
                  No templates found
                </div>
              )}

              {filteredComponents.length === 0 && !searchQuery && (
                <div className="text-center py-8 text-sm text-muted-foreground">
                  No templates available
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
                    {selectedComponent?.name || "Select a Template"}
                  </h2>
                  <p className="text-sm text-muted-foreground">
                    {selectedComponent?.description || "Choose a template from the list"}
                  </p>
                </div>
              </div>
            </div>

            {/* Preview content - render actual component */}
            <div className="flex-1 overflow-auto p-5">
              <div className="w-full max-w-lg mx-auto">
                {renderPreview()}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
