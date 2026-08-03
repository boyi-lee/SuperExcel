// 折扣變價。
//
// ⚠️ 這一頁設不好，後面的活動隨便都會死透。原始試算表的說明講得很直接：
//    如果你需要一直回來改折扣比例，那代表你高估了毛利、低估了固定分攤。
//
// 🚫 每一格都要顯示**淨利率**而不是毛利率。折扣表最危險的地方就是
//    「毛利還有 40% 看起來很安全」，但淨利早就是負的了。

import { useState } from "react";
import { Accordion, Button, Card, Field, Note, inputClass, money, pct } from "../components/ui";
import { computeMargin, logisticsCost, priceForNetProfit } from "../lib/costing";
import { computeProductCost, deriveRates, findPricedItem, listPricedItems, rateBreakdownFor } from "../lib/derive";
import { newId, type DiscountTier, type Doc } from "../lib/doc";

/** 三檔折數的欄位名稱。順序就是折得越來越兇。 */
const LEVELS = [
  { key: "light", label: "小折" },
  { key: "mid", label: "中折" },
  { key: "deep", label: "重折" },
] as const;

export function DiscountsScreen({ doc, onChange }: { doc: Doc; onChange: (doc: Doc) => void }) {
  const rates = deriveRates(doc);
  const items = listPricedItems(doc);

  const [itemKey, setItemKey] = useState<string | null>(items[0]?.key ?? null);
  const [channelId, setChannelId] = useState<string | null>(null);
  const [profitGoal, setProfitGoal] = useState(0.4);
  const [growthGoal, setGrowthGoal] = useState(0.5);

  const item = findPricedItem(doc, itemKey);
  const cost = item ? computeProductCost(doc, item.product, item.variant) : null;
  const breakdown = rateBreakdownFor(doc, channelId);
  const price = item?.price ?? null;

  /** 某個折數下的單位利潤。折數是比例，所以用單價算就好，不必湊件數。 */
  const marginAt = (discountedPrice: number) =>
    computeMargin({
      price: discountedPrice,
      manufacturingCost: cost?.unitCost ?? null,
      logistics: logisticsCost(discountedPrice, rates.logistics, doc.settings.averageOrderValue),
      variableSellingRate: breakdown.variableSelling,
      overheadRate: breakdown.overhead,
      adSpendRate: breakdown.adSpend,
    });

  const current = price === null ? null : marginAt(price);

  const setTier = (id: string, patch: Partial<DiscountTier>) =>
    onChange({
      ...doc,
      discountTiers: doc.discountTiers.map((tier) => (tier.id === id ? { ...tier, ...patch } : tier)),
    });

  const addTier = () => {
    const last = doc.discountTiers.at(-1);
    onChange({
      ...doc,
      discountTiers: [
        ...doc.discountTiers,
        {
          id: newId(),
          threshold: last ? last.threshold * 2 : 1000,
          // 沿用上一列再各折深一點，只是省打字。使用者當然可以改。
          light: last ? Math.max(0.05, last.light - 0.05) : 0.95,
          mid: last ? Math.max(0.05, last.mid - 0.05) : 0.92,
          deep: last ? Math.max(0.05, last.deep - 0.05) : 0.9,
        },
      ],
    });
  };

  /** 變價目標：算出要賣多少錢。 */
  const solveFor = (targetProfit: number) =>
    priceForNetProfit({
      targetProfit,
      manufacturingCost: cost?.unitCost ?? null,
      percentRate: breakdown.total,
      averageLogistics: rates.logistics,
      averageOrderValue: doc.settings.averageOrderValue,
    });

  const goals =
    current?.netProfit == null
      ? null
      : [
          {
            label: `提高獲利 ${pct(profitGoal, 0)}`,
            hint: "銷量不變，只靠售價把淨利拉上來。",
            target: current.netProfit * (1 + profitGoal),
            result: solveFor(current.netProfit * (1 + profitGoal)),
          },
          {
            label: `提高成長率 ${pct(growthGoal, 0)}`,
            hint: `假設銷量增加 ${pct(growthGoal, 0)}，總淨利要維持不變，售價最多可以降到多少。`,
            target: current.netProfit / (1 + growthGoal),
            result: solveFor(current.netProfit / (1 + growthGoal)),
          },
        ];

  return (
    <div className="space-y-4">
      <Card title="試算對象">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="產品／規格">
            <select
              className={inputClass}
              value={itemKey ?? ""}
              onChange={(event) => setItemKey(event.target.value === "" ? null : event.target.value)}
            >
              <option value="">未選擇</option>
              {items.map((option) => (
                <option key={option.key} value={option.key}>
                  {option.name || "未命名"}
                </option>
              ))}
            </select>
          </Field>
          <Field label="通路" hint="不同通路抽成不同，同一張折扣表在不同通路的結果會差很多。">
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
        </div>

        <div className="mt-3 space-y-3">
          {item === null ? <Note>請先選一項產品或規格。</Note> : null}
          {item !== null && price === null ? (
            <Note tone="warn">這項還沒有售價，無法試算折扣。請先到「產品與用料」填售價。</Note>
          ) : null}
          {cost !== null && cost.unitCost === null ? (
            <Note tone="warn">
              成本未知（缺 {cost.missing.length} 項單價），下面每一格都會顯示「－」。
              折扣表在成本補齊之前沒有意義，因為你不知道折到哪裡會虧。
            </Note>
          ) : null}
        </div>

        {current !== null && current.netProfit !== null ? (
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <Stat label="現在售價" value={money(price)} />
            <Stat label="現在淨利" value={money(current.netProfit)} sub={pct(current.netRate)} />
            <Stat label="費率合計" value={pct(breakdown.total)} sub={`物流上限 ${rates.logistics.toFixed(0)} 元`} />
          </div>
        ) : null}
      </Card>

      <Card
        title="折扣表"
        action={<span className="text-xs text-ink-3">存的是折數。0.92 代表 92 折，不是折 92%。</span>}
      >
        <Note tone="warn">
          這張表你大概要來回改很多次。如果你發現自己一直得把折數往上調才不會虧，
          那不是折扣表的問題，是前面高估了毛利、低估了固定費用分攤。
        </Note>

        <div className="mt-4 space-y-3">
          {doc.discountTiers.map((tier) => (
            <div key={tier.id} className="rounded-lg border border-line bg-panel-2 p-3">
              <div className="grid grid-cols-2 items-end gap-3 sm:grid-cols-5">
                <Field label="滿多少元">
                  <input
                    className={inputClass}
                    type="number"
                    step="100"
                    min="0"
                    value={tier.threshold}
                    onChange={(event) => setTier(tier.id, { threshold: Number(event.target.value) || 0 })}
                  />
                </Field>
                {LEVELS.map((level) => (
                  <Field key={level.key} label={level.label} hint="0.92＝92 折">
                    <input
                      className={inputClass}
                      type="number"
                      step="0.01"
                      min="0.01"
                      max="1"
                      value={tier[level.key]}
                      onChange={(event) => setTier(tier.id, { [level.key]: Number(event.target.value) || 0 })}
                    />
                  </Field>
                ))}
                <div className="flex items-end">
                  <Button
                    variant="danger"
                    onClick={() =>
                      onChange({ ...doc, discountTiers: doc.discountTiers.filter((row) => row.id !== tier.id) })
                    }
                  >
                    刪除
                  </Button>
                </div>
              </div>

              {price !== null ? (
                <div className="mt-3 grid gap-2 sm:grid-cols-3">
                  {LEVELS.map((level) => (
                    <TierCell key={level.key} label={level.label} price={price} rate={tier[level.key]} marginAt={marginAt} />
                  ))}
                </div>
              ) : null}
            </div>
          ))}

          {doc.discountTiers.length === 0 ? (
            <p className="text-sm text-ink-3">還沒有級距。新增一列，填「滿多少元」與三檔折數。</p>
          ) : null}
        </div>

        <div className="mt-4">
          <Button variant="secondary" onClick={addTier}>
            新增級距
          </Button>
        </div>
      </Card>

      <Card title="單品變價試算">
        <p className="text-sm leading-relaxed text-ink-2">
          兩種目標，兩個方向。左邊是「不動銷量、把價格拉上去」，右邊是「用降價換銷量」。
          兩邊都是<span className="font-semibold">反推</span>：先講你要的結果，再算出售價。
        </p>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Field label="提高獲利目標" hint="0.4 代表希望淨利比現在多 40%。">
            <input
              className={inputClass}
              type="number"
              step="0.05"
              min="0"
              value={profitGoal}
              onChange={(event) => setProfitGoal(Number(event.target.value) || 0)}
            />
          </Field>
          <Field label="提高成長率目標" hint="0.5 代表預期銷量會增加 50%。">
            <input
              className={inputClass}
              type="number"
              step="0.05"
              min="0"
              value={growthGoal}
              onChange={(event) => setGrowthGoal(Number(event.target.value) || 0)}
            />
          </Field>
        </div>

        {goals === null ? (
          <div className="mt-4">
            <Note tone="warn">需要售價與成本都齊全才算得出來。</Note>
          </div>
        ) : (
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {goals.map((goal) => (
              <div key={goal.label} className="rounded-lg border border-line bg-panel-2 p-4">
                <h4 className="text-sm font-semibold text-ink">{goal.label}</h4>
                <p className="mt-1 text-xs leading-relaxed text-ink-3">{goal.hint}</p>

                <div className="mt-3 text-2xl font-bold text-acid">
                  {goal.result.ok ? money(goal.result.price) : goal.result.reason === "NO_COST" ? "－" : "無解"}
                </div>

                {goal.result.ok && price !== null ? (
                  <p className="mt-1 text-xs text-ink-3">
                    目標單位淨利 {money(goal.target)}。
                    {goal.result.price >= price
                      ? `售價要從 ${money(price)} 調到 ${money(goal.result.price)}，漲 ${pct(
                          goal.result.price / price - 1,
                        )}。`
                      : `售價最多降到 ${money(goal.result.price)}，降 ${pct(1 - goal.result.price / price)}。`}
                  </p>
                ) : goal.result.ok ? null : (
                  <p className="mt-1 text-xs text-bad">
                    {goal.result.reason === "NO_COST"
                      ? "成本未知，算不出來。"
                      : "費率合計已經吃掉全部售價，這個目標賣多貴都達不到。"}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}

        <p className="mt-4 text-xs leading-relaxed text-ink-3">
          ⚠️「提高成長率」給的是<span className="font-semibold">價格下限的參考</span>，不是保證。
          銷量會不會真的增加那麼多是市場的事，這裡只負責告訴你：如果真的增加了，你降到這個價還不會比現在差。
        </p>
      </Card>

      <Accordion title="這一頁怎麼讀" summary="三個容易誤會的地方">
        <div className="space-y-3 text-sm leading-relaxed text-ink-2">
          <p>
            <span className="font-semibold text-ink">每一格顯示的是淨利率，不是毛利率。</span>
            折扣表最危險的地方就是「毛利還有 40% 看起來很安全」，但扣完變動銷售與固定分攤之後，
            淨利早就是負的了。
          </p>
          <p>
            <span className="font-semibold text-ink">折數是按單價算的，跟買幾件無關。</span>
            折數是比例，所以單位淨利率不會因為件數改變。門檻金額只是告訴你「客人買到多少才吃得到這一檔」。
          </p>
          <p>
            <span className="font-semibold text-ink">物流會跟著折後價變少。</span>
            它是按營收比例攤提的（上限是每筆平均運費），所以折得越深，攤到的運費也越少。
            這也是為什麼有些商品打到骨折反而不會爆掉。
          </p>
        </div>
      </Accordion>
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-lg border border-line bg-panel-2 p-3">
      <div className="text-xs text-ink-3">{label}</div>
      <div className="mt-1 text-xl font-bold text-ink">{value}</div>
      {sub ? <div className="mt-0.5 text-xs text-ink-3">{sub}</div> : null}
    </div>
  );
}

/** 折扣表的一格。爆掉的格子一定要一眼看得出來。 */
function TierCell({
  label,
  price,
  rate,
  marginAt,
}: {
  label: string;
  price: number;
  rate: number;
  marginAt: (price: number) => ReturnType<typeof computeMargin>;
}) {
  const discounted = price * rate;
  const margin = marginAt(discounted);
  const dead = margin.netProfit !== null && margin.netProfit < 0;

  return (
    <div
      className={`rounded-md border px-3 py-2 ${dead ? "border-bad/50 bg-bad/10" : "border-line bg-panel"}`}
    >
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-xs text-ink-3">
          {label}　{money(discounted)}
        </span>
        <span className={`text-xs font-semibold ${dead ? "text-bad" : "text-ink-3"}`}>
          {(rate * 10).toFixed(1)} 折
        </span>
      </div>
      <div className={`mt-1 text-lg font-bold ${dead ? "text-bad" : "text-ink"}`}>
        {margin.netProfit === null ? "－" : money(margin.netProfit)}
        <span className="ml-2 text-sm font-normal">{pct(margin.netRate)}</span>
      </div>
      {dead ? <div className="mt-0.5 text-xs font-semibold text-bad">這樣賣是虧的</div> : null}
    </div>
  );
}
