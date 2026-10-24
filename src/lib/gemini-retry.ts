/**
 * Proposal-only calls may retry transient provider failures once. Never use
 * this helper for payment submission, and never retry auth or quota failures.
 * The SDK's own retries are disabled so this is the only retry budget.
 */
export async function retryGemini<T>(generate: () => Promise<T>, pause = () => new Promise(resolve => setTimeout(resolve, 500))): Promise<T> {
  try {
    return await generate();
  } catch (error) {
    const provider = error as { status?: number; name?: string } | null;
    if (![500, 502, 503, 504].includes(provider?.status || 0) &&
        provider?.name !== "AbortError" && provider?.name !== "TimeoutError") throw error;
    await pause();
    return generate();
  }
}
