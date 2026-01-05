import { describe, expect, test } from "bun:test";
import { generateId } from "../types";

describe("types", () => {
  describe("generateId", () => {
    test("generates unique IDs with prefix", () => {
      const id1 = generateId("msg");
      const id2 = generateId("msg");

      expect(id1).toMatch(/^msg_/);
      expect(id2).toMatch(/^msg_/);
      expect(id1).not.toBe(id2);
    });

    test("supports different prefixes", () => {
      const msgId = generateId("msg");
      const partId = generateId("part");
      const sessionId = generateId("session");

      expect(msgId).toMatch(/^msg_/);
      expect(partId).toMatch(/^part_/);
      expect(sessionId).toMatch(/^session_/);
    });
  });
});
