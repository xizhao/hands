import { describe, expect, it } from "vitest";
import { substituteFormBindings } from "./live-action";

describe("substituteFormBindings", () => {
  describe("basic substitution", () => {
    it("substitutes a single field", () => {
      const sql = "UPDATE users SET name = {{name}} WHERE id = 1";
      const result = substituteFormBindings(sql, { name: "Alice" });
      expect(result).toBe("UPDATE users SET name = 'Alice' WHERE id = 1");
    });

    it("substitutes multiple fields", () => {
      const sql = "UPDATE users SET name = {{name}}, age = {{age}} WHERE id = 1";
      const result = substituteFormBindings(sql, { name: "Bob", age: 30 });
      expect(result).toBe("UPDATE users SET name = 'Bob', age = 30 WHERE id = 1");
    });

    it("leaves SQL unchanged when no bindings present", () => {
      const sql = "SELECT * FROM users";
      const result = substituteFormBindings(sql, { name: "test" });
      expect(result).toBe("SELECT * FROM users");
    });
  });

  describe("type coercion", () => {
    it("converts numbers without quotes", () => {
      const sql = "UPDATE users SET age = {{age}}";
      const result = substituteFormBindings(sql, { age: 25 });
      expect(result).toBe("UPDATE users SET age = 25");
    });

    it("converts floats without quotes", () => {
      const sql = "UPDATE products SET price = {{price}}";
      const result = substituteFormBindings(sql, { price: 19.99 });
      expect(result).toBe("UPDATE products SET price = 19.99");
    });

    it("converts boolean true to TRUE", () => {
      const sql = "UPDATE users SET active = {{active}}";
      const result = substituteFormBindings(sql, { active: true });
      expect(result).toBe("UPDATE users SET active = TRUE");
    });

    it("converts boolean false to FALSE", () => {
      const sql = "UPDATE users SET active = {{active}}";
      const result = substituteFormBindings(sql, { active: false });
      expect(result).toBe("UPDATE users SET active = FALSE");
    });
  });

  describe("NULL handling", () => {
    it("converts null to NULL", () => {
      const sql = "UPDATE users SET name = {{name}}";
      const result = substituteFormBindings(sql, { name: null });
      expect(result).toBe("UPDATE users SET name = NULL");
    });

    it("converts undefined to NULL", () => {
      const sql = "UPDATE users SET name = {{name}}";
      const result = substituteFormBindings(sql, { name: undefined });
      expect(result).toBe("UPDATE users SET name = NULL");
    });

    it("converts empty string to NULL", () => {
      const sql = "UPDATE users SET name = {{name}}";
      const result = substituteFormBindings(sql, { name: "" });
      expect(result).toBe("UPDATE users SET name = NULL");
    });

    it("returns NULL for missing fields", () => {
      const sql = "UPDATE users SET name = {{name}}";
      const result = substituteFormBindings(sql, {});
      expect(result).toBe("UPDATE users SET name = NULL");
    });
  });

  describe("SQL injection prevention", () => {
    it("escapes single quotes in strings", () => {
      const sql = "UPDATE users SET name = {{name}}";
      const result = substituteFormBindings(sql, { name: "O'Brien" });
      expect(result).toBe("UPDATE users SET name = 'O''Brien'");
    });

    it("escapes multiple single quotes", () => {
      const sql = "UPDATE users SET bio = {{bio}}";
      const result = substituteFormBindings(sql, { bio: "It's a 'test' string" });
      expect(result).toBe("UPDATE users SET bio = 'It''s a ''test'' string'");
    });

    it("handles attempted SQL injection via string", () => {
      const sql = "UPDATE users SET name = {{name}}";
      const result = substituteFormBindings(sql, { name: "'; DROP TABLE users; --" });
      expect(result).toBe("UPDATE users SET name = '''; DROP TABLE users; --'");
    });

    it("handles newlines in strings", () => {
      const sql = "UPDATE users SET bio = {{bio}}";
      const result = substituteFormBindings(sql, { bio: "line1\nline2" });
      expect(result).toBe("UPDATE users SET bio = 'line1\nline2'");
    });
  });

  describe("edge cases", () => {
    it("handles zero correctly", () => {
      const sql = "UPDATE users SET count = {{count}}";
      const result = substituteFormBindings(sql, { count: 0 });
      expect(result).toBe("UPDATE users SET count = 0");
    });

    it("handles negative numbers", () => {
      const sql = "UPDATE accounts SET balance = {{balance}}";
      const result = substituteFormBindings(sql, { balance: -100 });
      expect(result).toBe("UPDATE accounts SET balance = -100");
    });

    it("handles the same field multiple times", () => {
      const sql = "SELECT * FROM users WHERE name = {{name}} OR alias = {{name}}";
      const result = substituteFormBindings(sql, { name: "test" });
      expect(result).toBe("SELECT * FROM users WHERE name = 'test' OR alias = 'test'");
    });

    it("only matches word characters in field names", () => {
      const sql = "SELECT {{valid_field}} AND {{field2}}";
      const result = substituteFormBindings(sql, { valid_field: "a", field2: "b" });
      expect(result).toBe("SELECT 'a' AND 'b'");
    });

    it("ignores malformed bindings", () => {
      const sql = "SELECT {{ spaced }} AND {{}}";
      const result = substituteFormBindings(sql, { spaced: "x" });
      expect(result).toBe("SELECT {{ spaced }} AND {{}}");
    });
  });
});
