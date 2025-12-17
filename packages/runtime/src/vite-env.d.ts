/// <reference types="vite/client" />

declare module "virtual:blocks-registry" {
  export const blockRegistry: Map<string, () => Promise<{ default: React.FC<any> }>>;
  export const blockErrors: Array<{ id: string; path: string; error: string }>;
}
