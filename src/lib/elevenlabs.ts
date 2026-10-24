import { ServiceError } from "./errors";

export function voiceConfigured() {
  return !!(process.env.ELEVENLABS_API_KEY && process.env.ELEVENLABS_AGENT_ID);
}

// Keep the key on the server. The browser receives a short-lived session URL,
// which is also sensitive and must never be logged or persisted.
export async function voiceSession(
  config = { key: process.env.ELEVENLABS_API_KEY, agent: process.env.ELEVENLABS_AGENT_ID },
  request: typeof fetch = fetch,
) {
  if (!config.key || !config.agent) throw new ServiceError("Voice is not configured. Set ELEVENLABS_API_KEY and ELEVENLABS_AGENT_ID on the server.", 503);
  let response: Response;
  try {
    response = await request(`https://api.elevenlabs.io/v1/convai/conversation/get-signed-url?agent_id=${encodeURIComponent(config.agent)}`, {
      headers: { "xi-api-key": config.key },
      signal: AbortSignal.timeout(10000),
      cache: "no-store",
    });
  } catch {
    throw new ServiceError("Could not reach ElevenLabs. Please try again or use text chat.", 503);
  }
  if (!response.ok) {
    if (response.status === 401 || response.status === 403) throw new ServiceError("ElevenLabs denied access. Check the server API key and its agent permissions.", 503);
    if (response.status === 404) throw new ServiceError("ElevenLabs agent not found. Check ELEVENLABS_AGENT_ID on the server.", 503);
    if (response.status === 429) throw new ServiceError("ElevenLabs voice limit reached. Please try again later or use text chat.", 429);
    throw new ServiceError("ElevenLabs is temporarily unavailable. Please use text chat.", 503);
  }
  try {
    const data = await response.json();
    const url = new URL(data.signed_url);
    if (url.protocol !== "wss:" || !(url.hostname === "elevenlabs.io" || url.hostname.endsWith(".elevenlabs.io"))) throw new Error("Invalid URL");
    return { signedUrl: url.toString() };
  } catch {
    throw new ServiceError("ElevenLabs returned an invalid session. Please try again.", 502);
  }
}
