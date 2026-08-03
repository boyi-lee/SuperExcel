// 整份試算資料的形狀，以及存檔／讀檔。
//
// 設計前提：**這個工具沒有伺服器**。你的成本資料只存在你自己的瀏覽器裡，
// 我們看不到，也沒有任何地方備份。
//
// 🚫 因此「匯出檔案」不是附加功能，是**存檔機制**。
//    清除瀏覽器資料、換電腦、換瀏覽器，localStorage 就沒了。
//    介面上必須持續提醒使用者下載，不能讓人以為打開網頁資料就永遠都在。

export type CostBehavior = "MATERIAL" | "PROCESS" | "AMORTIZED";

export const BEHAVIOR_LABEL: Record<CostBehavior, string> = {
  MATERIAL: "投入物（依用量計價）",
  PROCESS: "工序（依次數計價）",
  AMORTIZED: "一次性攤提",
};

export type RateKind = "LOGISTICS" | "PAYMENT" | "CHANNEL" | "OVERHEAD" | "RETURN";

export const RATE_META: Record<RateKind, { label: string; hint: string; unit: "percent" | "amount" }> = {
  LOGISTICS: {
    label: "物流方式",
    hint: "每筆金額（運費＋包材＋代出貨），不是比率。填使用佔比才會算加權平均。",
    unit: "amount",
  },
  PAYMENT: { label: "金流方式", hint: "手續費率，依使用佔比加權平均。", unit: "percent" },
  CHANNEL: { label: "通路抽成", hint: "各通路的抽成率。試算時個別選擇，不計入全域費率合計。", unit: "percent" },
  OVERHEAD: { label: "固定費用分攤", hint: "年度費用 ÷ 年營業額。各項相加，不是加權平均。", unit: "percent" },
  RETURN: { label: "退貨率", hint: "供參考。目前不直接計入費率合計。", unit: "percent" },
};

export type AdSpendMode = "NOT_INCLUDED" | "ESTIMATE";

export type Settings = {
  baseCurrency: string;
  /** 營業稅率。台灣為 0.05。 */
  taxRate: number;
  /** 售價是否含稅。含稅時實際稅負佔比為 taxRate/(1+taxRate)。 */
  priceIncludesTax: boolean;
  adSpendMode: AdSpendMode;
  /** ESTIMATE 模式下的營收佔比。 */
  adSpendRate: number | null;
  /**
   * 平均客單價。
   * 用來把「每筆平均運費」換算成按營收比例的物流攤提，並以平均運費為上限。
   * null 代表沒有這個資料，物流一律用每筆平均運費（保守估法）。
   */
  averageOrderValue: number | null;
};

export type Category = { id: string; name: string; behavior: CostBehavior; sortOrder: number };

export type Supplier = { id: string; name: string; contact: string | null; paymentTerms: string | null };

export type Material = {
  id: string;
  name: string;
  categoryId: string;
  supplierId: string | null;
  unit: string;
  /** 以 currency 計價的單價。null 代表還沒有價格。 */
  unitCost: number | null;
  currency: string;
  /** 非本位幣時的匯率。 */
  fxRate: number | null;
  /** 耗損率 0 至 1（不含 1）。 */
  scrapRate: number | null;
  note: string | null;
};

export type BomLine = { id: string; materialId: string; quantity: number };

/**
 * 子規格（顏色、尺寸、口味⋯⋯）。
 *
 * ⚠️ 只存**與母規格的差異**，不複製整張 BOM。
 *    複製整張的話，母規格改配方時十個顏色不會跟著改，
 *    然後有九個顏色的成本會一直錯下去而且沒有人發現。
 */
export type Variant = {
  id: string;
  name: string;
  sku: string | null;
  /** null 代表沿用母規格售價。 */
  price: number | null;
  /** 差異用料：同一項物料覆蓋用量，用量 0 代表這個規格不用它。 */
  lines: BomLine[];
};

export type Product = {
  id: string;
  name: string;
  sku: string | null;
  price: number | null;
  /** 一次產出的數量。一鍋做 500 支就填 500，用量按整鍋填。 */
  outputQuantity: number;
  lines: BomLine[];
  /** 空陣列代表這項商品沒有規格之分。 */
  variants: Variant[];
};

export type Rate = {
  id: string;
  kind: RateKind;
  name: string;
  /** LOGISTICS 為每筆金額，其餘為比率 0 至 1。 */
  value: number;
  usageShare: number | null;
  packagingCost: number | null;
  handlingCost: number | null;
};

export type PromotionRule = {
  id: string;
  trigger: "AMOUNT" | "QUANTITY" | "COUPON";
  discount: "FIXED" | "PERCENT";
  threshold: number;
  value: number;
};

export type Promotion = {
  id: string;
  name: string;
  /** 套用哪個通路的抽成。 */
  channelRateId: string | null;
  /** 分潤比例（團購團主毛利等）。 */
  partnerShare: number | null;
  rules: PromotionRule[];
};

export type Doc = {
  /** 檔案格式版本。日後改結構時用來判斷要不要轉換。 */
  version: 1;
  updatedAt: string;
  settings: Settings;
  categories: Category[];
  suppliers: Supplier[];
  materials: Material[];
  products: Product[];
  rates: Rate[];
  promotions: Promotion[];
};

export function newId(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}

/**
 * 空白起始檔。
 *
 * 🚫 費率一律留白不預填數字：一個看起來已經設定好的錯誤費率，比空白危險得多。
 *    分類則預先建好，否則使用者第一步就卡住不知道要建什麼。
 */
export function emptyDoc(): Doc {
  const cat = (name: string, behavior: CostBehavior, sortOrder: number): Category => ({
    id: newId(),
    name,
    behavior,
    sortOrder,
  });

  return {
    version: 1,
    updatedAt: new Date().toISOString(),
    settings: {
      baseCurrency: "TWD",
      taxRate: 0.05,
      priceIncludesTax: true,
      // 預設不納入廣告費。以 0 代入會讓邊際貢獻虛高且無人察覺。
      adSpendMode: "NOT_INCLUDED",
      adSpendRate: null,
      averageOrderValue: null,
    },
    categories: [
      cat("主要物料", "MATERIAL", 10),
      cat("包裝物料", "MATERIAL", 20),
      cat("加工與工序", "PROCESS", 30),
      cat("一次性費用攤提", "AMORTIZED", 40),
    ],
    suppliers: [],
    materials: [],
    products: [],
    rates: [],
    promotions: [],
  };
}

/**
 * 補上新版才有的欄位。
 *
 * ⚠️ 舊存檔沒有 variants。與其在幾十個地方寫 `?? []`，不如在入口補齊一次：
 *    漏掉一個地方就是一個執行期爆炸，而且會發生在使用者讀舊檔的時候。
 */
export function normalizeDoc(doc: Doc): Doc {
  return {
    ...doc,
    settings: { ...emptyDoc().settings, ...doc.settings },
    suppliers: doc.suppliers ?? [],
    promotions: doc.promotions ?? [],
    products: (doc.products ?? []).map((product) => ({
      ...product,
      lines: product.lines ?? [],
      variants: (product.variants ?? []).map((variant) => ({ ...variant, lines: variant.lines ?? [] })),
    })),
  };
}

const STORAGE_KEY = "superexcel.doc.v1";

export function loadDoc(): Doc | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Doc;
    return parsed?.version === 1 ? normalizeDoc(parsed) : null;
  } catch {
    // localStorage 可能被停用（無痕模式、隱私設定）。讀不到就當作沒有，不讓整頁掛掉。
    return null;
  }
}

export function saveDoc(doc: Doc): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...doc, updatedAt: new Date().toISOString() }));
  } catch {
    // 寫不進去（配額滿、無痕模式）時不中斷操作，但呼叫端應提醒使用者匯出備份。
  }
}

export function isStorageAvailable(): boolean {
  try {
    const probe = "__superexcel_probe__";
    localStorage.setItem(probe, "1");
    localStorage.removeItem(probe);
    return true;
  } catch {
    return false;
  }
}

/** 匯出成檔案。這是這個工具唯一可靠的存檔方式。 */
export function downloadDoc(doc: Doc): void {
  // 只留數字：2026-08-03T15:30 → 202608031530。
  // （刻意不寫成字元類別。Tailwind 的掃描器會把那種寫法誤認成 class，產生一條壞掉的 CSS 規則。）
  const stamp = new Date().toISOString().slice(0, 16).replace(/\D/g, "");
  const blob = new Blob([JSON.stringify(doc, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `成本試算-${stamp}.json`;
  link.click();
  URL.revokeObjectURL(url);
}

export type ImportResult = { ok: true; doc: Doc } | { ok: false; error: string };

/**
 * 讀回匯出的檔案。
 * 🚫 不接受形狀不符的內容：與其載入一半再爆掉，不如明確拒絕。
 */
export function parseDoc(text: string): ImportResult {
  try {
    const parsed = JSON.parse(text) as Partial<Doc>;
    if (parsed?.version !== 1) return { ok: false, error: "這不是本工具匯出的檔案，或版本不符。" };
    const required: (keyof Doc)[] = ["settings", "categories", "materials", "products", "rates"];
    for (const key of required) {
      if (!parsed[key]) return { ok: false, error: `檔案缺少「${key}」，可能已損毀。` };
    }
    return { ok: true, doc: normalizeDoc({ ...emptyDoc(), ...(parsed as Doc) }) };
  } catch {
    return { ok: false, error: "檔案不是有效的 JSON，無法讀取。" };
  }
}
