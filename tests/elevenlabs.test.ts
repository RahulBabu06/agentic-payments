import { test } from "node:test";
import assert from "node:assert/strict";
import { voiceSession } from "../src/lib/elevenlabs";

const config = { key: "fixture-key-not-a-real-credential", agent: "fixture-agent" };
const stub = (fn: (...args: Parameters<typeof fetch>) => Promise<Response>) => fn as typeof fetch;

test("ElevenLabs key stays in the server request header, only signed session URL returns", async () => {
  const result = await voiceSession(config, stub(async (url, init) => {
    assert.equal(new URL(String(url)).searchParams.get("agent_id"), config.agent);
    assert.equal((init?.headers as Record<string, string>)["xi-api-key"], config.key);
    assert.equal(init?.cache, "no-store");
    return Response.json({ signed_url: "wss://api.elevenlabs.io/v1/convai/conversation?token=fixture" });
  }));
  assert.equal(result.signedUrl, "wss://api.elevenlabs.io/v1/convai/conversation?token=fixture");
  assert.equal(JSON.stringify(result).includes(config.key), false);
});

test("missing ElevenLabs configuration does not contact the provider", async () => {
  await assert.rejects(voiceSession({ key: undefined, agent: undefined }, stub(async () => { throw new Error("Must not fetch"); })), /not configured/);
});

test("provider errors are actionable without exposing credentials or provider diagnostics", async () => {
  for (const [status, expected] of [[401, /denied/], [403, /denied/], [404, /not found/], [429, /limit/], [500, /unavailable/]] as const) {
    await assert.rejects(voiceSession(config, stub(async () => new Response(config.key, { status }))), expected);
  }
  await assert.rejects(voiceSession(config, stub(async () => { throw new Error(config.key); })), /Could not reach/);
});

test("malformed or untrusted signed URLs are rejected", async () => {
  for (const signed_url of [undefined, "https://api.elevenlabs.io/test", "wss://elevenlabs.io.attacker.example/test"]) {
    await assert.rejects(voiceSession(config, stub(async () => Response.json({ signed_url }))), /invalid session/);
  }
});
