import { z } from "zod";
import { ServiceError } from "./errors";

export const DEFAULT_GEMINI_MODEL = "gemini-3.1-flash-lite";

/** Inspect provider diagnostics, but return only fixed, credential-free messages. */
export function geminiFailure(error: unknown): ServiceError {
  if (error instanceof z.ZodError || error instanceof SyntaxError) {
    return new ServiceError("Gemini returned an incomplete or invalid draft. Please try again, or use the invoice form.", 502);
  }
  const provider = error as { status?: unknown; message?: unknown; name?: unknown } | null;
  const status = typeof provider?.status === "number" ? provider.status : undefined;
  const detail = typeof provider?.message === "string" ? provider.message : "";
  if (status === 404) {
    return new ServiceError(`The configured Gemini model is unavailable for this account. Set GEMINI_MODEL=${DEFAULT_GEMINI_MODEL} in .env.local and restart the server.`, 503);
  }
  if (status === 401 || /API_KEY_INVALID|API key not valid/i.test(detail)) {
    return new ServiceError("Google rejected the Gemini API key. Check GEMINI_API_KEY in .env.local and restart the server. Do not share the key.", 503);
  }
  if (status === 403) {
    return new ServiceError("Google denied access to Gemini. Check that the API is enabled and your key, project, and region allow access.", 503);
  }
  if (status === 429) {
    return new ServiceError("Gemini quota or rate limit reached. Check your Google AI Studio quota and billing, then try again later.", 429);
  }
  if (status === 504 || provider?.name === "AbortError" || provider?.name === "TimeoutError") {
    return new ServiceError("Gemini took too long to respond. No invoice was issued. Please try again or use the form.", 504);
  }
  if (status === 400) {
    return new ServiceError("Gemini could not accept the request configuration. Try again or use the form; the server integration may need updating.", 502);
  }
  return new ServiceError("Gemini is temporarily unavailable. No invoice was issued. Please try again or use the form.", 503);
}
