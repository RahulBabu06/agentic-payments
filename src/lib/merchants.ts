export type MenuItem = { id: string; description: string; unitCents: number; detail: string };
export type Merchant = {
  id: string;
  name: string;
  category: "Coffee shop" | "Restaurant" | "Bar";
  area: string;
  description: string;
  walletEnv: string;
  menu: MenuItem[];
};

// Fictional demo businesses. "Simulated verification" is not a KYB/KYC check.
export const merchants: Merchant[] = [
  {
    id: "maple-coffee", name: "Maple Coffee", category: "Coffee shop", area: "Oxford Circus",
    description: "A small neighbourhood coffee counter.", walletEnv: "MERCHANT_WALLET",
    menu: [
      { id: "black-coffee", description: "Black coffee", unitCents: 300, detail: "Regular, freshly brewed" },
      { id: "latte", description: "Latte", unitCents: 400, detail: "Regular, dairy milk" },
      { id: "croissant", description: "Butter croissant", unitCents: 250, detail: "One freshly baked pastry" },
    ],
  },
  {
    id: "bean-and-brew", name: "Bean and Brew", category: "Coffee shop", area: "Soho",
    description: "An independent espresso and cake shop.", walletEnv: "MERCHANT_WALLET_BEAN_AND_BREW",
    menu: [
      { id: "espresso", description: "Espresso", unitCents: 250, detail: "One double shot" },
      { id: "cappuccino", description: "Cappuccino", unitCents: 350, detail: "Regular, dairy milk" },
      { id: "brownie", description: "Chocolate brownie", unitCents: 300, detail: "One slice" },
    ],
  },
  {
    id: "little-olive", name: "Little Olive", category: "Restaurant", area: "Soho",
    description: "A family-run Mediterranean lunch spot.", walletEnv: "MERCHANT_WALLET_LITTLE_OLIVE",
    menu: [
      { id: "falafel-wrap", description: "Falafel wrap", unitCents: 800, detail: "One wrap with salad" },
      { id: "greek-salad", description: "Greek salad", unitCents: 700, detail: "One bowl with feta" },
      { id: "lemonade", description: "Lemonade", unitCents: 300, detail: "One glass" },
    ],
  },
  {
    id: "corner-pizza", name: "Corner Pizza", category: "Restaurant", area: "Fitzrovia",
    description: "A small takeaway pizza kitchen.", walletEnv: "MERCHANT_WALLET_CORNER_PIZZA",
    menu: [
      { id: "margherita", description: "Margherita pizza", unitCents: 1000, detail: "One 10-inch pizza" },
      { id: "pepperoni", description: "Pepperoni pizza", unitCents: 1200, detail: "One 10-inch pizza" },
      { id: "garlic-bread", description: "Garlic bread", unitCents: 400, detail: "One portion" },
    ],
  },
  {
    id: "copper-tap", name: "Copper Tap", category: "Bar", area: "Marylebone",
    description: "A friendly local bar with alcohol-free demo drinks.", walletEnv: "MERCHANT_WALLET_COPPER_TAP",
    menu: [
      { id: "ginger-beer", description: "Alcohol-free ginger beer", unitCents: 400, detail: "One bottle, no alcohol" },
      { id: "mocktail", description: "Citrus mocktail", unitCents: 600, detail: "One glass, no alcohol" },
      { id: "bar-snacks", description: "Bar snacks", unitCents: 300, detail: "One bowl of crisps" },
    ],
  },
];

export function getMerchant(id: string): Merchant {
  const merchant = merchants.find(store => store.id === id);
  if (!merchant) throw new Error("Unknown merchant. Choose one of the five demo stores.");
  return merchant;
}

export function searchMerchants(query: string) {
  const terms = query.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().split(/\s+/).filter(Boolean);
  return merchants.filter(store => {
    const text = `${store.name} ${store.id} ${store.category} ${store.area} ${store.description} ${store.menu.map(item => item.description).join(" ")}`.toLowerCase().replace(/[^a-z0-9]+/g, " ");
    return terms.every(term => text.includes(term));
  });
}
