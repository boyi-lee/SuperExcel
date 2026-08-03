// 商品組合建構器：活動獲利規劃的工作台。
//
// 流程就是一條線：
//   先組商品 → 系統自動抓價格與數量 → 估算折扣、贈品與通路成本
//   → 判斷是否低於期望利潤 → 在活動製作以前就修正方案
//
// ⚠️ 「不可行」不等於「虧錢」。等到虧才擋已經太晚了，
//    所以判斷的基準是使用者自己設的安控線（期望最低淨利率），不是 0。
//
// 🚫 沒有資料的欄位一律留白，不顯示 N/A 或 0。
//    N/A 會被當成一個值，0 會被當成「免費」，兩個都會讓人做錯決定。

import { useState } from "react";
import { Accordion, Button, Card, Field, Note, inputClass, money, pct } from "../components/ui";
import { computeGiftUnits, computeMargin, logisticsCost, suggestPrices } from "../lib/costing";
import { deriveRates, listPricedItems, rateBreakdownFor, summarizeBundle } from "../lib/derive";
import { newId, type Bundle, type Doc } from "../lib/doc";

export function BundlesScreen({ doc, onChange }: { doc: Doc; onChange: (doc: Doc) => void }) {
  const rates = deriveRates(doc);
  const items = listPricedItems(doc);
  const [channelId, setChannelId] = useState<string | null>(null);

  const breakdown = rateBreakdownFor(doc, channelId);
  const minNetRate = doc.settings.minNetRate;

  const setBundle = (id: string, patch: Partial<Bundle>) =>
    onChange({ ...doc, bundles: doc.bundles.map((bundle) => (bundle.id === id ? { ...bundle, ...patch } : bundle)) });

  const addBundle = () =>
    onChange({
      ...doc,
      bundles: [...doc.bundles, { id: newId(), name: "", price: null, lines: [], note: null }],
    });

  return (
    <div className="space-y-4">
      <Card title="試算條件">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="通路" hint="抽成不同，同一個組合在不同通路可行與否會不一樣。">
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
          <Field
            label="安控線：期望最低淨利率"
            hint="低於這條線的組合會被標成「不可行」。不可行不等於虧錢，等到虧才擋已經太晚。"
          >
            <input
              className={inputClass}
              type="number"
              step="0.01"
              min="0"
              max="0.99"
              value={minNetRate}
              onChange={(event) =>
                onChange({
                  ...doc,
                  settings: { ...doc.settings, minNetRate: Number(event.target.value) || 0 },
                })
              }
            />
          </Field>
        </div>

        <p className="mt-3 text-sm text-ink-2">
          目前費率合計 <span className="font-semibold">{pct(breakdown.total)}</span>
          ，安控線 <span className="font-semibold text-acid">{pct(minNetRate)}</span>。
        </p>

        {items.length === 0 ? (
          <div className="mt-3">
            <Note tone="warn">還沒有可以組的品項。請先到「產品與用料」建立產品與規格。</Note>
          </div>
        ) : null}
      </Card>

      {doc.bundles.map((bundle) => {
        const summary = summarizeBundle(doc, bundle);
        const price = summary.price;

        const logistics = price === null ? 0 : logisticsCost(price, rates.logistics, doc.settings.averageOrderValue);
        const margin =
          price === null
            ? null
            : computeMargin({
                price,
                manufacturingCost: summary.cost,
                logistics,
                variableSellingRate: breakdown.variableSelling,
                overheadRate: breakdown.overhead,
                adSpendRate: breakdown.adSpend,
              });

        // 🚫 判斷分三種：達標、不可行、不知道。不知道不能算成任何一種。
        const verdict =
          margin?.netRate == null ? "unknown" : margin.netRate >= minNetRate ? "ok" : "blocked";

        const suggestions = suggestPrices(
          {
            manufacturingCost: summary.cost,
            percentRate: breakdown.total,
            averageLogistics: rates.logistics,
            averageOrderValue: doc.settings.averageOrderValue,
          },
          minNetRate,
        );

        // 規則引擎：這個價格會拿到哪些贈品。
        const earnedGifts =
          price === null
            ? []
            : doc.promotions.flatMap((promotion) =>
                promotion.gifts
                  .map((gift) => ({
                    promotion,
                    gift,
                    units: computeGiftUnits([gift], { subtotal: price, quantity: summary.quantity }),
                  }))
                  .filter((entry) => entry.units > 0),
              );

        return (
          <Card
            key={bundle.id}
            title={bundle.name || "未命名組合"}
            action={
              <span
                className={`rounded-full px-3 py-1 text-xs font-semibold ${
                  verdict === "ok"
                    ? "bg-ok/15 text-ok"
                    : verdict === "blocked"
                      ? "bg-bad/15 text-bad"
                      : "bg-warn/15 text-warn"
                }`}
              >
                {verdict === "ok" ? "可行" : verdict === "blocked" ? "不可行" : "資料不足"}
              </span>
            }
          >
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="組合名稱">
                <input
                  className={inputClass}
                  value={bundle.name}
                  placeholder="例如：母親節雙件組"
                  onChange={(event) => setBundle(bundle.id, { name: event.target.value })}
                />
              </Field>
              <Field label="原價加總" hint="由內容物自動加總，不能改。">
                {/* 該鎖的就鎖住，而且沒資料時留白不顯示 N/A。 */}
                <input
                  className={`${inputClass} bg-panel-2 text-ink-3`}
                  value={summary.listPrice === null ? "" : money(summary.listPrice)}
                  readOnly
                  tabIndex={-1}
                />
              </Field>
              <Field label="組合售價" hint="留空就用原價加總。組合價通常比加總便宜。">
                <input
                  className={inputClass}
                  type="number"
                  min="0"
                  placeholder={summary.listPrice === null ? "" : String(summary.listPrice)}
                  value={bundle.price ?? ""}
                  onChange={(event) =>
                    setBundle(bundle.id, { price: event.target.value === "" ? null : Number(event.target.value) })
                  }
                />
              </Field>
            </div>

            {/* 內容物。下拉選產品與規格，價格自動帶出，有選才出現排序號。 */}
            <h4 className="mt-6 text-sm font-semibold text-ink">組合內容</h4>
            <div className="mt-2 space-y-2">
              {bundle.lines.map((line, index) => {
                const content = summary.contents[index];
                const chosen = content?.item ?? null;

                return (
                  <div
                    key={line.id}
                    className="grid grid-cols-1 items-end gap-3 rounded-lg border border-line bg-panel-2 p-3 sm:grid-cols-2 lg:grid-cols-6"
                  >
                    {/* 有選擇才出現排序號。沒選的時候編號沒有意義。 */}
                    <div className="font-mono text-xs text-ink-3">{chosen ? `#${index + 1}` : ""}</div>

                    <Field label="產品／容量">
                      <select
                        className={inputClass}
                        value={line.itemKey}
                        onChange={(event) =>
                          setBundle(bundle.id, {
                            lines: bundle.lines.map((row) =>
                              row.id === line.id ? { ...row, itemKey: event.target.value } : row,
                            ),
                          })
                        }
                      >
                        <option value="">未選擇</option>
                        {/* 未來新增商品或容量不用改這裡：清單是從資料算出來的。 */}
                        {items.map((option) => (
                          <option key={option.key} value={option.key}>
                            {option.name || "未命名"}
                          </option>
                        ))}
                      </select>
                    </Field>

                    <Field label="數量">
                      <input
                        className={inputClass}
                        type="number"
                        min="0"
                        step="1"
                        value={line.quantity}
                        onChange={(event) =>
                          setBundle(bundle.id, {
                            lines: bundle.lines.map((row) =>
                              row.id === line.id ? { ...row, quantity: Number(event.target.value) || 0 } : row,
                            ),
                          })
                        }
                      />
                    </Field>

                    <Field label="單價" hint="選了產品就自動帶出。">
                      <input
                        className={`${inputClass} bg-panel text-ink-3`}
                        value={chosen?.price == null ? "" : money(chosen.price)}
                        readOnly
                        tabIndex={-1}
                      />
                    </Field>

                    <Field label="小計">
                      <input
                        className={`${inputClass} bg-panel text-ink-3`}
                        value={content?.subtotal == null ? "" : money(content.subtotal)}
                        readOnly
                        tabIndex={-1}
                      />
                    </Field>

                    <div className="flex items-end">
                      <Button
                        variant="danger"
                        onClick={() =>
                          setBundle(bundle.id, { lines: bundle.lines.filter((row) => row.id !== line.id) })
                        }
                      >
                        刪除
                      </Button>
                    </div>
                  </div>
                );
              })}
              {bundle.lines.length === 0 ? <p className="text-sm text-ink-3">還沒有內容物。</p> : null}
            </div>

            <div className="mt-3">
              <Button
                variant="secondary"
                onClick={() =>
                  setBundle(bundle.id, {
                    lines: [...bundle.lines, { id: newId(), itemKey: items[0]?.key ?? "", quantity: 1 }],
                  })
                }
              >
                加一項
              </Button>
            </div>

            {summary.missing.length > 0 ? (
              <div className="mt-4">
                <Note tone="warn">
                  以下項目資料不齊，所以下面的判斷是「不知道」而不是「可行」：
                  {summary.missing.join("、")}。
                </Note>
              </div>
            ) : null}

            {/* 損益與安控判斷 */}
            {margin !== null ? (
              <div className="mt-5 rounded-lg border border-line bg-panel-2 p-4">
                <dl className="grid grid-cols-2 gap-3 sm:grid-cols-5">
                  <Cell label="售價" value={price === null ? "" : money(price)} />
                  <Cell label="成本" value={summary.cost === null ? "" : money(summary.cost)} />
                  <Cell
                    label="通路＋費用"
                    value={money(margin.variableSellingCost + margin.overheadCost + margin.adSpendCost + logistics)}
                  />
                  <Cell
                    label="淨利"
                    value={margin.netProfit === null ? "" : money(margin.netProfit)}
                    tone={verdict === "blocked" ? "bad" : verdict === "ok" ? "ok" : "normal"}
                  />
                  <Cell
                    label="淨利率"
                    value={margin.netRate === null ? "" : pct(margin.netRate)}
                    sub={`安控線 ${pct(minNetRate)}`}
                    tone={verdict === "blocked" ? "bad" : verdict === "ok" ? "ok" : "normal"}
                  />
                </dl>

                {verdict === "blocked" ? (
                  <div className="mt-3">
                    <Note tone="danger">
                      <span className="font-semibold">不可行：</span>
                      淨利率 {pct(margin.netRate)} 低於你的安控線 {pct(minNetRate)}。
                      在做活動頁之前先修：把組合售價往上調、換掉成本高的內容物，或降低這一檔的期望。
                    </Note>
                  </div>
                ) : null}
              </div>
            ) : null}

            {/* 決策支援：依成本給高中低三個建議價 */}
            <h4 className="mt-6 text-sm font-semibold text-ink">
              建議優惠價
              <span className="ml-2 text-xs font-normal text-ink-3">從你的安控線往上推，不是行情價。</span>
            </h4>
            <div className="mt-2 grid gap-2 sm:grid-cols-3">
              {suggestions.map((tier) => (
                <div key={tier.label} className="rounded-lg border border-line bg-panel-2 p-3">
                  <div className="text-xs text-ink-3">
                    {tier.label}　淨利率 {pct(tier.targetRate)}
                  </div>
                  <div className="mt-1 text-xl font-bold text-acid">
                    {tier.result.ok ? money(tier.result.price) : tier.result.reason === "NO_COST" ? "" : "無解"}
                  </div>
                  {tier.result.ok ? (
                    <button
                      type="button"
                      className="mt-2 text-xs text-acid underline"
                      onClick={() => setBundle(bundle.id, { price: tier.result.ok ? tier.result.price : null })}
                    >
                      套用這個價
                    </button>
                  ) : (
                    <div className="mt-2 text-xs text-ink-3">
                      {tier.result.reason === "NO_COST" ? "成本未知，給不出建議" : "費率吃掉全部售價，無解"}
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* 規則引擎：這個價格會拿到哪些贈品 */}
            <h4 className="mt-6 text-sm font-semibold text-ink">
              這個價格會拿到的贈品
              <span className="ml-2 text-xs font-normal text-ink-3">由促銷試算頁設定的贈品規則自動判斷。</span>
            </h4>
            <div className="mt-2 space-y-2">
              {earnedGifts.map(({ promotion, gift, units }) => {
                const giftItem = items.find((option) => option.key === gift.itemKey);
                return (
                  <div
                    key={`${promotion.id}-${gift.id}`}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-ok/40 bg-ok/10 p-3 text-sm"
                  >
                    <span className="text-ink-2">
                      <span className="font-semibold text-ok">{promotion.name || "未命名方案"}</span>
                      　{gift.trigger === "QUANTITY" ? `滿 ${gift.threshold} 件` : `滿 ${money(gift.threshold)} 元`}
                      　送 {giftItem?.name || "（還沒選贈品）"} × {units}
                    </span>
                    <span className="text-xs text-ink-3">{gift.stackable ? "可累贈" : "不可累贈"}</span>
                  </div>
                );
              })}
              {earnedGifts.length === 0 ? (
                <p className="text-sm text-ink-3">
                  {price === null ? "填了售價之後才判斷得出來。" : "這個價格沒有觸發任何贈品規則。"}
                </p>
              ) : null}
            </div>

            <div className="mt-5 flex flex-wrap gap-2">
              <Button
                variant="danger"
                onClick={() => {
                  if (!confirm(`刪除組合「${bundle.name || "未命名"}」？`)) return;
                  onChange({ ...doc, bundles: doc.bundles.filter((row) => row.id !== bundle.id) });
                }}
              >
                刪除組合
              </Button>
            </div>
          </Card>
        );
      })}

      <Card>
        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={addBundle}>新增組合</Button>
          <span className="text-sm text-ink-3">目前 {money(doc.bundles.length)} 個組合。</span>
        </div>
      </Card>

      <Accordion title="這一頁的流程" summary="先組商品，再判斷可不可行">
        <ol className="list-decimal space-y-2 pl-5 text-sm leading-relaxed text-ink-2">
          <li>先組商品：下拉選產品與容量、填數量。</li>
          <li>系統自動抓價格與數量，原價加總與小計都是算出來的，不能手改。</li>
          <li>同時估算折扣、贈品與通路成本，通路在最上面切換。</li>
          <li>
            直接判斷是否低於期望利潤：低於安控線就標
            <span className="font-semibold text-bad">不可行</span>，資料不齊就標
            <span className="font-semibold text-warn">資料不足</span>，
            兩者不會被當成可行。
          </li>
          <li>在活動製作以前就修正方案：套用建議價，或換掉成本高的內容物。</li>
        </ol>
      </Accordion>
    </div>
  );
}

function Cell({
  label,
  value,
  sub,
  tone = "normal",
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "normal" | "ok" | "bad";
}) {
  const color = tone === "bad" ? "text-bad" : tone === "ok" ? "text-ok" : "text-ink";
  return (
    <div>
      <dt className="text-xs text-ink-3">{label}</dt>
      {/* 🚫 沒資料就留白，不寫 N/A。N/A 會被當成一個值。 */}
      <dd className={`mt-0.5 text-lg font-bold ${color}`}>{value || <span className="text-ink-3">－</span>}</dd>
      {sub ? <div className="text-xs text-ink-3">{sub}</div> : null}
    </div>
  );
}
