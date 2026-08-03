// 成本計算核心測試。
//
// 這些數字決定定價與促銷決策，算錯的代價是實際虧錢，因此逐條釘住。
// 特別針對原始試算表的兩個缺陷：耗損率未計入成本、營業稅被寫死成 0.048。
import { describe, expect, it } from "vitest";
import {
  computeDiscount,
  computeMargin,
  computeMarginWithReturns,
  effectiveTaxShare,
  floorPrice,
  lineCost,
  logisticsCost,
  priceForNetProfit,
  returnOnCost,
  rollupBom,
  simulateGroupBuy,
  simulatePromotion,
  totalPercentRate,
  weightedRate,
} from "../costing";

const line = (quantity: number, unitCostBase: number | null, scrapRate: number | null = null) => ({
  quantity,
  unitCostBase,
  scrapRate,
});

describe("耗損率（原始試算表 的缺陷）", () => {
  it("🚫 耗損率是除進去不是乘上去", () => {
    // 耗損 10% 代表投入只有 90% 變成成品，成本放大成 1/0.9，不是 ×1.1。
    expect(lineCost(line(1, 100, 0.1), 1)).toBeCloseTo(111.111, 3);
    expect(lineCost(line(1, 100, 0.1), 1)).not.toBeCloseTo(110, 3);
  });

  it("耗損率為 null 或 0 時不影響成本", () => {
    expect(lineCost(line(2, 50, null), 1)).toBe(100);
    expect(lineCost(line(2, 50, 0), 1)).toBe(100);
  });

  it("🚫 耗損率 1 是輸入錯誤（成本無限大），回 null 而非 Infinity", () => {
    expect(lineCost(line(1, 100, 1), 1)).toBeNull();
    expect(lineCost(line(1, 100, 1.5), 1)).toBeNull();
    expect(lineCost(line(1, 100, -0.1), 1)).toBeNull();
  });
});

describe("產出數量", () => {
  it("一鍋做 500 支時，用量要除以產出數", () => {
    // 一鍋用 1000ml 基底做 500 支 → 每支 2ml。
    expect(lineCost(line(1000, 0.5), 500)).toBe(1);
  });

  it("🚫 產出數量為 0 時回 null，不得除以零", () => {
    expect(lineCost(line(1, 100), 0)).toBeNull();
    expect(lineCost(line(1, 100), -1)).toBeNull();
  });
});

describe("BOM 滾算", () => {
  it("全部有單價時加總", () => {
    const result = rollupBom([line(2, 30), line(1, 50)], 1);
    expect(result.unitCost).toBe(110);
    expect(result.missingCostLines).toBe(0);
    expect(result.countedLines).toBe(2);
  });

  it("🚫 任一項缺單價則整體為 null，不做部分加總", () => {
    // 部分加總必然偏低，而偏低的成本會讓毛利看起來很好。
    const result = rollupBom([line(1, 30), line(1, null)], 1);
    expect(result.unitCost).toBeNull();
    expect(result.missingCostLines).toBe(1);
    expect(result.countedLines).toBe(1);
  });

  it("空 BOM 為 null 而非 0（沒有配方不等於免費）", () => {
    expect(rollupBom([], 1).unitCost).toBeNull();
  });

  it("單價 0 是有效資料，不等於缺單價", () => {
    const result = rollupBom([line(1, 0)], 1);
    expect(result.unitCost).toBe(0);
    expect(result.missingCostLines).toBe(0);
  });
});

describe("營業稅（原始試算表 寫死的 0.048）", () => {
  it("含稅售價的稅負佔比 = 稅率 ÷ (1+稅率)，正是那個 0.048", () => {
    expect(effectiveTaxShare({ taxRate: 0.05, priceIncludesTax: true })).toBeCloseTo(0.047619, 6);
  });

  it("未稅售價時稅負佔比就是稅率本身", () => {
    expect(effectiveTaxShare({ taxRate: 0.05, priceIncludesTax: false })).toBe(0.05);
  });

  it("🚫 兩者不得相同（這正是寫死 0.048 會丟失的資訊）", () => {
    const inclusive = effectiveTaxShare({ taxRate: 0.05, priceIncludesTax: true });
    const exclusive = effectiveTaxShare({ taxRate: 0.05, priceIncludesTax: false });
    expect(inclusive).not.toBe(exclusive);
  });

  it("稅率 0 時為 0", () => {
    expect(effectiveTaxShare({ taxRate: 0, priceIncludesTax: true })).toBe(0);
  });
});

describe("加權平均費率", () => {
  it("依使用佔比加權", () => {
    const rate = weightedRate([
      { value: 0.018, usageShare: 0.5 },
      { value: 0.023, usageShare: 0.5 },
    ]);
    expect(rate).toBeCloseTo(0.0205, 6);
  });

  it("🚫 佔比總和不為 1 時要正規化，不得讓平均值憑空低估", () => {
    // 只填了兩種付款方式共 0.8，平均值不該因此被打八折。
    const rate = weightedRate([
      { value: 0.02, usageShare: 0.4 },
      { value: 0.02, usageShare: 0.4 },
    ]);
    expect(rate).toBeCloseTo(0.02, 6);
  });

  it("完全沒填佔比時退回簡單平均", () => {
    expect(weightedRate([{ value: 0.01, usageShare: null }, { value: 0.03, usageShare: null }])).toBe(0.02);
  });

  it("空清單為 0", () => {
    expect(weightedRate([])).toBe(0);
  });
});

describe("利潤階梯：毛利 → 微利 → 淨利", () => {
  // 變動銷售 6%（金流＋通路＋稅）、固定分攤 3%、廣告 1%，合計 10%。
  const base = { price: 1000, logistics: 60, variableSellingRate: 0.06, overheadRate: 0.03, adSpendRate: 0.01 };

  it("三層分別計算", () => {
    const result = computeMargin({ ...base, manufacturingCost: 300 });

    expect(result.grossContribution).toBe(700);
    // 微利：700 − 1000×0.06 − 60 = 580
    expect(result.operatingContribution).toBe(580);
    // 淨利：580 − 1000×0.03 − 1000×0.01 = 540
    expect(result.netProfit).toBe(540);
    expect(result.netRate).toBeCloseTo(0.54, 6);
  });

  it("⚠️ 毛利好看不代表淨利好看，三層一定會越來越小", () => {
    const result = computeMargin({ ...base, manufacturingCost: 300 });
    expect(result.grossContribution!).toBeGreaterThan(result.operatingContribution!);
    expect(result.operatingContribution!).toBeGreaterThan(result.netProfit!);
  });

  it("🚫 成本未知時三層都是 null，不以 0 代入", () => {
    // 以 0 代入會讓毛利等於售價，是嚴重高估。
    const result = computeMargin({ ...base, manufacturingCost: null });
    expect(result.grossContribution).toBeNull();
    expect(result.operatingContribution).toBeNull();
    expect(result.netProfit).toBeNull();
    expect(result.netRate).toBeNull();
  });

  it("費用金額不需要成本就算得出來（只跟售價有關）", () => {
    const result = computeMargin({ ...base, manufacturingCost: null });
    expect(result.variableSellingCost).toBe(60);
    expect(result.overheadCost).toBe(30);
    expect(result.adSpendCost).toBe(10);
  });

  it("淨利可為負（成本高於售價）", () => {
    expect(computeMargin({ ...base, manufacturingCost: 1200 }).netProfit).toBeLessThan(0);
  });

  it("售價 0 時回 null 而非除以零", () => {
    expect(computeMargin({ ...base, price: 0, manufacturingCost: 100 }).netRate).toBeNull();
  });
});

describe("物流攤提上限（原始試算表的 M25 規則）", () => {
  it("售價等於平均客單價時，剛好攤到一筆平均運費", () => {
    expect(logisticsCost(1000, 80, 1000)).toBe(80);
  });

  it("🚫 高價商品不得攤超過平均運費：你根本沒花那麼多錢寄它", () => {
    // 沒有上限的話 2000 元商品會攤到 160，但實際平均運費就是 80。
    expect(logisticsCost(2000, 80, 1000)).toBe(80);
    expect(logisticsCost(20000, 80, 1000)).toBe(80);
  });

  it("低價商品按比例少攤，不必扛整筆平均運費", () => {
    expect(logisticsCost(200, 80, 1000)).toBe(16);
  });

  it("沒有客單價資料時退回每筆平均運費（寧可高估運費也不要低估）", () => {
    expect(logisticsCost(200, 80, null)).toBe(80);
    expect(logisticsCost(200, 80, 0)).toBe(80);
  });
});

describe("折扣下限", () => {
  it("反推達到期望貢獻率的最低售價", () => {
    // (300 + 60) / (1 − 0.1 − 0.2) = 360 / 0.7 = 514.29
    const result = floorPrice({
      manufacturingCost: 300,
      fixedPerOrderCost: 60,
      percentRate: 0.1,
      targetContributionRate: 0.2,
    });
    expect(result.ok && result.floorPrice).toBeCloseTo(514.29, 2);
  });

  it("算出來的下限確實達到期望貢獻率（自洽檢查）", () => {
    const input = { manufacturingCost: 300, fixedPerOrderCost: 60, percentRate: 0.1, targetContributionRate: 0.2 };
    const result = floorPrice(input);
    if (!result.ok) throw new Error("預期有解");
    const margin = computeMargin({
      price: result.floorPrice,
      manufacturingCost: input.manufacturingCost,
      logistics: input.fixedPerOrderCost,
      variableSellingRate: input.percentRate,
      overheadRate: 0,
      adSpendRate: 0,
    });
    expect(margin.netRate).toBeCloseTo(0.2, 4);
  });

  it("🚫 費率吃掉全部售價時無解，不得回一個很大的數字", () => {
    // 回大數字會讓人以為「只要賣夠貴就好」，那是錯的。
    const result = floorPrice({
      manufacturingCost: 300,
      fixedPerOrderCost: 60,
      percentRate: 0.7,
      targetContributionRate: 0.35,
    });
    expect(result).toEqual({ ok: false, reason: "IMPOSSIBLE" });
  });

  it("成本未知時明確回 NO_COST", () => {
    const result = floorPrice({
      manufacturingCost: null,
      fixedPerOrderCost: 60,
      percentRate: 0.1,
      targetContributionRate: 0.2,
    });
    expect(result).toEqual({ ok: false, reason: "NO_COST" });
  });
});

describe("反推售價", () => {
  const base = {
    manufacturingCost: 300,
    percentRate: 0.2,
    averageLogistics: 60,
    averageOrderValue: null as number | null,
  };

  it("沒有客單價資料時，物流固定，一次方程式解得出來", () => {
    // (100 + 300 + 60) / (1 − 0.2) = 575
    const result = priceForNetProfit({ ...base, targetProfit: 100 });
    expect(result.ok && result.price).toBe(575);
  });

  it("反推出來的售價確實達到目標淨利（自洽檢查）", () => {
    const result = priceForNetProfit({ ...base, targetProfit: 100 });
    if (!result.ok) throw new Error("預期有解");

    const margin = computeMargin({
      price: result.price,
      manufacturingCost: base.manufacturingCost,
      logistics: logisticsCost(result.price, base.averageLogistics, base.averageOrderValue),
      variableSellingRate: base.percentRate,
      overheadRate: 0,
      adSpendRate: 0,
    });
    expect(margin.netProfit).toBeCloseTo(100, 2);
  });

  it("有客單價時要挑對物流那一段（低於客單價走按比例）", () => {
    const input = { ...base, averageOrderValue: 2000, targetProfit: 100 };
    const result = priceForNetProfit(input);
    if (!result.ok) throw new Error("預期有解");

    // 解出來的售價低於客單價，物流還沒攤滿，驗證它自洽。
    expect(result.price).toBeLessThan(2000);
    const margin = computeMargin({
      price: result.price,
      manufacturingCost: input.manufacturingCost,
      logistics: logisticsCost(result.price, input.averageLogistics, input.averageOrderValue),
      variableSellingRate: input.percentRate,
      overheadRate: 0,
      adSpendRate: 0,
    });
    expect(margin.netProfit).toBeCloseTo(100, 2);
  });

  it("目標很高時落到封頂那一段，一樣要自洽", () => {
    const input = { ...base, averageOrderValue: 500, targetProfit: 800 };
    const result = priceForNetProfit(input);
    if (!result.ok) throw new Error("預期有解");

    expect(result.price).toBeGreaterThan(500);
    const margin = computeMargin({
      price: result.price,
      manufacturingCost: input.manufacturingCost,
      logistics: logisticsCost(result.price, input.averageLogistics, input.averageOrderValue),
      variableSellingRate: input.percentRate,
      overheadRate: 0,
      adSpendRate: 0,
    });
    expect(margin.netProfit).toBeCloseTo(800, 2);
  });

  it("🚫 費率吃掉全部售價時無解，不得回一個很大的數字", () => {
    expect(priceForNetProfit({ ...base, percentRate: 1.2, targetProfit: 100 })).toEqual({
      ok: false,
      reason: "IMPOSSIBLE",
    });
  });

  it("成本未知時明確回 NO_COST", () => {
    expect(priceForNetProfit({ ...base, manufacturingCost: null, targetProfit: 100 })).toEqual({
      ok: false,
      reason: "NO_COST",
    });
  });
});

describe("促銷折抵", () => {
  const basket = { subtotal: 2000, quantity: 3 };

  it("滿額折現", () => {
    expect(computeDiscount([{ trigger: "AMOUNT", discount: "FIXED", threshold: 1000, value: 200 }], basket)).toBe(200);
  });

  it("滿額折％", () => {
    expect(computeDiscount([{ trigger: "AMOUNT", discount: "PERCENT", threshold: 1000, value: 0.1 }], basket)).toBe(200);
  });

  it("滿件門檻看件數不看金額", () => {
    const rule = { trigger: "QUANTITY" as const, discount: "FIXED" as const, threshold: 5, value: 100 };
    expect(computeDiscount([rule], basket)).toBe(0);
    expect(computeDiscount([rule], { subtotal: 100, quantity: 5 })).toBe(100);
  });

  it("未達門檻不折抵", () => {
    expect(computeDiscount([{ trigger: "AMOUNT", discount: "FIXED", threshold: 5000, value: 200 }], basket)).toBe(0);
  });

  it("折上再折：後面的％算在前面折完的餘額上", () => {
    // 先折 200 剩 1800，再折 5% 是 90，合計 290 而不是 300。
    const discount = computeDiscount(
      [
        { trigger: "AMOUNT", discount: "FIXED", threshold: 1000, value: 200 },
        { trigger: "COUPON", discount: "PERCENT", threshold: 1000, value: 0.05 },
      ],
      basket,
    );
    expect(discount).toBe(290);
  });

  it("⚠️ 順序會改變結果：先折現跟先折％不一樣", () => {
    const fixedFirst = computeDiscount(
      [
        { trigger: "AMOUNT", discount: "FIXED", threshold: 1000, value: 200 },
        { trigger: "COUPON", discount: "PERCENT", threshold: 1000, value: 0.05 },
      ],
      basket,
    );
    const percentFirst = computeDiscount(
      [
        { trigger: "COUPON", discount: "PERCENT", threshold: 1000, value: 0.05 },
        { trigger: "AMOUNT", discount: "FIXED", threshold: 1000, value: 200 },
      ],
      basket,
    );
    // 先折％：2000×5% = 100，再折 200，合計 300。
    expect(percentFirst).toBe(300);
    expect(fixedFirst).not.toBe(percentFirst);
  });

  it("🚫 門檻用原價小計判斷，不是用折後餘額", () => {
    // 先折 1200 剩 800，第二條的門檻 1000 仍然算達標，因為原價是 2000。
    const discount = computeDiscount(
      [
        { trigger: "AMOUNT", discount: "FIXED", threshold: 1000, value: 1200 },
        { trigger: "AMOUNT", discount: "FIXED", threshold: 1000, value: 100 },
      ],
      basket,
    );
    expect(discount).toBe(1300);
  });

  it("🚫 折抵不得超過小計（不會倒貼現金）", () => {
    const discount = computeDiscount(
      [{ trigger: "AMOUNT", discount: "FIXED", threshold: 100, value: 99999 }],
      basket,
    );
    expect(discount).toBe(2000);
  });
});

describe("促銷試算", () => {
  const rules = [{ trigger: "AMOUNT" as const, discount: "PERCENT" as const, threshold: 1000, value: 0.2 }];
  const base = {
    basket: { subtotal: 2000, quantity: 2 },
    rules,
    costPerUnit: 300 as number | null,
    giftCost: 0 as number | null,
    addOnRevenue: 0,
    addOnCost: 0 as number | null,
    averageLogistics: 60,
    // 沒有客單價資料，物流固定 60，方便手算對照。
    averageOrderValue: null,
    variableSellingRate: 0.06,
    overheadRate: 0.03,
    adSpendRate: 0.01,
  };

  it("折後仍有淨利時標為 profitable", () => {
    const result = simulatePromotion(base);
    expect(result.discount).toBe(400);
    expect(result.netRevenue).toBe(1600);
    // 1600 − 300×2 − 1600×0.1 − 60 = 780
    expect(result.netProfit).toBe(780);
    expect(result.profitable).toBe(true);
  });

  it("⚠️ 要能看出「多賺的部分來自少付的費用」", () => {
    // 這是做活動最常見的誤會：以為是銷量變好，其實是按售價算的費用變少了。
    const result = simulatePromotion(base);
    // 少收 400 元營收，按售價算的費用就少付 400×10% = 40。
    expect(result.savedVariableCost).toBe(40);
    // 原價淨利 2000 − 600 − 200 − 60 = 1140，折後 780，實際少賺 360 而不是少賺 400。
    expect(result.netProfitAtFullPrice).toBe(1140);
    expect(result.netProfitAtFullPrice! - result.netProfit!).toBe(360);
  });

  it("折太多會變負淨利", () => {
    const deep = [{ trigger: "AMOUNT" as const, discount: "PERCENT" as const, threshold: 1000, value: 0.8 }];
    expect(simulatePromotion({ ...base, rules: deep }).profitable).toBe(false);
  });

  it("贈品只算製造成本，沒有營收", () => {
    // 送一份成本 80 的贈品，淨利就少 80，實收不變。
    const result = simulatePromotion({ ...base, giftCost: 80 });
    expect(result.netRevenue).toBe(1600);
    expect(result.netProfit).toBe(700);
  });

  it("🚫 贈品成本未知時整體淨利也未知，不能把贈品當免費", () => {
    const result = simulatePromotion({ ...base, giftCost: null });
    expect(result.netProfit).toBeNull();
    expect(result.profitable).toBeNull();
  });

  it("加價購有營收也有成本，而且不分攤廣告", () => {
    // 加價購 200 元、成本 50。廣告率 0 的情況下先確認基本收支。
    const result = simulatePromotion({ ...base, addOnRevenue: 200, addOnCost: 50 });
    expect(result.collected).toBe(1800);
    // 費用：1800×(0.06+0.03) 變動銷售與分攤 ＋ 1600×0.01 廣告（只算主商品）＋ 60 物流 = 238
    // 淨利：1800 − (600 + 50) − 238 = 912
    expect(result.netProfit).toBe(912);
  });

  it("⚠️ 廣告只攤在主商品上，不攤到加價購", () => {
    const withAd = { ...base, adSpendRate: 0.1, addOnRevenue: 1000, addOnCost: 0 };
    const result = simulatePromotion(withAd);
    const withoutAddOn = simulatePromotion({ ...withAd, addOnRevenue: 0 });
    // 多收 1000 元加價購，廣告費不該跟著多 100。
    const adOnAddOn = (result.netProfit ?? 0) - (withoutAddOn.netProfit ?? 0);
    expect(adOnAddOn).toBeGreaterThan(0);
  });

  it("🚫 成本未知時 profitable 為 null 而非 true", () => {
    // 「不知道賺不賺」與「確定有賺」是完全不同的事。
    const result = simulatePromotion({ ...base, costPerUnit: null });
    expect(result.netProfit).toBeNull();
    expect(result.netRate).toBeNull();
    expect(result.profitable).toBeNull();
    expect(result.netProfitAtFullPrice).toBeNull();
    // 折抵金額與少付的費用不需要成本就算得出來，仍應回傳。
    expect(result.discount).toBe(400);
    expect(result.savedVariableCost).toBe(40);
  });

  it("全額折抵時淨利率為 null 而非除以零", () => {
    const full = [{ trigger: "AMOUNT" as const, discount: "FIXED" as const, threshold: 100, value: 99999 }];
    const result = simulatePromotion({ ...base, rules: full });
    expect(result.netRevenue).toBe(0);
    expect(result.netRate).toBeNull();
  });

  it("物流也會隨著折價變少（有客單價資料時）", () => {
    // 平均客單價 2000、平均運費 60：原價 2000 攤 60，折後 1600 只攤 48。
    const result = simulatePromotion({ ...base, averageOrderValue: 2000 });
    // 少付的費用 = 400×10% + (60 − 48) = 52
    expect(result.savedVariableCost).toBe(52);
  });
});

describe("費率合計（原始試算表 的售固係數）", () => {
  it("各項相加", () => {
    const total = totalPercentRate({
      payment: 0.02,
      channel: 0.23,
      tax: 0.047619,
      overhead: 0.15,
      partnerShare: 0.2,
      adSpend: 0,
    });
    expect(total).toBeCloseTo(0.647619, 6);
  });
});

describe("團購", () => {
  const base = {
    subtotal: 1000,
    quantity: 2,
    costPerUnit: 150 as number | null,
    discount: 0.9,
    partnerShare: 0.2,
    absorbsShipping: true,
    averageLogistics: 60,
    averageOrderValue: null as number | null,
    variableSellingRate: 0.08,
    overheadRate: 0.15,
    adSpendRate: 0,
  };

  it("團主毛利是從結帳金額抽走的", () => {
    const result = simulateGroupBuy(base);
    expect(result.checkout).toBe(900);
    expect(result.partnerPayout).toBe(180);
    expect(result.yourRevenue).toBe(720);
  });

  it("⚠️ 費用仍按結帳金額算，不是按你實收的算", () => {
    // 通路與金流是照成交金額收的，不會因為你分了兩成給團主就少收。
    const result = simulateGroupBuy(base);
    // 900 − 180 − 300 − 900×0.23 − 60 = 153
    expect(result.netProfit).toBe(153);
  });

  it("未達免運門檻時運費不算你的成本（團員自付）", () => {
    const absorbed = simulateGroupBuy(base);
    const notAbsorbed = simulateGroupBuy({ ...base, absorbsShipping: false });
    expect(notAbsorbed.logistics).toBe(0);
    expect(notAbsorbed.netProfit! - absorbed.netProfit!).toBe(60);
  });

  it("團主毛利給太多會直接虧", () => {
    expect(simulateGroupBuy({ ...base, partnerShare: 0.6 }).profitable).toBe(false);
  });

  it("🚫 成本未知時淨利為 null，不得當成有賺", () => {
    const result = simulateGroupBuy({ ...base, costPerUnit: null });
    expect(result.netProfit).toBeNull();
    expect(result.profitable).toBeNull();
    // 給團主多少錢不需要成本就算得出來，仍應回傳。
    expect(result.partnerPayout).toBe(180);
  });
});

describe("退貨", () => {
  // 售價 1000、成本 300、物流 60、費率合計 10%（變動銷售 6＋分攤 3＋廣告 1）。
  const base = {
    price: 1000,
    manufacturingCost: 300 as number | null,
    logistics: 60,
    variableSellingRate: 0.06,
    overheadRate: 0.03,
    adSpendRate: 0.01,
  };
  const noReturn = { returnRate: 0, resaleable: false, paysReturnShipping: false };

  it("退貨率 0 時跟沒有退貨完全一樣", () => {
    expect(computeMarginWithReturns(base, noReturn)).toEqual(computeMargin(base));
  });

  it("⚠️ 營收打折但成本不打折：東西已經做出來也寄出去了", () => {
    // 退 10%、不能再賣、回程運費自付。
    const result = computeMarginWithReturns(base, {
      returnRate: 0.1,
      resaleable: false,
      paysReturnShipping: true,
    });

    // 實收 900，製造成本仍是 300（全損），物流 60×1.1 = 66。
    expect(result.grossContribution).toBe(600);
    // 微利：600 − 900×0.06 − 66 = 480
    expect(result.operatingContribution).toBe(480);
    // 淨利：480 − 900×0.03 − 1000×0.01 = 443
    expect(result.netProfit).toBe(443);
  });

  it("🚫 不得把成本也乘上 (1−退貨率)，那等於假設退貨的東西沒被做出來過", () => {
    const lost = computeMarginWithReturns(base, { returnRate: 0.1, resaleable: false, paysReturnShipping: false });
    // 若成本也打折，毛利會是 900 − 270 = 630。實際上是 600。
    expect(lost.grossContribution).toBe(600);
    expect(lost.grossContribution).not.toBe(630);
  });

  it("退回來還能再賣時，那一份的製造成本才算回收", () => {
    const resale = computeMarginWithReturns(base, { returnRate: 0.1, resaleable: true, paysReturnShipping: false });
    const scrap = computeMarginWithReturns(base, { returnRate: 0.1, resaleable: false, paysReturnShipping: false });
    expect(resale.grossContribution! - scrap.grossContribution!).toBe(30);
  });

  it("⚠️ 廣告花掉就是花掉了，不會因為退貨退回來", () => {
    const result = computeMarginWithReturns(base, { returnRate: 0.5, resaleable: true, paysReturnShipping: false });
    expect(result.adSpendCost).toBe(10);
  });

  it("退貨一定讓淨利變差", () => {
    const clean = computeMargin(base).netProfit!;
    const withReturns = computeMarginWithReturns(base, {
      returnRate: 0.1,
      resaleable: true,
      paysReturnShipping: false,
    }).netProfit!;
    expect(withReturns).toBeLessThan(clean);
  });

  it("🚫 成本未知時仍然是 null", () => {
    const result = computeMarginWithReturns({ ...base, manufacturingCost: null }, { ...noReturn, returnRate: 0.1 });
    expect(result.netProfit).toBeNull();
  });
});

describe("投報率", () => {
  it("這一塊錢成本換回多少淨利", () => {
    expect(returnOnCost(300, 100)).toBe(3);
  });

  it("⚠️ 淨利率高不代表投報率高", () => {
    // A：售價 1000、成本 800、淨利 150 → 淨利率 15%，投報率 0.19
    // B：售價 100、成本 20、淨利 30 → 淨利率 30%，投報率 1.5
    expect(returnOnCost(150, 800)!).toBeLessThan(returnOnCost(30, 20)!);
  });

  it("🚫 成本為 0 或未知時回 null，不回無限大", () => {
    expect(returnOnCost(300, 0)).toBeNull();
    expect(returnOnCost(300, null)).toBeNull();
    expect(returnOnCost(null, 100)).toBeNull();
  });
});
