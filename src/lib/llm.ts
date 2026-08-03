// 可使用的語言模型清單與設定。
//
// 這裡只是「一份可選清單 + 使用者自己的設定」，是純資料。
// 程式不對個別供應商寫死行為：要不要金鑰、能不能改端點、預設端點是什麼，
// 一律由這張表上的欄位決定。加一家供應商就是加一筆資料，不是加一個 if。
//
// 🚫 金鑰**不放進 Doc**。Doc 會被「下載存檔」整包匯出成 JSON，
//    而存檔是拿來到處傳、丟雲端硬碟、寄給同事的東西。金鑰跟著跑出去就完了。
//    因此金鑰另存一個 localStorage 鍵，且匯出時永遠不包含。

export type ProviderId =
  | "anthropic"
  | "openai"
  | "google"
  | "deepseek"
  | "moonshot"
  | "zhipu"
  | "minimax"
  | "groq"
  | "ollama";

/**
 * 這家能不能從瀏覽器直接呼叫。
 *
 * ⚠️ 這是**這個工具能不能用**的關鍵，不是效能問題。
 *    純前端沒有後端可以代打，供應商如果不回 CORS 標頭，
 *    帶授權標頭的預檢請求會被瀏覽器擋掉，連送都送不出去。
 *
 * "yes"     直接可用
 * "header"  要多帶一個標頭才放行
 * "local"   本機服務，要自己設定允許的來源
 * "no"      政策上不接受瀏覽器直接呼叫，換一家就好
 * "unknown" 沒有實測過，不確定
 */
export type BrowserAccess = "yes" | "header" | "local" | "no" | "unknown";

export const BROWSER_ACCESS_LABEL: Record<BrowserAccess, string> = {
  yes: "可從瀏覽器直接用",
  header: "要多帶一個標頭",
  local: "跑在本機，要開放來源",
  no: "不能從瀏覽器直接用",
  unknown: "未實測",
};

export type Provider = {
  id: ProviderId;
  name: string;
  /** 建議型號。清單之外也可以自己填，這裡不是白名單。 */
  models: string[];
  defaultModel: string;
  /** 本機模型不需要金鑰。 */
  needsApiKey: boolean;
  /** 預設 API 端點。 */
  baseUrl: string;
  /** 端點可否修改（自架、代理、企業閘道）。 */
  editableBaseUrl: boolean;
  /** 適合誰用。照實寫，不吹。 */
  fitFor: string;
  /** 去哪裡拿金鑰。null 代表不需要。 */
  keyUrl: string | null;
  /** 能不能從瀏覽器直接呼叫。 */
  browserAccess: BrowserAccess;
  /** 關於瀏覽器呼叫的補充說明。 */
  accessNote: string | null;
};

/**
 * 目前支援的供應商。
 *
 * ⚠️ 型號會改版、會下架，這份清單只是「建議值」不是保證。
 *    因此畫面上一律允許自行輸入型號，不做白名單擋人。
 *    擋下來的結果是使用者卡住而且不知道為什麼。
 */
export const PROVIDERS: Provider[] = [
  {
    id: "anthropic",
    name: "Anthropic Claude",
    models: ["claude-opus-5", "claude-sonnet-5", "claude-haiku-4-5"],
    defaultModel: "claude-sonnet-5",
    needsApiKey: true,
    baseUrl: "https://api.anthropic.com/v1",
    editableBaseUrl: true,
    fitFor: "綜合能力最強，中文與長文推理穩定。",
    keyUrl: "https://console.anthropic.com/settings/keys",
    browserAccess: "header",
    accessNote: "要在請求裡加上 anthropic-dangerous-direct-browser-access: true 才會放行。",
  },
  {
    id: "openai",
    name: "OpenAI",
    models: ["gpt-4o-mini", "gpt-4o", "gpt-4.1-mini"],
    defaultModel: "gpt-4o-mini",
    needsApiKey: true,
    baseUrl: "https://api.openai.com/v1",
    editableBaseUrl: true,
    fitFor: "最多人已經有帳號，文件與範例最多。",
    keyUrl: "https://platform.openai.com/api-keys",
    browserAccess: "no",
    accessNote: "OpenAI 不接受從瀏覽器直接呼叫，帶授權標頭的預檢請求會被擋下。這是他們的政策，不是設定問題，換一家供應商就好。",
  },
  {
    id: "google",
    name: "Google Gemini",
    models: ["gemini-2.0-flash", "gemini-2.5-flash", "gemini-2.5-pro"],
    defaultModel: "gemini-2.5-flash",
    needsApiKey: true,
    baseUrl: "https://generativelanguage.googleapis.com/v1beta",
    editableBaseUrl: true,
    fitFor: "有免費額度，適合先試用再決定。",
    keyUrl: "https://aistudio.google.com/apikey",
    browserAccess: "yes",
    accessNote: null,
  },
  {
    id: "deepseek",
    name: "DeepSeek",
    models: ["deepseek-chat", "deepseek-reasoner"],
    defaultModel: "deepseek-chat",
    needsApiKey: true,
    baseUrl: "https://api.deepseek.com/v1",
    editableBaseUrl: true,
    fitFor: "便宜，量大時成本差很多。",
    keyUrl: "https://platform.deepseek.com/api_keys",
    browserAccess: "unknown",
    accessNote: "沒有實測過。如果被瀏覽器擋下，那就是對方沒開放跨來源呼叫，換一家。",
  },
  {
    id: "moonshot",
    name: "Kimi（Moonshot）",
    models: ["moonshot-v1-32k", "kimi-latest"],
    defaultModel: "moonshot-v1-32k",
    needsApiKey: true,
    baseUrl: "https://api.moonshot.cn/v1",
    editableBaseUrl: true,
    fitFor: "長文，一次丟整份報表也吃得下。",
    keyUrl: "https://platform.moonshot.cn/console/api-keys",
    browserAccess: "unknown",
    accessNote: "沒有實測過。如果被瀏覽器擋下，那就是對方沒開放跨來源呼叫，換一家。",
  },
  {
    id: "zhipu",
    name: "智譜 GLM",
    models: ["glm-4-plus", "glm-4-flash", "glm-4-air"],
    defaultModel: "glm-4-flash",
    needsApiKey: true,
    baseUrl: "https://open.bigmodel.cn/api/paas/v4",
    editableBaseUrl: true,
    fitFor: "中國方案，境內連線穩定。",
    keyUrl: "https://open.bigmodel.cn/usercenter/apikeys",
    browserAccess: "unknown",
    accessNote: "沒有實測過。如果被瀏覽器擋下，那就是對方沒開放跨來源呼叫，換一家。",
  },
  {
    id: "minimax",
    name: "MiniMax",
    models: ["MiniMax-Text-01", "abab6.5s-chat"],
    defaultModel: "MiniMax-Text-01",
    needsApiKey: true,
    baseUrl: "https://api.minimax.chat/v1",
    editableBaseUrl: true,
    fitFor: "中國方案。",
    keyUrl: "https://platform.minimaxi.com/user-center/basic-information",
    browserAccess: "unknown",
    accessNote: "沒有實測過。如果被瀏覽器擋下，那就是對方沒開放跨來源呼叫，換一家。",
  },
  {
    id: "groq",
    name: "Groq",
    models: ["llama-3.3-70b", "llama-3.1-8b", "qwen-2.5-72b"],
    defaultModel: "llama-3.3-70b",
    needsApiKey: true,
    baseUrl: "https://api.groq.com/openai/v1",
    editableBaseUrl: true,
    fitFor: "速度極快，有免費額度。",
    keyUrl: "https://console.groq.com/keys",
    browserAccess: "yes",
    accessNote: null,
  },
  {
    id: "ollama",
    name: "Ollama（本機模型）",
    models: ["llama3.2", "qwen2.5:7b", "gemma3"],
    defaultModel: "llama3.2",
    // 跑在自己電腦上，沒有金鑰也沒有帳單。
    needsApiKey: false,
    baseUrl: "http://localhost:11434/v1",
    editableBaseUrl: true,
    fitFor: "零 API 費用，資料完全不出這台電腦。",
    keyUrl: null,
    browserAccess: "local",
    accessNote: "跑在你自己的電腦上。要讓網頁連得到，啟動 Ollama 前得先設定 OLLAMA_ORIGINS 允許這個網站。",
  },
];

export function findProvider(id: string): Provider | null {
  return PROVIDERS.find((provider) => provider.id === id) ?? null;
}

export type LlmSettings = {
  providerId: ProviderId;
  /** 型號。可以是建議清單以外的值。 */
  model: string;
  /** 金鑰。只存在這台瀏覽器，不進匯出檔。 */
  apiKey: string;
  /** API 端點。空字串代表用供應商預設值。 */
  baseUrl: string;
};

export function defaultLlmSettings(): LlmSettings {
  const provider = PROVIDERS[0];
  return { providerId: provider.id, model: provider.defaultModel, apiKey: "", baseUrl: "" };
}

/** 換供應商時把型號一併換成該家的預設值，不要留下另一家的型號名稱。 */
export function switchProvider(settings: LlmSettings, provider: Provider): LlmSettings {
  return { ...settings, providerId: provider.id, model: provider.defaultModel, baseUrl: "" };
}

export function resolvedBaseUrl(settings: LlmSettings): string {
  const provider = findProvider(settings.providerId);
  return settings.baseUrl.trim() || provider?.baseUrl || "";
}

/** 設定齊了沒。缺什麼就說缺什麼，不要讓人按下去才發現。 */
export function missingFields(settings: LlmSettings): string[] {
  const provider = findProvider(settings.providerId);
  const missing: string[] = [];
  if (!provider) return ["供應商"];
  if (settings.model.trim() === "") missing.push("型號");
  if (provider.needsApiKey && settings.apiKey.trim() === "") missing.push("API 金鑰");
  if (resolvedBaseUrl(settings) === "") missing.push("API 端點");
  return missing;
}

// 🚫 與 Doc 分開的儲存鍵。Doc 會被匯出成檔案，這個不會。
const STORAGE_KEY = "superexcel.llm.v1";

export function loadLlmSettings(): LlmSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultLlmSettings();
    const parsed = JSON.parse(raw) as Partial<LlmSettings>;
    const provider = findProvider(parsed.providerId ?? "");
    if (!provider) return defaultLlmSettings();
    return {
      providerId: provider.id,
      model: parsed.model ?? provider.defaultModel,
      apiKey: parsed.apiKey ?? "",
      baseUrl: parsed.baseUrl ?? "",
    };
  } catch {
    return defaultLlmSettings();
  }
}

export function saveLlmSettings(settings: LlmSettings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // 無痕模式寫不進去。不中斷操作，畫面另有提示。
  }
}

export function clearLlmSettings(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // 同上。
  }
}
