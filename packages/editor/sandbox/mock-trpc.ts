/**
 * Mock tRPC Client for Testing/Sandbox
 *
 * Provides stubbed AI endpoints that return example MDX components.
 * Use with EditorProvider for testing @ autocomplete without a real backend.
 *
 * @example
 * ```tsx
 * import { EditorProvider, mockTrpc } from "@hands/editor/context";
 *
 * <EditorProvider trpc={mockTrpc}>
 *   <Editor />
 * </EditorProvider>
 * ```
 */

import type { EditorTrpcClient, GenerateMdxInput, GenerateMdxBlockInput, GenerateMdxOutput } from "@hands/editor";

// SQL queries that match MOCK_DATA in main.tsx
const QUERIES = {
  sales: "SELECT month, sales, revenue, profit FROM monthly_sales",
  categories: "SELECT category, value FROM categories",
  devices: "SELECT name, value FROM device_breakdown",
  users: "SELECT id, name, email, status, role FROM users LIMIT 10",
};

// Example MDX snippets keyed by prompt patterns
const MOCK_RESPONSES: Record<string, string> = {
  // Charts wrapped in LiveValue with SQL queries
  chart: `<LiveValue query="${QUERIES.sales}">
  <BarChart xKey="month" yKey={["sales", "revenue"]} />
</LiveValue>`,
  bar: `<LiveValue query="${QUERIES.categories}">
  <BarChart xKey="category" yKey="value" />
</LiveValue>`,
  line: `<LiveValue query="${QUERIES.sales}">
  <LineChart xKey="month" yKey={["sales", "revenue", "profit"]} />
</LiveValue>`,
  pie: `<LiveValue query="${QUERIES.devices}">
  <PieChart nameKey="name" valueKey="value" />
</LiveValue>`,
  area: `<LiveValue query="${QUERIES.sales}">
  <AreaChart xKey="month" yKey={["revenue", "profit"]} />
</LiveValue>`,

  // Data display with LiveValue
  table: `<LiveValue query="${QUERIES.users}" display="table" />`,
  grid: `<LiveValue query="${QUERIES.users}" display="table" />`,
  count: `Total users: <LiveValue query="SELECT COUNT(*) as count FROM users" />`,
  metric: `<Metric value={1234} label="Total Items" />`,

  // Forms
  form: `<LiveAction sql="INSERT INTO items (name) VALUES ({{name}})">
  <Input name="name" placeholder="Enter name">Name</Input>
  <Button>Submit</Button>
</LiveAction>`,
  input: `<Input name="value" placeholder="Enter value">Value</Input>`,
  button: `<Button variant="default">Click me</Button>`,

  // Layout
  columns: `<Columns>
  <Column width="50%">

Left column content here

  </Column>
  <Column width="50%">

Right column content here

  </Column>
</Columns>`,

  // Status
  alert: `<Alert variant="info" title="Note">This is an informational message.</Alert>`,
  badge: `<Badge variant="success">Active</Badge>`,
  progress: `<Progress value={75} max={100} showValue />`,
};

// Default response when no pattern matches
const DEFAULT_RESPONSE = `<Metric value={42} label="Result" />`;

/**
 * Find matching MDX response for a prompt.
 */
function findMockResponse(prompt: string): string {
  const lower = prompt.toLowerCase();

  for (const [pattern, mdx] of Object.entries(MOCK_RESPONSES)) {
    if (lower.includes(pattern)) {
      return mdx;
    }
  }

  return DEFAULT_RESPONSE;
}

/**
 * Mock tRPC client for testing.
 * Returns example MDX based on prompt patterns.
 */
export const mockTrpc: EditorTrpcClient = {
  ai: {
    generateMdx: {
      mutate: async (input: GenerateMdxInput): Promise<GenerateMdxOutput> => {
        // Simulate network delay
        await new Promise((resolve) => setTimeout(resolve, 200 + Math.random() * 300));

        const mdx = findMockResponse(input.prompt);
        console.log('[mock-trpc] generateMdx prompt:', input.prompt, '-> mdx:', mdx);
        return { mdx };
      },
    },
    generateMdxBlock: {
      mutate: async (input: GenerateMdxBlockInput): Promise<GenerateMdxOutput> => {
        // Simulate longer delay for "thinking"
        const delay = input.reasoning === "high" ? 1000 : input.reasoning === "mid" ? 500 : 200;
        await new Promise((resolve) => setTimeout(resolve, delay + Math.random() * 300));

        const mdx = findMockResponse(input.prompt);
        console.log('[mock-trpc] generateMdxBlock prompt:', input.prompt, '-> mdx:', mdx);
        return { mdx };
      },
    },
  },
};

/**
 * Create a mock tRPC client with custom responses.
 */
export function createMockTrpc(
  customResponses?: Record<string, string>,
  delay = 200
): EditorTrpcClient {
  const responses = { ...MOCK_RESPONSES, ...customResponses };

  const findResponse = (prompt: string): string => {
    const lower = prompt.toLowerCase();
    for (const [pattern, mdx] of Object.entries(responses)) {
      if (lower.includes(pattern)) {
        return mdx;
      }
    }
    return DEFAULT_RESPONSE;
  };

  return {
    ai: {
      generateMdx: {
        mutate: async (input: GenerateMdxInput): Promise<GenerateMdxOutput> => {
          await new Promise((resolve) => setTimeout(resolve, delay + Math.random() * 100));
          return { mdx: findResponse(input.prompt) };
        },
      },
      generateMdxBlock: {
        mutate: async (input: GenerateMdxBlockInput): Promise<GenerateMdxOutput> => {
          const extraDelay = input.reasoning === "high" ? 800 : input.reasoning === "mid" ? 400 : 0;
          await new Promise((resolve) => setTimeout(resolve, delay + extraDelay + Math.random() * 100));
          return { mdx: findResponse(input.prompt) };
        },
      },
    },
  };
}
