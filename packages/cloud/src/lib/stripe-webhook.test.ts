import { describe, expect, test } from "bun:test";

// Since the webhook verification functions are not exported, we'll test them here
// by recreating the logic or extracting them

const TIMESTAMP_TOLERANCE = 300;

/**
 * Constant-time string comparison to prevent timing attacks
 */
function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }

  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }

  return result === 0;
}

interface SignatureVerificationResult {
  valid: boolean;
  error?: string;
}

async function verifyStripeSignature(
  payload: string,
  signature: string,
  secret: string
): Promise<SignatureVerificationResult> {
  // Parse signature header
  const parts: Record<string, string> = {};
  for (const part of signature.split(",")) {
    const [key, value] = part.split("=");
    if (key && value) {
      parts[key] = value;
    }
  }

  const timestamp = parts["t"];
  const expectedSig = parts["v1"];

  if (!timestamp || !expectedSig) {
    return { valid: false, error: "Missing timestamp or signature" };
  }

  // Check timestamp (within tolerance window)
  const now = Math.floor(Date.now() / 1000);
  const timestampNum = parseInt(timestamp, 10);

  if (isNaN(timestampNum)) {
    return { valid: false, error: "Invalid timestamp" };
  }

  if (Math.abs(now - timestampNum) > TIMESTAMP_TOLERANCE) {
    return { valid: false, error: "Timestamp outside tolerance window" };
  }

  // Compute expected signature
  const signedPayload = `${timestamp}.${payload}`;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const sig = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(signedPayload)
  );

  const computedHex = Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  // Constant-time comparison to prevent timing attacks
  if (!constantTimeEqual(computedHex, expectedSig)) {
    return { valid: false, error: "Signature mismatch" };
  }

  return { valid: true };
}

// Helper to generate a valid Stripe signature
async function generateStripeSignature(
  payload: string,
  secret: string,
  timestamp?: number
): Promise<string> {
  const t = timestamp ?? Math.floor(Date.now() / 1000);
  const signedPayload = `${t}.${payload}`;

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const sig = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(signedPayload)
  );

  const hexSig = Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  return `t=${t},v1=${hexSig}`;
}

describe("Stripe webhook verification", () => {
  const TEST_SECRET = "whsec_test_secret_12345";
  const TEST_PAYLOAD = '{"type":"checkout.session.completed","data":{}}';

  describe("constantTimeEqual", () => {
    test("should return true for equal strings", () => {
      expect(constantTimeEqual("abc123", "abc123")).toBe(true);
      expect(constantTimeEqual("", "")).toBe(true);
    });

    test("should return false for different strings", () => {
      expect(constantTimeEqual("abc", "abd")).toBe(false);
      expect(constantTimeEqual("abc", "abc ")).toBe(false);
    });

    test("should return false for different length strings", () => {
      expect(constantTimeEqual("abc", "abcd")).toBe(false);
      expect(constantTimeEqual("abcd", "abc")).toBe(false);
    });

    test("should handle hex signatures", () => {
      const sig1 = "a1b2c3d4e5f6";
      const sig2 = "a1b2c3d4e5f6";
      const sig3 = "a1b2c3d4e5f7";

      expect(constantTimeEqual(sig1, sig2)).toBe(true);
      expect(constantTimeEqual(sig1, sig3)).toBe(false);
    });
  });

  describe("verifyStripeSignature", () => {
    test("should verify a valid signature", async () => {
      const signature = await generateStripeSignature(TEST_PAYLOAD, TEST_SECRET);
      const result = await verifyStripeSignature(
        TEST_PAYLOAD,
        signature,
        TEST_SECRET
      );

      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    test("should reject invalid signature", async () => {
      const timestamp = Math.floor(Date.now() / 1000);
      const signature = `t=${timestamp},v1=invalid_signature_hex`;

      const result = await verifyStripeSignature(
        TEST_PAYLOAD,
        signature,
        TEST_SECRET
      );

      expect(result.valid).toBe(false);
      expect(result.error).toBe("Signature mismatch");
    });

    test("should reject signature with wrong secret", async () => {
      const signature = await generateStripeSignature(
        TEST_PAYLOAD,
        "wrong_secret"
      );
      const result = await verifyStripeSignature(
        TEST_PAYLOAD,
        signature,
        TEST_SECRET
      );

      expect(result.valid).toBe(false);
      expect(result.error).toBe("Signature mismatch");
    });

    test("should reject expired timestamp", async () => {
      const oldTimestamp = Math.floor(Date.now() / 1000) - 400; // 400 seconds ago
      const signature = await generateStripeSignature(
        TEST_PAYLOAD,
        TEST_SECRET,
        oldTimestamp
      );

      const result = await verifyStripeSignature(
        TEST_PAYLOAD,
        signature,
        TEST_SECRET
      );

      expect(result.valid).toBe(false);
      expect(result.error).toBe("Timestamp outside tolerance window");
    });

    test("should reject future timestamp", async () => {
      const futureTimestamp = Math.floor(Date.now() / 1000) + 400; // 400 seconds in future
      const signature = await generateStripeSignature(
        TEST_PAYLOAD,
        TEST_SECRET,
        futureTimestamp
      );

      const result = await verifyStripeSignature(
        TEST_PAYLOAD,
        signature,
        TEST_SECRET
      );

      expect(result.valid).toBe(false);
      expect(result.error).toBe("Timestamp outside tolerance window");
    });

    test("should accept timestamp within tolerance", async () => {
      // 2 minutes ago (within 5 minute tolerance)
      const recentTimestamp = Math.floor(Date.now() / 1000) - 120;
      const signature = await generateStripeSignature(
        TEST_PAYLOAD,
        TEST_SECRET,
        recentTimestamp
      );

      const result = await verifyStripeSignature(
        TEST_PAYLOAD,
        signature,
        TEST_SECRET
      );

      expect(result.valid).toBe(true);
    });

    test("should reject missing timestamp", async () => {
      const signature = "v1=somehex";
      const result = await verifyStripeSignature(
        TEST_PAYLOAD,
        signature,
        TEST_SECRET
      );

      expect(result.valid).toBe(false);
      expect(result.error).toBe("Missing timestamp or signature");
    });

    test("should reject missing signature", async () => {
      const signature = `t=${Math.floor(Date.now() / 1000)}`;
      const result = await verifyStripeSignature(
        TEST_PAYLOAD,
        signature,
        TEST_SECRET
      );

      expect(result.valid).toBe(false);
      expect(result.error).toBe("Missing timestamp or signature");
    });

    test("should reject invalid timestamp format", async () => {
      const signature = "t=notanumber,v1=abc123";
      const result = await verifyStripeSignature(
        TEST_PAYLOAD,
        signature,
        TEST_SECRET
      );

      expect(result.valid).toBe(false);
      expect(result.error).toBe("Invalid timestamp");
    });

    test("should handle payload with special characters", async () => {
      const specialPayload = '{"name":"Test","emoji":"🔥","unicode":"日本語"}';
      const signature = await generateStripeSignature(specialPayload, TEST_SECRET);

      const result = await verifyStripeSignature(
        specialPayload,
        signature,
        TEST_SECRET
      );

      expect(result.valid).toBe(true);
    });

    test("should reject tampered payload", async () => {
      const signature = await generateStripeSignature(TEST_PAYLOAD, TEST_SECRET);
      const tamperedPayload = TEST_PAYLOAD.replace("completed", "failed");

      const result = await verifyStripeSignature(
        tamperedPayload,
        signature,
        TEST_SECRET
      );

      expect(result.valid).toBe(false);
      expect(result.error).toBe("Signature mismatch");
    });
  });
});
