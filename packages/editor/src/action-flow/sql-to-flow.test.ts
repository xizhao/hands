/**
 * Tests for SQL to Flow Parser
 */

import { describe, it, expect, beforeEach } from "bun:test";
import { parseSqlToFlow, resetNodeIdCounter } from "./sql-to-flow";
import {
  getNodesOfType,
  getSourceTables,
  getTargetTable,
  type SourceNode,
  type FilterNode,
  type JoinNode,
  type AggregateNode,
  type ProjectNode,
  type SortNode,
  type LimitNode,
  type InsertNode,
  type UpdateNode,
  type DeleteNode,
} from "./sql-flow-types";

beforeEach(() => {
  resetNodeIdCounter();
});

describe("parseSqlToFlow", () => {
  describe("basic SELECT queries", () => {
    it("parses simple SELECT *", () => {
      const result = parseSqlToFlow("SELECT * FROM users");

      expect(result.success).toBe(true);
      expect(result.flow).toBeDefined();
      expect(result.flow!.operation).toBe("select");

      const sources = getNodesOfType(result.flow!, "source");
      expect(sources).toHaveLength(1);
      expect(sources[0].table).toBe("users");

      const projects = getNodesOfType(result.flow!, "project");
      expect(projects).toHaveLength(1);
      expect(projects[0].columns[0].isStar).toBe(true);
    });

    it("parses SELECT with specific columns", () => {
      const result = parseSqlToFlow("SELECT id, name, email FROM customers");

      expect(result.success).toBe(true);
      const projects = getNodesOfType(result.flow!, "project");
      expect(projects[0].columns).toHaveLength(3);
      expect(projects[0].columns.map((c) => c.expression)).toEqual(["id", "name", "email"]);
    });

    it("parses SELECT with aliases", () => {
      const result = parseSqlToFlow("SELECT id AS user_id, name AS full_name FROM users");

      expect(result.success).toBe(true);
      const projects = getNodesOfType(result.flow!, "project");
      expect(projects[0].columns[0].alias).toBe("user_id");
      expect(projects[0].columns[1].alias).toBe("full_name");
    });

    it("parses SELECT DISTINCT", () => {
      const result = parseSqlToFlow("SELECT DISTINCT category FROM products");

      expect(result.success).toBe(true);
      const projects = getNodesOfType(result.flow!, "project");
      expect(projects[0].distinct).toBe(true);
    });
  });

  describe("WHERE clause", () => {
    it("parses simple WHERE condition", () => {
      const result = parseSqlToFlow("SELECT * FROM users WHERE active = true");

      expect(result.success).toBe(true);
      const filters = getNodesOfType(result.flow!, "filter");
      expect(filters).toHaveLength(1);
      expect(filters[0].condition).toContain("active");
      expect(filters[0].isHaving).toBeFalsy();
    });

    it("parses complex WHERE with AND/OR", () => {
      const result = parseSqlToFlow(
        "SELECT * FROM orders WHERE status = 'pending' AND total > 100"
      );

      expect(result.success).toBe(true);
      const filters = getNodesOfType(result.flow!, "filter");
      expect(filters[0].condition).toContain("AND");
    });

    it("connects filter node to source node", () => {
      const result = parseSqlToFlow("SELECT * FROM users WHERE id = 1");

      expect(result.success).toBe(true);
      const sources = getNodesOfType(result.flow!, "source");
      const filters = getNodesOfType(result.flow!, "filter");

      expect(filters[0].inputs).toContain(sources[0].id);
    });
  });

  describe("JOIN operations", () => {
    it("parses INNER JOIN", () => {
      const result = parseSqlToFlow(`
        SELECT * FROM orders o
        INNER JOIN customers c ON o.customer_id = c.id
      `);

      expect(result.success).toBe(true);
      const joins = getNodesOfType(result.flow!, "join");
      expect(joins).toHaveLength(1);
      expect(joins[0].joinType).toBe("inner");
      expect(joins[0].table).toBe("customers");
      expect(joins[0].condition).toContain("customer_id");
    });

    it("parses LEFT JOIN", () => {
      const result = parseSqlToFlow(`
        SELECT * FROM users u
        LEFT JOIN orders o ON u.id = o.user_id
      `);

      expect(result.success).toBe(true);
      const joins = getNodesOfType(result.flow!, "join");
      expect(joins[0].joinType).toBe("left");
    });

    it("parses multiple JOINs", () => {
      const result = parseSqlToFlow(`
        SELECT * FROM orders o
        JOIN customers c ON o.customer_id = c.id
        JOIN products p ON o.product_id = p.id
      `);

      expect(result.success).toBe(true);
      const joins = getNodesOfType(result.flow!, "join");
      expect(joins).toHaveLength(2);
    });

    it("includes all tables in getSourceTables", () => {
      const result = parseSqlToFlow(`
        SELECT * FROM orders o
        JOIN customers c ON o.customer_id = c.id
      `);

      expect(result.success).toBe(true);
      const tables = getSourceTables(result.flow!);
      expect(tables).toContain("orders");
      expect(tables).toContain("customers");
    });
  });

  describe("GROUP BY and aggregates", () => {
    it("parses GROUP BY", () => {
      const result = parseSqlToFlow(`
        SELECT category, COUNT(*) FROM products GROUP BY category
      `);

      expect(result.success).toBe(true);
      const aggs = getNodesOfType(result.flow!, "aggregate");
      expect(aggs).toHaveLength(1);
      expect(aggs[0].groupBy).toContain("category");
    });

    it("extracts aggregate functions", () => {
      const result = parseSqlToFlow(`
        SELECT
          category,
          COUNT(*) as count,
          SUM(price) as total,
          AVG(price) as avg_price
        FROM products
        GROUP BY category
      `);

      expect(result.success).toBe(true);
      const aggs = getNodesOfType(result.flow!, "aggregate");
      expect(aggs[0].functions).toHaveLength(3);

      const funcNames = aggs[0].functions.map((f) => f.fn);
      expect(funcNames).toContain("count");
      expect(funcNames).toContain("sum");
      expect(funcNames).toContain("avg");
    });

    it("parses HAVING clause", () => {
      const result = parseSqlToFlow(`
        SELECT category, COUNT(*) as cnt
        FROM products
        GROUP BY category
        HAVING COUNT(*) > 5
      `);

      expect(result.success).toBe(true);
      const filters = getNodesOfType(result.flow!, "filter");
      const havingFilter = filters.find((f) => f.isHaving);
      expect(havingFilter).toBeDefined();
    });
  });

  describe("ORDER BY", () => {
    it("parses simple ORDER BY", () => {
      const result = parseSqlToFlow("SELECT * FROM users ORDER BY name");

      expect(result.success).toBe(true);
      const sorts = getNodesOfType(result.flow!, "sort");
      expect(sorts).toHaveLength(1);
      expect(sorts[0].specs[0].column).toBe("name");
      expect(sorts[0].specs[0].direction).toBe("asc");
    });

    it("parses ORDER BY with direction", () => {
      const result = parseSqlToFlow("SELECT * FROM users ORDER BY created_at DESC");

      expect(result.success).toBe(true);
      const sorts = getNodesOfType(result.flow!, "sort");
      expect(sorts[0].specs[0].direction).toBe("desc");
    });

    it("parses multiple ORDER BY columns", () => {
      const result = parseSqlToFlow(
        "SELECT * FROM users ORDER BY last_name ASC, first_name ASC"
      );

      expect(result.success).toBe(true);
      const sorts = getNodesOfType(result.flow!, "sort");
      expect(sorts[0].specs).toHaveLength(2);
    });
  });

  describe("LIMIT and OFFSET", () => {
    it("parses LIMIT", () => {
      const result = parseSqlToFlow("SELECT * FROM users LIMIT 10");

      expect(result.success).toBe(true);
      const limits = getNodesOfType(result.flow!, "limit");
      expect(limits).toHaveLength(1);
      expect(limits[0].limit).toBe(10);
    });

    it("parses LIMIT with OFFSET", () => {
      const result = parseSqlToFlow("SELECT * FROM users LIMIT 10 OFFSET 20");

      expect(result.success).toBe(true);
      const limits = getNodesOfType(result.flow!, "limit");
      expect(limits[0].limit).toBe(10);
      expect(limits[0].offset).toBe(20);
    });
  });

  describe("CTEs (WITH clause)", () => {
    it("parses simple CTE", () => {
      const result = parseSqlToFlow(`
        WITH active_users AS (
          SELECT * FROM users WHERE active = true
        )
        SELECT * FROM active_users
      `);

      expect(result.success).toBe(true);
      const ctes = getNodesOfType(result.flow!, "cte");
      expect(ctes).toHaveLength(1);
      expect(ctes[0].name).toBe("active_users");
      expect(ctes[0].subflow).toBeDefined();
    });

    it("parses multiple CTEs", () => {
      const result = parseSqlToFlow(`
        WITH
          active_users AS (SELECT * FROM users WHERE active = true),
          recent_orders AS (SELECT * FROM orders WHERE created_at > '2024-01-01')
        SELECT * FROM active_users JOIN recent_orders ON active_users.id = recent_orders.user_id
      `);

      expect(result.success).toBe(true);
      const ctes = getNodesOfType(result.flow!, "cte");
      expect(ctes).toHaveLength(2);
    });
  });

  describe("INSERT statements", () => {
    it("parses simple INSERT", () => {
      const result = parseSqlToFlow(
        "INSERT INTO users (name, email) VALUES ('John', 'john@example.com')"
      );

      expect(result.success).toBe(true);
      expect(result.flow!.operation).toBe("insert");

      const inserts = getNodesOfType(result.flow!, "insert");
      expect(inserts).toHaveLength(1);
      expect(inserts[0].table).toBe("users");
      expect(inserts[0].columns).toEqual(["name", "email"]);
    });

    it("detects ON CONFLICT (upsert)", () => {
      const result = parseSqlToFlow(`
        INSERT INTO users (id, name) VALUES (1, 'John')
        ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name
      `);

      expect(result.success).toBe(true);
      const inserts = getNodesOfType(result.flow!, "insert");
      expect(inserts[0].onConflict).toBeDefined();
      expect(inserts[0].onConflict?.action).toBe("update");
    });

    it("detects ON CONFLICT DO NOTHING", () => {
      const result = parseSqlToFlow(`
        INSERT INTO users (id, name) VALUES (1, 'John')
        ON CONFLICT DO NOTHING
      `);

      expect(result.success).toBe(true);
      const inserts = getNodesOfType(result.flow!, "insert");
      expect(inserts[0].onConflict?.action).toBe("nothing");
    });

    it("returns target table via getTargetTable", () => {
      const result = parseSqlToFlow("INSERT INTO orders (id) VALUES (1)");

      expect(result.success).toBe(true);
      expect(getTargetTable(result.flow!)).toBe("orders");
    });
  });

  describe("UPDATE statements", () => {
    it("parses simple UPDATE", () => {
      const result = parseSqlToFlow("UPDATE users SET name = 'Jane' WHERE id = 1");

      expect(result.success).toBe(true);
      expect(result.flow!.operation).toBe("update");

      const updates = getNodesOfType(result.flow!, "update");
      expect(updates).toHaveLength(1);
      expect(updates[0].table).toBe("users");
      expect(updates[0].setColumns).toHaveLength(1);
      expect(updates[0].setColumns[0].column).toBe("name");
    });

    it("parses UPDATE with multiple SET columns", () => {
      const result = parseSqlToFlow(
        "UPDATE users SET name = 'Jane', email = 'jane@test.com' WHERE id = 1"
      );

      expect(result.success).toBe(true);
      const updates = getNodesOfType(result.flow!, "update");
      expect(updates[0].setColumns).toHaveLength(2);
    });

    it("includes WHERE filter node", () => {
      const result = parseSqlToFlow("UPDATE users SET active = false WHERE last_login < '2023-01-01'");

      expect(result.success).toBe(true);
      const filters = getNodesOfType(result.flow!, "filter");
      expect(filters).toHaveLength(1);

      const updates = getNodesOfType(result.flow!, "update");
      expect(updates[0].inputs).toContain(filters[0].id);
    });
  });

  describe("DELETE statements", () => {
    it("parses simple DELETE", () => {
      const result = parseSqlToFlow("DELETE FROM users WHERE id = 1");

      expect(result.success).toBe(true);
      expect(result.flow!.operation).toBe("delete");

      const deletes = getNodesOfType(result.flow!, "delete");
      expect(deletes).toHaveLength(1);
      expect(deletes[0].table).toBe("users");
    });

    it("includes WHERE filter node", () => {
      const result = parseSqlToFlow("DELETE FROM sessions WHERE expires_at < NOW()");

      expect(result.success).toBe(true);
      const filters = getNodesOfType(result.flow!, "filter");
      expect(filters).toHaveLength(1);
    });
  });

  describe("node connectivity", () => {
    it("creates proper DAG for SELECT with WHERE and ORDER BY", () => {
      const result = parseSqlToFlow(`
        SELECT name, email
        FROM users
        WHERE active = true
        ORDER BY name
        LIMIT 10
      `);

      expect(result.success).toBe(true);

      // Check the flow: source -> filter -> project -> sort -> limit -> output
      const source = getNodesOfType(result.flow!, "source")[0];
      const filter = getNodesOfType(result.flow!, "filter")[0];
      const project = getNodesOfType(result.flow!, "project")[0];
      const sort = getNodesOfType(result.flow!, "sort")[0];
      const limit = getNodesOfType(result.flow!, "limit")[0];
      const output = getNodesOfType(result.flow!, "output")[0];

      expect(filter.inputs).toContain(source.id);
      expect(project.inputs).toContain(filter.id);
      expect(sort.inputs).toContain(project.id);
      expect(limit.inputs).toContain(sort.id);
      expect(output.inputs).toContain(limit.id);
    });

    it("creates proper DAG for GROUP BY query", () => {
      const result = parseSqlToFlow(`
        SELECT category, COUNT(*) as cnt
        FROM products
        WHERE in_stock = true
        GROUP BY category
        HAVING COUNT(*) > 5
        ORDER BY cnt DESC
      `);

      expect(result.success).toBe(true);

      // Flow: source -> filter -> aggregate -> having -> project -> sort -> output
      const source = getNodesOfType(result.flow!, "source")[0];
      const whereFilter = getNodesOfType(result.flow!, "filter").find((f) => !f.isHaving)!;
      const agg = getNodesOfType(result.flow!, "aggregate")[0];
      const havingFilter = getNodesOfType(result.flow!, "filter").find((f) => f.isHaving)!;

      expect(whereFilter.inputs).toContain(source.id);
      expect(agg.inputs).toContain(whereFilter.id);
      expect(havingFilter.inputs).toContain(agg.id);
    });
  });

  describe("descriptions", () => {
    it("generates description from variable name", () => {
      const result = parseSqlToFlow("SELECT * FROM users", "activeUsers");

      expect(result.success).toBe(true);
      expect(result.flow!.description).toBe("Active users");
      expect(result.flow!.assignedTo).toBe("activeUsers");
    });

    it("generates description for aggregation queries", () => {
      const result = parseSqlToFlow(
        "SELECT category, COUNT(*) FROM products GROUP BY category"
      );

      expect(result.success).toBe(true);
      expect(result.flow!.description).toContain("Aggregate");
      expect(result.flow!.description).toContain("COUNT");
    });

    it("generates description for INSERT", () => {
      const result = parseSqlToFlow("INSERT INTO users (name) VALUES ('test')");

      expect(result.success).toBe(true);
      expect(result.flow!.description).toContain("Insert");
      expect(result.flow!.description).toContain("users");
    });

    it("generates description for upsert", () => {
      const result = parseSqlToFlow(
        "INSERT INTO users (id) VALUES (1) ON CONFLICT DO NOTHING"
      );

      expect(result.success).toBe(true);
      expect(result.flow!.description).toContain("Upsert");
    });
  });

  describe("error handling", () => {
    it("returns error for invalid SQL", () => {
      const result = parseSqlToFlow("NOT VALID SQL AT ALL");

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it("returns error for empty input", () => {
      const result = parseSqlToFlow("");

      expect(result.success).toBe(false);
    });
  });

  describe("complex real-world queries", () => {
    it("parses production shortfall query", () => {
      const result = parseSqlToFlow(`
        SELECT
          production_date as date,
          kpi_name as line,
          CAST(REPLACE(actual, ',', '') AS INTEGER) as actual,
          CAST(REPLACE(target, ',', '') AS INTEGER) as target,
          ROUND(CAST(REPLACE(actual, ',', '') AS REAL) / NULLIF(CAST(REPLACE(target, ',', '') AS REAL), 0) * 100, 1) as pct_of_target
        FROM daily_dms_kpis
        WHERE opex_focus = 'Production'
          AND kpi_name LIKE 'Output%'
          AND actual IS NOT NULL
        ORDER BY production_date DESC
        LIMIT 25
      `, "shortfalls");

      expect(result.success).toBe(true);
      expect(result.flow!.description).toBe("Shortfalls");

      const sources = getNodesOfType(result.flow!, "source");
      expect(sources[0].table).toBe("daily_dms_kpis");

      const filters = getNodesOfType(result.flow!, "filter");
      expect(filters).toHaveLength(1);

      const sorts = getNodesOfType(result.flow!, "sort");
      expect(sorts).toHaveLength(1);

      const limits = getNodesOfType(result.flow!, "limit");
      expect(limits[0].limit).toBe(25);
    });

    it("parses aggregation summary query", () => {
      const result = parseSqlToFlow(`
        SELECT
          kpi_name as line,
          COUNT(*) as shortfall_days,
          ROUND(AVG(CAST(actual AS REAL) / NULLIF(CAST(target AS REAL), 0) * 100), 1) as avg_pct
        FROM daily_dms_kpis
        WHERE opex_focus = 'Production'
        GROUP BY kpi_name
        ORDER BY shortfall_days DESC
      `, "summaryByLine");

      expect(result.success).toBe(true);
      expect(result.flow!.description).toBe("Summary by line");

      const aggs = getNodesOfType(result.flow!, "aggregate");
      expect(aggs).toHaveLength(1);
      expect(aggs[0].groupBy).toContain("kpi_name");

      const funcNames = aggs[0].functions.map((f) => f.fn);
      expect(funcNames).toContain("count");
      expect(funcNames).toContain("avg");
    });
  });
});
