// 團購優惠。
//
// ⚠️ 團購跟一般促銷的關鍵差別：團主毛利是**從團員結帳金額裡抽走的**，
//    但通路抽成、金流、稅、固定分攤仍然按結帳金額算。
//    很多人把團主毛利當成「行銷費用」另外看，結果整場團購賠了還以為有賺。
//
// 🚫 團購一次常常出幾百單，成本未知卻當成有賺，賠起來是等比例放大的。
//    所以成本沒齊的時候一律顯示「不知道」。

import { useState } from "react";
import { Accordion, Button, Card, Field, Note, inputClass, money, pct } from "../components/ui";
import { simulateGroupBuy } from "../lib/costing";
import { computeProductCost, deriveRates, findPricedItem, listPricedItems, rateBreakdownFor } from "../lib/derive";
import { newId, type Doc, type GroupBuy, type GroupBuyTier } from "../lib/doc";

export function GroupBuyScreen({ doc, onChange }: { doc: Doc; onChange: (doc: Doc) => void }) {
  const rates = deriveRates(doc);
  const items = listPricedItems(doc);

  const [itemKey, setItemKey] = useState<string | null>(items[0]?.key ?? null);
  const [quantity, setQuantity] = useState(10);

  const item = findPricedItem(doc, itemKey);
  const cost = item ? computeProductCost(doc, item.product, item.variant) : null;
  const subtotal = item?.price != null ? item.price * quantity : null;

  const setGroupBuy = (id: string, patch: Partial<GroupBuy>) =>
    onChange({
      ...doc,
      groupBuys: doc.groupBuys.map((groupBuy) => (groupBuy.id === id ? { ...groupBuy, ...patch } : groupBuy)),
    });

  const setTier = (groupBuy: GroupBuy, tierId: string, patch: Partial<GroupBuyTier>) =>
    setGroupBuy(groupBuy.id, {
      tiers: groupBuy.tiers.map((tier) => (tier.id === tierId ? { ...tier, ...patch } : tier)),
    });

  const addGroupBuy = () =>
    onChange({
      ...doc,
      groupBuys: [
        ...doc.groupBuys,
        {
          id: newId(),
          name: "",
          leaderName: "",
          channelRateId: null,
          freeShippingThreshold: null,
          // 預設給一列，也就是最單純的「單一折扣式」。
          tiers: [{ id: newId(), threshold: 1, discount: 0.9, partnerShare: 0.2 }],
        },
      ],
    });

  return (
    <div className="space-y-4">
      <Card title="試算情境">
        <div className="grid gap-4 sm:grid-cols-3">
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
          <Field label="這一單買幾件" hint="團購常常一次幾十件，數字放大之後問題才看得出來。">
            <input
              className={inputClass}
              type="number"
              min="1"
              step="1"
              value={quantity}
              onChange={(event) => setQuantity(Math.max(1, Number(event.target.value) || 1))}
            />
          </Field>
          <Field label="原價小計" hint="售價 × 件數。">
            <input className={`${inputClass} bg-panel-2`} value={subtotal === null ? "－" : money(subtotal)} readOnly />
          </Field>
        </div>

        <div className="mt-3 space-y-3">
          {item === null ? <Note>請先選一項產品或規格。</Note> : null}
          {item !== null && item.price === null ? (
            <Note tone="warn">這項還沒有售價，無法試算。請先到「產品與用料」填售價。</Note>
          ) : null}
          {cost !== null && cost.unitCost === null ? (
            <Note tone="warn">
              成本未知（缺 {cost.missing.length} 項單價）。給團主多少錢仍算得出來，
              但「你還剩多少」會顯示「不知道」。團購一次幾百單，這裡猜錯代價很大。
            </Note>
          ) : null}
        </div>
      </Card>

      {doc.groupBuys.map((groupBuy) => {
        const breakdown = rateBreakdownFor(doc, groupBuy.channelRateId);
        const singleRate = groupBuy.tiers.length <= 1;

        return (
          <Card
            key={groupBuy.id}
            title={groupBuy.name || "未命名團購"}
            action={
              <span className="text-xs text-ink-3">
                {singleRate ? "單一折扣式" : "變價式"}　費率合計 {pct(breakdown.total)}
              </span>
            }
          >
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Field label="開團名稱">
                <input
                  className={inputClass}
                  value={groupBuy.name}
                  placeholder="例如：三月團"
                  onChange={(event) => setGroupBuy(groupBuy.id, { name: event.target.value })}
                />
              </Field>
              <Field label="團主名稱">
                <input
                  className={inputClass}
                  value={groupBuy.leaderName}
                  onChange={(event) => setGroupBuy(groupBuy.id, { leaderName: event.target.value })}
                />
              </Field>
              <Field label="通路">
                <select
                  className={inputClass}
                  value={groupBuy.channelRateId ?? ""}
                  onChange={(event) =>
                    setGroupBuy(groupBuy.id, {
                      channelRateId: event.target.value === "" ? null : event.target.value,
                    })
                  }
                >
                  <option value="">自有通路（不抽成）</option>
                  {rates.channels.map((rate) => (
                    <option key={rate.id} value={rate.id}>
                      {rate.name || "未命名"}（{pct(rate.value)}）
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="免運門檻" hint="達到就由你吸收運費。留空代表運費一律團員自付。">
                <input
                  className={inputClass}
                  type="number"
                  min="0"
                  placeholder="留空"
                  value={groupBuy.freeShippingThreshold ?? ""}
                  onChange={(event) =>
                    setGroupBuy(groupBuy.id, {
                      freeShippingThreshold: event.target.value === "" ? null : Number(event.target.value),
                    })
                  }
                />
              </Field>
            </div>

            <h4 className="mt-6 text-sm font-semibold text-ink">
              折扣標準表
              <span className="ml-2 text-xs font-normal text-ink-3">
                {singleRate
                  ? "只有一列＝單一折扣式：不管買多少都同一個折數與團主毛利。"
                  : "多列＝變價式：買越多折越好、團主也拿越多。"}
              </span>
            </h4>

            <div className="mt-2 space-y-3">
              {groupBuy.tiers.map((tier) => {
                const applies = subtotal !== null && subtotal >= tier.threshold;
                const absorbsShipping =
                  groupBuy.freeShippingThreshold !== null &&
                  subtotal !== null &&
                  subtotal * tier.discount >= groupBuy.freeShippingThreshold;

                const result =
                  subtotal === null
                    ? null
                    : simulateGroupBuy({
                        subtotal,
                        quantity,
                        costPerUnit: cost?.unitCost ?? null,
                        discount: tier.discount,
                        partnerShare: tier.partnerShare,
                        absorbsShipping,
                        averageLogistics: rates.logistics,
                        averageOrderValue: doc.settings.averageOrderValue,
                        variableSellingRate: breakdown.variableSelling,
                        overheadRate: breakdown.overhead,
                        adSpendRate: breakdown.adSpend,
                      });

                const dead = result?.netProfit != null && result.netProfit < 0;

                return (
                  <div
                    key={tier.id}
                    className={`rounded-lg border p-3 ${dead ? "border-bad/50 bg-bad/10" : "border-line bg-panel-2"}`}
                  >
                    <div className="grid grid-cols-2 items-end gap-3 sm:grid-cols-4">
                      <Field label="小計滿多少元">
                        <input
                          className={inputClass}
                          type="number"
                          min="0"
                          value={tier.threshold}
                          onChange={(event) =>
                            setTier(groupBuy, tier.id, { threshold: Number(event.target.value) || 0 })
                          }
                        />
                      </Field>
                      <Field label="折數" hint="0.9＝九折">
                        <input
                          className={inputClass}
                          type="number"
                          step="0.01"
                          min="0.01"
                          max="1"
                          value={tier.discount}
                          onChange={(event) =>
                            setTier(groupBuy, tier.id, { discount: Number(event.target.value) || 0 })
                          }
                        />
                      </Field>
                      <Field label="團主毛利" hint="0.2＝抽兩成">
                        <input
                          className={inputClass}
                          type="number"
                          step="0.01"
                          min="0"
                          max="0.99"
                          value={tier.partnerShare}
                          onChange={(event) =>
                            setTier(groupBuy, tier.id, { partnerShare: Number(event.target.value) || 0 })
                          }
                        />
                      </Field>
                      <div className="flex items-end">
                        <Button
                          variant="danger"
                          onClick={() =>
                            setGroupBuy(groupBuy.id, {
                              tiers: groupBuy.tiers.filter((row) => row.id !== tier.id),
                            })
                          }
                        >
                          刪除
                        </Button>
                      </div>
                    </div>

                    {result !== null ? (
                      <>
                        <dl className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
                          <Cell label="團員結帳" value={money(result.checkout)} />
                          <Cell label="給團主" value={`−${money(result.partnerPayout)}`} />
                          <Cell
                            label="運費"
                            value={result.logistics === 0 ? "團員自付" : `−${money(result.logistics)}`}
                          />
                          <Cell
                            label="你的淨利"
                            value={result.netProfit === null ? "－" : money(result.netProfit)}
                            sub={pct(result.netRate)}
                            tone={dead ? "bad" : "normal"}
                          />
                        </dl>

                        <p className="mt-2 text-xs text-ink-3">
                          {applies ? "這一籃適用這一列。" : `這一籃小計未達 ${money(tier.threshold)}，實際不適用這一列。`}
                          {result.profitable === null
                            ? "　成本未知，不知道賺不賺。"
                            : dead
                              ? "　這樣開團是虧的。"
                              : ""}
                        </p>
                      </>
                    ) : null}
                  </div>
                );
              })}
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <Button
                variant="secondary"
                onClick={() => {
                  const last = groupBuy.tiers.at(-1);
                  setGroupBuy(groupBuy.id, {
                    tiers: [
                      ...groupBuy.tiers,
                      {
                        id: newId(),
                        threshold: last ? Math.max(last.threshold * 2, 1000) : 1000,
                        discount: last ? Math.max(0.05, last.discount - 0.03) : 0.9,
                        partnerShare: last ? Math.min(0.9, last.partnerShare + 0.03) : 0.2,
                      },
                    ],
                  });
                }}
              >
                新增級距
              </Button>
              <Button
                variant="danger"
                onClick={() => {
                  if (!confirm("刪除這個團購方案？")) return;
                  onChange({ ...doc, groupBuys: doc.groupBuys.filter((row) => row.id !== groupBuy.id) });
                }}
              >
                刪除方案
              </Button>
            </div>
          </Card>
        );
      })}

      <Card>
        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={addGroupBuy}>新增團購方案</Button>
          <span className="text-sm text-ink-3">目前 {money(doc.groupBuys.length)} 個方案。</span>
        </div>
      </Card>

      <Accordion title="團購為什麼特別容易算錯" summary="三個地方">
        <div className="space-y-3 text-sm leading-relaxed text-ink-2">
          <p>
            <span className="font-semibold text-ink">團主毛利是從結帳金額抽走的，不是額外的行銷費用。</span>
            但通路抽成、金流、稅、固定分攤仍然按結帳金額算，不會因為你分了兩成給團主就少收。
            把團主毛利另外記在一邊，是團購賠錢卻以為有賺的頭號原因。
          </p>
          <p>
            <span className="font-semibold text-ink">免運門檻是一個真的成本開關。</span>
            未達門檻時運費由團員自付，對你是收支相抵；達到門檻才變成你的成本。
            這一格設錯，整場團購的損益會差很多。
          </p>
          <p>
            <span className="font-semibold text-ink">變價式牽涉到人性，要想清楚再開。</span>
            只填一列就是單一折扣式，最單純也最不會出事。
            多列代表買越多折越好，團主為了衝到下一級可能會自己補單，那個量不是真需求。
          </p>
        </div>
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
  tone?: "normal" | "bad";
}) {
  return (
    <div>
      <dt className="text-xs text-ink-3">{label}</dt>
      <dd className={`mt-0.5 text-lg font-bold ${tone === "bad" ? "text-bad" : "text-ink"}`}>
        {value}
        {sub ? <span className="ml-2 text-sm font-normal text-ink-3">{sub}</span> : null}
      </dd>
    </div>
  );
}
