// 範例資料的測試。
//
// ⚠️ 範例是很多人對這個工具的第一印象。它壞掉的話，
//    使用者看到的是一堆「－」或錯誤，然後就關掉分頁了。
//    所以它得跟真實資料一樣被檢查。

import { describe, expect, it } from "vitest";
import { sampleDoc } from "../sample";
import { normalizeDoc } from "../doc";
import { computeProductCost, listPricedItems, summarizeBundle } from "../derive";
import { buildContent } from "../content";

describe("範例資料", () => {
  const doc = sampleDoc();

  it("形狀跟正規化之後完全一致（不缺任何欄位）", () => {
    expect(normalizeDoc(doc)).toEqual(doc);
  });

  it("每一條參照都指得到東西", () => {
    const materialIds = new Set(doc.materials.map((material) => material.id));
    const itemKeys = new Set(listPricedItems(doc).map((item) => item.key));

    for (const product of doc.products) {
      for (const line of [...product.lines, ...product.variants.flatMap((variant) => variant.lines)]) {
        expect(materialIds.has(line.materialId), `找不到物料 ${line.materialId}`).toBe(true);
      }
    }

    for (const bundle of doc.bundles) {
      for (const line of bundle.lines) {
        expect(itemKeys.has(line.itemKey), `找不到品項 ${line.itemKey}`).toBe(true);
      }
    }

    for (const promotion of doc.promotions) {
      for (const gift of promotion.gifts) {
        expect(itemKeys.has(gift.itemKey ?? ""), `贈品指到不存在的品項`).toBe(true);
      }
    }

    const rateIds = new Set(doc.rates.map((rate) => rate.id));
    for (const promotion of doc.promotions) {
      if (promotion.channelRateId) expect(rateIds.has(promotion.channelRateId)).toBe(true);
    }
    for (const groupBuy of doc.groupBuys) {
      if (groupBuy.channelRateId) expect(rateIds.has(groupBuy.channelRateId)).toBe(true);
    }
  });

  it("大部分的成本算得出來（不然使用者只會看到一片「－」）", () => {
    const priced = listPricedItems(doc).filter(
      (item) => computeProductCost(doc, item.product, item.variant).unitCost !== null,
    );
    expect(priced.length).toBeGreaterThanOrEqual(3);
  });

  it("⚠️ 但刻意留一項沒有單價，用來示範「算不出來就說算不出來」", () => {
    const unpriced = doc.materials.filter((material) => material.unitCost === null);
    expect(unpriced).toHaveLength(1);

    // 用到它的那個規格，成本必須是未知，而不是被當成免費。
    const affected = listPricedItems(doc).find((item) => item.variant?.name === "花香");
    expect(affected).toBeDefined();
    expect(computeProductCost(doc, affected!.product, affected!.variant).unitCost).toBeNull();
  });

  it("第一個組合是完整可算的，第二個示範成本未知", () => {
    const [ok, unknown] = doc.bundles.map((bundle) => summarizeBundle(doc, bundle));
    expect(ok.cost).not.toBeNull();
    expect(ok.listPrice).not.toBeNull();
    expect(unknown.cost).toBeNull();
  });

  it("活動內容產得出來，而且會列出缺詳情的品項", () => {
    const block = buildContent(doc, doc.bundles[0].id);
    expect(block).not.toBeNull();
    expect(block!.items.length).toBeGreaterThan(0);
    expect(block!.price).toBe(800);
    // 組合價 800 低於原價加總，所以省下的金額算得出來。
    expect(block!.saved).not.toBeNull();
  });

  it("⚠️ 主打組合要觸發到贈品，否則規則引擎在範例裡看不出來", () => {
    const block = buildContent(doc, doc.bundles[0].id)!;
    expect(block.gifts.length).toBeGreaterThan(0);
    expect(block.gifts[0].name).toBe("棉麻提袋");
  });

  it("🚫 範例不能把物流或費率留成 0，那會讓人以為這些不用填", () => {
    expect(doc.rates.some((rate) => rate.kind === "LOGISTICS" && rate.value > 0)).toBe(true);
    expect(doc.rates.some((rate) => rate.kind === "PAYMENT" && rate.value > 0)).toBe(true);
    expect(doc.rates.some((rate) => rate.kind === "OVERHEAD" && rate.value > 0)).toBe(true);
  });
});
