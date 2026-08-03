import { useEffect, useMemo, useRef, useState } from "react";
import { Button, Note } from "./components/ui";
import { RatesScreen } from "./screens/Rates";
import { MaterialsScreen } from "./screens/Materials";
import { ProductsScreen } from "./screens/Products";
import { MarginsScreen } from "./screens/Margins";
import { PromotionsScreen } from "./screens/Promotions";
import { ModelsScreen } from "./screens/Models";
import { AboutScreen } from "./screens/About";
import { downloadDoc, emptyDoc, isStorageAvailable, loadDoc, parseDoc, saveDoc, type Doc } from "./lib/doc";
import { importSuperExcel } from "./lib/import-xlsx";

const TABS = [
  { key: "about", label: "這是什麼" },
  { key: "rates", label: "費率設定" },
  { key: "materials", label: "物料與供應商" },
  { key: "products", label: "產品與用料" },
  { key: "margins", label: "邊際貢獻與定價" },
  { key: "promotions", label: "促銷試算" },
  { key: "models", label: "語言模型" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

/** 記住使用者看過來由頁了。跟試算資料無關，所以不放進 Doc（也就不會進匯出檔）。 */
const SEEN_KEY = "superexcel.seenAbout.v1";

function markAboutSeen(): void {
  try {
    localStorage.setItem(SEEN_KEY, "1");
  } catch {
    // 無痕模式寫不進去。頂多每次都先看到說明，不影響功能。
  }
}

function hasSeenAbout(): boolean {
  try {
    return localStorage.getItem(SEEN_KEY) === "1";
  } catch {
    return false;
  }
}

export function App() {
  const [doc, setDoc] = useState<Doc>(() => loadDoc() ?? emptyDoc());
  // 第一次進來先看來由，不要一開場就丟一堆欄位。看過之後記住，下次直接進費率設定。
  const [tab, setTab] = useState<TabKey>(() => (hasSeenAbout() ? "rates" : "about"));
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** 上次匯出之後有沒有改過東西。用來決定要不要提醒下載。 */
  const [dirty, setDirty] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const xlsxRef = useRef<HTMLInputElement>(null);

  const storageOk = useMemo(() => isStorageAvailable(), []);

  useEffect(() => {
    saveDoc(doc);
  }, [doc]);

  // 關閉分頁前提醒尚未匯出的變更。localStorage 只是暫存，不是備份。
  useEffect(() => {
    if (!dirty) return;
    const handler = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);

  function update(next: Doc) {
    setDoc(next);
    setDirty(true);
  }

  function notify(text: string) {
    setMessage(text);
    setError(null);
  }

  function fail(text: string) {
    setError(text);
    setMessage(null);
  }

  function handleExport() {
    downloadDoc(doc);
    setDirty(false);
    notify("已下載。這個檔案就是你的存檔，換電腦或清瀏覽器資料時用它還原。");
  }

  async function handleImportJson(file: File) {
    const result = parseDoc(await file.text());
    if (!result.ok) return fail(result.error);
    setDoc(result.doc);
    setDirty(false);
    notify("已讀入存檔。");
  }

  async function handleImportXlsx(file: File) {
    const result = await importSuperExcel(await file.arrayBuffer(), doc);
    if (!result.ok) return fail(result.error);
    update(result.doc);
    notify(
      `已從試算表匯入：${result.summary.rates} 筆費率、${result.summary.materials} 項物料、${result.summary.products} 項產品。` +
        (result.warnings.length > 0 ? `另有 ${result.warnings.length} 項提醒，見下方。` : ""),
    );
    setWarnings(result.warnings);
  }

  const [warnings, setWarnings] = useState<string[]>([]);

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-4">
          {/* 放 public/logo.png 就會顯示。沒放也不會留下破圖，因此不必為了佔位塞一張假圖。 */}
          <img
            src="/logo.png"
            alt=""
            className="hidden h-16 w-16 shrink-0 rounded-full"
            onLoad={(event) => event.currentTarget.classList.remove("hidden")}
          />
          <div>
          <h1 className="text-3xl font-bold text-stone-900">超級 Excel</h1>
          <p className="mt-2 max-w-2xl text-sm text-stone-600">
            算出商品真正的成本與邊際貢獻，以及打折之後還剩多少。
            沒有伺服器、不用註冊，你的資料只留在這台電腦的瀏覽器裡。
          </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={handleExport}>下載存檔</Button>
          <Button variant="secondary" onClick={() => fileRef.current?.click()}>
            讀取存檔
          </Button>
          <Button variant="secondary" onClick={() => xlsxRef.current?.click()}>
            匯入試算表
          </Button>
          <Button
            variant="danger"
            onClick={() => {
              if (confirm("清空所有資料並重新開始？沒有下載過的內容會永久消失。")) {
                setDoc(emptyDoc());
                setDirty(false);
                setWarnings([]);
                notify("已清空。");
              }
            }}
          >
            清空
          </Button>
        </div>
      </header>

      <input
        ref={fileRef}
        type="file"
        accept="application/json,.json"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void handleImportJson(file);
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
          if (file) void handleImportXlsx(file);
          event.target.value = "";
        }}
      />

      <div className="mt-4 space-y-3">
        {!storageOk ? (
          <Note tone="danger">
            這個瀏覽器不允許本機儲存（可能是無痕模式）。重新整理就會失去所有輸入，
            請隨時用「下載存檔」保存。
          </Note>
        ) : null}
        {dirty ? (
          <Note tone="warn">
            有尚未下載的變更。資料目前只在這個瀏覽器裡，清除瀏覽器資料或換電腦就會不見，
            請按「下載存檔」保存一份。
          </Note>
        ) : null}
        {message ? <Note>{message}</Note> : null}
        {error ? <Note tone="danger">{error}</Note> : null}
        {warnings.length > 0 ? (
          <Note tone="warn">
            <span className="font-semibold">匯入時發現的問題：</span>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              {warnings.map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          </Note>
        ) : null}
      </div>

      {/*
        ⚠️ 分頁列橫向捲動而不換行。分頁只會越加越多，換行的話在手機上會吃掉半個螢幕，
           而且每次多一個分頁版面就再跳一次。
      */}
      <nav className="mt-6 -mx-4 overflow-x-auto border-b border-stone-200 px-4">
        <div className="flex min-w-max gap-1 pb-px">
          {TABS.map((item) => (
            <button
              key={item.key}
              onClick={() => setTab(item.key)}
              className={`shrink-0 rounded-t-lg px-4 py-2 text-sm font-semibold ${
                tab === item.key
                  ? "border border-b-white border-stone-200 bg-white text-brand-800"
                  : "text-stone-600 hover:text-stone-900"
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </nav>

      <main className="mt-6 space-y-6">
        {tab === "about" && (
          <AboutScreen
            onStart={() => {
              markAboutSeen();
              setTab("rates");
            }}
          />
        )}
        {tab === "rates" && <RatesScreen doc={doc} onChange={update} />}
        {tab === "materials" && <MaterialsScreen doc={doc} onChange={update} />}
        {tab === "products" && <ProductsScreen doc={doc} onChange={update} />}
        {tab === "margins" && <MarginsScreen doc={doc} />}
        {tab === "promotions" && <PromotionsScreen doc={doc} onChange={update} />}
        {tab === "models" && <ModelsScreen />}
      </main>

      <footer className="mt-12 border-t border-stone-200 pt-6 text-sm text-stone-600">
        <p>
          開源專案，以 AGPL-3.0 授權釋出。這個工具沒有後端，我們不蒐集也收不到你的任何資料。
          唯一的例外是你自己在「語言模型」頁設定並使用第三方模型時，送出的內容會到那家供應商，
          那一頁上有完整說明。
        </p>
      </footer>
    </div>
  );
}
