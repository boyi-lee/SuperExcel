// 電商營業利益分析。
//
// ⚠️ 這一頁跟前面所有分頁的方向相反：前面是「還沒賣，先算會不會賠」，
//    這裡是「賣完了，看看實際長怎樣」。兩邊的數字不會一樣，
//    而**差在哪裡**才是這一頁真正的價值。
//
// 這一頁算出來的平均客單價與廣告佔比，可以直接回填到「費率設定」，
// 讓事前試算越用越準。

import { BarLineChart } from "../components/Chart";
import { Accordion, Button, Card, Field, Note, inputClass, money, pct } from "../components/ui";
import { computeMonthlyMetrics, summarize } from "../lib/analysis";
import { newId, type Doc, type MonthlyRecord } from "../lib/doc";

/** 可填的數字欄位。全部允許留空，留空代表「還沒查」而不是 0。 */
const FIELDS = [
  { key: "revenue", label: "總營業額", hint: "這個月實收（折扣後）。" },
  { key: "orders", label: "成交訂單數", hint: "" },
  { key: "returnedOrders", label: "退貨訂單數", hint: "到貨後退貨的筆數。" },
  { key: "repeatOrders", label: "回購訂單數", hint: "來自舊客的訂單數。" },
  { key: "adSpend", label: "廣告費", hint: "這個月實際花掉的金額。" },
] as const;

export function AnalysisScreen({ doc, onChange }: { doc: Doc; onChange: (doc: Doc) => void }) {
  const records = [...doc.monthlyRecords].sort((a, b) => a.month.localeCompare(b.month));
  const summary = summarize(records);

  const setRecord = (id: string, patch: Partial<MonthlyRecord>) =>
    onChange({
      ...doc,
      monthlyRecords: doc.monthlyRecords.map((record) => (record.id === id ? { ...record, ...patch } : record)),
    });

  const addRecord = () => {
    const last = records.at(-1);
    // 沿用上一筆的年月加一個月，只是省打字。
    const next = (() => {
      if (!last) return "";
      const [year, month] = last.month.split("-").map(Number);
      if (!year || !month) return "";
      const rolled = month >= 12 ? { year: year + 1, month: 1 } : { year, month: month + 1 };
      return `${rolled.year}-${String(rolled.month).padStart(2, "0")}`;
    })();

    onChange({
      ...doc,
      monthlyRecords: [
        ...doc.monthlyRecords,
        {
          id: newId(),
          month: next,
          revenue: null,
          orders: null,
          returnedOrders: null,
          repeatOrders: null,
          adSpend: null,
          note: null,
        },
      ],
    });
  };

  /** 把分析結果回填到費率設定。這是這一頁最實用的地方。 */
  const applyToSettings = (patch: Partial<Doc["settings"]>) =>
    onChange({ ...doc, settings: { ...doc.settings, ...patch } });

  return (
    <div className="space-y-4">
      <Card title="期間合計">
        {records.length === 0 ? (
          <Note>還沒有資料。從下面新增一個月開始，通常從平台後台把數字抄過來就好。</Note>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
              <Stat label="月份數" value={String(summary.months)} sub={`${summary.monthsWithRevenue} 個月有營收`} />
              <Stat label="總營業額" value={summary.totalRevenue === null ? "－" : money(summary.totalRevenue)} />
              <Stat label="總訂單數" value={summary.totalOrders === null ? "－" : money(summary.totalOrders)} />
              <Stat
                label="平均客單價"
                value={summary.averageOrderValue === null ? "－" : money(summary.averageOrderValue)}
              />
              <Stat label="退貨率" value={pct(summary.returnRate)} />
              <Stat label="回購率" value={pct(summary.repeatRate)} />
            </div>

            <p className="mt-4 text-xs leading-relaxed text-ink-3">
              ⚠️ 平均值是用「合計 ÷ 合計」算的，不是把每月比率再平均。
              後者會讓一個只賣三筆的月份，跟一個賣三千筆的月份佔一樣的權重。
            </p>

            {/* 這一段是這一頁的重點：把實際數字送回事前試算，讓前面越用越準。 */}
            <div className="mt-5 rounded-lg border border-acid/40 bg-acid/10 p-4">
              <h4 className="text-sm font-semibold text-acid">回填到費率設定</h4>
              <p className="mt-1 text-xs leading-relaxed text-ink-2">
                前面的試算需要「平均客單價」與「廣告佔營收比」。這裡有實際數字，直接填回去最準。
              </p>

              <div className="mt-3 flex flex-wrap gap-2">
                <Button
                  variant="secondary"
                  disabled={summary.averageOrderValue === null}
                  onClick={() => applyToSettings({ averageOrderValue: summary.averageOrderValue })}
                >
                  套用平均客單價
                  {summary.averageOrderValue === null ? "（缺資料）" : `　${money(summary.averageOrderValue)}`}
                </Button>
                <Button
                  variant="secondary"
                  disabled={summary.adSpendRate === null}
                  onClick={() =>
                    applyToSettings({ adSpendMode: "ESTIMATE", adSpendRate: summary.adSpendRate })
                  }
                >
                  套用廣告佔比
                  {summary.adSpendRate === null ? "（缺資料）" : `　${pct(summary.adSpendRate)}`}
                </Button>
              </div>

              <p className="mt-3 text-xs text-ink-3">
                目前設定：平均客單價{" "}
                {doc.settings.averageOrderValue === null ? "未填" : money(doc.settings.averageOrderValue)}，
                廣告{" "}
                {doc.settings.adSpendMode === "ESTIMATE" && doc.settings.adSpendRate !== null
                  ? pct(doc.settings.adSpendRate)
                  : "未納入"}
                。
              </p>
            </div>
          </>
        )}
      </Card>

      {records.length > 0 ? (
        <Card title="趨勢" action={<span className="text-xs text-ink-3">營業額與退貨率</span>}>
          <BarLineChart
            points={records.map((record) => ({
              label: record.month || "？",
              bar: record.revenue,
              line: computeMonthlyMetrics(record).returnRate,
            }))}
            barLabel="營業額"
            lineLabel="退貨率"
            formatBar={(value) => (value >= 10000 ? `${Math.round(value / 1000)}k` : String(Math.round(value)))}
            formatLine={(value) => `${(value * 100).toFixed(0)}%`}
          />
          <p className="mt-3 text-xs leading-relaxed text-ink-3">
            ⚠️ 營業額往上但退貨率也往上，多半是折扣或廣告換來的量，那種成長撐不久。
            要留意的是兩條線的方向，不是單看長條有沒有變高。
          </p>
        </Card>
      ) : null}

      {records.length > 0 ? (
        <Card title="趨勢" action={<span className="text-xs text-ink-3">營業額與廣告佔比</span>}>
          <BarLineChart
            points={records.map((record) => ({
              label: record.month || "？",
              bar: record.revenue,
              line: computeMonthlyMetrics(record).adSpendRate,
            }))}
            barLabel="營業額"
            lineLabel="廣告佔營收比"
            formatBar={(value) => (value >= 10000 ? `${Math.round(value / 1000)}k` : String(Math.round(value)))}
            formatLine={(value) => `${(value * 100).toFixed(0)}%`}
          />
          <p className="mt-3 text-xs leading-relaxed text-ink-3">
            ⚠️ 廣告佔比一路往上而營業額只是持平，代表買量越來越貴。
            這條線比營業額本身更早告訴你出事了。
          </p>
        </Card>
      ) : null}

      <Card title="逐月數據" action={<span className="text-xs text-ink-3">留空代表還沒查，不是 0。</span>}>
        <div className="space-y-3">
          {records.map((record) => {
            const metrics = computeMonthlyMetrics(record);

            return (
              <div key={record.id} className="rounded-lg border border-line bg-panel-2 p-3">
                <div className="grid grid-cols-2 items-end gap-3 sm:grid-cols-4 lg:grid-cols-7">
                  <Field label="年月" hint="格式 2026-03">
                    <input
                      className={inputClass}
                      value={record.month}
                      placeholder="2026-03"
                      onChange={(event) => setRecord(record.id, { month: event.target.value })}
                    />
                  </Field>

                  {FIELDS.map((field) => (
                    <Field key={field.key} label={field.label} hint={field.hint || undefined}>
                      <input
                        className={inputClass}
                        type="number"
                        min="0"
                        placeholder="留空"
                        value={record[field.key] ?? ""}
                        onChange={(event) =>
                          setRecord(record.id, {
                            [field.key]: event.target.value === "" ? null : Number(event.target.value),
                          })
                        }
                      />
                    </Field>
                  ))}

                  <div className="flex items-end">
                    <Button
                      variant="danger"
                      onClick={() =>
                        onChange({
                          ...doc,
                          monthlyRecords: doc.monthlyRecords.filter((row) => row.id !== record.id),
                        })
                      }
                    >
                      刪除
                    </Button>
                  </div>
                </div>

                <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <Mini label="客單價" value={metrics.averageOrderValue === null ? "－" : money(metrics.averageOrderValue)} />
                  <Mini label="退貨率" value={pct(metrics.returnRate)} />
                  <Mini label="回購率" value={pct(metrics.repeatRate)} />
                  <Mini label="廣告佔比" value={pct(metrics.adSpendRate)} />
                </div>

                <input
                  className={`${inputClass} mt-3`}
                  placeholder="這個月的檔期或備註，例如：母親節、雙 11"
                  value={record.note ?? ""}
                  onChange={(event) =>
                    setRecord(record.id, { note: event.target.value === "" ? null : event.target.value })
                  }
                />
              </div>
            );
          })}

          {records.length === 0 ? <p className="text-sm text-ink-3">還沒有任何月份。</p> : null}
        </div>

        <div className="mt-4">
          <Button variant="secondary" onClick={addRecord}>
            新增一個月
          </Button>
        </div>
      </Card>

      <Accordion title="這一頁怎麼用" summary="事前試算與事後對帳的橋">
        <div className="space-y-3 text-sm leading-relaxed text-ink-2">
          <p>
            <span className="font-semibold text-ink">從平台後台抄數字進來就好。</span>
            總營業額、訂單數、退貨數、回購數、廣告費，這五個數字多數平台的月報都有。
            抄不到的就留空，留空不會被當成 0。
          </p>
          <p>
            <span className="font-semibold text-ink">重點是把結果回填到費率設定。</span>
            平均客單價決定物流怎麼攤，廣告佔比決定淨利要扣多少。
            這兩個數字用猜的，前面每一頁都會跟著歪。
          </p>
          <p>
            <span className="font-semibold text-ink">請留意利益率的變化，不只看營業額。</span>
            營業額成長但淨利率下滑，多半是折扣開太兇或廣告投太多換來的。
            那種成長撐不久，而且會在你決定擴大投入之後才爆出來。
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

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-line px-3 py-2">
      <div className="text-xs text-ink-3">{label}</div>
      <div className="mt-0.5 text-sm font-semibold text-ink">{value}</div>
    </div>
  );
}
