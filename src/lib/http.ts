import { cookies } from "next/headers";
import { timingSafeEqual, createHash } from "node:crypto";
import { db } from "./db";
import { ServiceError } from "./errors";

export function equalSecret(a: string, b: string) {
  const hash = (v: string) => createHash("sha256").update(v).digest();
  return timingSafeEqual(hash(a), hash(b));
}
export async function authenticated() {
  const token = (await cookies()).get("voicepay_session")?.value;
  if (!token) return false;
  return !!db().prepare("SELECT token FROM sessions WHERE token=? AND expires>?").get(token, Date.now());
}
export async function requireAuth() {
  if (!(await authenticated())) throw new Error("Unauthorized");
}
export async function customerAuthenticated() {
  const token = (await cookies()).get("voicepay_customer")?.value;
  return !!token && !!db().prepare("SELECT token FROM customer_sessions WHERE token=? AND expires>?").get(token, Date.now());
}
export async function requireCustomer() {
  if (!(await customerAuthenticated())) throw new Error("Unauthorized");
}
export function sameOrigin(req: Request) {
  const origin = req.headers.get("origin");
  if (!origin || origin !== new URL(req.url).origin) throw new Error("Invalid request origin");
}
export async function body(req: Request) {
  const text = await req.text();
  if (text.length > 20000) throw new Error("Request too large");
  return JSON.parse(text);
}
export function failure(error: unknown) {
  const raw = error instanceof Error ? error.message : "Request failed";
  // Do not forward provider errors, RPC URLs, or credentials to the browser.
  const message = /https?:\/\/|AIza/i.test(raw) ? "External service unavailable. Check server configuration." : raw;
  return Response.json({ error: message }, { status: error instanceof ServiceError ? error.status : message === "Unauthorized" ? 401 : 400 });
}
