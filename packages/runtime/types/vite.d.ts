declare module "*?url" {
  const result: string;
  export default result;
}

interface ImportMeta {
  glob<M = Record<string, any>>(
    pattern: string,
    options?: {
      eager?: boolean;
      import?: string;
      query?: Record<string, string | string[]>;
    }
  ): Record<string, () => Promise<M>>;
}
