import { orderWithGemini } from "./gemini";
import { createCustomerOrder, getCustomerOrder, confirmCustomerOrder, orderView } from "./customer-orders";
import { orderVoiceReply } from "./voice";
import type { Cart } from "./catalog";

// Text and voice share the same order transitions. Neither can sign a wallet transaction.
export async function customerAssistant(message: string, current?: Cart, requestId?: string, pendingOrderId?: string) {
  const result = await orderWithGemini(message, current);
  if (result.action === "place_order" && result.order) {
    if (!requestId) throw new Error("Refresh your cart and try again.");
    const order = createCustomerOrder(result.order, requestId);
    const say = `${orderVoiceReply(order.cart)} Internal order ${order.id} is saved. Do you confirm this order? You will still need to approve payment in your wallet.`;
    return { ...result, internalOrder: orderView(order), reply: say, say };
  }
  if (result.action === "confirm_order") {
    if (!pendingOrderId || !current) throw new Error("Place your order first and review the confirmation.");
    const pending = getCustomerOrder(pendingOrderId);
    if (JSON.stringify(pending.cart) !== JSON.stringify(current) || (result.order && JSON.stringify(result.order) !== JSON.stringify(current))) {
      throw new Error("Your cart changed. Place the updated order and review it again.");
    }
    const { devnetConnection } = await import("./solana");
    await devnetConnection();
    const order = confirmCustomerOrder(pendingOrderId);
    const say = "Order confirmed. Open wallet payment on screen and approve the USDC transaction in Phantom. No payment has been made yet.";
    return { ...result, internalOrder: orderView(order), invoiceId: order.invoiceId, reply: say, say };
  }
  return { ...result, say: result.order ? orderVoiceReply(result.order) : result.reply };
}
