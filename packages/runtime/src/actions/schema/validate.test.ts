import type { ActionSchema, DbSchema } from "@hands/core/primitives";
import { describe, expect, it } from "vitest";
import { validateSchema } from "./validate";

describe("validateSchema", () => {
  const dbSchema: DbSchema = {
    tables: [
      {
        name: "users",
        columns: [
          { name: "id", type: "TEXT", nullable: false, isPrimary: true },
          { name: "email", type: "TEXT", nullable: false, isPrimary: false },
          { name: "name", type: "TEXT", nullable: true, isPrimary: false },
        ],
      },
      {
        name: "orders",
        columns: [
          { name: "id", type: "TEXT", nullable: false, isPrimary: true },
          { name: "user_id", type: "TEXT", nullable: false, isPrimary: false },
          { name: "total", type: "REAL", nullable: false, isPrimary: false },
        ],
      },
    ],
  };

  it("passes when all required tables and columns exist", () => {
    const actionSchema: ActionSchema = {
      tables: [
        {
          name: "users",
          columns: [
            { name: "id", type: "TEXT" },
            { name: "email", type: "TEXT" },
          ],
        },
      ],
    };

    const result = validateSchema(actionSchema, dbSchema);

    expect(result.valid).toBe(true);
    expect(result.missingTables).toEqual([]);
    expect(result.missingColumns).toEqual([]);
    expect(result.errors).toEqual([]);
  });

  it("fails when table is missing", () => {
    const actionSchema: ActionSchema = {
      tables: [
        {
          name: "products", // doesn't exist
          columns: [{ name: "id", type: "TEXT" }],
        },
      ],
    };

    const result = validateSchema(actionSchema, dbSchema);

    expect(result.valid).toBe(false);
    expect(result.missingTables).toEqual(["products"]);
    expect(result.errors).toContain('Table "products" does not exist');
  });

  it("fails when column is missing", () => {
    const actionSchema: ActionSchema = {
      tables: [
        {
          name: "users",
          columns: [
            { name: "id", type: "TEXT" },
            { name: "phone", type: "TEXT" }, // doesn't exist
          ],
        },
      ],
    };

    const result = validateSchema(actionSchema, dbSchema);

    expect(result.valid).toBe(false);
    expect(result.missingColumns).toEqual([{ table: "users", column: "phone" }]);
    expect(result.errors).toContain('Column "users.phone" does not exist');
  });

  it("ignores optional columns when missing", () => {
    const actionSchema: ActionSchema = {
      tables: [
        {
          name: "users",
          columns: [
            { name: "id", type: "TEXT" },
            { name: "avatar_url", type: "TEXT", optional: true }, // optional, doesn't exist
          ],
        },
      ],
    };

    const result = validateSchema(actionSchema, dbSchema);

    expect(result.valid).toBe(true);
    expect(result.missingColumns).toEqual([]);
  });

  it("validates multiple tables", () => {
    const actionSchema: ActionSchema = {
      tables: [
        {
          name: "users",
          columns: [{ name: "id", type: "TEXT" }],
        },
        {
          name: "orders",
          columns: [
            { name: "id", type: "TEXT" },
            { name: "total", type: "REAL" },
          ],
        },
      ],
    };

    const result = validateSchema(actionSchema, dbSchema);

    expect(result.valid).toBe(true);
  });

  it("reports multiple errors", () => {
    const actionSchema: ActionSchema = {
      tables: [
        {
          name: "users",
          columns: [
            { name: "id", type: "TEXT" },
            { name: "phone", type: "TEXT" },
            { name: "address", type: "TEXT" },
          ],
        },
        {
          name: "products",
          columns: [{ name: "id", type: "TEXT" }],
        },
      ],
    };

    const result = validateSchema(actionSchema, dbSchema);

    expect(result.valid).toBe(false);
    expect(result.missingTables).toEqual(["products"]);
    expect(result.missingColumns).toHaveLength(2);
    expect(result.errors).toHaveLength(3);
  });
});
