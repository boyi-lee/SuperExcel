// 內容產生器的測試。
//
// 這一層產出的東西會直接貼到活動頁給客人看，
// 所以「缺資料時不要硬編」比任何格式細節都重要。

import { describe, expect, it } from "vitest";
import { buildContent, renderCsv, renderMarkdown, renderPlainText } from "../content";
import { emptyDoc, type Doc, type Material, type Product } from "../doc";

const material = (id: string, name: string, unitCost: number | null): Material => ({
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
});

const product = (id: string, name: string, price: number | null, details: string | null): Product => ({
  id,
  name,
  sku: `${id.toUpperCase()}-1`,
  details,
  price,
  outputQuantity: 1,
  lines: [{ id: `l-${id}`, materialId: "m1", quantity: 1 }],
  variants: [],
});

function docWith(products: Product[], bundleLines: { itemKey: string; quantity: number }[], bundlePrice: number | null = null): Doc {
  return {
    ...emptyDoc(),
    categories: [{ id: "cat", name: "測試", behavior: "MATERIAL", sortOrder: 10 }],
    materials: [material("m1", "基底", 50)],
    products,
    bundles: [
      {
        id: "b1",
        name: "母親節雙件組",
        price: bundlePrice,
        lines: bundleLines.map((line, index) => ({ id: `bl${index}`, ...line })),
        note: null,
      },
    ],
  };
}

describe("彙整組合內容", () => {
  const doc = docWith(
    [product("p1", "手工皂", 380, "冷製工法，四週熟成。"), product("p2", "沐浴油", 520, null)],
    [
      { itemKey: "p1", quantity: 2 },
      { itemKey: "p2", quantity: 1 },
    ],
    1000,
  );

  it("品名、料號、數量、詳情都帶出來", () => {
    const block = buildContent(doc, "b1")!;
    expect(block.title).toBe("母親節雙件組");
    expect(block.items).toHaveLength(2);
    expect(block.items[0]).toEqual({
      name: "手工皂",
      sku: "P1-1",
      quantity: 2,
      details: "冷製工法，四週熟成。",
    });
  });

  it("算出原價加總與省下多少", () => {
    const block = buildContent(doc, "b1")!;
    // 380×2 + 520 = 1280，組合價 1000，省 280。
    expect(block.listPrice).toBe(1280);
    expect(block.price).toBe(1000);
    expect(block.saved).toBe(280);
  });

  it("🚫 沒填詳情的品項照實列出來，不編一段文案", () => {
    const block = buildContent(doc, "b1")!;
    expect(block.items[1].details).toBeNull();
    expect(block.missingDetails).toEqual(["沐浴油"]);
  });

  it("🚫 組合價比原價貴時不硬算成「省 0 元」", () => {
    const pricey = docWith(
      [product("p1", "手工皂", 380, null)],
      [{ itemKey: "p1", quantity: 1 }],
      500,
    );
    expect(buildContent(pricey, "b1")!.saved).toBeNull();
  });

  it("任一項沒定價時原價加總為 null，不做部分加總", () => {
    const partial = docWith(
      [product("p1", "手工皂", 380, null), product("p2", "沐浴油", null, null)],
      [
        { itemKey: "p1", quantity: 1 },
        { itemKey: "p2", quantity: 1 },
      ],
      1000,
    );
    expect(buildContent(partial, "b1")!.listPrice).toBeNull();
  });

  it("數量 0 的列不會出現在活動頁上", () => {
    const withZero = docWith(
      [product("p1", "手工皂", 380, null), product("p2", "沐浴油", 520, null)],
      [
        { itemKey: "p1", quantity: 2 },
        { itemKey: "p2", quantity: 0 },
      ],
    );
    expect(buildContent(withZero, "b1")!.items.map((item) => item.name)).toEqual(["手工皂"]);
  });

  it("找不到組合時回 null", () => {
    expect(buildContent(doc, "沒有這個")).toBeNull();
  });
});

describe("輸出格式", () => {
  const doc = docWith(
    [product("p1", "手工皂", 380, "冷製工法。"), product("p2", "沐浴油", 520, null)],
    [
      { itemKey: "p1", quantity: 2 },
      { itemKey: "p2", quantity: 1 },
    ],
    1000,
  );
  const block = buildContent(doc, "b1")!;

  it("純文字含品名數量與價格", () => {
    const text = renderPlainText(block);
    expect(text).toContain("母親節雙件組");
    expect(text).toContain("．手工皂 × 2（P1-1）");
    expect(text).toContain("冷製工法。");
    expect(text).toContain("省 NT$280");
  });

  it("🚫 沒詳情的品項不會多出一行空白說明", () => {
    const text = renderPlainText(block);
    // 沐浴油沒有詳情，它後面直接接下一段，不會有一行只有空白。
    expect(text).not.toMatch(/沐浴油 × 1（P2-1）\n {2}\n/);
  });

  it("Markdown 用刪除線標原價", () => {
    expect(renderMarkdown(block)).toContain("~~NT$1,280~~");
  });

  it("⚠️ CSV 的引號要跳脫，否則對方讀進去會整份錯位", () => {
    const risky = docWith(
      [product("p1", '手工皂 12" 版', 380, "含逗號, 與換行\n第二行")],
      [{ itemKey: "p1", quantity: 1 }],
    );
    const csv = renderCsv(buildContent(risky, "b1")!);
    expect(csv).toContain('"手工皂 12"" 版"');
    expect(csv).toContain('"含逗號, 與換行\n第二行"');
  });

  it("CSV 第一列是表頭", () => {
    expect(renderCsv(block).split("\n")[0]).toBe('"組合","品名","料號","數量","商品詳情"');
  });
});
