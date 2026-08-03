// 把 Doc 裡零散的設定，收斂成計算層要的幾個數字。
//
// 計算本身在 costing.ts（純函式），這裡只做取數與組裝。

import {
  computeMargin,
  effectiveTaxShare,
  floorPrice,
  logisticsCost,
  rollupBom,
  totalPercentRate,
  weightedRate,
  type BomLineInput,
  type MarginResult,
} from "./costing";
import type { BomLine, Doc, Material, Product, Rate, Variant } from "./doc";

/** 物料單價換算成本位幣。幣別相同時匯率視為 1，不強迫使用者填。 */
export function unitCostBase(material: Material, baseCurrency: string): number | null {
  if (material.unitCost === null) return null;
  if (!material.currency || material.currency === baseCurrency) return material.unitCost;
  if (material.fxRate === null || !(material.fxRate > 0)) return null;
  return material.unitCost * material.fxRate;
}

/**
 * 母規格 BOM 疊上子規格差異。
 *
 * 同一項物料由子規格覆蓋用量，用量 0 代表這個規格不用它。
 * ⚠️ 用量 ≤ 0 的項目一律濾掉，不是留著算 0：
 *    留著的話，一項「不使用而且還沒問到價」的物料會讓整張 BOM 變成未知，
 *    但它其實根本不影響成本。
 */
export function effectiveLines(product: Product, variant: Variant | null): BomLine[] {
  const base = product.lines;
  if (!variant) return base.filter((line) => line.quantity > 0);

  const override = new Map(variant.lines.map((line) => [line.materialId, line]));
  const merged = base.map((line) => override.get(line.materialId) ?? line);
  for (const line of variant.lines) {
    if (!base.some((item) => item.materialId === line.materialId)) merged.push(line);
  }
  return merged.filter((line) => line.quantity > 0);
}

export type ProductCost = {
  unitCost: number | null;
  /** 依分類拆解，對應原始試算表的「配方／包裝／組裝／模治具」四段。 */
  byCategory: { categoryId: string; categoryName: string; cost: number | null }[];
  /** 缺單價的物料名稱。只要有一項，整張 BOM 就算不出成本。 */
  missing: string[];
  lineCount: number;
};

export function computeProductCost(doc: Doc, product: Product, variant: Variant | null = null): ProductCost {
  const byId = new Map(doc.materials.map((material) => [material.id, material]));
  const catById = new Map(doc.categories.map((category) => [category.id, category]));

  const inputs: BomLineInput[] = [];
  const missing: string[] = [];
  const groups = new Map<string, { name: string; lines: BomLineInput[] }>();

  for (const line of effectiveLines(product, variant)) {
    const material = byId.get(line.materialId);
    if (!material) continue;
    const base = unitCostBase(material, doc.settings.baseCurrency);
    if (base === null) missing.push(material.name);

    const input: BomLineInput = { quantity: line.quantity, unitCostBase: base, scrapRate: material.scrapRate };
    inputs.push(input);

    const category = catById.get(material.categoryId);
    const key = category?.id ?? "unknown";
    const group = groups.get(key) ?? { name: category?.name ?? "未分類", lines: [] };
    group.lines.push(input);
    groups.set(key, group);
  }

  const overall = rollupBom(inputs, product.outputQuantity);

  return {
    unitCost: overall.unitCost,
    byCategory: [...groups.entries()].map(([categoryId, group]) => ({
      categoryId,
      categoryName: group.name,
      cost: rollupBom(group.lines, product.outputQuantity).unitCost,
    })),
    missing,
    lineCount: inputs.length,
  };
}

export type AdSpend = { rate: number; included: boolean; note: string | null };

/**
 * 廣告費。
 * 🚫 未納入時 rate 為 0，但呼叫端**必須**顯示 note，否則使用者會以為廣告費已經算進去了。
 */
export function resolveAdSpend(doc: Doc): AdSpend {
  if (doc.settings.adSpendMode === "ESTIMATE" && doc.settings.adSpendRate !== null) {
    return { rate: doc.settings.adSpendRate, included: true, note: `廣告費為手動預估值，不是實際投放資料。` };
  }
  return { rate: 0, included: false, note: "未納入廣告費，下方數字為未扣廣告成本的結果。" };
}

export type Rates = {
  payment: number;
  overhead: number;
  tax: number;
  /** 每筆固定型費用（物流）。 */
  logistics: number;
  returnRate: number;
  channels: Rate[];
};

/**
 * ⚠️ 物流是**每筆固定金額**不是比率，因此與百分比型費率分開。
 *    把它當比率會讓高單價商品的物流成本被高估數十倍。
 */
export function deriveRates(doc: Doc): Rates {
  const of = (kind: Rate["kind"]) => doc.rates.filter((rate) => rate.kind === kind);
  const asEntries = (rates: Rate[]) => rates.map((rate) => ({ value: rate.value, usageShare: rate.usageShare }));

  return {
    payment: weightedRate(asEntries(of("PAYMENT"))),
    // 固定費用分攤是各項相加（管理＋研發＋行銷），不是加權平均。
    overhead: of("OVERHEAD").reduce((sum, rate) => sum + rate.value, 0),
    tax: effectiveTaxShare({ taxRate: doc.settings.taxRate, priceIncludesTax: doc.settings.priceIncludesTax }),
    logistics: weightedRate(
      of("LOGISTICS").map((rate) => ({
        value: rate.value + (rate.packagingCost ?? 0) + (rate.handlingCost ?? 0),
        usageShare: rate.usageShare,
      })),
    ),
    returnRate: weightedRate(asEntries(of("RETURN"))),
    channels: of("CHANNEL"),
  };
}

/**
 * 費率拆成三段。
 *
 * ⚠️ 分段不是為了好看，是因為它們的意義完全不同：
 *    變動銷售是「賣一筆就付一筆」，固定分攤是「本來就要付、只是分攤到這一筆」。
 *    折價時兩者都會變少，但只有前者是真的省下來的現金。
 */
export type RateBreakdown = {
  /** 金流＋通路抽成＋稅＋分潤。 */
  variableSelling: number;
  /** 固定費用分攤。 */
  overhead: number;
  /** 廣告。 */
  adSpend: number;
  /** 三段合計。 */
  total: number;
};

export function rateBreakdownFor(doc: Doc, channelId: string | null, partnerShare = 0): RateBreakdown {
  const rates = deriveRates(doc);
  const channel = channelId ? rates.channels.find((rate) => rate.id === channelId) : undefined;
  const adSpend = resolveAdSpend(doc).rate;

  const variableSelling = rates.payment + (channel?.value ?? 0) + rates.tax + partnerShare;

  return {
    variableSelling,
    overhead: rates.overhead,
    adSpend,
    total: totalPercentRate({
      payment: rates.payment,
      channel: channel?.value ?? 0,
      tax: rates.tax,
      overhead: rates.overhead,
      partnerShare,
      adSpend,
    }),
  };
}

export function percentRateFor(doc: Doc, channelId: string | null, partnerShare = 0): number {
  return rateBreakdownFor(doc, channelId, partnerShare).total;
}

/**
 * 一個「可以定價的東西」。沒有規格的商品自己就是一個，有規格的則每個子規格各算一個。
 * 這樣邊際貢獻與促銷試算都只要對付同一種東西，不必到處判斷有沒有規格。
 */
export type PricedItem = {
  /** 母規格 id 或「母規格 id:子規格 id」。用來當 React key 與下拉選單的值。 */
  key: string;
  product: Product;
  variant: Variant | null;
  /** 顯示名稱。有規格時是「商品-規格」，與一般電商的 SKU 命名一致。 */
  name: string;
  sku: string | null;
  /** 子規格沒填售價時沿用母規格。 */
  price: number | null;
};

export function listPricedItems(doc: Doc): PricedItem[] {
  return doc.products.flatMap((product): PricedItem[] => {
    if (product.variants.length === 0) {
      return [{ key: product.id, product, variant: null, name: product.name, sku: product.sku, price: product.price }];
    }
    return product.variants.map((variant) => ({
      key: `${product.id}:${variant.id}`,
      product,
      variant,
      name: `${product.name}-${variant.name}`,
      sku: variant.sku ?? product.sku,
      price: variant.price ?? product.price,
    }));
  });
}

export function findPricedItem(doc: Doc, key: string | null): PricedItem | null {
  return key === null ? null : (listPricedItems(doc).find((item) => item.key === key) ?? null);
}

export type ProductMargin = {
  item: PricedItem;
  cost: ProductCost;
  margin: MarginResult;
  floor: ReturnType<typeof floorPrice>;
};

export function computeProductMargins(doc: Doc, channelId: string | null, targetRate: number): ProductMargin[] {
  const rates = deriveRates(doc);
  const breakdown = rateBreakdownFor(doc, channelId);

  return listPricedItems(doc).map((item) => {
    const cost = computeProductCost(doc, item.product, item.variant);
    const price = item.price ?? 0;
    // 物流按營收比例攤，但以每筆平均運費為上限。
    const logistics = logisticsCost(price, rates.logistics, doc.settings.averageOrderValue);

    return {
      item,
      cost,
      margin: computeMargin({
        price,
        manufacturingCost: cost.unitCost,
        logistics,
        variableSellingRate: breakdown.variableSelling,
        overheadRate: breakdown.overhead,
        adSpendRate: breakdown.adSpend,
      }),
      floor: floorPrice({
        manufacturingCost: cost.unitCost,
        // 下限是「多低才不行」，物流用整筆平均運費是保守的一邊，寧可算貴不要算便宜。
        fixedPerOrderCost: rates.logistics,
        percentRate: breakdown.total,
        targetContributionRate: targetRate,
      }),
    };
  });
}
