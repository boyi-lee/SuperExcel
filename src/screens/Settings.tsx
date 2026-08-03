// 資料管理：存檔、還原、匯入、清空。
//
// 🚫 「下載存檔」不是附加功能，它就是這個工具的存檔機制。
//    所以這一頁不能只是四顆按鈕，每一顆旁邊都要寫清楚它實際上會做什麼、
//    以及不做會怎樣。使用者以為資料自動保存，是這個架構最大的風險。

import { useRef, useState } from "react";
import { Button, Card, Field, Note, inputClass } from "../components/ui";
import { newId, type Doc } from "../lib/doc";
import { MAX_SLOTS, deleteSlot, loadSlots, saveSlot, type SavedSlot } from "../lib/saves";

export function SettingsScreen({
  doc,
  dirty,
  storageOk,
  onExport,
  onImportJson,
  onImportXlsx,
  onReset,
  onLoadSlot,
}: {
  doc: Doc;
  dirty: boolean;
  storageOk: boolean;
  onExport: () => void;
  onImportJson: (file: File) => void;
  onImportXlsx: (file: File) => void;
  onReset: () => void;
  onLoadSlot: (doc: Doc) => void;
}) {
  const [slots, setSlots] = useState<SavedSlot[]>(() => loadSlots());
  const [slotName, setSlotName] = useState("");
  const [slotError, setSlotError] = useState<string | null>(null);

  const applySlotResult = (result: ReturnType<typeof saveSlot>) => {
    if (result.ok) {
      setSlots(result.slots);
      setSlotError(null);
      return true;
    }
    setSlotError(result.error);
    return false;
  };
  const jsonRef = useRef<HTMLInputElement>(null);
  const xlsxRef = useRef<HTMLInputElement>(null);

  const counts = [
    { label: "分類", value: doc.categories.length },
    { label: "供應商", value: doc.suppliers.length },
    { label: "物料", value: doc.materials.length },
    { label: "產品", value: doc.products.length },
    { label: "規格", value: doc.products.reduce((sum, product) => sum + product.variants.length, 0) },
    { label: "費率", value: doc.rates.length },
    { label: "促銷方案", value: doc.promotions.length },
  ];

  const updatedAt = (() => {
    const parsed = new Date(doc.updatedAt);
    return Number.isNaN(parsed.getTime()) ? null : parsed.toLocaleString("zh-TW", { hour12: false });
  })();

  return (
    <div className="space-y-4">
      <input
        ref={jsonRef}
        type="file"
        accept="application/json,.json"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) onImportJson(file);
          event.target.value = "";
        }}
      />
      <input
        ref={xlsxRef}
        type="file"
        accept=".xlsx"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) onImportXlsx(file);
          event.target.value = "";
        }}
      />

      <Card title="目前的資料">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
          {counts.map((count) => (
            <div key={count.label} className="rounded-lg border border-line bg-panel-2 p-3 text-center">
              <div className="text-2xl font-bold text-ink">{count.value}</div>
              <div className="mt-1 text-xs text-ink-3">{count.label}</div>
            </div>
          ))}
        </div>
        <p className="mt-4 text-sm text-ink-2">
          最後一次變更：{updatedAt ?? "未知"}。
          {dirty ? (
            <span className="font-semibold text-warn">目前有尚未下載的變更。</span>
          ) : (
            <span className="text-ink-3">自上次下載後沒有變更。</span>
          )}
        </p>
      </Card>

      <Card title="存檔與還原">
        <Note tone="warn">
          這個工具沒有伺服器，你的資料只存在這個瀏覽器裡。我們看不到，也沒有任何地方有備份。
          清除瀏覽器資料、換電腦、換瀏覽器，資料就沒了。
          <span className="font-semibold">「下載存檔」不是附加功能，它就是存檔本身。</span>
        </Note>

        {!storageOk ? (
          <div className="mt-3">
            <Note tone="danger">
              這個瀏覽器不允許本機儲存（可能是無痕模式）。連暫存都沒有，重新整理就會失去所有輸入，
              請隨時下載。
            </Note>
          </div>
        ) : null}

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div className="rounded-lg border border-line p-4">
            <h4 className="text-sm font-semibold text-ink">下載存檔</h4>
            <p className="mt-1 text-xs leading-relaxed text-ink-2">
              把目前所有資料存成一個 JSON 檔。這個檔就是你的存檔，換電腦或清瀏覽器資料時用它還原。
              建議每次改完就下載一份。
            </p>
            <div className="mt-3">
              <Button onClick={onExport}>下載存檔</Button>
            </div>
          </div>

          <div className="rounded-lg border border-line p-4">
            <h4 className="text-sm font-semibold text-ink">讀取存檔</h4>
            <p className="mt-1 text-xs leading-relaxed text-ink-2">
              讀回先前下載的 JSON。會<span className="font-semibold">整份取代</span>目前的資料，
              所以讀之前先把現在的下載一份。格式不符會直接拒絕，不會載入一半再爆掉。
            </p>
            <div className="mt-3">
              <Button variant="secondary" onClick={() => jsonRef.current?.click()}>
                選擇存檔⋯⋯
              </Button>
            </div>
          </div>
        </div>
      </Card>

      {/*
        ⚠️ 這一區跟「下載存檔」是兩件事，說明必須把它講清楚。
           使用者以為自己有備份，結果清一次瀏覽器全沒了，那是最糟的情況。
      */}
      <Card title="這台電腦上的多份存檔">
        <Note tone="warn">
          這幾份跟主檔存在<span className="font-semibold">同一個瀏覽器裡</span>，
          清除瀏覽器資料時會一起消失。它解決的是「想試另一組費率又不想弄丟現在這組」，
          <span className="font-semibold">不是備份</span>。真正的備份只有一種：下載 JSON 到你自己的硬碟。
        </Note>

        <div className="mt-4 flex flex-wrap items-end gap-3">
          <Field label="這一份要叫什麼" className="min-w-[16rem] flex-1">
            <input
              className={inputClass}
              value={slotName}
              placeholder="例如：漲價前、雙11 版本"
              onChange={(event) => setSlotName(event.target.value)}
            />
          </Field>
          <Button
            disabled={slotName.trim() === ""}
            onClick={() => {
              const ok = applySlotResult(
                saveSlot(slots, {
                  id: newId(),
                  name: slotName.trim(),
                  savedAt: new Date().toISOString(),
                  doc,
                }),
              );
              if (ok) setSlotName("");
            }}
          >
            存成新的一份
          </Button>
        </div>

        {slotError ? (
          <div className="mt-3">
            <Note tone="danger">{slotError}</Note>
          </div>
        ) : null}

        <div className="mt-4 space-y-2">
          {slots.map((slot) => (
            <div
              key={slot.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-line bg-panel-2 p-3"
            >
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold text-ink">{slot.name}</div>
                <div className="mt-0.5 text-xs text-ink-3">
                  {new Date(slot.savedAt).toLocaleString("zh-TW", { hour12: false })}　
                  物料 {slot.doc.materials.length}　產品 {slot.doc.products.length}　費率 {slot.doc.rates.length}
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="secondary"
                  onClick={() => {
                    if (!confirm(`讀取「${slot.name}」？目前畫面上的資料會被整份取代。`)) return;
                    onLoadSlot(slot.doc);
                  }}
                >
                  讀取
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => {
                    if (!confirm(`用目前的資料覆蓋「${slot.name}」？`)) return;
                    applySlotResult(saveSlot(slots, { ...slot, savedAt: new Date().toISOString(), doc }));
                  }}
                >
                  覆蓋
                </Button>
                <Button
                  variant="danger"
                  onClick={() => {
                    if (!confirm(`刪除「${slot.name}」？`)) return;
                    applySlotResult(deleteSlot(slots, slot.id));
                  }}
                >
                  刪除
                </Button>
              </div>
            </div>
          ))}
          {slots.length === 0 ? <p className="text-sm text-ink-3">還沒有存過任何一份。</p> : null}
        </div>

        <p className="mt-3 text-xs text-ink-3">
          目前 {slots.length} / {MAX_SLOTS} 份。存太多份會撐爆瀏覽器配額，也不會有人回頭整理。
        </p>
      </Card>

      <Card title="從 Excel 匯入">
        <p className="text-sm leading-relaxed text-ink-2">
          可以讀 .xlsx（舊版 .xls 請先另存新檔）。它靠<span className="font-semibold">表頭關鍵字</span>認欄位，
          所以你的表不需要長得跟這個工具一樣。匯入是<span className="font-semibold">疊加</span>不是取代：
          同名的物料與產品會被更新，其餘保留。
        </p>

        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[30rem] text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs text-ink-3">
                <th className="py-2">想匯入</th>
                <th className="py-2">表裡要有的欄位</th>
              </tr>
            </thead>
            <tbody className="text-ink-2">
              {[
                ["物料", "名稱／品名 ＋ 單價，可再加 單位、分類、耗損、幣別、匯率、備註"],
                ["產品", "產品／品名 ＋ 售價，可再加 料號、產出數量"],
                ["用料（BOM）", "產品 ＋ 物料 ＋ 用量"],
                ["費率", "名稱 ＋ 費率／運費，可再加 使用佔比"],
              ].map(([what, columns]) => (
                <tr key={what} className="border-b border-line">
                  <td className="py-2 font-medium text-ink">{what}</td>
                  <td className="py-2 text-xs">{columns}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p className="mt-3 text-xs leading-relaxed text-ink-3">
          認不出來的東西不會硬猜：整張表或個別列會被跳過，並列出原因給你看。
          看不懂的單價會變成「沒有單價」而不是 0；判斷不出種類的費率不匯入；
          「營業稅」那一列也不匯入，因為稅要在費率設定填稅率本身並勾選售價是否含稅。
        </p>

        <div className="mt-4">
          <Button variant="secondary" onClick={() => xlsxRef.current?.click()}>
            選擇 Excel 檔⋯⋯
          </Button>
        </div>
      </Card>

      <Card title="清空重來">
        <Note tone="danger">
          會刪掉這個瀏覽器裡的全部資料並回到空白起點。沒有下載過的內容<span className="font-semibold">永久消失</span>，
          我們這邊沒有備份可以幫你救回來。
        </Note>
        <div className="mt-4">
          <Button variant="danger" onClick={onReset}>
            清空所有資料
          </Button>
        </div>
      </Card>
    </div>
  );
}
