import { describe, it, expect } from "vitest";
import {
  escapeIdentifier,
  escapeValue,
  generateInsertSql,
  generateUpdateSql,
  generateDeleteSql,
  generateBulkDeleteSql,
  generateSelectSql,
  generateCountSql,
  generateAddColumnSql,
  generateDropColumnSql,
  generateRenameColumnSql,
  generateAlterColumnTypeSql,
} from "./sql-builder";

describe("escapeIdentifier", () => {
  it("wraps identifier in double quotes", () => {
    expect(escapeIdentifier("name")).toBe('"name"');
    expect(escapeIdentifier("users")).toBe('"users"');
  });

  it("escapes internal double quotes by doubling", () => {
    expect(escapeIdentifier('col"name')).toBe('"col""name"');
    expect(escapeIdentifier('a"b"c')).toBe('"a""b""c"');
  });

  it("handles reserved SQL keywords", () => {
    expect(escapeIdentifier("SELECT")).toBe('"SELECT"');
    expect(escapeIdentifier("order")).toBe('"order"');
    expect(escapeIdentifier("table")).toBe('"table"');
  });

  it("throws on empty identifier", () => {
    expect(() => escapeIdentifier("")).toThrow("Identifier cannot be empty");
  });

  it("handles special characters", () => {
    expect(escapeIdentifier("user-name")).toBe('"user-name"');
    expect(escapeIdentifier("user.name")).toBe('"user.name"');
    expect(escapeIdentifier("user name")).toBe('"user name"');
  });
});

describe("escapeValue", () => {
  describe("strings", () => {
    it("wraps strings in single quotes", () => {
      expect(escapeValue("hello")).toBe("'hello'");
      expect(escapeValue("world")).toBe("'world'");
    });

    it("escapes single quotes by doubling", () => {
      expect(escapeValue("O'Brien")).toBe("'O''Brien'");
      expect(escapeValue("it's")).toBe("'it''s'");
      // Three single quotes become six (each doubled), plus outer quotes = 8 chars
      expect(escapeValue("'''")).toBe("''''''''");
    });

    it("handles empty strings", () => {
      expect(escapeValue("")).toBe("''");
    });

    it("handles unicode", () => {
      expect(escapeValue("Hello")).toBe("'Hello'");
      expect(escapeValue("日本語")).toBe("'日本語'");
    });
  });

  describe("null/undefined", () => {
    it("returns NULL for null", () => {
      expect(escapeValue(null)).toBe("NULL");
    });

    it("returns NULL for undefined", () => {
      expect(escapeValue(undefined)).toBe("NULL");
    });
  });

  describe("booleans", () => {
    it("returns TRUE for true", () => {
      expect(escapeValue(true)).toBe("TRUE");
    });

    it("returns FALSE for false", () => {
      expect(escapeValue(false)).toBe("FALSE");
    });
  });

  describe("numbers", () => {
    it("handles integers", () => {
      expect(escapeValue(42)).toBe("42");
      expect(escapeValue(0)).toBe("0");
      expect(escapeValue(-1)).toBe("-1");
    });

    it("handles floats", () => {
      expect(escapeValue(3.14)).toBe("3.14");
      expect(escapeValue(-0.5)).toBe("-0.5");
    });

    it("handles very large numbers", () => {
      expect(escapeValue(Number.MAX_SAFE_INTEGER)).toBe("9007199254740991");
    });

    it("throws on non-finite numbers", () => {
      expect(() => escapeValue(Infinity)).toThrow("non-finite");
      expect(() => escapeValue(-Infinity)).toThrow("non-finite");
      expect(() => escapeValue(NaN)).toThrow("non-finite");
    });
  });

  describe("bigint", () => {
    it("handles bigint values", () => {
      expect(escapeValue(BigInt(123))).toBe("123");
      expect(escapeValue(BigInt("9999999999999999999"))).toBe(
        "9999999999999999999"
      );
    });
  });

  describe("dates", () => {
    it("converts Date to ISO string", () => {
      const date = new Date("2024-01-15T10:30:00.000Z");
      expect(escapeValue(date)).toBe("'2024-01-15T10:30:00.000Z'");
    });
  });

  describe("objects and arrays", () => {
    it("serializes objects as JSON", () => {
      expect(escapeValue({ a: 1 })).toBe("'{\"a\":1}'");
      expect(escapeValue({ name: "test" })).toBe("'{\"name\":\"test\"}'");
    });

    it("serializes arrays as JSON", () => {
      expect(escapeValue([1, 2, 3])).toBe("'[1,2,3]'");
      expect(escapeValue(["a", "b"])).toBe("'[\"a\",\"b\"]'");
    });

    it("escapes single quotes in JSON", () => {
      expect(escapeValue({ name: "O'Brien" })).toBe(
        "'{\"name\":\"O''Brien\"}'"
      );
    });
  });
});

describe("generateInsertSql", () => {
  it("generates basic INSERT", () => {
    const sql = generateInsertSql("users", { name: "John" });
    expect(sql).toBe('INSERT INTO "users" ("name") VALUES (\'John\')');
  });

  it("handles multiple columns", () => {
    const sql = generateInsertSql("users", { name: "John", age: 30 });
    expect(sql).toBe(
      'INSERT INTO "users" ("name", "age") VALUES (\'John\', 30)'
    );
  });

  it("handles NULL values", () => {
    const sql = generateInsertSql("users", { name: "John", email: null });
    expect(sql).toBe(
      'INSERT INTO "users" ("name", "email") VALUES (\'John\', NULL)'
    );
  });

  it("handles empty strings", () => {
    const sql = generateInsertSql("users", { name: "" });
    expect(sql).toBe("INSERT INTO \"users\" (\"name\") VALUES ('')");
  });

  it("handles special characters in values", () => {
    const sql = generateInsertSql("users", { name: "O'Brien" });
    expect(sql).toBe("INSERT INTO \"users\" (\"name\") VALUES ('O''Brien')");
  });

  it("handles boolean values", () => {
    const sql = generateInsertSql("users", { active: true, verified: false });
    expect(sql).toBe(
      'INSERT INTO "users" ("active", "verified") VALUES (TRUE, FALSE)'
    );
  });

  it("handles JSON objects", () => {
    const sql = generateInsertSql("users", { meta: { role: "admin" } });
    expect(sql).toBe(
      'INSERT INTO "users" ("meta") VALUES (\'{"role":"admin"}\')'
    );
  });

  it("escapes column names that are reserved words", () => {
    const sql = generateInsertSql("users", { order: 1, select: "test" });
    expect(sql).toBe(
      'INSERT INTO "users" ("order", "select") VALUES (1, \'test\')'
    );
  });

  it("throws on empty data", () => {
    expect(() => generateInsertSql("users", {})).toThrow("no columns");
  });
});

describe("generateUpdateSql", () => {
  it("generates basic UPDATE", () => {
    const sql = generateUpdateSql("users", "id", "123", { name: "John" });
    expect(sql).toBe(
      'UPDATE "users" SET "name" = \'John\' WHERE "id" = \'123\''
    );
  });

  it("handles multiple columns", () => {
    const sql = generateUpdateSql("users", "id", "123", {
      name: "John",
      age: 30,
    });
    expect(sql).toBe(
      'UPDATE "users" SET "name" = \'John\', "age" = 30 WHERE "id" = \'123\''
    );
  });

  it("handles NULL value updates", () => {
    const sql = generateUpdateSql("users", "id", "123", { email: null });
    expect(sql).toBe('UPDATE "users" SET "email" = NULL WHERE "id" = \'123\'');
  });

  it("handles boolean updates", () => {
    const sql = generateUpdateSql("users", "id", "123", { active: true });
    expect(sql).toBe('UPDATE "users" SET "active" = TRUE WHERE "id" = \'123\'');
  });

  it("escapes values with quotes", () => {
    const sql = generateUpdateSql("users", "id", "123", { name: "O'Brien" });
    expect(sql).toBe(
      "UPDATE \"users\" SET \"name\" = 'O''Brien' WHERE \"id\" = '123'"
    );
  });

  it("handles numeric IDs", () => {
    const sql = generateUpdateSql("users", "id", "42", { name: "John" });
    expect(sql).toBe(
      'UPDATE "users" SET "name" = \'John\' WHERE "id" = \'42\''
    );
  });

  it("throws on empty data", () => {
    expect(() => generateUpdateSql("users", "id", "123", {})).toThrow(
      "no columns"
    );
  });
});

describe("generateDeleteSql", () => {
  it("generates DELETE with string ID", () => {
    const sql = generateDeleteSql("users", "id", "abc-123");
    expect(sql).toBe('DELETE FROM "users" WHERE "id" = \'abc-123\'');
  });

  it("generates DELETE with numeric ID", () => {
    const sql = generateDeleteSql("users", "id", "42");
    expect(sql).toBe('DELETE FROM "users" WHERE "id" = \'42\'');
  });

  it("handles special characters in ID", () => {
    const sql = generateDeleteSql("users", "id", "user's-id");
    expect(sql).toBe("DELETE FROM \"users\" WHERE \"id\" = 'user''s-id'");
  });

  it("handles UUID-style IDs", () => {
    const sql = generateDeleteSql(
      "users",
      "id",
      "550e8400-e29b-41d4-a716-446655440000"
    );
    expect(sql).toBe(
      'DELETE FROM "users" WHERE "id" = \'550e8400-e29b-41d4-a716-446655440000\''
    );
  });
});

describe("generateBulkDeleteSql", () => {
  it("generates DELETE with IN clause for multiple IDs", () => {
    const sql = generateBulkDeleteSql("users", "id", ["1", "2", "3"]);
    expect(sql).toBe(
      "DELETE FROM \"users\" WHERE \"id\" IN ('1', '2', '3')"
    );
  });

  it("handles single ID", () => {
    const sql = generateBulkDeleteSql("users", "id", ["123"]);
    expect(sql).toBe('DELETE FROM "users" WHERE "id" IN (\'123\')');
  });

  it("escapes IDs with special characters", () => {
    const sql = generateBulkDeleteSql("users", "id", ["O'Brien", "Jane's"]);
    expect(sql).toBe(
      "DELETE FROM \"users\" WHERE \"id\" IN ('O''Brien', 'Jane''s')"
    );
  });

  it("throws on empty array", () => {
    expect(() => generateBulkDeleteSql("users", "id", [])).toThrow("no IDs");
  });
});

describe("generateSelectSql", () => {
  it("generates SELECT * by default", () => {
    const sql = generateSelectSql({ table: "users" });
    expect(sql).toBe('SELECT * FROM "users"');
  });

  it("generates SELECT with specific columns", () => {
    const sql = generateSelectSql({
      table: "users",
      columns: ["id", "name", "email"],
    });
    expect(sql).toBe('SELECT "id", "name", "email" FROM "users"');
  });

  it("adds ORDER BY clause ascending", () => {
    const sql = generateSelectSql({ table: "users", orderBy: "name" });
    expect(sql).toBe('SELECT * FROM "users" ORDER BY "name" ASC');
  });

  it("adds ORDER BY clause descending", () => {
    const sql = generateSelectSql({
      table: "users",
      orderBy: "created_at",
      orderDirection: "desc",
    });
    expect(sql).toBe('SELECT * FROM "users" ORDER BY "created_at" DESC');
  });

  it("adds LIMIT clause", () => {
    const sql = generateSelectSql({ table: "users", limit: 10 });
    expect(sql).toBe('SELECT * FROM "users" LIMIT 10');
  });

  it("adds OFFSET clause", () => {
    const sql = generateSelectSql({ table: "users", offset: 20 });
    expect(sql).toBe('SELECT * FROM "users" OFFSET 20');
  });

  it("adds LIMIT and OFFSET together", () => {
    const sql = generateSelectSql({ table: "users", limit: 10, offset: 20 });
    expect(sql).toBe('SELECT * FROM "users" LIMIT 10 OFFSET 20');
  });

  it("handles all options together", () => {
    const sql = generateSelectSql({
      table: "users",
      columns: ["id", "name"],
      orderBy: "name",
      orderDirection: "asc",
      limit: 10,
      offset: 0,
    });
    expect(sql).toBe(
      'SELECT "id", "name" FROM "users" ORDER BY "name" ASC LIMIT 10'
    );
  });

  it("ignores offset of 0", () => {
    const sql = generateSelectSql({ table: "users", offset: 0 });
    expect(sql).toBe('SELECT * FROM "users"');
  });

  it("floors fractional limit/offset", () => {
    const sql = generateSelectSql({ table: "users", limit: 10.7, offset: 5.3 });
    expect(sql).toBe('SELECT * FROM "users" LIMIT 10 OFFSET 5');
  });
});

describe("generateCountSql", () => {
  it("generates COUNT query", () => {
    const sql = generateCountSql("users");
    expect(sql).toBe('SELECT COUNT(*) as count FROM "users"');
  });

  it("escapes table name", () => {
    const sql = generateCountSql("user-data");
    expect(sql).toBe('SELECT COUNT(*) as count FROM "user-data"');
  });
});

describe("ALTER TABLE operations", () => {
  describe("generateAddColumnSql", () => {
    it("generates basic ADD COLUMN", () => {
      const sql = generateAddColumnSql("users", "email", "VARCHAR(255)");
      expect(sql).toBe(
        'ALTER TABLE "users" ADD COLUMN "email" VARCHAR(255)'
      );
    });

    it("handles NOT NULL constraint", () => {
      const sql = generateAddColumnSql("users", "name", "TEXT", {
        nullable: false,
      });
      expect(sql).toBe(
        'ALTER TABLE "users" ADD COLUMN "name" TEXT NOT NULL'
      );
    });

    it("handles DEFAULT value", () => {
      const sql = generateAddColumnSql("users", "active", "BOOLEAN", {
        defaultValue: true,
      });
      expect(sql).toBe(
        'ALTER TABLE "users" ADD COLUMN "active" BOOLEAN DEFAULT TRUE'
      );
    });

    it("handles both NOT NULL and DEFAULT", () => {
      const sql = generateAddColumnSql("users", "count", "INTEGER", {
        nullable: false,
        defaultValue: 0,
      });
      expect(sql).toBe(
        'ALTER TABLE "users" ADD COLUMN "count" INTEGER NOT NULL DEFAULT 0'
      );
    });
  });

  describe("generateDropColumnSql", () => {
    it("generates DROP COLUMN", () => {
      const sql = generateDropColumnSql("users", "email");
      expect(sql).toBe('ALTER TABLE "users" DROP COLUMN "email"');
    });

    it("escapes column names", () => {
      const sql = generateDropColumnSql("users", "user-name");
      expect(sql).toBe('ALTER TABLE "users" DROP COLUMN "user-name"');
    });
  });

  describe("generateRenameColumnSql", () => {
    it("generates RENAME COLUMN", () => {
      const sql = generateRenameColumnSql("users", "name", "full_name");
      expect(sql).toBe(
        'ALTER TABLE "users" RENAME COLUMN "name" TO "full_name"'
      );
    });
  });

  describe("generateAlterColumnTypeSql", () => {
    it("generates ALTER COLUMN TYPE", () => {
      const sql = generateAlterColumnTypeSql("users", "age", "BIGINT");
      expect(sql).toBe(
        'ALTER TABLE "users" ALTER COLUMN "age" TYPE BIGINT'
      );
    });
  });
});

describe("SQL injection prevention", () => {
  it("escapes Bobby Tables attack in values", () => {
    const sql = generateInsertSql("users", {
      name: "'; DROP TABLE users; --",
    });
    // The injection string is safely inside a string literal (quote is escaped)
    expect(sql).toBe(
      "INSERT INTO \"users\" (\"name\") VALUES ('''; DROP TABLE users; --')"
    );
    // The leading quote is escaped (doubled), making it a safe string literal
    expect(sql).toContain("'''; DROP TABLE");
  });

  it("escapes comment injection in values", () => {
    const sql = generateUpdateSql("users", "id", "1", {
      name: "test /* comment */ value",
    });
    expect(sql).toContain("'test /* comment */ value'");
  });

  it("escapes semicolon injection in values", () => {
    const sql = generateInsertSql("users", {
      name: "test; DELETE FROM users;",
    });
    expect(sql).toBe(
      'INSERT INTO "users" ("name") VALUES (\'test; DELETE FROM users;\')'
    );
  });

  it("handles table names with quotes safely", () => {
    const sql = generateSelectSql({ table: 'users"; DROP TABLE users; --' });
    expect(sql).toBe('SELECT * FROM "users""; DROP TABLE users; --"');
  });

  it("escapes UNION injection attempts", () => {
    const sql = generateInsertSql("users", {
      name: "' UNION SELECT * FROM passwords --",
    });
    expect(sql).toContain("''' UNION SELECT * FROM passwords --'");
  });
});

describe("realistic cell editing scenarios", () => {
  it("generates UPDATE for text cell change", () => {
    const sql = generateUpdateSql("users", "id", "123", { name: "John Doe" });
    expect(sql).toBe(
      'UPDATE "users" SET "name" = \'John Doe\' WHERE "id" = \'123\''
    );
  });

  it("generates UPDATE for number cell change", () => {
    const sql = generateUpdateSql("products", "id", "456", { price: 29.99 });
    expect(sql).toBe(
      'UPDATE "products" SET "price" = 29.99 WHERE "id" = \'456\''
    );
  });

  it("generates UPDATE for boolean toggle", () => {
    const sql = generateUpdateSql("users", "id", "123", { active: false });
    expect(sql).toBe(
      'UPDATE "users" SET "active" = FALSE WHERE "id" = \'123\''
    );
  });

  it("generates UPDATE for clearing cell (NULL)", () => {
    const sql = generateUpdateSql("users", "id", "123", { email: null });
    expect(sql).toBe('UPDATE "users" SET "email" = NULL WHERE "id" = \'123\'');
  });
});

describe("realistic row operations", () => {
  it("generates INSERT for new row with defaults", () => {
    const sql = generateInsertSql("products", {
      name: "Widget",
      price: 9.99,
      active: true,
      stock: 100,
    });
    expect(sql).toBe(
      'INSERT INTO "products" ("name", "price", "active", "stock") VALUES (\'Widget\', 9.99, TRUE, 100)'
    );
  });

  it("generates DELETE for single row", () => {
    const sql = generateDeleteSql("orders", "order_id", "ORD-2024-001");
    expect(sql).toBe(
      'DELETE FROM "orders" WHERE "order_id" = \'ORD-2024-001\''
    );
  });

  it("generates bulk DELETE for multiple rows", () => {
    const sql = generateBulkDeleteSql("logs", "id", [
      "log-1",
      "log-2",
      "log-3",
    ]);
    expect(sql).toBe(
      "DELETE FROM \"logs\" WHERE \"id\" IN ('log-1', 'log-2', 'log-3')"
    );
  });
});
