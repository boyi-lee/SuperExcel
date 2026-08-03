// 營業分析的測試。
//
// 這一頁的數字會被拿去回填「費率設定」（廣告佔比、平均客單價），
// 所以算錯會一路污染前面所有的試算。

import { describe, expect, it } from "vitest";
import { computeMonthlyMetrics, summarize } from "../analysis";
import type { MonthlyRecord } from "../doc";

const record = (patch: Partial<MonthlyRecord> = {}): MonthlyRecord => ({
  id: "m",
  month: "2026-03",
  revenue: 100000,
  orders: 100,
  returnedOrders: 5,
  repeatOrders: 30,
  adSpend: 12000,
  note: null,
  ...patch,
});

describe("單月指標", () => {
  it("基本比率", () => {
    const metrics = computeMonthlyMetrics(record());
    expect(metrics.averageOrderValue).toBe(1000);
    expect(metrics.returnRate).toBe(0.05);
    expect(metrics.repeatRate).toBe(0.3);
    expect(metrics.adSpendRate).toBe(0.12);
  });

  it("🚫 分子沒填時回 null，不是 0", () => {
    // 「退貨率 0%」與「還沒去查退貨數」是完全不同的事。
    const metrics = computeMonthlyMetrics(record({ returnedOrders: null }));
    expect(metrics.returnRate).toBeNull();
  });

  it("退貨 0 筆是有效資料，比率就是 0", () => {
    expect(computeMonthlyMetrics(record({ returnedOrders: 0 })).returnRate).toBe(0);
  });

  it("🚫 訂單數為 0 或未填時回 null，不得除以零", () => {
    expect(computeMonthlyMetrics(record({ orders: 0 })).averageOrderValue).toBeNull();
    expect(computeMonthlyMetrics(record({ orders: null })).averageOrderValue).toBeNull();
  });
});

describe("期間合計", () => {
  it("⚠️ 平均用合計除合計，不是每月比率再平均", () => {
    // 一個月賣 3 筆、一個月賣 300 筆，兩個月的權重不該一樣。
    const months = [
      record({ id: "a", revenue: 3000, orders: 3, returnedOrders: 3, repeatOrders: 0, adSpend: 0 }),
      record({ id: "b", revenue: 300000, orders: 300, returnedOrders: 0, repeatOrders: 0, adSpend: 0 }),
    ];
    const summary = summarize(months);

    // 合計除合計：3 ÷ 303 = 0.99%。若先算每月比率再平均會變成 50%，差了 50 倍。
    expect(summary.returnRate).toBeCloseTo(0.009901, 6);
    expect(summary.averageOrderValue).toBeCloseTo(1000, 2);
  });

  it("部分月份沒填的欄位不計入分子，但仍照實回報有幾個月有資料", () => {
    const months = [record({ id: "a" }), record({ id: "b", revenue: null, orders: null })];
    const summary = summarize(months);
    expect(summary.months).toBe(2);
    expect(summary.monthsWithRevenue).toBe(1);
    expect(summary.totalRevenue).toBe(100000);
  });

  it("🚫 完全沒有資料時回 null 而不是 0", () => {
    const summary = summarize([]);
    expect(summary.totalRevenue).toBeNull();
    expect(summary.averageOrderValue).toBeNull();
    expect(summary.returnRate).toBeNull();
  });
});
