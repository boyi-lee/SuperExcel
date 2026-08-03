// 語言模型設定。
//
// ⚠️ 這一頁是整個工具唯一會把資料送出這台電腦的地方，因此警語要寫在最上面，
//    不是藏在小字裡。使用者有權知道自己的成本結構要送去哪。
// 🚫 金鑰不進「下載存檔」。存檔是拿來到處傳的東西，金鑰不是。

import { useEffect, useState } from "react";
import { Button, Card, Field, Note, inputClass } from "../components/ui";
import {
  PROVIDERS,
  clearLlmSettings,
  findProvider,
  loadLlmSettings,
  missingFields,
  resolvedBaseUrl,
  saveLlmSettings,
  switchProvider,
  type LlmSettings,
} from "../lib/llm";

export function ModelsScreen() {
  const [settings, setSettings] = useState<LlmSettings>(() => loadLlmSettings());
  const [showKey, setShowKey] = useState(false);

  useEffect(() => {
    saveLlmSettings(settings);
  }, [settings]);

  const provider = findProvider(settings.providerId);
  const missing = missingFields(settings);
  const custom = provider !== null && !provider.models.includes(settings.model);

  return (
    <>
      <Card title="這一頁會把資料送出去">
        <div className="space-y-3">
          <Note tone="warn">
            這個工具其他部分都在你的瀏覽器裡跑，不連任何伺服器。
            但只要你在這裡設定並使用語言模型，送過去的內容就會離開這台電腦，交給你選的那家供應商。
            成本結構、配方、供應商名稱都是商業機密，送出去之前先想清楚。
          </Note>
          <Note tone="danger">
            API 金鑰存在這個瀏覽器的本機儲存區，任何能打開這台電腦這個瀏覽器的人都拿得到。
            共用電腦請用完就按「清除金鑰」。
            金鑰<span className="font-semibold">不會</span>寫進「下載存檔」的 JSON：那個檔案可以安心傳給別人。
          </Note>
          {provider !== null && !provider.needsApiKey ? (
            <Note>
              你選的是本機模型，資料不會離開這台電腦，也不會產生 API 費用。
              前提是那個服務真的跑在本機端點上。
            </Note>
          ) : null}
        </div>
      </Card>

      <Card
        title="供應商"
        action={<span className="text-xs text-ink-3">目前支援 {PROVIDERS.length} 家</span>}
      >
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {PROVIDERS.map((item) => {
            const selected = item.id === settings.providerId;
            return (
              <button
                key={item.id}
                onClick={() => setSettings(switchProvider(settings, item))}
                className={`rounded-lg border p-3 text-left ${
                  selected ? "border-brand-500 bg-acid/10" : "border-line bg-panel hover:bg-panel-2"
                }`}
              >
                <span className="block text-sm font-semibold text-ink">{item.name}</span>
                <span className="mt-1 block text-xs text-ink-3">{item.fitFor}</span>
                <span className="mt-2 block text-xs text-ink-3">
                  {item.needsApiKey ? "需要 API 金鑰" : "不需要金鑰，跑在本機"}
                </span>
              </button>
            );
          })}
        </div>
      </Card>

      {provider !== null ? (
        <Card title={`${provider.name} 的設定`}>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="型號"
              hint="下拉是建議值。型號會改版也會下架，清單裡沒有的可以自己填。"
            >
              <select
                className={inputClass}
                value={custom ? "__custom__" : settings.model}
                onChange={(event) =>
                  setSettings({
                    ...settings,
                    model: event.target.value === "__custom__" ? "" : event.target.value,
                  })
                }
              >
                {provider.models.map((model) => (
                  <option key={model} value={model}>
                    {model}
                  </option>
                ))}
                <option value="__custom__">自行輸入⋯⋯</option>
              </select>
            </Field>

            {custom ? (
              <Field label="型號（自行輸入）" hint="填錯不會在這裡被擋下來，會在實際呼叫時才失敗。">
                <input
                  className={inputClass}
                  value={settings.model}
                  placeholder={provider.defaultModel}
                  onChange={(event) => setSettings({ ...settings, model: event.target.value })}
                />
              </Field>
            ) : null}

            {provider.needsApiKey ? (
              <Field
                label="API 金鑰"
                hint={provider.keyUrl ? `到 ${provider.keyUrl} 申請。` : undefined}
              >
                <div className="flex gap-2">
                  <input
                    className={`${inputClass} flex-1`}
                    type={showKey ? "text" : "password"}
                    autoComplete="off"
                    spellCheck={false}
                    value={settings.apiKey}
                    onChange={(event) => setSettings({ ...settings, apiKey: event.target.value })}
                  />
                  <Button variant="secondary" onClick={() => setShowKey(!showKey)}>
                    {showKey ? "隱藏" : "顯示"}
                  </Button>
                </div>
              </Field>
            ) : null}

            {provider.editableBaseUrl ? (
              <Field label="API 端點" hint={`留空就用預設值：${provider.baseUrl}`}>
                <input
                  className={inputClass}
                  value={settings.baseUrl}
                  placeholder={provider.baseUrl}
                  onChange={(event) => setSettings({ ...settings, baseUrl: event.target.value })}
                />
              </Field>
            ) : null}
          </div>

          <div className="mt-4 space-y-3">
            {missing.length > 0 ? (
              <Note tone="warn">還缺：{missing.join("、")}。補齊之前這個設定不能用。</Note>
            ) : (
              <Note>
                設定完成。實際送出的端點是 {resolvedBaseUrl(settings)}，型號 {settings.model}。
              </Note>
            )}
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <Button
              variant="danger"
              onClick={() => {
                if (!confirm("清除金鑰與這一頁的設定？")) return;
                clearLlmSettings();
                setSettings(loadLlmSettings());
              }}
            >
              清除金鑰
            </Button>
          </div>
        </Card>
      ) : null}
    </>
  );
}
