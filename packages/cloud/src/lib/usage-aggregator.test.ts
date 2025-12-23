import { describe, expect, test } from "bun:test";

// Cost per 1K tokens (in cents) by model
const MODEL_COSTS: Record<string, { input: number; output: number }> = {
  "claude-3-opus": { input: 1.5, output: 7.5 },
  "claude-3-sonnet": { input: 0.3, output: 1.5 },
  "claude-3-haiku": { input: 0.025, output: 0.125 },
  "claude-sonnet-4": { input: 0.3, output: 1.5 },
  "claude-opus-4": { input: 1.5, output: 7.5 },
  "gpt-4": { input: 3.0, output: 6.0 },
  "gpt-4-turbo": { input: 1.0, output: 3.0 },
  "gpt-3.5-turbo": { input: 0.05, output: 0.15 },
  default: { input: 0.1, output: 0.3 },
};

function estimateCost(
  model: string | undefined,
  inputTokens: number,
  outputTokens: number
): number {
  const costs = MODEL_COSTS[model ?? "default"] ?? MODEL_COSTS.default;
  const inputCost = (inputTokens / 1000) * costs.input;
  const outputCost = (outputTokens / 1000) * costs.output;
  return Math.round(inputCost + outputCost);
}

interface AIGatewayLogEntry {
  metadata?: {
    userId?: string;
  };
  model?: string;
  provider?: string;
  request_tokens?: number;
  response_tokens?: number;
  timestamp?: string;
  success?: boolean;
}

function aggregateLogs(logs: AIGatewayLogEntry[]): Map<
  string,
  {
    userId: string;
    date: string;
    tokensInput: number;
    tokensOutput: number;
    requests: number;
    costCents: number;
  }
> {
  const aggregates = new Map<
    string,
    {
      userId: string;
      date: string;
      tokensInput: number;
      tokensOutput: number;
      requests: number;
      costCents: number;
    }
  >();

  for (const log of logs) {
    const userId = log.metadata?.userId;
    if (!userId) continue;

    const date = log.timestamp
      ? new Date(log.timestamp).toISOString().split("T")[0]
      : new Date().toISOString().split("T")[0];

    const key = `${userId}:${date}`;
    const existing = aggregates.get(key);

    const inputTokens = log.request_tokens ?? 0;
    const outputTokens = log.response_tokens ?? 0;
    const cost = estimateCost(log.model, inputTokens, outputTokens);

    if (existing) {
      existing.tokensInput += inputTokens;
      existing.tokensOutput += outputTokens;
      existing.requests += 1;
      existing.costCents += cost;
    } else {
      aggregates.set(key, {
        userId,
        date,
        tokensInput: inputTokens,
        tokensOutput: outputTokens,
        requests: 1,
        costCents: cost,
      });
    }
  }

  return aggregates;
}

describe("usage aggregator", () => {
  describe("estimateCost", () => {
    test("should calculate cost for claude-3-opus", () => {
      // 1000 input tokens at 1.5 cents + 1000 output at 7.5 cents = 9 cents
      const cost = estimateCost("claude-3-opus", 1000, 1000);
      expect(cost).toBe(9);
    });

    test("should calculate cost for claude-3-haiku", () => {
      // 1000 input at 0.025 + 1000 output at 0.125 = 0.15 cents → rounds to 0
      const cost = estimateCost("claude-3-haiku", 1000, 1000);
      expect(cost).toBe(0);

      // 10000 tokens each = 1.5 cents total → rounds to 2
      const cost2 = estimateCost("claude-3-haiku", 10000, 10000);
      expect(cost2).toBe(2);
    });

    test("should calculate cost for gpt-4", () => {
      // 1000 input at 3.0 + 1000 output at 6.0 = 9 cents
      const cost = estimateCost("gpt-4", 1000, 1000);
      expect(cost).toBe(9);
    });

    test("should use default pricing for unknown model", () => {
      // 1000 input at 0.1 + 1000 output at 0.3 = 0.4 cents → rounds to 0
      const cost = estimateCost("unknown-model", 1000, 1000);
      expect(cost).toBe(0);

      // Larger scale
      const cost2 = estimateCost("unknown-model", 10000, 10000);
      expect(cost2).toBe(4);
    });

    test("should handle zero tokens", () => {
      const cost = estimateCost("claude-3-opus", 0, 0);
      expect(cost).toBe(0);
    });

    test("should handle undefined model", () => {
      const cost = estimateCost(undefined, 1000, 1000);
      expect(cost).toBe(0); // Uses default which rounds to 0 at 1k tokens
    });
  });

  describe("aggregateLogs", () => {
    test("should aggregate logs by user and date", () => {
      const logs: AIGatewayLogEntry[] = [
        {
          metadata: { userId: "user-1" },
          model: "claude-3-sonnet",
          request_tokens: 100,
          response_tokens: 200,
          timestamp: "2025-01-15T10:00:00Z",
        },
        {
          metadata: { userId: "user-1" },
          model: "claude-3-sonnet",
          request_tokens: 150,
          response_tokens: 250,
          timestamp: "2025-01-15T11:00:00Z",
        },
      ];

      const result = aggregateLogs(logs);

      expect(result.size).toBe(1);
      const aggregate = result.get("user-1:2025-01-15");
      expect(aggregate).toBeDefined();
      expect(aggregate!.tokensInput).toBe(250);
      expect(aggregate!.tokensOutput).toBe(450);
      expect(aggregate!.requests).toBe(2);
    });

    test("should separate different dates", () => {
      const logs: AIGatewayLogEntry[] = [
        {
          metadata: { userId: "user-1" },
          request_tokens: 100,
          response_tokens: 100,
          timestamp: "2025-01-15T10:00:00Z",
        },
        {
          metadata: { userId: "user-1" },
          request_tokens: 100,
          response_tokens: 100,
          timestamp: "2025-01-16T10:00:00Z",
        },
      ];

      const result = aggregateLogs(logs);
      expect(result.size).toBe(2);
      expect(result.has("user-1:2025-01-15")).toBe(true);
      expect(result.has("user-1:2025-01-16")).toBe(true);
    });

    test("should separate different users", () => {
      const logs: AIGatewayLogEntry[] = [
        {
          metadata: { userId: "user-1" },
          request_tokens: 100,
          response_tokens: 100,
          timestamp: "2025-01-15T10:00:00Z",
        },
        {
          metadata: { userId: "user-2" },
          request_tokens: 200,
          response_tokens: 200,
          timestamp: "2025-01-15T10:00:00Z",
        },
      ];

      const result = aggregateLogs(logs);
      expect(result.size).toBe(2);

      const user1 = result.get("user-1:2025-01-15");
      const user2 = result.get("user-2:2025-01-15");

      expect(user1!.tokensInput).toBe(100);
      expect(user2!.tokensInput).toBe(200);
    });

    test("should skip logs without userId", () => {
      const logs: AIGatewayLogEntry[] = [
        {
          metadata: { userId: "user-1" },
          request_tokens: 100,
          response_tokens: 100,
          timestamp: "2025-01-15T10:00:00Z",
        },
        {
          metadata: {}, // No userId
          request_tokens: 100,
          response_tokens: 100,
          timestamp: "2025-01-15T10:00:00Z",
        },
        {
          // No metadata
          request_tokens: 100,
          response_tokens: 100,
          timestamp: "2025-01-15T10:00:00Z",
        },
      ];

      const result = aggregateLogs(logs);
      expect(result.size).toBe(1);
    });

    test("should handle missing token counts", () => {
      const logs: AIGatewayLogEntry[] = [
        {
          metadata: { userId: "user-1" },
          timestamp: "2025-01-15T10:00:00Z",
          // No token counts
        },
      ];

      const result = aggregateLogs(logs);
      const aggregate = result.get("user-1:2025-01-15");

      expect(aggregate!.tokensInput).toBe(0);
      expect(aggregate!.tokensOutput).toBe(0);
      expect(aggregate!.requests).toBe(1);
    });

    test("should calculate cumulative cost", () => {
      const logs: AIGatewayLogEntry[] = [
        {
          metadata: { userId: "user-1" },
          model: "claude-3-opus",
          request_tokens: 1000,
          response_tokens: 1000,
          timestamp: "2025-01-15T10:00:00Z",
        },
        {
          metadata: { userId: "user-1" },
          model: "claude-3-opus",
          request_tokens: 1000,
          response_tokens: 1000,
          timestamp: "2025-01-15T11:00:00Z",
        },
      ];

      const result = aggregateLogs(logs);
      const aggregate = result.get("user-1:2025-01-15");

      // 2 requests x 9 cents each = 18 cents
      expect(aggregate!.costCents).toBe(18);
    });

    test("should handle empty logs array", () => {
      const result = aggregateLogs([]);
      expect(result.size).toBe(0);
    });
  });
});
