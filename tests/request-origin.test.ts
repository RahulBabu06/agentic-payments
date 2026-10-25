import assert from "node:assert/strict";
import test from "node:test";
import { assertSameOrigin } from "../src/lib/request-origin";

const request = (origin?: string, extra: Record<string, string> = {}) => new Request("http://localhost:10000/api/customer/session", {
  headers: { ...(origin ? { origin } : {}), ...extra },
});
test("same-origin requests work locally and through Render TLS termination", () => {
  assert.doesNotThrow(() => assertSameOrigin(request("http://localhost:10000"), ""));
  assert.doesNotThrow(() => assertSameOrigin(request("https://voicepay.onrender.com"), "https://voicepay.onrender.com"));
  assert.doesNotThrow(() => assertSameOrigin(request("https://pay.example.com"), "https://pay.example.com/"));
});
test("origin checks reject foreign, absent, null and forged proxy origins", () => {
  for (const origin of [undefined, "null", "https://evil.example", "http://voicepay.onrender.com", "https://voicepay.onrender.com.evil.example"]) {
    assert.throws(() => assertSameOrigin(request(origin, { "x-forwarded-host": "evil.example", "x-forwarded-proto": "https" }), "https://voicepay.onrender.com"), /Invalid request origin/);
  }
  assert.throws(() => assertSameOrigin(request("https://evil.example", { "x-forwarded-host": "evil.example" }), ""), /Invalid request origin/);
});
test("invalid public origins fail closed without leaking configuration", () => {
  for (const url of ["not a URL", "https://user:secret@example.com", "https://example.com/path", "https://example.com/?secret=value", "file:///tmp/site"]) {
    assert.throws(() => assertSameOrigin(request("https://example.com"), url), { message: "Invalid public origin configuration" });
  }
});
