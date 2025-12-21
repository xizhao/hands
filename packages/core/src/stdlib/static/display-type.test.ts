import { describe, expect, it } from "vitest";
import {
  autoDetectColumns,
  formatCellValue,
  resolveDisplayMode,
  selectDisplayType,
} from "./live-value";

describe("selectDisplayType", () => {
  describe("inline mode (1x1)", () => {
    it("returns inline for single row, single column", () => {
      const data = [{ count: 42 }];
      expect(selectDisplayType(data)).toBe("inline");
    });

    it("returns inline for any single value", () => {
      const data = [{ total: "hello" }];
      expect(selectDisplayType(data)).toBe("inline");
    });
  });

  describe("list mode (Nx1)", () => {
    it("returns list for multiple rows, single column", () => {
      const data = [{ name: "Alice" }, { name: "Bob" }, { name: "Charlie" }];
      expect(selectDisplayType(data)).toBe("list");
    });

    it("returns list for two rows, single column", () => {
      const data = [{ id: 1 }, { id: 2 }];
      expect(selectDisplayType(data)).toBe("list");
    });
  });

  describe("table mode (NxM)", () => {
    it("returns table for single row, multiple columns", () => {
      const data = [{ id: 1, name: "Alice" }];
      expect(selectDisplayType(data)).toBe("table");
    });

    it("returns table for multiple rows, multiple columns", () => {
      const data = [
        { id: 1, name: "Alice", age: 30 },
        { id: 2, name: "Bob", age: 25 },
      ];
      expect(selectDisplayType(data)).toBe("table");
    });

    it("returns table for empty data", () => {
      expect(selectDisplayType([])).toBe("table");
    });

    it("returns table for null/undefined data", () => {
      expect(selectDisplayType(null as any)).toBe("table");
      expect(selectDisplayType(undefined as any)).toBe("table");
    });
  });
});

describe("resolveDisplayMode", () => {
  const singleValue = [{ count: 42 }];
  const listData = [{ name: "A" }, { name: "B" }];
  const tableData = [{ id: 1, name: "Alice" }];

  describe("auto mode", () => {
    it("auto-selects inline for 1x1 data", () => {
      expect(resolveDisplayMode("auto", singleValue)).toBe("inline");
    });

    it("auto-selects list for Nx1 data", () => {
      expect(resolveDisplayMode("auto", listData)).toBe("list");
    });

    it("auto-selects table for NxM data", () => {
      expect(resolveDisplayMode("auto", tableData)).toBe("table");
    });

    it("treats undefined as auto", () => {
      expect(resolveDisplayMode(undefined, singleValue)).toBe("inline");
    });
  });

  describe("explicit mode", () => {
    it("respects explicit inline mode", () => {
      expect(resolveDisplayMode("inline", tableData)).toBe("inline");
    });

    it("respects explicit list mode", () => {
      expect(resolveDisplayMode("list", singleValue)).toBe("list");
    });

    it("respects explicit table mode", () => {
      expect(resolveDisplayMode("table", singleValue)).toBe("table");
    });
  });
});

describe("autoDetectColumns", () => {
  it("returns empty array for empty data", () => {
    expect(autoDetectColumns([])).toEqual([]);
  });

  it("creates column config from object keys", () => {
    const data = [{ id: 1, user_name: "Alice" }];
    const columns = autoDetectColumns(data);

    expect(columns).toHaveLength(2);
    expect(columns[0]).toEqual({ key: "id", label: "Id" });
    expect(columns[1]).toEqual({ key: "user_name", label: "User name" });
  });

  it("capitalizes first letter of labels", () => {
    const data = [{ name: "test" }];
    const columns = autoDetectColumns(data);

    expect(columns[0].label).toBe("Name");
  });

  it("replaces underscores with spaces in labels", () => {
    const data = [{ created_at: "2024-01-01", updated_by_user: "admin" }];
    const columns = autoDetectColumns(data);

    expect(columns[0].label).toBe("Created at");
    expect(columns[1].label).toBe("Updated by user");
  });
});

describe("formatCellValue", () => {
  it("returns empty string for null", () => {
    expect(formatCellValue(null)).toBe("");
  });

  it("returns empty string for undefined", () => {
    expect(formatCellValue(undefined)).toBe("");
  });

  it("returns 'Yes' for true", () => {
    expect(formatCellValue(true)).toBe("Yes");
  });

  it("returns 'No' for false", () => {
    expect(formatCellValue(false)).toBe("No");
  });

  it("formats Date objects", () => {
    // Use explicit time to avoid timezone issues
    const date = new Date(2024, 5, 15); // June 15, 2024 (month is 0-indexed)
    const result = formatCellValue(date);
    expect(result).toMatch(/6\/15\/2024|15\/6\/2024|2024-06-15/); // Locale-dependent
  });

  it("converts numbers to strings", () => {
    expect(formatCellValue(42)).toBe("42");
    expect(formatCellValue(3.14)).toBe("3.14");
    expect(formatCellValue(-100)).toBe("-100");
  });

  it("passes through strings unchanged", () => {
    expect(formatCellValue("hello")).toBe("hello");
    expect(formatCellValue("")).toBe("");
  });

  it("converts objects to string representation", () => {
    expect(formatCellValue({ a: 1 })).toBe("[object Object]");
    expect(formatCellValue([1, 2, 3])).toBe("1,2,3");
  });
});
