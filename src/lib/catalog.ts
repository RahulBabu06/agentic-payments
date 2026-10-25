import { z } from "zod";
import { getMerchant, merchants } from "./merchants";

export const merchantIdSchema = z.enum(merchants.map(store => store.id) as [string, ...string[]]);
const itemIdSchema = z.enum([...new Set(merchants.flatMap(store => store.menu.map(item => item.id)))] as [string, ...string[]]);
const itemsSchema = z.array(z.object({
  id: itemIdSchema,
  quantity: z.number().int().min(1).max(100),
})).max(10).refine(items => new Set(items.map(item => item.id)).size === items.length, "Combine repeated items into one quantity.");
export const cartSchema = z.object({ merchantId: merchantIdSchema, items: itemsSchema });
export const orderSchema = cartSchema.refine(order => order.items.length > 0, "Choose at least one menu item.");
export type Cart = z.infer<typeof cartSchema>;

// Item order and object key order are not part of the cart. Gemini often echoes
// the same items in a different order than the menu-backed on-screen cart.
export function sameCart(a: Cart, b: Cart) {
  if (a.merchantId !== b.merchantId || a.items.length !== b.items.length) return false;
  const quantities = new Map(a.items.map(item => [item.id, item.quantity]));
  return b.items.every(item => quantities.get(item.id) === item.quantity);
}

// Resolve prices and membership server-side; never accept client or model prices.
export function cartLines(input: Cart) {
  const cart = cartSchema.parse(input);
  const merchant = getMerchant(cart.merchantId);
  return cart.items.map(item => {
    const product = merchant.menu.find(product => product.id === item.id);
    if (!product) throw new Error(`This item is not on ${merchant.name}'s menu. Review your order.`);
    return { description: product.description, quantity: item.quantity, unitCents: product.unitCents };
  });
}
