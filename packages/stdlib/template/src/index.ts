import { Hono } from "hono";
import { cors } from "hono/cors";
import charts from "../charts";

type Bindings = {
  DB: D1Database;
  ENVIRONMENT: string;
};

const app = new Hono<{ Bindings: Bindings }>();

// Enable CORS for local development
app.use("/*", cors());

// Health check
app.get("/", (c) => {
  return c.json({ status: "ok", name: "{{name}}" });
});

// Charts API - returns chart definitions
app.get("/api/charts", (c) => {
  return c.json({ charts });
});

app.get("/api/charts/:id", (c) => {
  const id = c.req.param("id");
  const chart = charts.find((chart) => chart.id === id);
  if (!chart) {
    return c.json({ error: "Chart not found" }, 404);
  }
  return c.json({ chart });
});

// Execute chart query - returns data for rendering
app.post("/api/charts/:id/query", async (c) => {
  const id = c.req.param("id");
  const chart = charts.find((chart) => chart.id === id);
  if (!chart) {
    return c.json({ error: "Chart not found" }, 404);
  }

  try {
    const result = await c.env.DB.prepare(chart.query).all();
    return c.json({ data: result.results });
  } catch (error) {
    return c.json({ error: String(error) }, 500);
  }
});

// Export for Cloudflare Workers
export default {
  fetch: app.fetch,

  // Scheduled handler - cron triggers defined in wrangler.toml
  async scheduled(
    controller: ScheduledController,
    env: Bindings,
    ctx: ExecutionContext
  ) {
    console.log(`Cron triggered: ${controller.cron} at ${new Date().toISOString()}`);

    // Route based on cron pattern if you have multiple schedules
    // switch (controller.cron) {
    //   case "0 * * * *": await hourlyTask(env); break;
    //   case "0 0 * * *": await dailyTask(env); break;
    // }

    // Or just run your scheduled logic here
  },
};
