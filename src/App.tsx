import { useEffect, useMemo, useState } from "react";
import { Button, Note } from "./components/ui";
import { RatesScreen } from "./screens/Rates";
import { MaterialsScreen } from "./screens/Materials";
import { ProductsScreen } from "./screens/Products";
import { MarginsScreen } from "./screens/Margins";
import { PromotionsScreen } from "./screens/Promotions";
import { ModelsScreen } from "./screens/Models";
import { AboutScreen } from "./screens/About";
import { SettingsScreen } from "./screens/Settings";
import { BundlesScreen } from "./screens/Bundles";
import { ContentScreen } from "./screens/Content";
import { DiscountsScreen } from "./screens/Discounts";
import { GroupBuyScreen } from "./screens/GroupBuy";
import { AnalysisScreen } from "./screens/Analysis";
import { downloadDoc, emptyDoc, isStorageAvailable, loadDoc, parseDoc, saveDoc, type Doc } from "./lib/doc";
import { importSuperExcel } from "./lib/import-xlsx";

const TABS = [
  { key: "about", label: "這是什麼" },
  { key: "rates", label: "費率設定" },
  { key: "materials", label: "物料與供應商" },
  { key: "products", label: "產品與用料" },
  { key: "margins", label: "邊際貢獻與定價" },
  { key: "bundles", label: "商品組合" },
  { key: "discounts", label: "折扣變價" },
  { key: "promotions", label: "促銷試算" },
  { key: "groupbuy", label: "團購優惠" },
  { key: "content", label: "活動內容" },
  { key: "analysis", label: "營業分析" },
  { key: "models", label: "語言模型" },
  { key: "settings", label: "資料管理" },
] as const;

type TabKey = (typeof TABS)[number]["key"];


export function App() {
  const [doc, setDoc] = useState<Doc>(() => loadDoc() ?? emptyDoc());
  /*
    ⚠️ 每次進來都從說明頁開始，不記住「看過了」。
       這個工具算出來的數字會跟使用者原本的試算表不一樣，而且通常更難看。
       沒先讀過為什麼就直接看到數字，第一反應會是「這程式壞了」而不是「我以前算漏了」。
  */
  const [tab, setTab] = useState<TabKey>("about");
  const [menuOpen, setMenuOpen] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** 上次匯出之後有沒有改過東西。用來決定要不要提醒下載。 */
  const [dirty, setDirty] = useState(false);

  const storageOk = useMemo(() => isStorageAvailable(), []);
  const currentTab = TABS.find((item) => item.key === tab) ?? TABS[0];

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
      {/* ⚠️ 不用 flex-wrap：手機上標題會撐滿一整行，選單鈕就被擠到下一行去了。 */}
      <header className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-4">
          {/* 放 public/logo.png 就會顯示。沒放也不會留下破圖，因此不必為了佔位塞一張假圖。 */}
          <img
            src="/logo.png"
            alt=""
            className="hidden h-16 w-16 shrink-0 rounded-full"
            onLoad={(event) => event.currentTarget.classList.remove("hidden")}
          />
          <div>
          <h1 className="text-3xl font-bold text-ink">超級 Excel</h1>
          <p className="mt-2 max-w-2xl text-sm text-ink-3">
            算出商品真正的成本與邊際貢獻，以及打折之後還剩多少。
            沒有伺服器、不用註冊，你的資料只留在這台電腦的瀏覽器裡。
          </p>
          </div>
        </div>
        {/*
          ⚠️ 讀取、匯入、清空都搬到「資料管理」頁了，但「下載存檔」留在這裡。
             它是這個工具唯一的存檔機制，藏進設定頁等於讓人更容易忘記存檔而弄丟資料。
        */}
        <div className="flex items-center gap-2">
          <div className="hidden gap-2 sm:flex">
            <Button onClick={handleExport}>下載存檔</Button>
            <Button variant="secondary" onClick={() => setTab("settings")}>
              資料管理
            </Button>
          </div>

          {/* 手機的選單鈕收在標題列裡，不另外佔一整塊版面。 */}
          <button
            type="button"
            onClick={() => setMenuOpen(!menuOpen)}
            aria-expanded={menuOpen}
            aria-controls="main-nav"
            aria-label={menuOpen ? "關閉選單" : "開啟選單"}
            className="rounded-lg border border-line p-2 text-ink sm:hidden"
          >
            <svg viewBox="0 0 24 24" aria-hidden className="h-6 w-6">
              {menuOpen ? (
                <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              ) : (
                <path d="M4 7h16M4 12h16M4 17h16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              )}
            </svg>
          </button>
        </div>
      </header>

      <div className="mt-4 flex gap-2 sm:hidden">
        <Button onClick={handleExport}>下載存檔</Button>
        <Button variant="secondary" onClick={() => setTab("settings")}>
          資料管理
        </Button>
      </div>

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
        ⚠️ 手機的選單從標題列的漢堡鈕展開，不在內容上方常駐一張卡。
           常駐的話每一頁都被推下去一截，而那張卡九成的時間都不需要看。
      */}
      {menuOpen ? (
        <nav id="main-nav" className="mt-3 overflow-hidden rounded-lg border border-line bg-panel sm:hidden">
          {TABS.map((item) => (
            <button
              key={item.key}
              onClick={() => {
                setTab(item.key);
                setMenuOpen(false);
              }}
              aria-current={tab === item.key ? "page" : undefined}
              className={`block w-full border-b border-line px-4 py-3 text-left text-sm font-semibold last:border-b-0 ${
                tab === item.key ? "bg-acid/10 text-acid" : "text-ink-2 hover:bg-panel-2"
              }`}
            >
              {item.label}
            </button>
          ))}
        </nav>
      ) : null}

      <nav className="mt-6 hidden border-b border-line sm:block">
        <div className="flex flex-wrap gap-1 pb-px">
          {TABS.map((item) => (
            <button
              key={item.key}
              onClick={() => setTab(item.key)}
              aria-current={tab === item.key ? "page" : undefined}
              className={`shrink-0 rounded-t-lg px-4 py-2 text-sm font-semibold ${
                tab === item.key
                  ? "border border-b-panel border-line bg-panel text-acid"
                  : "text-ink-3 hover:text-ink"
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </nav>

      <p className="mt-6 font-mono text-xs uppercase tracking-widest text-acid sm:hidden">{currentTab.label}</p>

      <main className="mt-3 space-y-6 sm:mt-6">
        {tab === "about" && <AboutScreen onStart={() => setTab("rates")} />}
        {tab === "rates" && <RatesScreen doc={doc} onChange={update} />}
        {tab === "materials" && <MaterialsScreen doc={doc} onChange={update} />}
        {tab === "products" && <ProductsScreen doc={doc} onChange={update} />}
        {tab === "margins" && <MarginsScreen doc={doc} />}
        {tab === "bundles" && <BundlesScreen doc={doc} onChange={update} />}
        {tab === "discounts" && <DiscountsScreen doc={doc} onChange={update} />}
        {tab === "promotions" && <PromotionsScreen doc={doc} onChange={update} />}
        {tab === "groupbuy" && <GroupBuyScreen doc={doc} onChange={update} />}
        {tab === "content" && <ContentScreen doc={doc} onChange={update} />}
        {tab === "analysis" && <AnalysisScreen doc={doc} onChange={update} />}
        {tab === "models" && <ModelsScreen />}
        {tab === "settings" && (
          <SettingsScreen
            doc={doc}
            dirty={dirty}
            storageOk={storageOk}
            onExport={handleExport}
            onImportJson={(file) => void handleImportJson(file)}
            onImportXlsx={(file) => void handleImportXlsx(file)}
            onLoadSlot={(next) => {
              setDoc(next);
              // 讀進來的是這台電腦上的另一份，不是剛下載過的檔，所以仍算未存檔。
              setDirty(true);
              notify("已讀取。這一份跟主檔存在同一個瀏覽器裡，記得另外下載一份到硬碟。");
            }}
            onReset={() => {
              if (!confirm("清空所有資料並重新開始？沒有下載過的內容會永久消失。")) return;
              setDoc(emptyDoc());
              setDirty(false);
              setWarnings([]);
              notify("已清空。");
            }}
          />
        )}
      </main>

      <footer className="mt-12 border-t border-line pt-6">
        <p className="text-sm leading-relaxed text-ink-3">
          這個工具沒有後端，我們不蒐集也收不到你的任何資料。
          唯一的例外是你自己在「語言模型」頁設定並使用第三方模型時，送出的內容會到那家供應商，
          那一頁上有完整說明。
        </p>

        <div className="mt-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="flex items-center gap-3">
            <img
              src="/logo.png"
              alt=""
              className="hidden h-11 w-11 shrink-0 rounded-full"
              onLoad={(event) => event.currentTarget.classList.remove("hidden")}
            />
            <div>
              <div className="text-sm font-semibold text-ink">酒Ann</div>
              <div className="font-mono text-[11px] uppercase leading-relaxed tracking-wider text-ink-3">
                AI Application &amp; Developer
                <br />
                Online Educator &amp; Customized Creator
              </div>
            </div>
          </div>

          <div className="text-xs leading-relaxed text-ink-3 sm:text-right">
            <div>Copyright 2026 酒Ann　授權 FSL-1.1-MIT</div>
            <div className="mt-1">
              <a className="text-acid underline" href="mailto:cpw688@gmail.com">
                cpw688@gmail.com
              </a>
              <span className="px-2 text-line">|</span>
              <a
                className="text-acid underline"
                href="https://github.com/Joanna8521/SuperExcel"
                target="_blank"
                rel="noreferrer"
              >
                GitHub 原始碼
              </a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
