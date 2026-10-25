import { orderWithGemini } from "./gemini";
import { createCustomerOrder, getCustomerOrder, confirmCustomerOrder, orderView } from "./customer-orders";
import { orderVoiceReply } from "./voice";
import { sameCart, type Cart } from "./catalog";
import { interpretOrder } from "./order-turn";

// Text and voice share the same order transitions. Neither can sign a wallet transaction.
export async function customerAssistant(message: string, current?: Cart, requestId?: string, pendingOrderId?: string) {
  const result = await orderWithGemini(message, current);
  const turn = interpretOrder(message, result, current);
  if (turn.kind === "menu") {
    return { ...result, action: "show_menu" as const, order: null, reply: turn.reply, say: turn.reply };
  }
  if (turn.kind === "place") {
    if (!requestId) throw new Error("Refresh your cart and try again.");
    const order = createCustomerOrder(turn.order, requestId);
    const say = `${orderVoiceReply(order.cart)} Internal order ${order.id} is saved. Do you confirm this order? You will still need to approve payment in your wallet.`;
    return { ...result, action: "place_order" as const, order: turn.order, internalOrder: orderView(order), reply: say, say };
  }
  if (turn.kind === "confirm") {
    if (!pendingOrderId || !current) throw new Error("Place your order first and review the confirmation.");
    const pending = getCustomerOrder(pendingOrderId);
    if (!sameCart(pending.cart, current) || (result.order && !sameCart(result.order, current))) {
      throw new Error("Your cart changed. Place the updated order and review it again.");
    }
    const { devnetConnection } = await import("./solana");
    await devnetConnection();
    const order = confirmCustomerOrder(pendingOrderId);
    const say = "Order confirmed. Open wallet payment on screen and approve the USDC transaction in Phantom. No payment has been made yet.";
    return { ...result, action: "confirm_order" as const, internalOrder: orderView(order), invoiceId: order.invoiceId, reply: say, say };
  }
  return { ...result, action: "propose" as const, order: turn.order, reply: result.reply, say: turn.say };
}
