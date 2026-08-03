// 成本與邊際貢獻的計算核心（純函式，零依賴）。
//
// BOM 滾算、費率合計、邊際貢獻階梯、折扣下限、促銷試算全部由這幾個函式決定。
// 刻意寫成純函式，因此每一條都能用真實數字直接測。
//
// 貫穿的原則：**算不出來就回 null，不要給一個能用的假數字**。
// 成本偏低會讓毛利看起來很好，而看起來很好的錯誤數字最難被發現。

/** 四捨五入到指定位數。避免 (0.075).toFixed(2) === "0.07" 這類浮點誤差。 */
export function roundTo(value: number, digits: number): number {
  const factor = 10 ** digits;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

// ──────────────────────────────────────────────────────────── BOM 滾算

export type BomLineInput = {
  /** 每次產出所需的用量。 */
  quantity: number;
  /** 本位幣單價。null 代表這項物料還沒有價格。 */
  unitCostBase: number | null;
  /** 耗損率 0 至 1（不含 1）。null 視為 0。 */
  scrapRate: number | null;
};

export type BomRollupResult = {
  /** 每單位產出的成本。任一項缺單價時為 null。 */
  unitCost: number | null;
  /** 缺少單價的項目數。 */
  missingCostLines: number;
  /** 有計算到的項目數。 */
  countedLines: number;
};

/**
 * 單項成本 = 用量 ÷ 產出數量 × 單價 ÷ (1 − 耗損率)
 *
 * 🚫 耗損率必須除進去，不是乘上去。
 *    耗損 10% 代表「投入的量只有 90% 變成成品」，因此成本要放大成 1/0.9，
 *    不是 ×1.1。原始試算表 完全沒有把耗損率計入，成本系統性低估。
 */
export function lineCost(line: BomLineInput, outputQuantity: number): number | null {
  if (line.unitCostBase === null) return null;
  if (!(outputQuantity > 0)) return null;

  const scrap = line.scrapRate ?? 0;
  // 耗損率 1 代表投入全部報廢，成本無限大，那是輸入錯誤而非有效設定。
  if (scrap < 0 || scrap >= 1) return null;

  return (line.quantity / outputQuantity) * line.unitCostBase / (1 - scrap);
}

/**
 * 整張 BOM 的單位成本。
 *
 * 🚫 **只要有任一項缺單價，整體回 null，不做部分加總。**
 *    部分加總出來的成本必然偏低，而偏低的成本會讓毛利看起來很好。
 *    呼叫端應顯示「缺 N 項單價」並列出缺哪幾項，讓人去補。
 */
export function rollupBom(lines: readonly BomLineInput[], outputQuantity: number): BomRollupResult {
  let total = 0;
  let missing = 0;
  let counted = 0;

  for (const line of lines) {
    const cost = lineCost(line, outputQuantity);
    if (cost === null) {
      missing += 1;
      continue;
    }
    total += cost;
    counted += 1;
  }

  return {
    unitCost: missing > 0 || lines.length === 0 ? null : roundTo(total, 4),
    missingCostLines: missing,
    countedLines: counted,
  };
}

// ──────────────────────────────────────────────────────────── 費率

export type TaxInput = {
  /** 稅率，台灣營業稅為 0.05。 */
  taxRate: number;
  /** 售價是否含稅。 */
  priceIncludesTax: boolean;
};

/**
 * 售價中的實質稅負佔比。
 *
 * ⚠️ 這正是原始試算表 那個來歷不明的常數 `0.048` 的真身：
 *    台灣營業稅 5%，含稅售價中的稅負佔比 = 0.05 / 1.05 = 4.76% ≈ 0.048。
 * 🚫 不要把 0.048 存進資料庫：那會讓「售價含不含稅」這個前提消失，
 *    日後改成未稅報價時沒有人知道要改哪個數字。
 */
export function effectiveTaxShare({ taxRate, priceIncludesTax }: TaxInput): number {
  if (!(taxRate > 0)) return 0;
  return priceIncludesTax ? taxRate / (1 + taxRate) : taxRate;
}

/**
 * 加權平均費率（金流、退貨等依使用佔比加權）。
 *
 * ⚠️ 佔比總和不必為 1，會自行正規化：使用者只填了主要幾種付款方式時，
 *    不該因為總和是 0.8 就讓平均值憑空低估 20%。
 * 佔比全為 0 或未填時退回簡單平均，那至少是個誠實的估計。
 */
export function weightedRate(entries: readonly { value: number; usageShare: number | null }[]): number {
  if (entries.length === 0) return 0;

  const totalShare = entries.reduce((sum, entry) => sum + (entry.usageShare ?? 0), 0);
  if (totalShare > 0) {
    const weighted = entries.reduce((sum, entry) => sum + entry.value * (entry.usageShare ?? 0), 0);
    return weighted / totalShare;
  }

  return entries.reduce((sum, entry) => sum + entry.value, 0) / entries.length;
}

/**
 * 一筆訂單該攤多少物流。
 *
 * ⚠️ 物流不是固定金額，也不是固定比率，是**比率但有上限**：
 *    以「平均客單價會剛好攤到一筆平均運費」推出每一元營收的運費攤提，
 *    再以**平均運費金額為上限**。
 *
 * 🚫 沒有上限的話，2000 元的商品會攤到 120 元運費，
 *    但你實際上根本沒有花 120 元寄它，那是把不存在的成本算進去。
 * 🚫 反過來，一律用平均運費也不對：200 元的商品扛整筆平均運費，
 *    會讓低價品看起來全部都在虧。
 *
 * averageOrderValue 為 null 時退回「每筆平均運費」，那是沒有客單價資料時
 * 最保守的估法（寧可高估運費，不要低估）。
 */
export function logisticsCost(
  price: number,
  averageLogistics: number,
  averageOrderValue: number | null,
): number {
  if (averageOrderValue === null || !(averageOrderValue > 0)) return averageLogistics;
  if (!(price > 0)) return 0;
  return roundTo(Math.min(price * (averageLogistics / averageOrderValue), averageLogistics), 4);
}

export type PercentRateInput = {
  /** 金流手續費率（加權平均後）。 */
  payment: number;
  /** 通路抽成率。 */
  channel: number;
  /** 稅負佔比。 */
  tax: number;
  /** 固定費用分攤率合計（管理／研發／行銷 ÷ 年營業額）。 */
  overhead: number;
  /** 分潤比例（團購團主毛利等）。 */
  partnerShare: number;
  /** 廣告費佔營收比。未納入時為 0，但呼叫端必須另行標示未納入。 */
  adSpend: number;
};

/**
 * 百分比型費率合計。
 * 這就是原始試算表 的「售固係數」，差別在於每一項都具名、可追溯、可在畫面上改。
 */
export function totalPercentRate(input: PercentRateInput): number {
  return input.payment + input.channel + input.tax + input.overhead + input.partnerShare + input.adSpend;
}

// ──────────────────────────────────────────────────────────── 邊際貢獻階梯

export type MarginInput = {
  /** 售價（單位）。 */
  price: number;
  /** 單位變動製造成本。null 代表 BOM 尚未算得出來。 */
  manufacturingCost: number | null;
  /** 這一筆該攤的物流金額（已由 logisticsCost 算好）。 */
  logistics: number;
  /** 變動銷售費率：金流、通路抽成、稅、分潤。隨售價變動。 */
  variableSellingRate: number;
  /** 固定費用分攤率：年度管銷／研發／行銷 ÷ 年營業額。 */
  overheadRate: number;
  /** 廣告費佔營收比。未納入時為 0，但呼叫端必須另行標示未納入。 */
  adSpendRate: number;
};

export type MarginResult = {
  /** 毛利：售價 − 變動製造成本。 */
  grossContribution: number | null;
  grossRate: number | null;
  /** 微利：毛利再扣掉變動銷售費用與物流。 */
  operatingContribution: number | null;
  operatingRate: number | null;
  /** 淨利：微利再扣掉固定費用分攤與廣告。 */
  netProfit: number | null;
  netRate: number | null;
  /** 各段費用金額，供畫面拆解顯示。成本未知也算得出來，因為它們只跟售價有關。 */
  variableSellingCost: number;
  overheadCost: number;
  adSpendCost: number;
  logistics: number;
};

/**
 * 利潤階梯：毛利 → 微利 → 淨利。
 *
 * ⚠️ 三層要分開看，不能只看第一層。
 *    毛利是美好的，微利是緊張的，淨利是嚇人的。只活在毛利裡就會做出賠錢的活動。
 *
 * 🚫 manufacturingCost 為 null 時三層一律 null，不以 0 代入。
 *    以 0 代入會讓毛利等於售價，是嚴重高估。
 */
export function computeMargin(input: MarginInput): MarginResult {
  const variableSellingCost = roundTo(input.price * input.variableSellingRate, 4);
  const overheadCost = roundTo(input.price * input.overheadRate, 4);
  const adSpendCost = roundTo(input.price * input.adSpendRate, 4);

  const costs = { variableSellingCost, overheadCost, adSpendCost, logistics: input.logistics };

  if (input.manufacturingCost === null || !(input.price > 0)) {
    return {
      grossContribution: null,
      grossRate: null,
      operatingContribution: null,
      operatingRate: null,
      netProfit: null,
      netRate: null,
      ...costs,
    };
  }

  const gross = input.price - input.manufacturingCost;
  const operating = gross - variableSellingCost - input.logistics;
  const net = operating - overheadCost - adSpendCost;

  return {
    grossContribution: roundTo(gross, 4),
    grossRate: roundTo(gross / input.price, 6),
    operatingContribution: roundTo(operating, 4),
    operatingRate: roundTo(operating / input.price, 6),
    netProfit: roundTo(net, 4),
    netRate: roundTo(net / input.price, 6),
    ...costs,
  };
}

// ──────────────────────────────────────────────────────────── 折扣下限

export type FloorPriceInput = {
  manufacturingCost: number | null;
  fixedPerOrderCost: number;
  percentRate: number;
  /** 期望的單位邊際貢獻率 0 至 1。 */
  targetContributionRate: number;
};

export type FloorPriceResult =
  | { ok: true; floorPrice: number }
  | { ok: false; reason: "NO_COST" | "IMPOSSIBLE" };

/**
 * 達到期望邊際貢獻率所需的最低售價。
 *
 *   售價 × (1 − 費率) − 製造成本 − 固定費用 = 售價 × 期望貢獻率
 *   ⇒ 售價 = (製造成本 + 固定費用) ÷ (1 − 費率 − 期望貢獻率)
 *
 * 🚫 分母 ≤ 0 時**無解**，必須回 IMPOSSIBLE。
 *    那代表費率合計加上期望貢獻率已經吃掉全部售價，賣多貴都達不到。
 *    此時回一個很大的數字會讓人以為「只要賣夠貴就好」，那是錯的。
 */
export function floorPrice(input: FloorPriceInput): FloorPriceResult {
  if (input.manufacturingCost === null) return { ok: false, reason: "NO_COST" };

  const denominator = 1 - input.percentRate - input.targetContributionRate;
  if (denominator <= 0) return { ok: false, reason: "IMPOSSIBLE" };

  return {
    ok: true,
    floorPrice: roundTo((input.manufacturingCost + input.fixedPerOrderCost) / denominator, 2),
  };
}

// ──────────────────────────────────────────────────────────── 促銷試算

export type PromotionRuleInput = {
  trigger: "AMOUNT" | "QUANTITY" | "COUPON";
  discount: "FIXED" | "PERCENT";
  /** AMOUNT／COUPON 為金額門檻，QUANTITY 為件數門檻。 */
  threshold: number;
  /** FIXED 為折抵金額，PERCENT 為折扣率 0 至 1。 */
  value: number;
};

export type BasketInput = {
  /** 原價小計。 */
  subtotal: number;
  /** 件數。 */
  quantity: number;
};

/**
 * 算出一組促銷規則對這一籃商品的折抵金額。
 *
 * ⚠️ 多條規則採**加總**而非取最優：實務上滿額折加優惠券是可以疊加的，
 *    要互斥請設計成不同的情境分別試算。
 * 🚫 折抵不得超過小計（不會倒貼現金），也不會是負數。
 */
export function computeDiscount(rules: readonly PromotionRuleInput[], basket: BasketInput): number {
  let discount = 0;

  for (const rule of rules) {
    const meets =
      rule.trigger === "QUANTITY" ? basket.quantity >= rule.threshold : basket.subtotal >= rule.threshold;
    if (!meets) continue;

    discount += rule.discount === "PERCENT" ? basket.subtotal * rule.value : rule.value;
  }

  return roundTo(Math.min(Math.max(discount, 0), basket.subtotal), 2);
}

export type PromotionInput = {
  basket: BasketInput;
  rules: readonly PromotionRuleInput[];
  /** 單位變動製造成本。null 代表算不出來。 */
  costPerUnit: number | null;
  /** 每筆平均運費，同時是攤提上限。 */
  averageLogistics: number;
  averageOrderValue: number | null;
  variableSellingRate: number;
  overheadRate: number;
  adSpendRate: number;
};

export type PromotionResult = {
  /** 折抵金額。 */
  discount: number;
  /** 折後實收。 */
  netRevenue: number;
  /** 折後淨利。成本未知時為 null。 */
  netProfit: number | null;
  netRate: number | null;
  /** 折後是否仍有淨利。成本未知時為 null。 */
  profitable: boolean | null;
  /** 原價時的淨利，供對照。成本未知時為 null。 */
  netProfitAtFullPrice: number | null;
  /**
   * 因為降價而「少付」的費用。
   * ⚠️ 這是活動看起來變好賺的主要來源之一，不是銷量變好。
   */
  savedVariableCost: number;
};

/** 只跟營收有關的費用合計（變動銷售＋固定分攤＋廣告＋物流）。 */
function revenueLinkedCost(revenue: number, input: PromotionInput): number {
  const percent = input.variableSellingRate + input.overheadRate + input.adSpendRate;
  return revenue * percent + logisticsCost(revenue, input.averageLogistics, input.averageOrderValue);
}

/**
 * 促銷情境試算：這樣打折之後還剩多少。
 *
 * ⚠️ 折價之後，**變動製造成本不變，但變動銷售費用與固定費用分攤都會跟著變少**，
 *    因為它們是按售價算的。所以有些活動打到骨折反而不會爆掉。
 * 🚫 但那不代表活動成功：多出來的錢是「少付的費用」不是「多賣的量」。
 *    因此一定要把 savedVariableCost 顯示出來，不能只給一個變好看的淨利。
 *
 * 🚫 成本未知時 netProfit 與 profitable 一律 null，不得回 true。
 *    「不知道賺不賺」與「確定有賺」是完全不同的事。
 */
export function simulatePromotion(input: PromotionInput): PromotionResult {
  const { basket, rules, costPerUnit } = input;

  const discount = computeDiscount(rules, basket);
  const netRevenue = roundTo(basket.subtotal - discount, 2);

  const savedVariableCost = roundTo(
    revenueLinkedCost(basket.subtotal, input) - revenueLinkedCost(netRevenue, input),
    2,
  );

  if (costPerUnit === null) {
    return {
      discount,
      netRevenue,
      netProfit: null,
      netRate: null,
      profitable: null,
      netProfitAtFullPrice: null,
      savedVariableCost,
    };
  }

  const manufacturing = costPerUnit * basket.quantity;
  const netProfit = netRevenue - manufacturing - revenueLinkedCost(netRevenue, input);

  return {
    discount,
    netRevenue,
    netProfit: roundTo(netProfit, 2),
    // 實收為 0 時淨利率無意義（全額折抵），回 null 而非除以零。
    netRate: netRevenue > 0 ? roundTo(netProfit / netRevenue, 6) : null,
    profitable: netProfit > 0,
    netProfitAtFullPrice: roundTo(basket.subtotal - manufacturing - revenueLinkedCost(basket.subtotal, input), 2),
    savedVariableCost,
  };
}

/**
 * 單位成本的顯示格式。
 *
 * ⚠️ 刻意**不用** `formatCurrency`：那個是給訂單金額用的，四捨五入到整數元。
 *    單位成本經常是小數（每 ml 0.0375、配方成本 1.234），用整數顯示會讓
 *    1.234 變成 $1，使用者拿去對自己的試算表會以為系統算錯。
 *    這也會讓「特地把欄位精度提高到小數四位」這件事在畫面上完全消失。
 *
 * 小數位數依數值大小調整：金額大時多餘的小數只是雜訊，金額小時每一位都重要。
 */
export function formatUnitCost(value: number | null | undefined, currency = "NT$"): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "－";
  const abs = Math.abs(value);
  const digits = abs === 0 ? 0 : abs < 1 ? 4 : abs < 100 ? 3 : 2;
  return `${currency}${value.toLocaleString("zh-TW", {
    minimumFractionDigits: 0,
    maximumFractionDigits: digits,
  })}`;
}
