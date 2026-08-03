// 活動頁內容產生器。
//
// 把一個組合彙整成活動頁要的文字：品名、規格、數量、詳情、價格、贈品。
//
// 🚫 這一層**不做任何計算**，它只是把前面算好的東西排版。
//    如果這裡自己算一次價格，遲早會跟試算頁的數字對不起來，
//    而活動頁上的數字錯了，是直接對客人錯的。
//
// 🚫 缺資料一律不編。沒填詳情就不寫那一段，並在畫面上告訴使用者缺哪幾項，
//    不要生出「N/A」或「（請補充）」跟著貼到活動頁上去。

import { computeGiftUnits } from "./costing";
import type { Doc } from "./doc";
import { listPricedItems, summarizeBundle, type PricedItem } from "./derive";

export type ContentItem = {
  name: string;
  sku: string | null;
  quantity: number;
  /** 子規格的詳情優先，沒有就用母規格的。兩個都沒有就是 null。 */
  details: string | null;
};

export type ContentGift = {
  name: string;
  quantity: number;
  /** 觸發條件的白話說明。 */
  condition: string;
  stackable: boolean;
};

export type ContentBlock = {
  title: string;
  items: ContentItem[];
  listPrice: number | null;
  price: number | null;
  /** 比原價加總省下多少。組合價比較貴或算不出來時為 null。 */
  saved: number | null;
  gifts: ContentGift[];
  note: string | null;
  /** 沒有填商品詳情的品項名稱。 */
  missingDetails: string[];
};

function detailsOf(item: PricedItem): string | null {
  const own = item.variant?.details?.trim();
  if (own) return own;
  const parent = item.product.details?.trim();
  return parent ? parent : null;
}

export function buildContent(doc: Doc, bundleId: string): ContentBlock | null {
  const bundle = doc.bundles.find((row) => row.id === bundleId);
  if (!bundle) return null;

  const summary = summarizeBundle(doc, bundle);
  const items = listPricedItems(doc);

  const contentItems: ContentItem[] = summary.contents
    .filter((content) => content.item !== null && content.line.quantity > 0)
    .map((content) => {
      const item = content.item as PricedItem;
      return { name: item.name, sku: item.sku, quantity: content.line.quantity, details: detailsOf(item) };
    });

  const price = summary.price;
  const gifts: ContentGift[] =
    price === null
      ? []
      : doc.promotions.flatMap((promotion) =>
          promotion.gifts
            .map((gift) => {
              const units = computeGiftUnits([gift], { subtotal: price, quantity: summary.quantity });
              const giftItem = items.find((option) => option.key === gift.itemKey);
              return { gift, units, giftItem };
            })
            .filter((entry) => entry.units > 0 && entry.giftItem)
            .map(({ gift, units, giftItem }) => ({
              name: giftItem!.name,
              quantity: units,
              condition:
                gift.trigger === "QUANTITY" ? `滿 ${gift.threshold} 件` : `滿 ${gift.threshold.toLocaleString("zh-TW")} 元`,
              stackable: gift.stackable,
            })),
        );

  const saved =
    summary.listPrice === null || price === null || price >= summary.listPrice
      ? null
      : summary.listPrice - price;

  return {
    title: bundle.name.trim(),
    items: contentItems,
    listPrice: summary.listPrice,
    price,
    saved,
    gifts,
    note: bundle.note?.trim() || null,
    missingDetails: contentItems.filter((item) => item.details === null).map((item) => item.name),
  };
}

const yuan = (value: number) => `NT$${Math.round(value).toLocaleString("zh-TW")}`;

/** 給活動頁直接貼的純文字。 */
export function renderPlainText(block: ContentBlock): string {
  const lines: string[] = [];

  if (block.title) lines.push(block.title, "");

  lines.push("【組合內容】");
  for (const item of block.items) {
    lines.push(`．${item.name} × ${item.quantity}${item.sku ? `（${item.sku}）` : ""}`);
    if (item.details) lines.push(`  ${item.details}`);
  }

  if (block.price !== null) {
    lines.push("", "【價格】");
    if (block.listPrice !== null && block.saved !== null) {
      lines.push(`原價 ${yuan(block.listPrice)}　組合價 ${yuan(block.price)}　省 ${yuan(block.saved)}`);
    } else {
      lines.push(`售價 ${yuan(block.price)}`);
    }
  }

  if (block.gifts.length > 0) {
    lines.push("", "【贈品】");
    for (const gift of block.gifts) {
      lines.push(`．${gift.condition} 送 ${gift.name} × ${gift.quantity}${gift.stackable ? "（可累贈）" : ""}`);
    }
  }

  if (block.note) lines.push("", block.note);

  return lines.join("\n");
}

export function renderMarkdown(block: ContentBlock): string {
  const lines: string[] = [];

  if (block.title) lines.push(`## ${block.title}`, "");

  lines.push("### 組合內容", "");
  for (const item of block.items) {
    lines.push(`- **${item.name}** × ${item.quantity}${item.sku ? ` \`${item.sku}\`` : ""}`);
    if (item.details) lines.push(`  ${item.details}`);
  }

  if (block.price !== null) {
    lines.push("", "### 價格", "");
    if (block.listPrice !== null && block.saved !== null) {
      lines.push(`原價 ~~${yuan(block.listPrice)}~~　**組合價 ${yuan(block.price)}**　省 ${yuan(block.saved)}`);
    } else {
      lines.push(`**售價 ${yuan(block.price)}**`);
    }
  }

  if (block.gifts.length > 0) {
    lines.push("", "### 贈品", "");
    for (const gift of block.gifts) {
      lines.push(`- ${gift.condition} 送 **${gift.name}** × ${gift.quantity}${gift.stackable ? "（可累贈）" : ""}`);
    }
  }

  if (block.note) lines.push("", block.note);

  return lines.join("\n");
}

/**
 * 表格格式，給上架或交給設計師用。
 * ⚠️ 欄位裡可能有逗號與換行，所以一律加引號並把引號跳脫，否則對方讀進去會整份錯位。
 */
export function renderCsv(block: ContentBlock): string {
  const escape = (value: string | number | null) =>
    value === null ? '""' : `"${String(value).replace(/"/g, '""')}"`;

  const rows = [
    ["組合", "品名", "料號", "數量", "商品詳情"],
    ...block.items.map((item) => [block.title, item.name, item.sku ?? "", item.quantity, item.details ?? ""]),
  ];

  return rows.map((row) => row.map(escape).join(",")).join("\n");
}
