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

// ──────────────────────────────────────────────────────────── 退貨

export type ReturnAdjustment = {
  /** 退貨率 0 至 1。 */
  returnRate: number;
  /** 退回來的商品能不能再賣。食品、客製品通常不行。 */
  resaleable: boolean;
  /** 回程運費由你負擔嗎。 */
  paysReturnShipping: boolean;
};

/**
 * 把退貨算進去。
 *
 * ⚠️ 退貨**不是一項成本**，它的順序是：先有營收 → 才有退貨 → 營收減少。
 *    所以正確的做法是把營收打折，而不是把退貨當成一筆費用攤進去。
 *
 * 🚫 但成本不會跟著打折：東西已經做出來、也已經寄出去了。
 *    只有在退回來還能再賣的情況下，那一份的製造成本才算回收。
 *    把成本也一起乘 (1−退貨率)，等於假設退貨的東西從來沒被做出來過。
 *
 * 回程運費另計：退一次就多寄一趟，出貨那一趟的錢也拿不回來。
 */
export function computeMarginWithReturns(input: MarginInput, adjustment: ReturnAdjustment): MarginResult {
  const rate = adjustment.returnRate;
  if (!(rate > 0) || rate >= 1) return computeMargin(input);

  const kept = 1 - rate;
  const revenue = input.price * kept;

  // 費用照實收算：通路抽成與稅退貨時多半會退。
  const variableSellingCost = roundTo(revenue * input.variableSellingRate, 4);
  const overheadCost = roundTo(revenue * input.overheadRate, 4);
  // 廣告已經花掉了，不會因為退貨退回來，所以照原本的售價算。
  const adSpendCost = roundTo(input.price * input.adSpendRate, 4);
  const logistics = roundTo(input.logistics * (1 + (adjustment.paysReturnShipping ? rate : 0)), 4);

  const costs = { variableSellingCost, overheadCost, adSpendCost, logistics };

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

  const manufacturing = adjustment.resaleable ? input.manufacturingCost * kept : input.manufacturingCost;
  const gross = revenue - manufacturing;
  const operating = gross - variableSellingCost - logistics;
  const net = operating - overheadCost - adSpendCost;

  return {
    grossContribution: roundTo(gross, 4),
    // 比率一律用原售價當分母，才能跟沒有退貨的版本直接對照。
    grossRate: roundTo(gross / input.price, 6),
    operatingContribution: roundTo(operating, 4),
    operatingRate: roundTo(operating / input.price, 6),
    netProfit: roundTo(net, 4),
    netRate: roundTo(net / input.price, 6),
    ...costs,
  };
}

/**
 * 投報率：這一塊錢的製造成本換回多少淨利。
 *
 * ⚠️ 這是「這個產品該不該砍」的判準，跟淨利率是兩回事。
 *    淨利率高但成本也高的產品，投報率可能還輸給一個薄利多銷的。
 * 🚫 成本為 0 時回 null 而不是無限大：那多半是還沒填成本，不是真的免費。
 */
export function returnOnCost(netProfit: number | null, manufacturingCost: number | null): number | null {
  if (netProfit === null || manufacturingCost === null) return null;
  if (!(manufacturingCost > 0)) return null;
  return roundTo(netProfit / manufacturingCost, 4);
}

// ──────────────────────────────────────────────────────────── 反推售價

export type PriceForProfitInput = {
  /** 想要的單位淨利。 */
  targetProfit: number;
  manufacturingCost: number | null;
  /** 費率合計（變動銷售＋固定分攤＋廣告）。 */
  percentRate: number;
  averageLogistics: number;
  averageOrderValue: number | null;
};

export type PriceSolveResult = { ok: true; price: number } | { ok: false; reason: "NO_COST" | "IMPOSSIBLE" };

/**
 * 反推「要賣多少錢才能達到這個單位淨利」。
 *
 * 淨利 = 售價 − 成本 − 售價×費率 − 物流(售價)
 * 物流是分段的（按比例攤、但以平均運費封頂），所以要分兩段解再檢查落點：
 *
 *   低於平均客單價：物流 = 售價 × k，k = 平均運費 ÷ 平均客單價
 *     售價 = (目標淨利 + 成本) ÷ (1 − 費率 − k)
 *   高於平均客單價：物流固定為平均運費
 *     售價 = (目標淨利 + 成本 + 平均運費) ÷ (1 − 費率)
 *
 * 🚫 分母 ≤ 0 或兩段都解不出落在自己區間的答案時回 IMPOSSIBLE。
 *    費率已經吃掉全部售價時，賣多貴都達不到，回一個大數字會讓人以為只要漲價就好。
 */
export function priceForNetProfit(input: PriceForProfitInput): PriceSolveResult {
  const { targetProfit, manufacturingCost, percentRate, averageLogistics, averageOrderValue } = input;
  if (manufacturingCost === null) return { ok: false, reason: "NO_COST" };

  const solveCapped = (): number | null => {
    const denominator = 1 - percentRate;
    if (denominator <= 0) return null;
    return (targetProfit + manufacturingCost + averageLogistics) / denominator;
  };

  if (averageOrderValue === null || !(averageOrderValue > 0)) {
    const price = solveCapped();
    return price === null || price <= 0 ? { ok: false, reason: "IMPOSSIBLE" } : { ok: true, price: roundTo(price, 2) };
  }

  const k = averageLogistics / averageOrderValue;

  const proportionalDenominator = 1 - percentRate - k;
  if (proportionalDenominator > 0) {
    const price = (targetProfit + manufacturingCost) / proportionalDenominator;
    // 只有落在「還沒攤滿」的區間才算數，否則要用封頂那一段重解。
    if (price > 0 && price <= averageOrderValue) return { ok: true, price: roundTo(price, 2) };
  }

  const capped = solveCapped();
  if (capped !== null && capped > averageOrderValue) return { ok: true, price: roundTo(capped, 2) };

  return { ok: false, reason: "IMPOSSIBLE" };
}

export type PriceForRateInput = {
  /** 目標淨利率 0 至 1。 */
  targetRate: number;
  manufacturingCost: number | null;
  percentRate: number;
  averageLogistics: number;
  averageOrderValue: number | null;
};

/**
 * 反推「要賣多少錢才能達到這個淨利**率**」。
 *
 *   售價×(1−費率) − 成本 − 物流(售價) = 售價×目標率
 *
 * 跟 priceForNetProfit 一樣要分兩段解，因為物流是分段的：
 *   低於平均客單價：售價 = 成本 ÷ (1 − 費率 − k − 目標率)
 *   高於平均客單價：售價 = (成本 + 平均運費) ÷ (1 − 費率 − 目標率)
 *
 * 🚫 分母 ≤ 0 就是 IMPOSSIBLE。費率加上目標率已經吃掉全部售價時，
 *    賣多貴都達不到，回一個大數字會讓人以為只要漲價就好。
 */
export function priceForNetRate(input: PriceForRateInput): PriceSolveResult {
  const { targetRate, manufacturingCost, percentRate, averageLogistics, averageOrderValue } = input;
  if (manufacturingCost === null) return { ok: false, reason: "NO_COST" };

  const solveCapped = (): number | null => {
    const denominator = 1 - percentRate - targetRate;
    if (denominator <= 0) return null;
    return (manufacturingCost + averageLogistics) / denominator;
  };

  if (averageOrderValue === null || !(averageOrderValue > 0)) {
    const price = solveCapped();
    return price === null || price <= 0 ? { ok: false, reason: "IMPOSSIBLE" } : { ok: true, price: roundTo(price, 2) };
  }

  const k = averageLogistics / averageOrderValue;
  const proportionalDenominator = 1 - percentRate - k - targetRate;
  if (proportionalDenominator > 0) {
    const price = manufacturingCost / proportionalDenominator;
    if (price > 0 && price <= averageOrderValue) return { ok: true, price: roundTo(price, 2) };
  }

  const capped = solveCapped();
  if (capped !== null && capped > averageOrderValue) return { ok: true, price: roundTo(capped, 2) };

  return { ok: false, reason: "IMPOSSIBLE" };
}

export type PriceSuggestion = { label: string; targetRate: number; result: PriceSolveResult };

/**
 * 依成本給出高中低三個建議優惠價。
 *
 * ⚠️ 三檔都是**從你自己的安控線往上加**推出來的，不是憑空的行情價。
 *    低的那一檔就是安控線本身：再低就跌破你設定的底線。
 */
export function suggestPrices(input: Omit<PriceForRateInput, "targetRate">, minNetRate: number): PriceSuggestion[] {
  return [
    { label: "低（貼著安控線）", targetRate: minNetRate },
    { label: "中", targetRate: minNetRate + 0.05 },
    { label: "高", targetRate: minNetRate + 0.1 },
  ].map((tier) => ({ ...tier, result: priceForNetRate({ ...input, targetRate: tier.targetRate }) }));
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
 * ⚠️ **折上再折是有順序的，而且順序會改變結果。**
 *    規則按傳進來的順序依序套用，每一條的折扣％都是算在**上一條折完之後的餘額**上。
 *    先折 100 再打九折，跟先打九折再折 100，客人付的錢不一樣。
 *    通路的活動長什麼樣，這裡就要排成什麼樣。
 *
 * 🚫 門檻一律用**原價小計**判斷，不是用折後餘額。
 *    否則第一條折完之後就跌破第二條的門檻，跟通路的實際行為不符。
 * 🚫 折抵不得超過小計（不會倒貼現金），也不會是負數。
 */
export function computeDiscount(rules: readonly PromotionRuleInput[], basket: BasketInput): number {
  let remaining = basket.subtotal;

  for (const rule of rules) {
    const meets =
      rule.trigger === "QUANTITY" ? basket.quantity >= rule.threshold : basket.subtotal >= rule.threshold;
    if (!meets) continue;

    const taken = rule.discount === "PERCENT" ? remaining * rule.value : rule.value;
    remaining = Math.max(remaining - taken, 0);
  }

  return roundTo(Math.min(Math.max(basket.subtotal - remaining, 0), basket.subtotal), 2);
}

export type GiftRuleInput = {
  trigger: "AMOUNT" | "QUANTITY";
  threshold: number;
  /** 每次達標送幾份。 */
  quantity: number;
  /** 可累贈：買到兩倍門檻就送兩次。不可累贈時達標幾次都只送一份。 */
  stackable: boolean;
};

/**
 * 這一籃會送出幾份贈品。
 *
 * ⚠️ 可累贈與不可累贈差很多：滿 1000 送 1 的活動，客人買 5000 時
 *    可累贈要送 5 份，不可累贈只送 1 份。設錯的那一邊會直接吃掉獲利。
 */
export function computeGiftUnits(rules: readonly GiftRuleInput[], basket: BasketInput): number {
  let units = 0;

  for (const rule of rules) {
    if (!(rule.threshold > 0)) continue;
    const basis = rule.trigger === "QUANTITY" ? basket.quantity : basket.subtotal;
    if (basis < rule.threshold) continue;

    units += rule.stackable ? Math.floor(basis / rule.threshold) * rule.quantity : rule.quantity;
  }

  return units;
}

export type PromotionInput = {
  basket: BasketInput;
  rules: readonly PromotionRuleInput[];
  /** 單位變動製造成本。null 代表算不出來。 */
  costPerUnit: number | null;
  /**
   * 贈品的製造成本合計。
   * ⚠️ 贈品沒有營收，所以只有成本這一邊。null 代表贈品成本算不出來。
   */
  giftCost: number | null;
  /** 加價購客人多付的錢。 */
  addOnRevenue: number;
  /** 加價購的製造成本合計。null 代表算不出來。 */
  addOnCost: number | null;
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
  /** 折後實收（主商品）。 */
  netRevenue: number;
  /** 實際收到的錢：折後實收＋加價購。 */
  collected: number;
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

/**
 * 只跟營收有關的費用（變動銷售＋固定分攤＋廣告＋物流）。
 *
 * ⚠️ 加價購的營收要付金流與抽成，也要分攤固定費用，但**不分攤廣告**：
 *    廣告是為了把人帶進來買主商品，加價購是進來之後才發生的，
 *    把廣告攤到它頭上會讓加價購看起來比實際差。
 */
function revenueLinkedCost(mainRevenue: number, addOnRevenue: number, input: PromotionInput): number {
  const total = mainRevenue + addOnRevenue;
  return (
    total * (input.variableSellingRate + input.overheadRate) +
    mainRevenue * input.adSpendRate +
    logisticsCost(total, input.averageLogistics, input.averageOrderValue)
  );
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
  const { basket, rules, costPerUnit, giftCost, addOnRevenue, addOnCost } = input;

  const discount = computeDiscount(rules, basket);
  const netRevenue = roundTo(basket.subtotal - discount, 2);
  const collected = roundTo(netRevenue + addOnRevenue, 2);

  const savedVariableCost = roundTo(
    revenueLinkedCost(basket.subtotal, addOnRevenue, input) - revenueLinkedCost(netRevenue, addOnRevenue, input),
    2,
  );

  // 🚫 任何一段成本未知，整體淨利就是未知。贈品成本沒查到卻照樣算，
  //    等於把贈品當成免費，那正好是活動最容易爆的地方。
  if (costPerUnit === null || giftCost === null || addOnCost === null) {
    return {
      discount,
      netRevenue,
      collected,
      netProfit: null,
      netRate: null,
      profitable: null,
      netProfitAtFullPrice: null,
      savedVariableCost,
    };
  }

  const manufacturing = costPerUnit * basket.quantity + giftCost + addOnCost;
  const netProfit = collected - manufacturing - revenueLinkedCost(netRevenue, addOnRevenue, input);

  return {
    discount,
    netRevenue,
    collected,
    netProfit: roundTo(netProfit, 2),
    // 實收為 0 時淨利率無意義（全額折抵），回 null 而非除以零。
    netRate: collected > 0 ? roundTo(netProfit / collected, 6) : null,
    profitable: netProfit > 0,
    netProfitAtFullPrice: roundTo(
      basket.subtotal + addOnRevenue - manufacturing - revenueLinkedCost(basket.subtotal, addOnRevenue, input),
      2,
    ),
    savedVariableCost,
  };
}

// ──────────────────────────────────────────────────────────── 團購

export type GroupBuyInput = {
  /** 團員的原價小計。 */
  subtotal: number;
  quantity: number;
  costPerUnit: number | null;
  /** 折數 0 至 1。0.9 代表九折。 */
  discount: number;
  /** 團主毛利比例，從團員結帳金額裡抽走。 */
  partnerShare: number;
  /**
   * 這一單的運費由你吸收嗎。
   * ⚠️ 未達免運門檻時運費由團員自付，對你是收支相抵，所以不算你的成本；
   *    達到免運門檻才變成你的成本。這一格設錯，整場團購的損益會差很多。
   */
  absorbsShipping: boolean;
  averageLogistics: number;
  averageOrderValue: number | null;
  variableSellingRate: number;
  overheadRate: number;
  adSpendRate: number;
};

export type GroupBuyResult = {
  /** 團員實際結帳金額。 */
  checkout: number;
  /** 要付給團主的錢。 */
  partnerPayout: number;
  /** 扣掉團主毛利之後，進到你口袋的營收。 */
  yourRevenue: number;
  logistics: number;
  netProfit: number | null;
  netRate: number | null;
  profitable: boolean | null;
};

/**
 * 團購試算。
 *
 * ⚠️ 團主毛利是**從團員結帳金額裡抽走**的，不是額外的行銷費用。
 *    但通路抽成、金流、稅、固定分攤仍然按結帳金額算，
 *    因為那些是照成交金額收的，不會因為你分了一半給團主就少收。
 *
 * 🚫 成本未知時淨利一律 null。團購常常一次出幾百單，
 *    「不知道賺不賺」卻當成有賺，賠起來是等比例放大的。
 */
export function simulateGroupBuy(input: GroupBuyInput): GroupBuyResult {
  const checkout = roundTo(input.subtotal * input.discount, 2);
  const partnerPayout = roundTo(checkout * input.partnerShare, 2);
  const yourRevenue = roundTo(checkout - partnerPayout, 2);
  const logistics = input.absorbsShipping
    ? logisticsCost(checkout, input.averageLogistics, input.averageOrderValue)
    : 0;

  if (input.costPerUnit === null) {
    return { checkout, partnerPayout, yourRevenue, logistics, netProfit: null, netRate: null, profitable: null };
  }

  const percent = input.variableSellingRate + input.overheadRate + input.adSpendRate;
  const netProfit = checkout - partnerPayout - input.costPerUnit * input.quantity - checkout * percent - logistics;

  return {
    checkout,
    partnerPayout,
    yourRevenue,
    logistics,
    netProfit: roundTo(netProfit, 2),
    netRate: checkout > 0 ? roundTo(netProfit / checkout, 6) : null,
    profitable: netProfit > 0,
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
