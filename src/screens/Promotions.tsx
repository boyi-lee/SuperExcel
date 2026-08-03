// 促銷試算：這樣打折之後還剩多少。
//
// 🚫 成本未知時「折後是否仍有賺」一律顯示「不知道」，不得顯示「有賺」。
//    「不知道賺不賺」與「確定有賺」是完全不同的兩件事，混為一談會賠錢。

import { useState } from "react";
import { Button, Card, Field, Note, inputClass, money, pct } from "../components/ui";
import { formatUnitCost, logisticsCost, simulatePromotion } from "../lib/costing";
import { computeProductCost, deriveRates, findPricedItem, listPricedItems, rateBreakdownFor } from "../lib/derive";
import { newId, type Doc, type Promotion, type PromotionRule } from "../lib/doc";

const TRIGGER_LABEL: Record<PromotionRule["trigger"], string> = {
  AMOUNT: "滿額",
  QUANTITY: "滿件",
  COUPON: "優惠券（滿額才可用）",
};

const DISCOUNT_LABEL: Record<PromotionRule["discount"], string> = {
  FIXED: "折抵金額",
  PERCENT: "折抵比率",
};

export function PromotionsScreen({ doc, onChange }: { doc: Doc; onChange: (doc: Doc) => void }) {
  const rates = deriveRates(doc);
  const items = listPricedItems(doc);
  const [itemKey, setItemKey] = useState<string | null>(items[0]?.key ?? null);
  const [quantity, setQuantity] = useState(1);

  // 有規格的商品，成本與售價都看子規格：黃色跟限定色的成本可能差很多。
  const item = findPricedItem(doc, itemKey);
  const cost = item ? computeProductCost(doc, item.product, item.variant) : null;
  const subtotal = item?.price != null ? item.price * quantity : null;

  const setPromotion = (id: string, patch: Partial<Promotion>) =>
    onChange({
      ...doc,
      promotions: doc.promotions.map((promotion) =>
        promotion.id === id ? { ...promotion, ...patch } : promotion,
      ),
    });

  const addPromotion = () =>
    onChange({
      ...doc,
      promotions: [
        ...doc.promotions,
        { id: newId(), name: "", channelRateId: null, partnerShare: null, rules: [] },
      ],
    });

  const addRule = (promotion: Promotion) =>
    setPromotion(promotion.id, {
      rules: [
        ...promotion.rules,
        { id: newId(), trigger: "AMOUNT", discount: "FIXED", threshold: 0, value: 0 },
      ],
    });

  return (
    <>
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
          <Field label="件數">
            <input
              className={inputClass}
              type="number"
              step="1"
              min="1"
              value={quantity}
              onChange={(event) => setQuantity(Math.max(1, Number(event.target.value) || 1))}
            />
          </Field>
          <Field label="原價小計" hint="售價 × 件數，由上面兩欄算出。">
            <input className={`${inputClass} bg-stone-50`} value={subtotal === null ? "－" : money(subtotal)} readOnly />
          </Field>
        </div>

        <div className="mt-3 space-y-3">
          {item === null ? <Note>請先選一項產品或規格。</Note> : null}
          {item !== null && item.price === null ? (
            <Note tone="warn">這項還沒有售價，無法試算折扣。請先到「產品與用料」填售價。</Note>
          ) : null}
          {cost !== null && cost.unitCost === null ? (
            <Note tone="warn">
              這項產品的成本未知（缺 {cost.missing.length} 項單價）。折抵金額仍算得出來，
              但「折後還剩多少」會顯示「不知道」：不會給你一個看起來有賺的數字。
            </Note>
          ) : null}
        </div>

        {cost !== null ? (
          <p className="mt-3 text-sm text-stone-700">
            單位成本 <span className="font-semibold">{formatUnitCost(cost.unitCost)}</span>
            {subtotal === null
              ? `，每筆平均物流 ${rates.logistics.toFixed(2)} 元。`
              : `，這一籃攤到的物流 ${logisticsCost(
                  subtotal,
                  rates.logistics,
                  doc.settings.averageOrderValue,
                ).toFixed(2)} 元（上限為每筆平均運費 ${rates.logistics.toFixed(2)} 元）。`}
          </p>
        ) : null}
      </Card>

      {doc.promotions.map((promotion) => {
        const partnerShare = promotion.partnerShare ?? 0;
        const breakdown = rateBreakdownFor(doc, promotion.channelRateId, partnerShare);
        const result =
          subtotal === null
            ? null
            : simulatePromotion({
                basket: { subtotal, quantity },
                rules: promotion.rules,
                costPerUnit: cost?.unitCost ?? null,
                averageLogistics: rates.logistics,
                averageOrderValue: doc.settings.averageOrderValue,
                variableSellingRate: breakdown.variableSelling,
                overheadRate: breakdown.overhead,
                adSpendRate: breakdown.adSpend,
              });

        return (
          <Card
            key={promotion.id}
            title={promotion.name || "未命名方案"}
            action={<span className="text-xs text-stone-600">費率合計 {pct(breakdown.total)}</span>}
          >
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="方案名稱">
                <input
                  className={inputClass}
                  value={promotion.name}
                  placeholder="例如：週年慶滿千折百"
                  onChange={(event) => setPromotion(promotion.id, { name: event.target.value })}
                />
              </Field>
              <Field label="通路">
                <select
                  className={inputClass}
                  value={promotion.channelRateId ?? ""}
                  onChange={(event) =>
                    setPromotion(promotion.id, {
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
              <Field label="分潤比例" hint="團購團主毛利之類。0.2 代表再給出 20%。">
                <input
                  className={inputClass}
                  type="number"
                  step="0.01"
                  min="0"
                  max="0.99"
                  value={promotion.partnerShare ?? ""}
                  onChange={(event) =>
                    setPromotion(promotion.id, {
                      partnerShare: event.target.value === "" ? null : Number(event.target.value),
                    })
                  }
                />
              </Field>
            </div>

            <div className="mt-4 space-y-2">
              {promotion.rules.map((rule) => (
                <div key={rule.id} className="grid grid-cols-1 items-end gap-3 rounded-lg border border-stone-200 p-3 sm:grid-cols-2 lg:grid-cols-4">
                  <Field label="門檻類型">
                    <select
                      className={inputClass}
                      value={rule.trigger}
                      onChange={(event) =>
                        setPromotion(promotion.id, {
                          rules: promotion.rules.map((item) =>
                            item.id === rule.id
                              ? { ...item, trigger: event.target.value as PromotionRule["trigger"] }
                              : item,
                          ),
                        })
                      }
                    >
                      {(Object.keys(TRIGGER_LABEL) as PromotionRule["trigger"][]).map((key) => (
                        <option key={key} value={key}>
                          {TRIGGER_LABEL[key]}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label={rule.trigger === "QUANTITY" ? "滿幾件" : "滿多少元"}>
                    <input
                      className={inputClass}
                      type="number"
                      step={rule.trigger === "QUANTITY" ? "1" : "1"}
                      min="0"
                      value={rule.threshold}
                      onChange={(event) =>
                        setPromotion(promotion.id, {
                          rules: promotion.rules.map((item) =>
                            item.id === rule.id ? { ...item, threshold: Number(event.target.value) || 0 } : item,
                          ),
                        })
                      }
                    />
                  </Field>
                  <Field label="折抵方式">
                    <select
                      className={inputClass}
                      value={rule.discount}
                      onChange={(event) =>
                        setPromotion(promotion.id, {
                          rules: promotion.rules.map((item) =>
                            item.id === rule.id
                              ? { ...item, discount: event.target.value as PromotionRule["discount"] }
                              : item,
                          ),
                        })
                      }
                    >
                      {(Object.keys(DISCOUNT_LABEL) as PromotionRule["discount"][]).map((key) => (
                        <option key={key} value={key}>
                          {DISCOUNT_LABEL[key]}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label={rule.discount === "PERCENT" ? "折抵比率（0.1＝九折）" : "折抵金額"}>
                    <input
                      className={inputClass}
                      type="number"
                      step={rule.discount === "PERCENT" ? "0.01" : "1"}
                      min="0"
                      value={rule.value}
                      onChange={(event) =>
                        setPromotion(promotion.id, {
                          rules: promotion.rules.map((item) =>
                            item.id === rule.id ? { ...item, value: Number(event.target.value) || 0 } : item,
                          ),
                        })
                      }
                    />
                  </Field>
                  <Button
                    variant="danger"
                    onClick={() =>
                      setPromotion(promotion.id, {
                        rules: promotion.rules.filter((item) => item.id !== rule.id),
                      })
                    }
                  >
                    刪除
                  </Button>
                </div>
              ))}
              {promotion.rules.length === 0 ? (
                <p className="text-sm text-stone-600">還沒有折扣規則，等於原價。</p>
              ) : null}
              {promotion.rules.length > 1 ? (
                <p className="text-xs text-stone-600">
                  多條規則會<span className="font-semibold">疊加</span>（不是取最優）。要互斥請拆成不同方案分別試算。
                </p>
              ) : null}
            </div>

            <div className="mt-3 flex flex-wrap gap-2">
              <Button variant="secondary" onClick={() => addRule(promotion)}>
                新增規則
              </Button>
              <Button
                variant="danger"
                onClick={() =>
                  onChange({ ...doc, promotions: doc.promotions.filter((item) => item.id !== promotion.id) })
                }
              >
                刪除方案
              </Button>
            </div>

            {result !== null ? (
              <div className="mt-5 rounded-lg border border-stone-200 bg-stone-50 p-4">
                <dl className="grid gap-3 sm:grid-cols-4">
                  <div>
                    <dt className="text-xs text-stone-600">折抵</dt>
                    <dd className="text-lg font-semibold text-stone-900">−{money(result.discount)}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-stone-600">折後實收</dt>
                    <dd className="text-lg font-semibold text-stone-900">{money(result.netRevenue)}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-stone-600">折後淨利</dt>
                    <dd
                      className={`text-lg font-semibold ${
                        result.netProfit !== null && result.netProfit < 0 ? "text-red-700" : "text-stone-900"
                      }`}
                    >
                      {result.netProfit === null ? "－" : money(result.netProfit)}
                      <span className="ml-2 text-sm font-normal text-stone-600">{pct(result.netRate)}</span>
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-stone-600">這樣打折還有賺嗎</dt>
                    <dd className="text-lg font-semibold">
                      {result.profitable === null ? (
                        <span className="text-amber-700">不知道（成本未知）</span>
                      ) : result.profitable ? (
                        <span className="text-brand-700">有</span>
                      ) : (
                        <span className="text-red-700">沒有，這樣賣是虧的</span>
                      )}
                    </dd>
                  </div>
                </dl>

                {/*
                  ⚠️ 這一段是整個促銷試算最重要的地方。
                  打折之後費用會跟著變少，淨利因此不會照折抵金額等比例掉。
                  不把這件事寫出來，使用者會以為活動「沒有想像中傷」，
                  但那不是因為賣得好，是因為少付了本來就該分攤的費用。
                */}
                {result.netProfitAtFullPrice !== null ? (
                  <div className="mt-4 border-t border-stone-200 pt-3 text-sm text-stone-700">
                    <p>
                      原價淨利 <span className="font-semibold">{money(result.netProfitAtFullPrice)}</span>
                      ，折後 <span className="font-semibold">{money(result.netProfit)}</span>，
                      實際少賺 <span className="font-semibold">
                        {money(result.netProfitAtFullPrice - (result.netProfit ?? 0))}
                      </span>
                      ，但你折掉了 {money(result.discount)}。
                    </p>
                    <p className="mt-1 text-xs text-stone-600">
                      差額 {money(result.savedVariableCost)} 元是<span className="font-semibold">少付的費用</span>
                      （變動銷售、固定分攤與物流都是按售價算的，售價降了它們就跟著降）。
                      這不是多賺，只是少付。判斷活動好不好，要看銷量有沒有真的增加。
                    </p>
                  </div>
                ) : (
                  <p className="mt-4 border-t border-stone-200 pt-3 text-xs text-stone-600">
                    因為降價而少付的費用是 {money(result.savedVariableCost)} 元。
                    成本補齊之後，這裡會告訴你「少賺多少」與「少付多少」分別是多少。
                  </p>
                )}

                <p className="mt-3 text-xs text-stone-600">
                  折後淨利 ＝ 實收 − 單位成本×件數 − 實收×費率合計（{pct(breakdown.total)}） − 物流。
                </p>
              </div>
            ) : null}
          </Card>
        );
      })}

      <Card>
        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={addPromotion}>新增促銷方案</Button>
          <span className="text-sm text-stone-600">目前 {money(doc.promotions.length)} 個方案。</span>
        </div>
      </Card>
    </>
  );
}
