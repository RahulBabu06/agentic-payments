import { z } from "zod";
import { catalog } from "./catalog";
import { orderSchema } from "./gemini";

export const voiceContext = z.discriminatedUnion("scope", [
  z.object({ scope: z.literal("order") }),
  z.object({ scope: z.literal("checkout"), invoiceId: z.string().uuid() }),
]);
export const voiceTurn = z.object({
  context: voiceContext,
  message: z.string().trim().min(1).max(2000),
  current: orderSchema.optional(),
});

export function orderVoiceReply(order: z.infer<typeof orderSchema>) {
  const cents = order.items.reduce((sum, item) => sum + catalog.find(p => p.id === item.id)!.unitCents * item.quantity, 0);
  return `Your draft order is ${order.items.map(i => `${i.quantity} ${catalog.find(p => p.id === i.id)!.description}`).join(", ")}. Total ${(cents / 100).toFixed(2)} test USDC. Review it on screen before proceeding. No payment has been made.`;
}
