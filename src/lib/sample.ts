// 範例資料。
//
// 給第一次來的人一組能立刻看懂的東西，而不是十一個空白分頁。
//
// ⚠️ 範例裡**刻意留一項沒有單價**（進口香精）。
//    這個工具最重要的行為就是「算不出來就說算不出來」，
//    用一組全部填好的漂亮資料展示，反而看不到它真正的價值。
//
// 🚫 這裡的數字是編出來的示範，不是任何人的真實成本。
//    畫面上必須講清楚，否則有人會直接拿去當自己的費率用。

import { emptyDoc, type Doc } from "./doc";

export function sampleDoc(): Doc {
  const base = emptyDoc();
  const [mainCat, packCat, processCat, amortizedCat] = base.categories;

  return {
    ...base,
    settings: {
      ...base.settings,
      averageOrderValue: 1200,
      adSpendMode: "ESTIMATE",
      adSpendRate: 0.08,
      minNetRate: 0.15,
    },
    suppliers: [
      { id: "s1", name: "南部油廠", contact: "07-000-0000", paymentTerms: "月結 30 天" },
      { id: "s2", name: "包材行", contact: null, paymentTerms: "交貨立結" },
    ],
    materials: [
      {
        id: "m1", name: "橄欖油", categoryId: mainCat.id, supplierId: "s1", unit: "ml",
        unitCost: 0.42, currency: "TWD", fxRate: null, scrapRate: 0.08, note: "耗損 8%：過濾與殘留",
      },
      {
        id: "m2", name: "椰子油", categoryId: mainCat.id, supplierId: "s1", unit: "ml",
        unitCost: 0.35, currency: "TWD", fxRate: null, scrapRate: 0.08, note: null,
      },
      {
        id: "m3", name: "玻璃瓶", categoryId: packCat.id, supplierId: "s2", unit: "個",
        unitCost: 12, currency: "TWD", fxRate: null, scrapRate: null, note: null,
      },
      {
        id: "m4", name: "外盒", categoryId: packCat.id, supplierId: "s2", unit: "個",
        unitCost: 8.5, currency: "TWD", fxRate: null, scrapRate: null, note: null,
      },
      {
        // 🚫 故意留白。想看「缺一項單價會怎樣」就是看這一項。
        id: "m5", name: "進口香精（還沒問到價）", categoryId: mainCat.id, supplierId: null, unit: "ml",
        unitCost: null, currency: "EUR", fxRate: null, scrapRate: null, note: "示範用：缺單價時整張配方成本會變成未知",
      },
      {
        id: "m6", name: "灌模與切皂", categoryId: processCat.id, supplierId: null, unit: "次",
        unitCost: 1800, currency: "TWD", fxRate: null, scrapRate: null, note: "一次做 500 顆",
      },
      {
        id: "m7", name: "皂模攤提", categoryId: amortizedCat.id, supplierId: null, unit: "顆",
        unitCost: 1.2, currency: "TWD", fxRate: null, scrapRate: null, note: "模具 36000 元 ÷ 預計 30000 顆",
      },
      {
        id: "m8", name: "棉麻提袋", categoryId: packCat.id, supplierId: "s2", unit: "個",
        unitCost: 26, currency: "TWD", fxRate: null, scrapRate: null, note: null,
      },
    ],
    products: [
      {
        id: "p1", name: "手工皂", sku: "SOAP", details: "冷製工法，四週熟成，無人工香精。",
        price: 320, outputQuantity: 500,
        lines: [
          { id: "l1", materialId: "m1", quantity: 12000 },
          { id: "l2", materialId: "m2", quantity: 8000 },
          { id: "l3", materialId: "m4", quantity: 500 },
          { id: "l4", materialId: "m6", quantity: 1 },
          { id: "l5", materialId: "m7", quantity: 500 },
        ],
        variants: [
          { id: "v1", name: "無香", sku: "SOAP-N", details: null, price: null, lines: [] },
          {
            id: "v2", name: "花香", sku: "SOAP-F", details: "加入進口天然香精。", price: 380,
            // 這個規格用到還沒問到價的香精，所以它的成本會顯示「未知」。
            lines: [{ id: "l6", materialId: "m5", quantity: 500 }],
          },
        ],
      },
      {
        id: "p2", name: "沐浴油", sku: "OIL", details: "沐浴後直接抹上，鎖住水分。",
        price: 560, outputQuantity: 200,
        lines: [
          { id: "l7", materialId: "m1", quantity: 20000 },
          { id: "l8", materialId: "m3", quantity: 200 },
        ],
        variants: [],
      },
      {
        id: "p3", name: "棉麻提袋", sku: "BAG", details: "可重複使用，洗衣機可洗。",
        price: 0, outputQuantity: 1,
        lines: [{ id: "l9", materialId: "m8", quantity: 1 }],
        variants: [],
      },
    ],
    rates: [
      { id: "r1", kind: "LOGISTICS", name: "宅配", value: 65, usageShare: 0.7, packagingCost: 9, handlingCost: null },
      { id: "r2", kind: "LOGISTICS", name: "超商取貨", value: 45, usageShare: 0.3, packagingCost: 6, handlingCost: null },
      { id: "r3", kind: "PAYMENT", name: "信用卡", value: 0.028, usageShare: 0.75, packagingCost: null, handlingCost: null },
      { id: "r4", kind: "PAYMENT", name: "行動支付", value: 0.021, usageShare: 0.25, packagingCost: null, handlingCost: null },
      { id: "r5", kind: "CHANNEL", name: "電商平台", value: 0.23, usageShare: null, packagingCost: null, handlingCost: null },
      { id: "r6", kind: "CHANNEL", name: "自架站", value: 0.03, usageShare: null, packagingCost: null, handlingCost: null },
      { id: "r7", kind: "OVERHEAD", name: "管理費用分攤", value: 0.09, usageShare: null, packagingCost: null, handlingCost: null },
      { id: "r8", kind: "OVERHEAD", name: "研發分攤", value: 0.04, usageShare: null, packagingCost: null, handlingCost: null },
      { id: "r9", kind: "RETURN", name: "平均退貨率", value: 0.06, usageShare: null, packagingCost: null, handlingCost: null },
    ],
    promotions: [
      {
        id: "pr1", name: "母親節檔期", channelRateId: "r5", partnerShare: null,
        scope: "ALL", selectedItemKeys: [],
        rules: [
          { id: "ru1", trigger: "AMOUNT", discount: "FIXED", threshold: 1000, value: 100 },
          { id: "ru2", trigger: "COUPON", discount: "PERCENT", threshold: 1000, value: 0.05 },
        ],
        gifts: [{ id: "g1", trigger: "AMOUNT", threshold: 1200, itemKey: "p3", quantity: 1, stackable: false }],
        addOns: [{ id: "a1", itemKey: "p3", price: 99, quantity: 1 }],
      },
    ],
    discountTiers: [
      { id: "t1", threshold: 1000, light: 0.95, mid: 0.92, deep: 0.9 },
      { id: "t2", threshold: 2000, light: 0.9, mid: 0.87, deep: 0.85 },
      { id: "t3", threshold: 4000, light: 0.85, mid: 0.82, deep: 0.78 },
    ],
    groupBuys: [
      {
        id: "gb1", name: "三月團", leaderName: "示範團主", channelRateId: "r6",
        freeShippingThreshold: 1500,
        tiers: [
          { id: "gt1", threshold: 1, discount: 0.95, partnerShare: 0.15 },
          { id: "gt2", threshold: 3000, discount: 0.9, partnerShare: 0.2 },
          { id: "gt3", threshold: 8000, discount: 0.85, partnerShare: 0.25 },
        ],
      },
    ],
    monthlyRecords: [
      { id: "mr1", month: "2025-11", revenue: 186000, orders: 152, returnedOrders: 7, repeatOrders: 44, adSpend: 15000, note: null },
      { id: "mr2", month: "2025-12", revenue: 264000, orders: 210, returnedOrders: 12, repeatOrders: 61, adSpend: 27000, note: "年末檔" },
      { id: "mr3", month: "2026-01", revenue: 198000, orders: 168, returnedOrders: 11, repeatOrders: 58, adSpend: 24000, note: null },
      { id: "mr4", month: "2026-02", revenue: 231000, orders: 205, returnedOrders: 19, repeatOrders: 62, adSpend: 41000, note: "情人節" },
      { id: "mr5", month: "2026-03", revenue: 243000, orders: 224, returnedOrders: 24, repeatOrders: 65, adSpend: 56000, note: null },
    ],
    bundles: [
      {
        id: "b1", name: "母親節雙件組", price: 800,
        lines: [
          { id: "bl1", itemKey: "p1:v1", quantity: 1 },
          { id: "bl2", itemKey: "p2", quantity: 1 },
        ],
        note: "本檔期至 3/31 止，贈品送完為止。",
      },
      {
        id: "b2", name: "香氛組（示範：成本未知）", price: 900,
        lines: [
          { id: "bl3", itemKey: "p1:v2", quantity: 1 },
          { id: "bl4", itemKey: "p2", quantity: 1 },
        ],
        note: null,
      },
    ],
    // 範例本身就是「還沒下載過」的狀態，讓提醒橫幅照常出現。
    updatedAt: new Date().toISOString(),
  };
}

/** 給第一次來的人的一句話。放在按鈕旁邊，避免有人把示範數字當成行情。 */
export const SAMPLE_NOTE =
  "這組數字是編出來的示範，不是任何人的真實成本。裡面刻意留了一項沒有單價的物料，" +
  "你可以看到「算不出來就說算不出來」實際長什麼樣。看完按「清空所有資料」就乾淨了。";
