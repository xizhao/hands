import { describe, expect, test } from "bun:test";
import { encrypt, decrypt, hash, generateToken } from "./crypto";

describe("crypto utilities", () => {
  const TEST_SECRET = "test-encryption-secret-key-12345";

  describe("encrypt/decrypt", () => {
    test("should encrypt and decrypt a string", async () => {
      const plaintext = "my-secret-oauth-token";
      const encrypted = await encrypt(plaintext, TEST_SECRET);
      const decrypted = await decrypt(encrypted, TEST_SECRET);

      expect(decrypted).toBe(plaintext);
    });

    test("encrypted output should be base64 encoded", async () => {
      const encrypted = await encrypt("test", TEST_SECRET);
      // Base64 regex pattern
      expect(encrypted).toMatch(/^[A-Za-z0-9+/]+=*$/);
    });

    test("same plaintext should produce different ciphertexts (random IV)", async () => {
      const plaintext = "repeated-value";
      const encrypted1 = await encrypt(plaintext, TEST_SECRET);
      const encrypted2 = await encrypt(plaintext, TEST_SECRET);

      expect(encrypted1).not.toBe(encrypted2);

      // Both should still decrypt correctly
      expect(await decrypt(encrypted1, TEST_SECRET)).toBe(plaintext);
      expect(await decrypt(encrypted2, TEST_SECRET)).toBe(plaintext);
    });

    test("should handle empty string", async () => {
      const encrypted = await encrypt("", TEST_SECRET);
      const decrypted = await decrypt(encrypted, TEST_SECRET);
      expect(decrypted).toBe("");
    });

    test("should handle unicode characters", async () => {
      const plaintext = "Hello 世界 🔐 émoji";
      const encrypted = await encrypt(plaintext, TEST_SECRET);
      const decrypted = await decrypt(encrypted, TEST_SECRET);
      expect(decrypted).toBe(plaintext);
    });

    test("should handle long strings", async () => {
      const plaintext = "x".repeat(10000);
      const encrypted = await encrypt(plaintext, TEST_SECRET);
      const decrypted = await decrypt(encrypted, TEST_SECRET);
      expect(decrypted).toBe(plaintext);
    });

    test("should fail to decrypt with wrong secret", async () => {
      const plaintext = "secret-value";
      const encrypted = await encrypt(plaintext, TEST_SECRET);

      await expect(decrypt(encrypted, "wrong-secret")).rejects.toThrow();
    });

    test("should fail to decrypt corrupted data", async () => {
      const encrypted = await encrypt("test", TEST_SECRET);
      const corrupted = encrypted.slice(0, -5) + "XXXXX";

      await expect(decrypt(corrupted, TEST_SECRET)).rejects.toThrow();
    });
  });

  describe("hash", () => {
    test("should produce a 64-character hex string (SHA-256)", async () => {
      const result = await hash("test-value");
      expect(result).toHaveLength(64);
      expect(result).toMatch(/^[0-9a-f]{64}$/);
    });

    test("same input should produce same hash", async () => {
      const hash1 = await hash("consistent-input");
      const hash2 = await hash("consistent-input");
      expect(hash1).toBe(hash2);
    });

    test("different inputs should produce different hashes", async () => {
      const hash1 = await hash("input-1");
      const hash2 = await hash("input-2");
      expect(hash1).not.toBe(hash2);
    });

    test("should handle empty string", async () => {
      const result = await hash("");
      // SHA-256 of empty string is well-known
      expect(result).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
    });

    test("should handle unicode", async () => {
      const result = await hash("🔐");
      expect(result).toHaveLength(64);
    });
  });

  describe("generateToken", () => {
    test("should generate a token of default length (64 hex chars = 32 bytes)", () => {
      const token = generateToken();
      expect(token).toHaveLength(64);
      expect(token).toMatch(/^[0-9a-f]{64}$/);
    });

    test("should generate token of specified length", () => {
      const token = generateToken(16);
      expect(token).toHaveLength(32); // 16 bytes = 32 hex chars
    });

    test("should generate unique tokens", () => {
      const tokens = new Set<string>();
      for (let i = 0; i < 100; i++) {
        tokens.add(generateToken());
      }
      expect(tokens.size).toBe(100);
    });
  });
});
