// Trust a server-configured public URL, never client-supplied forwarding headers.
// Render terminates HTTPS before forwarding to Next's internal HTTP listener.
export function assertSameOrigin(req: Request, publicUrl = process.env.APP_ORIGIN || process.env.RENDER_EXTERNAL_URL) {
  let expected: string;
  try {
    const url = new URL(publicUrl || req.url);
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password ||
      (publicUrl && (url.pathname !== "/" || url.search || url.hash))) throw new Error();
    expected = url.origin;
  } catch {
    throw new Error("Invalid public origin configuration");
  }
  if (req.headers.get("origin") !== expected) throw new Error("Invalid request origin");
}
