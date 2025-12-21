import { describe, expect, it } from "vitest";
import { assertReadOnlySQL, extractFirstKeyword, validateReadOnlySQL } from "./sql-validation";

describe("extractFirstKeyword", () => {
  describe("basic extraction", () => {
    it("extracts SELECT", () => {
      expect(extractFirstKeyword("SELECT * FROM users")).toBe("SELECT");
    });

    it("extracts lowercase keywords and uppercases them", () => {
      expect(extractFirstKeyword("select * from users")).toBe("SELECT");
    });

    it("extracts mixed case keywords", () => {
      expect(extractFirstKeyword("SeLeCt * FROM users")).toBe("SELECT");
    });

    it("handles leading whitespace", () => {
      expect(extractFirstKeyword("   SELECT * FROM users")).toBe("SELECT");
      expect(extractFirstKeyword("\t\nSELECT * FROM users")).toBe("SELECT");
    });
  });

  describe("comment handling", () => {
    it("skips single-line comments", () => {
      expect(extractFirstKeyword("-- comment\nSELECT * FROM users")).toBe("SELECT");
    });

    it("skips multiple single-line comments", () => {
      expect(extractFirstKeyword("-- comment 1\n-- comment 2\nSELECT *")).toBe("SELECT");
    });

    it("skips multi-line comments", () => {
      expect(extractFirstKeyword("/* comment */ SELECT * FROM users")).toBe("SELECT");
    });

    it("skips multi-line comments spanning lines", () => {
      const sql = `/*
        This is a
        multi-line comment
      */
      SELECT * FROM users`;
      expect(extractFirstKeyword(sql)).toBe("SELECT");
    });

    it("handles nested-looking comments (non-nested)", () => {
      expect(extractFirstKeyword("/* outer /* inner */ SELECT")).toBe("SELECT");
    });

    it("handles mixed comment styles", () => {
      const sql = `-- single line
      /* multi
         line */
      -- another single
      SELECT * FROM users`;
      expect(extractFirstKeyword(sql)).toBe("SELECT");
    });

    it("returns null for only comments", () => {
      expect(extractFirstKeyword("-- just a comment")).toBe(null);
      expect(extractFirstKeyword("/* only comments */")).toBe(null);
    });

    it("returns null for unclosed multi-line comment", () => {
      expect(extractFirstKeyword("/* unclosed comment SELECT")).toBe(null);
    });
  });

  describe("edge cases", () => {
    it("returns null for empty string", () => {
      expect(extractFirstKeyword("")).toBe(null);
    });

    it("returns null for whitespace only", () => {
      expect(extractFirstKeyword("   \t\n  ")).toBe(null);
    });

    it("returns null for query starting with punctuation", () => {
      expect(extractFirstKeyword("(SELECT * FROM users)")).toBe(null);
    });

    it("handles keywords with numbers", () => {
      expect(extractFirstKeyword("SELECT2 something")).toBe("SELECT2");
    });

    it("stops at first non-keyword character", () => {
      expect(extractFirstKeyword("SELECT(*)")).toBe("SELECT");
    });
  });
});

describe("validateReadOnlySQL", () => {
  describe("valid read-only queries", () => {
    it("accepts SELECT", () => {
      const result = validateReadOnlySQL("SELECT * FROM users");
      expect(result.valid).toBe(true);
      expect(result.keyword).toBe("SELECT");
    });

    it("accepts WITH (CTE)", () => {
      const sql = "WITH cte AS (SELECT 1) SELECT * FROM cte";
      const result = validateReadOnlySQL(sql);
      expect(result.valid).toBe(true);
      expect(result.keyword).toBe("WITH");
    });

    it("accepts EXPLAIN", () => {
      const result = validateReadOnlySQL("EXPLAIN SELECT * FROM users");
      expect(result.valid).toBe(true);
      expect(result.keyword).toBe("EXPLAIN");
    });

    it("accepts SHOW", () => {
      const result = validateReadOnlySQL("SHOW TABLES");
      expect(result.valid).toBe(true);
      expect(result.keyword).toBe("SHOW");
    });

    it("accepts DESCRIBE", () => {
      const result = validateReadOnlySQL("DESCRIBE users");
      expect(result.valid).toBe(true);
      expect(result.keyword).toBe("DESCRIBE");
    });

    it("accepts DESC", () => {
      const result = validateReadOnlySQL("DESC users");
      expect(result.valid).toBe(true);
      expect(result.keyword).toBe("DESC");
    });

    it("accepts VALUES", () => {
      const result = validateReadOnlySQL("VALUES (1, 2), (3, 4)");
      expect(result.valid).toBe(true);
      expect(result.keyword).toBe("VALUES");
    });

    it("accepts TABLE", () => {
      const result = validateReadOnlySQL("TABLE users");
      expect(result.valid).toBe(true);
      expect(result.keyword).toBe("TABLE");
    });

    it("accepts lowercase queries", () => {
      const result = validateReadOnlySQL("select * from users");
      expect(result.valid).toBe(true);
    });
  });

  describe("invalid write queries", () => {
    it("rejects INSERT", () => {
      const result = validateReadOnlySQL("INSERT INTO users VALUES (1)");
      expect(result.valid).toBe(false);
      expect(result.keyword).toBe("INSERT");
      if (!result.valid) {
        expect(result.reason).toContain("not allowed");
      }
    });

    it("rejects UPDATE", () => {
      const result = validateReadOnlySQL("UPDATE users SET name = 'x'");
      expect(result.valid).toBe(false);
      expect(result.keyword).toBe("UPDATE");
    });

    it("rejects DELETE", () => {
      const result = validateReadOnlySQL("DELETE FROM users");
      expect(result.valid).toBe(false);
      expect(result.keyword).toBe("DELETE");
    });

    it("rejects DROP", () => {
      const result = validateReadOnlySQL("DROP TABLE users");
      expect(result.valid).toBe(false);
      expect(result.keyword).toBe("DROP");
    });

    it("rejects CREATE", () => {
      const result = validateReadOnlySQL("CREATE TABLE users (id INT)");
      expect(result.valid).toBe(false);
      expect(result.keyword).toBe("CREATE");
    });

    it("rejects ALTER", () => {
      const result = validateReadOnlySQL("ALTER TABLE users ADD col INT");
      expect(result.valid).toBe(false);
      expect(result.keyword).toBe("ALTER");
    });

    it("rejects TRUNCATE", () => {
      const result = validateReadOnlySQL("TRUNCATE users");
      expect(result.valid).toBe(false);
      expect(result.keyword).toBe("TRUNCATE");
    });

    it("rejects GRANT", () => {
      const result = validateReadOnlySQL("GRANT SELECT ON users TO role");
      expect(result.valid).toBe(false);
      expect(result.keyword).toBe("GRANT");
    });

    it("rejects transaction control", () => {
      expect(validateReadOnlySQL("BEGIN").valid).toBe(false);
      expect(validateReadOnlySQL("COMMIT").valid).toBe(false);
      expect(validateReadOnlySQL("ROLLBACK").valid).toBe(false);
    });
  });

  describe("malformed queries", () => {
    it("rejects empty queries", () => {
      const result = validateReadOnlySQL("");
      expect(result.valid).toBe(false);
      expect(result.keyword).toBe(null);
      if (!result.valid) {
        expect(result.reason).toContain("empty or malformed");
      }
    });

    it("rejects queries starting with punctuation", () => {
      const result = validateReadOnlySQL("(SELECT 1)");
      expect(result.valid).toBe(false);
      expect(result.keyword).toBe(null);
    });

    it("rejects unknown keywords", () => {
      const result = validateReadOnlySQL("FOOBAR something");
      expect(result.valid).toBe(false);
      expect(result.keyword).toBe("FOOBAR");
      if (!result.valid) {
        expect(result.reason).toContain("Unknown SQL statement");
      }
    });
  });

  describe("comment edge cases", () => {
    it("handles SELECT hidden after comments", () => {
      const sql = `-- This looks like an UPDATE
      /* But it's really just a SELECT */
      SELECT * FROM users`;
      const result = validateReadOnlySQL(sql);
      expect(result.valid).toBe(true);
    });

    it("rejects UPDATE even with misleading comments", () => {
      const sql = `-- SELECT * FROM users
      UPDATE users SET x = 1`;
      const result = validateReadOnlySQL(sql);
      expect(result.valid).toBe(false);
      expect(result.keyword).toBe("UPDATE");
    });
  });
});

describe("assertReadOnlySQL", () => {
  it("does not throw for valid read-only queries", () => {
    expect(() => assertReadOnlySQL("SELECT 1")).not.toThrow();
    expect(() => assertReadOnlySQL("WITH x AS (SELECT 1) SELECT * FROM x")).not.toThrow();
  });

  it("throws for write queries", () => {
    expect(() => assertReadOnlySQL("INSERT INTO x VALUES (1)")).toThrow(/not allowed/);
    expect(() => assertReadOnlySQL("UPDATE x SET y = 1")).toThrow(/not allowed/);
    expect(() => assertReadOnlySQL("DELETE FROM x")).toThrow(/not allowed/);
  });

  it("throws for empty queries", () => {
    expect(() => assertReadOnlySQL("")).toThrow(/empty or malformed/);
  });

  it("includes the keyword in the error message", () => {
    expect(() => assertReadOnlySQL("DROP TABLE users")).toThrow(/DROP/);
  });
});
