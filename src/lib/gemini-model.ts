import { DEFAULT_GEMINI_MODEL } from "./gemini-errors";

export const GEMINI_FALLBACK_NOTICE =
  `Your configured model was unavailable. This response used ${DEFAULT_GEMINI_MODEL}.`;

/**
 * Retry only model-not-found errors, once, against our tested default.
 * Authentication, quota, timeout, and response-validation errors must not
 * silently switch models or trigger additional billable requests.
 */
export async function generateWithModelFallback<T>(
  configuredModel: string | undefined,
  generate: (model: string) => Promise<T>,
): Promise<{ response: T; usedFallback: boolean }> {
  const model = configuredModel?.trim().replace(/^models\//, "") || DEFAULT_GEMINI_MODEL;
  try {
    return { response: await generate(model), usedFallback: false };
  } catch (error) {
    const status = (error as { status?: unknown } | null)?.status;
    if (status !== 404 || model === DEFAULT_GEMINI_MODEL) throw error;
    return { response: await generate(DEFAULT_GEMINI_MODEL), usedFallback: true };
  }
}
