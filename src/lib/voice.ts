import { z } from "zod";
import { cartSchema, cartLines, Cart } from "./catalog";
import { getMerchant } from "./merchants";

export const voiceContext = z.discriminatedUnion("scope", [
  z.object({ scope: z.literal("order") }),
  z.object({ scope: z.literal("checkout"), invoiceId: z.string().uuid() }),
]);
export const voiceTurn = z.object({
  context: voiceContext,
  message: z.string().trim().min(1).max(2000),
  current: cartSchema.optional(),
  requestId: z.string().uuid().optional(),
  pendingOrderId: z.string().uuid().optional(),
});

export function menuVoiceReply(merchantId: string) {
  const merchant = getMerchant(merchantId);
  const items = merchant.menu.map(item => `${item.description}, ${(item.unitCents / 100).toFixed(2)} test USDC`).join("; ");
  return `The menu at ${merchant.name} in ${merchant.area} is: ${items}. Merchant verification is simulated. What would you like to order?`;
}

export function orderVoiceReply(order: Cart) {
  const merchant = getMerchant(order.merchantId);
  const lines = cartLines(order);
  if (!lines.length) return menuVoiceReply(order.merchantId);
  const cents = lines.reduce((sum, line) => sum + line.unitCents * line.quantity, 0);
  return `Your draft order at ${merchant.name}, ${merchant.area}, is ${lines.map(line => `${line.quantity} ${line.description}`).join(", ")}. Total ${(cents / 100).toFixed(2)} test USDC. Review it on screen before proceeding. No payment has been made.`;
}
