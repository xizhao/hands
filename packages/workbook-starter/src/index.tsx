import { Hono } from "hono";
import { cors } from "hono/cors";
import * as React from "react";
import charts from "../charts";
import { Dashboard } from "@/pages/Dashboard";
import { renderPage } from "@/lib/render";
import { createDb, runQuery } from "@/lib/db";

type Bindings = {
  DATABASE_URL: string;
  ENVIRONMENT: string;
};

const app = new Hono<{ Bindings: Bindings }>();

// Enable CORS for local development
app.use("/*", cors());

// Health check
app.get("/health", (c) => {
  return c.json({ status: "ok", name: "{{name}}" });
});

// SSR Dashboard - renders charts with data
app.get("/", async (c) => {
  const sql = createDb(c.env.DATABASE_URL);
  const chartData: Record<string, Record<string, unknown>[]> = {};

  for (const chart of charts) {
    try {
      const result = await runQuery(sql, chart.query);
      chartData[chart.id] = result;
    } catch (error) {
      console.error(`Error fetching data for chart ${chart.id}:`, error);
      chartData[chart.id] = [];
    }
  }

  const html = renderPage(
    <Dashboard charts={charts} chartData={chartData} />,
    { title: "{{name}} - Dashboard", initialData: { charts, chartData } }
  );

  return c.html(html);
});

// Individual chart page
app.get("/charts/:id", async (c) => {
  const id = c.req.param("id");
  const chart = charts.find((ch) => ch.id === id);

  if (!chart) {
    return c.notFound();
  }

  const sql = createDb(c.env.DATABASE_URL);
  let data: Record<string, unknown>[] = [];
  try {
    data = await runQuery(sql, chart.query);
  } catch (error) {
    console.error(`Error fetching data for chart ${chart.id}:`, error);
  }

  const html = renderPage(
    <Dashboard charts={[chart]} chartData={{ [chart.id]: data }} />,
    { title: `${chart.title} - {{name}}` }
  );

  return c.html(html);
});

// API: Charts metadata
app.get("/api/charts", (c) => {
  return c.json({ charts });
});

app.get("/api/charts/:id", (c) => {
  const id = c.req.param("id");
  const chart = charts.find((ch) => ch.id === id);
  if (!chart) {
    return c.json({ error: "Chart not found" }, 404);
  }
  return c.json({ chart });
});

// API: Execute chart query - returns data for rendering
app.post("/api/charts/:id/query", async (c) => {
  const id = c.req.param("id");
  const chart = charts.find((ch) => ch.id === id);
  if (!chart) {
    return c.json({ error: "Chart not found" }, 404);
  }

  try {
    const sql = createDb(c.env.DATABASE_URL);
    const result = await runQuery(sql, chart.query);
    return c.json({ data: result });
  } catch (error) {
    return c.json({ error: String(error) }, 500);
  }
});

// Export for Cloudflare Workers
export default {
  fetch: app.fetch,

  // Scheduled handler - uncomment crons in wrangler.toml to enable
  async scheduled(
    controller: ScheduledController,
    env: Bindings,
    ctx: ExecutionContext
  ) {
    console.log(`Cron triggered: ${controller.cron} at ${new Date().toISOString()}`);
    // Add your scheduled task logic here
  },
};
