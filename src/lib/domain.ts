import { z } from "zod";

export const DEVNET_USDC = "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU";
export const DEVNET_GENESIS = "EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG";
export const lineSchema = z.object({
  description: z.string().trim().min(1).max(160),
  quantity: z.number().int().min(1).max(10000),
  unitCents: z.number().int().min(1).max(100000000),
});
export const draftSchema = z.object({
  customer: z.string().trim().min(1).max(120),
  dueDate: z.string().refine((s) => {
    if (s === "") return true;
    const parsed = new Date(s);
    return /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === s;
  }, "Use YYYY-MM-DD").default(""),
  lines: z.array(lineSchema).min(1).max(30),
});
export type Draft = z.infer<typeof draftSchema>;
export type Invoice = Draft & {
  id: string;
  number: string;
  status: "draft" | "issued" | "paid";
  version: number;
  totalCents: number;
  reference: string | null;
  merchant: string | null;
  signature: string | null;
  settlement: string | null;
  createdAt: string;
  paidAt: string | null;
};
export function totalCents(lines: Draft["lines"]) {
  const total = lines.reduce((sum, line) => sum + line.quantity * line.unitCents, 0);
  if (!Number.isSafeInteger(total) || total <= 0 || total > 100000000) {
    throw new Error("Invoice total must be between $0.01 and $1,000,000.");
  }
  return total;
}
export function atomicAmount(cents: number): bigint {
  if (!Number.isSafeInteger(cents) || cents < 1) throw new Error("Invalid amount");
  return BigInt(cents) * 10000n;
}
export function money(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}
