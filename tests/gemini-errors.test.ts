import { test } from "node:test";
import assert from "node:assert/strict";
import { z } from "zod";
import { DEFAULT_GEMINI_MODEL, geminiFailure } from "../src/lib/gemini-errors";

test("model retirement produces a model-specific action, not a generic 400 or key error", () => {
  const error = geminiFailure({ status: 404, message: "This model is no longer available to new users." });
  assert.equal(error.status, 503);
  assert.match(error.message, /model is unavailable/);
  assert.ok(error.message.includes(`GEMINI_MODEL=${DEFAULT_GEMINI_MODEL}`));
  assert.doesNotMatch(error.message, /rejected.*key/i);
});

test("key, access, quota, timeout and service failures are distinguishable", () => {
  for (const [provider, status, expected] of [
    [{ status: 400, message: "API_KEY_INVALID" }, 503, /rejected.*API key/],
    [{ status: 403 }, 503, /denied access/],
    [{ status: 429 }, 429, /quota or rate limit/],
    [{ status: 504 }, 504, /too long/],
    [{ name: "TimeoutError" }, 504, /too long/],
    [{ status: 400 }, 502, /request configuration/],
    [{ status: 503 }, 503, /temporarily unavailable/],
  ] as const) {
    const result = geminiFailure(provider);
    assert.equal(result.status, status);
    assert.match(result.message, expected);
  }
});

test("JSON and schema failures report invalid output", () => {
  const invalid = z.object({ quantity: z.number().int() }).safeParse({ quantity: 0.5 });
  assert.equal(invalid.success, false);
  for (const error of [new SyntaxError("Invalid JSON"), invalid.error]) {
    const result = geminiFailure(error);
    assert.equal(result.status, 502);
    assert.match(result.message, /incomplete or invalid/);
  }
});

test("provider messages and URLs never escape in public errors", () => {
  const detail = "private-diagnostic https://example.invalid/?key=test-secret";
  for (const status of [400, 401, 403, 404, 429, 500, 503, 504]) {
    const result = geminiFailure({ status, message: detail });
    assert.doesNotMatch(result.message, /private-diagnostic|example.invalid|test-secret/);
  }
});
