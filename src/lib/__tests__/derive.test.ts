// 母子規格與取數層的測試。
//
// 規格這一塊最容易出的錯是「子規格沒跟著母規格更新」，
// 所以這裡特別釘住：母規格改配方時，子規格必須跟著變。

import { describe, expect, it } from "vitest";
import { computeProductCost, effectiveLines, listPricedItems, unitCostBase } from "../derive";
import { emptyDoc, normalizeDoc, type Doc, type Material, type Product } from "../doc";

const material = (id: string, name: string, unitCost: number | null, extra: Partial<Material> = {}): Material => ({
  id,
  name,
  categoryId: "cat",
  supplierId: null,
  unit: "個",
  unitCost,
  currency: "TWD",
  fxRate: null,
  scrapRate: null,
  note: null,
  ...extra,
});

function docWith(products: Product[], materials: Material[]): Doc {
  return {
    ...emptyDoc(),
    categories: [{ id: "cat", name: "測試分類", behavior: "MATERIAL", sortOrder: 10 }],
    materials,
    products,
  };
}

const product: Product = {
  id: "p1",
  name: "手工皂",
  sku: "S1",
  price: 380,
  outputQuantity: 1,
  lines: [
    { id: "l1", materialId: "m1", quantity: 2 },
    { id: "l2", materialId: "m2", quantity: 1 },
  ],
  variants: [],
};

describe("子規格疊在母規格上", () => {
  const doc = docWith([product], [material("m1", "基底", 10), material("m2", "瓶子", 30), material("m3", "限定貼紙", 5)]);

  it("沒有差異時成本與母規格相同", () => {
    const variant = { id: "v1", name: "黃色", sku: null, price: null, lines: [] };
    expect(computeProductCost(doc, product, variant).unitCost).toBe(computeProductCost(doc, product).unitCost);
  });

  it("同一項物料由子規格覆蓋用量", () => {
    const variant = { id: "v1", name: "大瓶", sku: null, price: null, lines: [{ id: "x", materialId: "m2", quantity: 3 }] };
    // 2×10 + 3×30 = 110
    expect(computeProductCost(doc, product, variant).unitCost).toBe(110);
  });

  it("子規格可以加上母規格沒有的物料", () => {
    const variant = { id: "v1", name: "限定", sku: null, price: null, lines: [{ id: "x", materialId: "m3", quantity: 1 }] };
    // 2×10 + 1×30 + 1×5 = 55
    expect(computeProductCost(doc, product, variant).unitCost).toBe(55);
  });

  it("🚫 用量 0 代表這個規格不用這一項，不是算 0 元", () => {
    const variant = { id: "v1", name: "無瓶", sku: null, price: null, lines: [{ id: "x", materialId: "m2", quantity: 0 }] };
    expect(effectiveLines(product, variant)).toHaveLength(1);
    expect(computeProductCost(doc, product, variant).unitCost).toBe(20);
  });

  it("🚫 不使用的物料就算缺單價，也不該讓整張 BOM 變成未知", () => {
    // 「這個規格不用它」與「這個規格用它但不知道多少錢」是兩件事。
    const withUnpriced = docWith(
      [product],
      [material("m1", "基底", 10), material("m2", "瓶子", 30), material("m3", "沒問到價的香精", null)],
    );
    const variant = { id: "v1", name: "無香", sku: null, price: null, lines: [{ id: "x", materialId: "m3", quantity: 0 }] };
    expect(computeProductCost(withUnpriced, product, variant).unitCost).toBe(50);
  });

  it("母規格改配方時，子規格跟著改（因為只存差異）", () => {
    const variant = { id: "v1", name: "黃色", sku: null, price: null, lines: [] };
    const cheaper = { ...product, lines: [{ id: "l1", materialId: "m1", quantity: 2 }] };
    expect(computeProductCost(doc, cheaper, variant).unitCost).toBe(20);
  });
});

describe("可定價品項清單", () => {
  it("沒有規格時商品自己就是一項", () => {
    const doc = docWith([product], [material("m1", "基底", 10), material("m2", "瓶子", 30)]);
    const items = listPricedItems(doc);
    expect(items).toHaveLength(1);
    expect(items[0].name).toBe("手工皂");
    expect(items[0].variant).toBeNull();
  });

  it("有規格時每個子規格各一項，名稱是「商品-規格」", () => {
    const withVariants: Product = {
      ...product,
      variants: [
        { id: "v1", name: "黃色", sku: null, price: null, lines: [] },
        { id: "v2", name: "限定色", sku: "S1-X", price: 480, lines: [] },
      ],
    };
    const items = listPricedItems(docWith([withVariants], []));

    expect(items.map((item) => item.name)).toEqual(["手工皂-黃色", "手工皂-限定色"]);
    // 子規格沒填售價就沿用母規格，填了就以自己的為準。
    expect(items[0].price).toBe(380);
    expect(items[1].price).toBe(480);
    expect(items[0].sku).toBe("S1");
    expect(items[1].sku).toBe("S1-X");
  });
});

describe("舊存檔相容", () => {
  it("🚫 沒有 variants 的舊檔要能讀，不能在畫面上爆掉", () => {
    // 使用者手上的存檔是先前版本匯出的，讀進來時必須自己補齊新欄位。
    const legacy = {
      ...emptyDoc(),
      products: [{ id: "p1", name: "舊商品", sku: null, price: 100, outputQuantity: 1, lines: [] }],
    } as unknown as Doc;

    const fixed = normalizeDoc(legacy);
    expect(fixed.products[0].variants).toEqual([]);
    expect(listPricedItems(fixed)).toHaveLength(1);
  });
});

describe("外幣物料", () => {
  it("幣別與本位幣相同時不強迫填匯率", () => {
    expect(unitCostBase(material("m", "x", 10), "TWD")).toBe(10);
  });

  it("🚫 外幣缺匯率時回 null，不是拿原幣別的數字直接當本位幣", () => {
    expect(unitCostBase(material("m", "x", 10, { currency: "EUR" }), "TWD")).toBeNull();
  });

  it("有匯率時換算", () => {
    expect(unitCostBase(material("m", "x", 10, { currency: "EUR", fxRate: 35 }), "TWD")).toBe(350);
  });
});
