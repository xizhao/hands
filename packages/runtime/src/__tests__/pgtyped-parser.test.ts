/**
 * Test for pgtyped parser and type generation
 */
import { describe, expect, test } from "bun:test";
import { PGlite } from "@electric-sql/pglite";
import { extractQueriesFromSource } from "../db/pgtyped/parser.js";
import { buildSchemaMap, generateTypesFile } from "../db/pgtyped/type-generator.js";

describe("pgtyped parser", () => {
  test("extracts sql tagged templates", () => {
    const testSource = `
import { sql } from "@pgtyped/runtime"

const getUsers = sql\`SELECT id, name FROM users WHERE active = $active\`
const getOrders = sql\`SELECT * FROM orders WHERE user_id = $userId LIMIT $limit\`
`;
    const result = extractQueriesFromSource(testSource, "test.tsx");

    console.log("Queries found:", result.queries.length);
    console.log("Errors:", result.errors);

    for (const query of result.queries) {
      console.log(
        "Query:",
        query.name,
        "SQL:",
        query.sql,
        "Params:",
        query.params.map((p) => p.name),
      );
    }

    expect(result.queries.length).toBe(2);
    expect(result.queries[0].name).toBe("getUsers");
    expect(result.queries[0].params.length).toBe(1);
    expect(result.queries[0].params[0].name).toBe("active");
    expect(result.queries[1].name).toBe("getOrders");
    expect(result.queries[1].params.length).toBe(2);
  });

  test("handles files without sql templates", () => {
    const testSource = `
const foo = "bar"
export default function() { return null }
`;
    const result = extractQueriesFromSource(testSource, "test.tsx");
    expect(result.queries.length).toBe(0);
    expect(result.errors.length).toBe(0);
  });

  test("extracts typed sql templates", () => {
    const testSource = `
import { sql } from "@pgtyped/runtime"
import type { IGetUsersQuery } from "./test.types"

const getUsers = sql<IGetUsersQuery>\`SELECT id, name FROM users WHERE active = $active\`
`;
    const result = extractQueriesFromSource(testSource, "test.tsx");
    expect(result.queries.length).toBe(1);
    expect(result.queries[0].name).toBe("getUsers");
  });
});

describe("pgtyped type generator", () => {
  test("generates type definitions from schema", async () => {
    // Create in-memory PGlite database
    const db = new PGlite();

    // Create a test table
    await db.exec(`
      CREATE TABLE users (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        email VARCHAR(255),
        active BOOLEAN DEFAULT true,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )
    `);

    // Parse a test source file
    const testSource = `
import { sql } from "@pgtyped/runtime"

const getUsers = sql\`SELECT id, name, email FROM users WHERE active = $active\`
`;
    const parsed = extractQueriesFromSource(testSource, "test-block.tsx");

    // Build schema and generate types
    const schema = await buildSchemaMap(db);
    const typesContent = generateTypesFile(parsed, schema);

    console.log("Generated types:\n", typesContent);

    // Verify the generated content (toPascalCase produces "Getusers" from "getUsers")
    expect(typesContent).toContain("IGetusersParams");
    expect(typesContent).toContain("IGetusersResult");
    expect(typesContent).toContain("IGetusersQuery");
    expect(typesContent).toContain("active");
    // Verify column types are inferred from schema
    expect(typesContent).toContain("id: number");
    expect(typesContent).toContain("name: string");
    expect(typesContent).toContain("email: string | null");

    // Cleanup
    await db.close();
  });
});
