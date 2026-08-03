import { Button, Card, Field, Note, inputClass, pct } from "../components/ui";
import { deriveRates, resolveAdSpend } from "../lib/derive";
import { RATE_META, newId, type Doc, type Rate, type RateKind } from "../lib/doc";

const ORDER: RateKind[] = ["LOGISTICS", "PAYMENT", "CHANNEL", "OVERHEAD", "RETURN"];

export function RatesScreen({ doc, onChange }: { doc: Doc; onChange: (doc: Doc) => void }) {
  const rates = deriveRates(doc);
  const ad = resolveAdSpend(doc);
  const total = rates.payment + rates.overhead + rates.tax + ad.rate;

  const setSettings = (patch: Partial<Doc["settings"]>) =>
    onChange({ ...doc, settings: { ...doc.settings, ...patch } });

  const setRate = (id: string, patch: Partial<Rate>) =>
    onChange({ ...doc, rates: doc.rates.map((rate) => (rate.id === id ? { ...rate, ...patch } : rate)) });

  const addRate = (kind: RateKind) =>
    onChange({
      ...doc,
      rates: [
        ...doc.rates,
        { id: newId(), kind, name: "", value: 0, usageShare: null, packagingCost: null, handlingCost: null },
      ],
    });

  const removeRate = (id: string) => onChange({ ...doc, rates: doc.rates.filter((rate) => rate.id !== id) });

  return (
    <>
      <Card title="基本設定">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="本位幣別">
            <input
              className={inputClass}
              value={doc.settings.baseCurrency}
              onChange={(event) => setSettings({ baseCurrency: event.target.value.toUpperCase().slice(0, 3) })}
            />
          </Field>
          <Field label="營業稅率" hint="台灣為 0.05。填稅率本身，不要填「含稅售價中的稅負佔比」。">
            <input
              className={inputClass}
              type="number"
              step="0.0001"
              min="0"
              max="0.9999"
              value={doc.settings.taxRate}
              onChange={(event) => setSettings({ taxRate: Number(event.target.value) || 0 })}
            />
          </Field>
          <Field
            label="平均客單價"
            hint="用來把每筆平均運費換算成按營收攤提，並以平均運費為上限。留空就一律用整筆平均運費。"
            className="sm:col-span-2"
          >
            <input
              className={inputClass}
              type="number"
              step="1"
              min="0"
              placeholder="留空"
              value={doc.settings.averageOrderValue ?? ""}
              onChange={(event) =>
                setSettings({
                  averageOrderValue: event.target.value === "" ? null : Number(event.target.value),
                })
              }
            />
          </Field>
        </div>

        {doc.settings.averageOrderValue === null && rates.logistics > 0 ? (
          <div className="mt-3">
            <Note tone="warn">
              沒填平均客單價，所以每一件商品都攤到一整筆平均運費 {rates.logistics.toFixed(2)} 元。
              低價商品會因此看起來全部都在虧。填了之後，物流會按營收比例攤，並以這筆平均運費為上限，
              高價商品也就不會攤到你根本沒花的運費。
            </Note>
          </div>
        ) : null}

        <label className="mt-4 flex items-start gap-2">
          <input
            type="checkbox"
            className="mt-1"
            checked={doc.settings.priceIncludesTax}
            onChange={(event) => setSettings({ priceIncludesTax: event.target.checked })}
          />
          <span className="text-sm text-stone-700">
            商品售價為含稅價
            <span className="mt-1 block text-xs text-stone-600">
              勾選時，售價中的實際稅負佔比是 {pct(doc.settings.taxRate / (1 + doc.settings.taxRate))}
              （{pct(doc.settings.taxRate)} ÷ {(1 + doc.settings.taxRate).toFixed(2)}），
              未勾選時就是 {pct(doc.settings.taxRate)}。
              兩個數字不一樣是正常的，很多試算表把後者直接寫死成 4.8%，之後就沒有人知道那是什麼。
            </span>
          </span>
        </label>

        <fieldset className="mt-4 rounded-lg border border-stone-200 p-4">
          <legend className="px-2 text-sm font-semibold text-stone-800">廣告費</legend>
          <div className="grid gap-3">
            {(
              [
                ["NOT_INCLUDED", "未納入", "邊際貢獻不含廣告費，畫面會標示。這是最誠實的預設。"],
                ["ESTIMATE", "手動預估", "填一個佔營收的比率，畫面會標示這是估計值。"],
              ] as const
            ).map(([value, label, hint]) => (
              <label key={value} className="flex items-start gap-2">
                <input
                  type="radio"
                  className="mt-1"
                  checked={doc.settings.adSpendMode === value}
                  onChange={() => setSettings({ adSpendMode: value })}
                />
                <span className="text-sm text-stone-700">
                  {label}
                  <span className="mt-1 block text-xs text-stone-600">{hint}</span>
                </span>
              </label>
            ))}
          </div>
          {doc.settings.adSpendMode === "ESTIMATE" ? (
            <Field label="預估廣告費佔營收比" className="mt-3 sm:max-w-xs">
              <input
                className={inputClass}
                type="number"
                step="0.0001"
                min="0"
                max="0.9999"
                value={doc.settings.adSpendRate ?? ""}
                onChange={(event) =>
                  setSettings({ adSpendRate: event.target.value === "" ? null : Number(event.target.value) })
                }
              />
            </Field>
          ) : null}
        </fieldset>
      </Card>

      <Card title="目前的合計">
        <p className="text-sm text-stone-700">
          金流 {pct(rates.payment)} ＋ 稅 {pct(rates.tax)} ＋ 固定費用分攤 {pct(rates.overhead)}
          {ad.included ? ` ＋ 廣告 ${pct(ad.rate)}` : ""} ={" "}
          <span className="font-semibold">{pct(total)}</span>，另每筆平均物流 {rates.logistics.toFixed(2)} 元
          （這個金額同時是物流攤提的上限）。通路抽成在試算時個別選擇，不含在這裡。
        </p>
        {!ad.included ? (
          <div className="mt-3">
            <Note tone="warn">{ad.note}</Note>
          </div>
        ) : null}
      </Card>

      {ORDER.map((kind) => {
        const meta = RATE_META[kind];
        const rows = doc.rates.filter((rate) => rate.kind === kind);
        return (
          <Card
            key={kind}
            title={meta.label}
            action={<span className="text-xs text-stone-600">{meta.hint}</span>}
          >
            <div className="space-y-2">
              {rows.map((rate) => (
                <div key={rate.id} className="grid grid-cols-1 items-end gap-3 rounded-lg border border-stone-200 p-3 sm:grid-cols-2 lg:grid-cols-4">
                  <Field label="名稱">
                    <input
                      className={inputClass}
                      value={rate.name}
                      onChange={(event) => setRate(rate.id, { name: event.target.value })}
                    />
                  </Field>
                  <Field label={meta.unit === "amount" ? "運費" : "費率"}>
                    <input
                      className={inputClass}
                      type="number"
                      step={meta.unit === "amount" ? "0.01" : "0.0001"}
                      min="0"
                      value={rate.value}
                      onChange={(event) => setRate(rate.id, { value: Number(event.target.value) || 0 })}
                    />
                  </Field>
                  {meta.unit === "amount" ? (
                    <>
                      <Field label="包材">
                        <input
                          className={inputClass}
                          type="number"
                          step="0.01"
                          min="0"
                          value={rate.packagingCost ?? ""}
                          onChange={(event) =>
                            setRate(rate.id, {
                              packagingCost: event.target.value === "" ? null : Number(event.target.value),
                            })
                          }
                        />
                      </Field>
                      <Field label="代出貨">
                        <input
                          className={inputClass}
                          type="number"
                          step="0.01"
                          min="0"
                          value={rate.handlingCost ?? ""}
                          onChange={(event) =>
                            setRate(rate.id, {
                              handlingCost: event.target.value === "" ? null : Number(event.target.value),
                            })
                          }
                        />
                      </Field>
                    </>
                  ) : null}
                  <Field label="使用佔比">
                    <input
                      className={inputClass}
                      type="number"
                      step="0.01"
                      min="0"
                      max="1"
                      value={rate.usageShare ?? ""}
                      onChange={(event) =>
                        setRate(rate.id, { usageShare: event.target.value === "" ? null : Number(event.target.value) })
                      }
                    />
                  </Field>
                  <Button variant="danger" onClick={() => removeRate(rate.id)}>
                    刪除
                  </Button>
                </div>
              ))}
              {rows.length === 0 ? <p className="text-sm text-stone-600">尚未設定。</p> : null}
            </div>
            <div className="mt-3">
              <Button variant="secondary" onClick={() => addRate(kind)}>
                新增{meta.label}
              </Button>
            </div>
          </Card>
        );
      })}
    </>
  );
}
