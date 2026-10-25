// The order and invoice assistants share one 2000-character request limit.
// Keep the latest customer line and drop older turns rather than failing the request.
export function boundedTranscript(history: string[], message: string, limit = 2000) {
  const latest = `Customer: ${message.trim()}`;
  const lines = [...history, latest];
  while (lines.length > 1 && lines.join("\n").length > limit) lines.shift();
  return lines.join("\n");
}
