import type { Cart } from "./catalog";
import { merchants, type Merchant } from "./merchants";
import { menuVoiceReply, orderVoiceReply } from "./voice";

export type OrderAction = "propose" | "show_menu" | "place_order" | "confirm_order";

const MENU_INTENT = /\b(menus?|prices?|browse|what do you (?:have|sell|serve|offer)|what can i (?:get|order)|what(?:'s| is) (?:on the menu|available))\b/i;
const CART_CHANGE = /\b(place|checkout|confirm|add|remove|cancel|change|make that|i'?ll take|i will take|get me)\b/i;
const STOP = new Set(["with", "from", "that", "this", "your", "have", "want", "free", "shop", "menu", "menus", "price", "prices", "browse", "what", "show", "please"]);
const CATEGORY_LABELS = new Set(merchants.map(store => store.category.toLowerCase().replace(/ shop$/, "")));
const DEMO_STORES = merchants.map(store => `${store.name} in ${store.area}`).join(", ");

export function latestCustomerUtterance(message: string) {
  const lines = message.split("\n").map(line => line.trim()).filter(Boolean);
  const customer = lines.filter(line => /^customer:/i.test(line));
  const last = customer.at(-1) ?? lines.at(-1) ?? message;
  return last.replace(/^customer:\s*/i, "").trim();
}

export function isMenuQuestion(text: string) {
  const utterance = text.trim();
  return !!utterance && !CART_CHANGE.test(utterance) && MENU_INTENT.test(utterance);
}

function words(value: string) {
  return value.toLowerCase().split(/[^a-z0-9]+/).filter(word => word.length > 3 && !STOP.has(word) && !CATEGORY_LABELS.has(word));
}

function categories(text: string) {
  return merchants.filter(store => {
    const label = store.category.toLowerCase().replace(/ shop$/, "");
    return new RegExp(`\\b${label}\\b`).test(text);
  });
}

function mentioned(text: string): Merchant[] {
  const normalized = text.toLowerCase();
  const named = merchants.filter(store => normalized.includes(store.name.toLowerCase()));
  if (named.length) return named;
  const area = merchants.filter(store => normalized.includes(store.area.toLowerCase()));
  if (area.length) return area;
  const byItem = merchants.filter(store => store.menu.some(item => words(item.description).some(word => normalized.includes(word))));
  if (byItem.length === 1) return byItem;
  const category = categories(normalized);
  if (category.length) return category;
  return byItem;
}

function placePhrase(text: string) {
  const match = text.match(/\b(?:at|from|in)\s+(?:the\s+)?([a-z0-9][a-z0-9'’&. -]{1,40})/i);
  if (!match) return null;
  const place = match[1].replace(/[?.!,]+$/g, "").replace(/\b(menus?|please|today|now|store|shop)\b/gi, "").trim();
  return place || null;
}

// Menu text always comes from the catalog. A model reply is not a price list.
export function menuAnswer(message: string, order: Cart | null, current?: Cart) {
  const text = latestCustomerUtterance(message);
  const stores = mentioned(text);
  if (stores.length === 1) return menuVoiceReply(stores[0].id);
  if (stores.length > 1) return `Which store do you mean? ${stores.map(store => `${store.name} in ${store.area}`).join(", ")}.`;
  const place = placePhrase(text);
  if (place) {
    const named = merchants.filter(store => store.name.toLowerCase().includes(place.toLowerCase()));
    const partial = named.length ? named : mentioned(place);
    if (partial.length === 1) return menuVoiceReply(partial[0].id);
    if (partial.length > 1) return `Which store do you mean? ${partial.map(store => `${store.name} in ${store.area}`).join(", ")}.`;
    return `${place} is not one of the demo stores. You can order from ${DEMO_STORES}. Merchant verification is simulated.`;
  }
  const merchantId = current?.merchantId || order?.merchantId;
  if (merchantId) return menuVoiceReply(merchantId);
  return `Which store's menu would you like? You can order from ${DEMO_STORES}.`;
}

export type InterpretedOrder =
  | { kind: "menu"; reply: string }
  | { kind: "place"; order: Cart }
  | { kind: "confirm" }
  | { kind: "propose"; order: Cart | null; say: string };

export function interpretOrder(
  message: string,
  result: { reply: string; order: Cart | null; action: OrderAction },
  current?: Cart,
): InterpretedOrder {
  const utterance = latestCustomerUtterance(message);
  // A menu question never places, confirms, or replaces the on-screen cart.
  if (isMenuQuestion(utterance) || (result.action === "show_menu" && !result.order?.items.length)) {
    return { kind: "menu", reply: menuAnswer(message, result.order, current) };
  }
  if (result.action === "place_order" && result.order) return { kind: "place", order: result.order };
  if (result.action === "confirm_order") return { kind: "confirm" };
  return { kind: "propose", order: result.order, say: result.order ? orderVoiceReply(result.order) : result.reply };
}
