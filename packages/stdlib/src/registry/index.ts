import registry from "../registry.json" with { type: "json" };

export interface ComponentMeta {
  name: string;
  category: string;
  description: string;
  files: string[];
  dependencies: string[];
}

export interface CategoryMeta {
  name: string;
  description: string;
}

export interface Registry {
  name: string;
  version: string;
  components: Record<string, ComponentMeta>;
  categories: Record<string, CategoryMeta>;
}

// Export typed registry
export const componentRegistry = registry as Registry;

// Helper functions for querying

export function listComponents(category?: string): Array<{ key: string } & ComponentMeta> {
  return Object.entries(componentRegistry.components)
    .filter(([_, comp]) => !category || comp.category === category)
    .map(([key, comp]) => ({ key, ...comp }));
}

export function getComponent(name: string): (ComponentMeta & { key: string }) | undefined {
  const comp = componentRegistry.components[name];
  return comp ? { key: name, ...comp } : undefined;
}

export function searchComponents(query: string): Array<{ key: string } & ComponentMeta> {
  const q = query.toLowerCase();
  return Object.entries(componentRegistry.components)
    .filter(([key, comp]) =>
      key.includes(q) ||
      comp.name.toLowerCase().includes(q) ||
      comp.description.toLowerCase().includes(q) ||
      comp.category.includes(q)
    )
    .map(([key, comp]) => ({ key, ...comp }));
}

export function listCategories(): Array<{ key: string } & CategoryMeta> {
  return Object.entries(componentRegistry.categories)
    .map(([key, cat]) => ({ key, ...cat }));
}

export function getCategory(name: string): CategoryMeta | undefined {
  return componentRegistry.categories[name];
}
