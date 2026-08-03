// 活動內容產生器。
//
// 把組好的組合彙整成活動頁要的東西：品名、規格、數量、詳情、價格、贈品。
//
// 🚫 這一頁不做任何計算，只排版。價格與贈品全部沿用試算頁算好的結果，
//    這裡再算一次遲早會對不起來，而活動頁上的數字錯了是直接對客人錯的。

import { useState } from "react";
import { Accordion, Button, Card, Field, Note, inputClass, money } from "../components/ui";
import { buildContent, renderCsv, renderMarkdown, renderPlainText } from "../lib/content";
import { listPricedItems } from "../lib/derive";
import type { Doc } from "../lib/doc";

const FORMATS = [
  { key: "text", label: "純文字", hint: "直接貼到活動頁編輯器。", render: renderPlainText, ext: "txt" },
  { key: "markdown", label: "Markdown", hint: "貼到部落格或電子報。", render: renderMarkdown, ext: "md" },
  { key: "csv", label: "表格 CSV", hint: "給上架用，或交給設計師。", render: renderCsv, ext: "csv" },
] as const;

type FormatKey = (typeof FORMATS)[number]["key"];

export function ContentScreen({ doc, onChange }: { doc: Doc; onChange: (doc: Doc) => void }) {
  const [bundleId, setBundleId] = useState<string | null>(doc.bundles[0]?.id ?? null);
  const [format, setFormat] = useState<FormatKey>("text");
  const [copied, setCopied] = useState(false);

  const items = listPricedItems(doc);
  const bundle = doc.bundles.find((row) => row.id === bundleId) ?? null;
  const block = bundleId === null ? null : buildContent(doc, bundleId);
  const spec = FORMATS.find((item) => item.key === format) ?? FORMATS[0];
  const output = block === null ? "" : spec.render(block);

  /** 沒填詳情的品項，直接在這裡補，不用跑回產品頁。 */
  const setDetails = (itemKey: string, details: string) => {
    const target = items.find((item) => item.key === itemKey);
    if (!target) return;
    const value = details.trim() === "" ? null : details;

    onChange({
      ...doc,
      products: doc.products.map((product) => {
        if (product.id !== target.product.id) return product;
        if (target.variant === null) return { ...product, details: value };
        return {
          ...product,
          variants: product.variants.map((variant) =>
            variant.id === target.variant?.id ? { ...variant, details: value } : variant,
          ),
        };
      }),
    });
  };

  return (
    <div className="space-y-4">
      <Card title="要產生哪一個組合的內容">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="組合">
            <select
              className={inputClass}
              value={bundleId ?? ""}
              onChange={(event) => setBundleId(event.target.value === "" ? null : event.target.value)}
            >
              <option value="">未選擇</option>
              {doc.bundles.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.name || "未命名組合"}
                </option>
              ))}
            </select>
          </Field>
          <Field label="輸出格式" hint={spec.hint}>
            <select
              className={inputClass}
              value={format}
              onChange={(event) => setFormat(event.target.value as FormatKey)}
            >
              {FORMATS.map((option) => (
                <option key={option.key} value={option.key}>
                  {option.label}
                </option>
              ))}
            </select>
          </Field>
        </div>

        {doc.bundles.length === 0 ? (
          <div className="mt-3">
            <Note tone="warn">還沒有組合。請先到「商品組合」建立一個，確認可行之後再回來產生內容。</Note>
          </div>
        ) : null}
      </Card>

      {block !== null ? (
        <>
          {/*
            ⚠️ 缺詳情要在這裡就講清楚並讓他當場補。
               否則使用者會複製一段少了商品說明的文案貼上去，然後在活動頁上才發現。
          */}
          {block.missingDetails.length > 0 ? (
            <Card title="這些品項還沒有商品詳情">
              <Note tone="warn">
                下面 {block.missingDetails.length} 項沒有詳情，所以產生出來的內容會少掉那幾段說明。
                這裡直接補就好，不用跑回產品頁。缺的地方我們不會自動編一段文案填進去。
              </Note>

              <div className="mt-4 space-y-3">
                {block.items
                  .filter((item) => item.details === null)
                  .map((item) => {
                    const target = items.find((option) => option.name === item.name);
                    return (
                      <Field key={item.name} label={item.name} hint="這段會出現在活動頁的品項下方。">
                        <textarea
                          className={`${inputClass} min-h-[4.5rem]`}
                          placeholder="例如：冷製工法，四週熟成，無人工香精。"
                          onChange={(event) => target && setDetails(target.key, event.target.value)}
                        />
                      </Field>
                    );
                  })}
              </div>
            </Card>
          ) : null}

          <Card
            title="預覽"
            action={
              <span className="text-xs text-ink-3">
                {block.items.length} 項內容
                {block.gifts.length > 0 ? `　${block.gifts.length} 個贈品規則` : ""}
              </span>
            }
          >
            <div className="grid gap-3 sm:grid-cols-3">
              <Stat label="原價加總" value={block.listPrice === null ? "" : money(block.listPrice)} />
              <Stat label="組合價" value={block.price === null ? "" : money(block.price)} />
              <Stat label="省下" value={block.saved === null ? "" : money(block.saved)} />
            </div>

            {block.price === null ? (
              <div className="mt-3">
                <Note tone="warn">
                  這個組合還沒有售價，所以價格與贈品那幾段不會出現。先到「商品組合」把價格填好。
                </Note>
              </div>
            ) : null}

            <div className="mt-4 flex flex-wrap gap-2">
              <Button
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(output);
                    setCopied(true);
                    window.setTimeout(() => setCopied(false), 2000);
                  } catch {
                    // 有些瀏覽器在非安全來源不給用剪貼簿。下面的文字框可以自己選取複製。
                    setCopied(false);
                    alert("這個瀏覽器不允許自動複製，請直接從下面的文字框選取複製。");
                  }
                }}
              >
                {copied ? "已複製" : "複製全部"}
              </Button>
              <Button
                variant="secondary"
                onClick={() => {
                  const blob = new Blob([output], { type: "text/plain;charset=utf-8" });
                  const url = URL.createObjectURL(blob);
                  const link = document.createElement("a");
                  link.href = url;
                  link.download = `${block.title || "活動內容"}.${spec.ext}`;
                  link.click();
                  URL.revokeObjectURL(url);
                }}
              >
                下載 .{spec.ext}
              </Button>
            </div>

            {/* 唯讀但可選取。剪貼簿被擋的時候這是備案。 */}
            <textarea
              className={`${inputClass} mt-4 min-h-[20rem] whitespace-pre font-mono text-xs`}
              value={output}
              readOnly
            />
          </Card>

          {bundle !== null ? (
            <Card title="活動頁補充說明">
              <Field label="這一段會接在內容最後面" hint="例如：本檔期至 3/31 止，贈品送完為止。">
                <textarea
                  className={`${inputClass} min-h-[5rem]`}
                  value={bundle.note ?? ""}
                  onChange={(event) =>
                    onChange({
                      ...doc,
                      bundles: doc.bundles.map((row) =>
                        row.id === bundle.id
                          ? { ...row, note: event.target.value.trim() === "" ? null : event.target.value }
                          : row,
                      ),
                    })
                  }
                />
              </Field>
            </Card>
          ) : null}
        </>
      ) : null}

      <Accordion title="這一頁不做什麼" summary="它只排版，不算數字">
        <div className="space-y-3 text-sm leading-relaxed text-ink-2">
          <p>
            <span className="font-semibold text-ink">價格與贈品都是沿用試算頁的結果，這裡不重算。</span>
            同一個數字在兩個地方各算一次，遲早會對不起來，而活動頁上的數字錯了是直接對客人錯的。
          </p>
          <p>
            <span className="font-semibold text-ink">缺資料不會自動補一段文案。</span>
            沒填詳情就是不寫那一段，並在上面列出缺哪幾項。編一段「本商品品質優良」貼上去，
            比少一段說明更糟。
          </p>
          <p>
            <span className="font-semibold text-ink">先確認可行，再產生內容。</span>
            「商品組合」那一頁會告訴你這個組合有沒有跌破安控線。不可行的組合不要拿來做活動頁，
            做完才發現要改，前面的美編與排程都白做了。
          </p>
        </div>
      </Accordion>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-line bg-panel-2 p-3">
      <div className="text-xs text-ink-3">{label}</div>
      {/* 🚫 沒資料留白，不寫 N/A。 */}
      <div className="mt-1 text-xl font-bold text-ink">{value || <span className="text-ink-3">－</span>}</div>
    </div>
  );
}
