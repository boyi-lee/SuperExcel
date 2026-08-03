// 邊際貢獻與定價下限。
//
// 這一頁只讀不寫：它是前面所有輸入的結果。
// 🚫 任何一格算不出來就顯示「－」並說明原因，不得用 0 或某個大數字補上。

import { useState } from "react";
import { Card, Field, Note, inputClass, money, pct } from "../components/ui";
import { formatUnitCost } from "../lib/costing";
import { computeProductMargins, deriveRates, percentRateFor, resolveAdSpend } from "../lib/derive";
import type { Doc } from "../lib/doc";

export function MarginsScreen({ doc }: { doc: Doc }) {
  const rates = deriveRates(doc);
  const [channelId, setChannelId] = useState<string | null>(null);
  const [targetRate, setTargetRate] = useState(0.3);

  const ad = resolveAdSpend(doc);
  const percentRate = percentRateFor(doc, channelId);
  const channel = rates.channels.find((rate) => rate.id === channelId);
  const rows = computeProductMargins(doc, channelId, targetRate);

  return (
    <>
      <Card title="試算條件">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="通路" hint="不同通路抽成不同，換一個看看同一件商品還剩多少。">
            <select
              className={inputClass}
              value={channelId ?? ""}
              onChange={(event) => setChannelId(event.target.value === "" ? null : event.target.value)}
            >
              <option value="">自有通路（不抽成）</option>
              {rates.channels.map((rate) => (
                <option key={rate.id} value={rate.id}>
                  {rate.name || "未命名"}（{pct(rate.value)}）
                </option>
              ))}
            </select>
          </Field>
          <Field label="期望淨利率" hint="用來反推最低售價。填 0.3 代表希望折到底還留 30% 淨利。">
            <input
              className={inputClass}
              type="number"
              step="0.01"
              min="0"
              max="0.99"
              value={targetRate}
              onChange={(event) => setTargetRate(Number(event.target.value) || 0)}
            />
          </Field>
        </div>

        <p className="mt-4 text-sm text-ink-2">
          目前費率合計 <span className="font-semibold">{pct(percentRate)}</span>
          （金流 {pct(rates.payment)}＋稅 {pct(rates.tax)}＋固定費用分攤 {pct(rates.overhead)}
          {channel ? `＋通路 ${pct(channel.value)}` : ""}
          {ad.included ? `＋廣告 ${pct(ad.rate)}` : ""}）。
          {doc.settings.averageOrderValue !== null && doc.settings.averageOrderValue > 0
            ? `物流按營收比例攤提，上限為每筆平均運費 ${rates.logistics.toFixed(2)} 元（平均客單價 ${doc.settings.averageOrderValue} 元時剛好攤滿）。`
            : `物流一律用每筆平均運費 ${rates.logistics.toFixed(2)} 元。填了平均客單價才會按營收比例攤提。`}
        </p>

        <div className="mt-3 space-y-3">
          {!ad.included ? <Note tone="warn">{ad.note}</Note> : null}
          {percentRate + targetRate >= 1 ? (
            <Note tone="danger">
              費率合計加上期望貢獻率已達 {pct(percentRate + targetRate)}，超過售價全部。
              這個目標賣多貴都達不到，下方「最低售價」會顯示無解：那不是計算失敗，是這組條件本身不成立。
            </Note>
          ) : null}
        </div>
      </Card>

      <Card title="各產品" action={<span className="text-xs text-ink-3">共 {money(rows.length)} 項</span>}>
        {rows.length === 0 ? (
          <p className="text-sm text-ink-3">還沒有產品。</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[46rem] text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs text-ink-3">
                  <th className="py-2">產品</th>
                  <th className="py-2 text-right">售價</th>
                  <th className="py-2 text-right">單位成本</th>
                  <th className="py-2 text-right">毛利</th>
                  <th className="py-2 text-right">微利</th>
                  <th className="py-2 text-right">淨利</th>
                  <th className="py-2 text-right">淨利率</th>
                  <th className="py-2 text-right">投報率</th>
                  <th className="py-2 text-right">最低售價</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ item, cost, margin, roi, floor }) => (
                  <tr key={item.key} className="border-b border-line align-top">
                    <td className="py-2">
                      <span className="font-medium text-ink">{item.name || "未命名"}</span>
                      {item.sku ? <span className="ml-2 text-xs text-ink-3">{item.sku}</span> : null}
                      {cost.missing.length > 0 ? (
                        <span className="mt-1 block text-xs text-warn">
                          缺 {cost.missing.length} 項單價，成本未知
                        </span>
                      ) : null}
                      {item.price === null ? <span className="mt-1 block text-xs text-warn">尚未定價</span> : null}
                    </td>
                    <td className="py-2 text-right">{item.price === null ? "－" : money(item.price)}</td>
                    <td className="py-2 text-right">{formatUnitCost(cost.unitCost, "")}</td>
                    <td className="py-2 text-right text-ink-3">
                      {margin.grossContribution === null ? "－" : money(margin.grossContribution)}
                      <span className="block text-xs">{pct(margin.grossRate)}</span>
                    </td>
                    <td className="py-2 text-right text-ink-3">
                      {margin.operatingContribution === null ? "－" : money(margin.operatingContribution)}
                      <span className="block text-xs">
                        扣 {money(margin.variableSellingCost)}＋物流 {margin.logistics.toFixed(0)}
                      </span>
                    </td>
                    <td
                      className={`py-2 text-right font-semibold ${
                        margin.netProfit !== null && margin.netProfit < 0 ? "text-bad" : "text-ink"
                      }`}
                    >
                      {margin.netProfit === null ? "－" : money(margin.netProfit)}
                      <span className="block text-xs font-normal text-ink-3">
                        扣分攤 {money(margin.overheadCost)}
                        {margin.adSpendCost > 0 ? `＋廣告 ${money(margin.adSpendCost)}` : ""}
                      </span>
                    </td>
                    <td
                      className={`py-2 text-right font-semibold ${
                        margin.netRate !== null && margin.netRate < 0 ? "text-bad" : "text-ink"
                      }`}
                    >
                      {pct(margin.netRate)}
                    </td>
                    <td className="py-2 text-right">
                      {/* 投報率：這一塊錢成本換回多少淨利。決定該不該砍產品看這個。 */}
                      {roi === null ? (
                        <span className="text-ink-3">－</span>
                      ) : (
                        <span className={roi < 0 ? "font-semibold text-bad" : "font-semibold text-ink"}>
                          {roi.toFixed(2)} 倍
                        </span>
                      )}
                    </td>
                    <td className="py-2 text-right">
                      {floor.ok ? (
                        money(floor.floorPrice)
                      ) : floor.reason === "NO_COST" ? (
                        <span className="text-ink-3">－</span>
                      ) : (
                        <span className="text-bad">無解</span>
                      )}
                      {floor.ok && item.price !== null && item.price < floor.floorPrice ? (
                        <span className="block text-xs text-bad">目前售價低於下限</span>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="mt-4 space-y-1 text-xs text-ink-3">
          <p>
            <span className="font-semibold">毛利</span> ＝ 售價 − 單位成本。
            <span className="font-semibold">微利</span> ＝ 毛利 − 變動銷售費用（金流、通路、稅、分潤）− 物流。
            <span className="font-semibold">淨利</span> ＝ 微利 − 固定費用分攤 − 廣告。
          </p>
          <p>毛利是美好的，微利是緊張的，淨利是嚇人的。要看就看淨利那一欄。</p>
          <p>
            <span className="font-semibold">投報率</span> ＝ 淨利 ÷ 單位成本，也就是這一塊錢的成本換回多少淨利。
            決定一個產品該不該砍，看投報率比看淨利率準：淨利率高但成本也高的，
            可能還輸給一個薄利多銷的。捨不得砍，那就當帶路雞，但要知道自己在做什麼。
          </p>
          {doc.settings.includeReturns ? (
            <p className="text-warn">
              已納入退貨率 {pct(rates.returnRate)}：營收打折但成本不打折
              {doc.settings.returnsResaleable ? "（退回來的還能再賣，那一份成本算回收）" : "（退回來的不能再賣，成本全損）"}
              {doc.settings.paysReturnShipping ? "，回程運費由你負擔" : ""}。
            </p>
          ) : (
            <p>目前<span className="font-semibold">未納入退貨</span>，這些是「沒有人退貨」的理想數字。到費率設定可以開啟。</p>
          )}
          <p>
            最低售價 ＝（單位成本 ＋ 每筆物流）÷（1 − 費率合計 − 期望淨利率）。
            分母 ≤ 0 時顯示「無解」：那代表賣多貴都達不到，不是一個很大的數字。
          </p>
          <p>「－」代表算不出來（缺單價或未定價），不是 0。</p>
        </div>
      </Card>
    </>
  );
}
