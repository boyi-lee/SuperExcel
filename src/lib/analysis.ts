// 事後的營業分析。
//
// ⚠️ 這裡跟前面所有分頁的方向是相反的：
//    前面是「還沒賣，先算會不會賠」，這裡是「賣完了，看看實際長怎樣」。
//    兩邊的數字不會一樣，而**差在哪裡**才是這一頁真正的價值。
//
// 🚫 一律沿用同一條規則：分母缺了就回 null，不要給一個看起來合理的比率。
//    「退貨率 0%」與「還沒去查退貨數」是完全不同的事。

import { roundTo } from "./costing";
import type { MonthlyRecord } from "./doc";

export type MonthlyMetrics = {
  record: MonthlyRecord;
  /** 平均訂單金額。營收或訂單數缺一就是 null。 */
  averageOrderValue: number | null;
  returnRate: number | null;
  repeatRate: number | null;
  /** 廣告佔營收比。這個數字拿去填「費率設定」的廣告費最準。 */
  adSpendRate: number | null;
};

/** 一個安全的除法：分子分母任一缺漏或分母為 0 就回 null。 */
function ratio(numerator: number | null, denominator: number | null, digits = 6): number | null {
  if (numerator === null || denominator === null) return null;
  if (!(denominator > 0)) return null;
  return roundTo(numerator / denominator, digits);
}

export function computeMonthlyMetrics(record: MonthlyRecord): MonthlyMetrics {
  return {
    record,
    averageOrderValue: ratio(record.revenue, record.orders, 2),
    returnRate: ratio(record.returnedOrders, record.orders),
    repeatRate: ratio(record.repeatOrders, record.orders),
    adSpendRate: ratio(record.adSpend, record.revenue),
  };
}

export type AnalysisSummary = {
  months: number;
  /** 有填營收的月份數。用來提醒使用者「這個平均只根據幾個月」。 */
  monthsWithRevenue: number;
  totalRevenue: number | null;
  totalOrders: number | null;
  averageOrderValue: number | null;
  returnRate: number | null;
  repeatRate: number | null;
  adSpendRate: number | null;
};

/**
 * 期間合計。
 *
 * ⚠️ 平均值用「合計 ÷ 合計」而不是「每月比率再平均」。
 *    後者會讓一個只賣了三筆的月份，跟一個賣了三千筆的月份佔一樣的權重。
 * 🚫 完全沒有資料時回 null 而不是 0。
 */
export function summarize(records: readonly MonthlyRecord[]): AnalysisSummary {
  const sum = (pick: (record: MonthlyRecord) => number | null): number | null => {
    const values = records.map(pick).filter((value): value is number => value !== null);
    return values.length === 0 ? null : roundTo(values.reduce((total, value) => total + value, 0), 2);
  };

  const totalRevenue = sum((record) => record.revenue);
  const totalOrders = sum((record) => record.orders);

  return {
    months: records.length,
    monthsWithRevenue: records.filter((record) => record.revenue !== null).length,
    totalRevenue,
    totalOrders,
    averageOrderValue: ratio(totalRevenue, totalOrders, 2),
    returnRate: ratio(sum((record) => record.returnedOrders), totalOrders),
    repeatRate: ratio(sum((record) => record.repeatOrders), totalOrders),
    adSpendRate: ratio(sum((record) => record.adSpend), totalRevenue),
  };
}
