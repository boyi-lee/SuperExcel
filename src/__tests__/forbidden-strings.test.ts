// 禁用字串掃描。這是一條 CI 測試，不是建議。
//
// 這個專案是從一份公司內部的試算表長出來的開源工具。內部的專案代號、客戶名稱、
// 平台名稱、多用戶隔離架構的殘留詞彙，都不該跟著程式一起公開出去。
// 一旦推上公開 repo，git 歷史就洗不掉了，所以在合併前擋下來。
//
// ⚠️ 這個檔案本身也會被掃到，因此**禁用字串一律拆成片段再組回去**，
//    絕不能在原始碼裡寫出完整字串：否則這條測試會被自己絆倒。

import { readFileSync, readdirSync, statSync } from "node:fs";
import { extname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const ROOT = fileURLToPath(new URL("../..", import.meta.url));

/** 不掃第三方程式碼與建置產物：那些不是這個 repo 的內容。 */
const SKIP_DIRS = new Set([".git", "node_modules", "dist", ".vite", "coverage", ".vercel"]);

/** 二進位檔沒有「字串」可言，讀進來只會是雜訊。 */
const SKIP_EXTENSIONS = new Set([
  ".jpg", ".jpeg", ".png", ".gif", ".webp", ".ico", ".svg",
  ".pdf", ".zip", ".xlsx", ".xls", ".woff", ".woff2", ".ttf", ".otf",
  ".tsbuildinfo",
]);

type Forbidden = { pattern: RegExp; label: string; why: string };

/** U+2500。組出來而不寫字面值，理由同上。 */
const BOX = String.fromCharCode(0x2500);

/**
 * 🚫 一律用片段組合，不要寫出完整字串。
 *    大小寫敏感度個別設定：工單編號前綴若不分大小寫，會誤傷 package-lock 裡的
 *    "microtask-1.2.3" 這種套件名，所以只比對大寫開頭。
 *    誤報的 CI 測試很快就會被大家習慣性忽略，那比沒有測試更糟。
 */
const FORBIDDEN: Forbidden[] = [
  {
    pattern: new RegExp(["cdp", "4ai"].join(""), "i"),
    label: "內部專案代號",
    why: "公司內部代號，不該出現在開源專案裡。",
  },
  {
    pattern: new RegExp(["phyto", "pia"].join(""), "i"),
    label: "客戶品牌名稱",
    why: "客戶名稱，不該出現在開源專案裡。",
  },
  {
    pattern: new RegExp(["cyber", "biz"].join(""), "i"),
    label: "電商平台名稱",
    why: "特定平台名稱。費率請由使用者自行設定，程式不綁任何平台。",
  },
  {
    pattern: new RegExp(["租", "戶"].join("")),
    label: "多用戶隔離用語（中文）",
    why: "這個工具沒有後端也沒有帳號，不存在多用戶隔離的概念。",
  },
  {
    pattern: new RegExp(["ten", "ant"].join(""), "i"),
    label: "多用戶隔離用語（英文）",
    why: "這個工具沒有後端也沒有帳號，不存在多用戶隔離的概念。",
  },
  {
    pattern: new RegExp(["Task", "-"].join("")),
    label: "內部工單編號前綴",
    why: "內部工單編號，對外部讀者沒有意義。",
  },
  {
    // U+2014 破折號、U+2015 橫線、U+2013 連接號。
    // 同樣不寫出字面值，否則這一行自己就會被掃到。
    pattern: new RegExp(`[${[0x2014, 0x2015, 0x2013].map((code) => String.fromCharCode(code)).join("")}]`),
    label: "破折號",
    why: "全站不用破折號。要停頓就用全形冒號或逗號，要補充就另起一句。",
  },
  {
    // U+2500 短横線。長的那種是區段分隔線（整行都是），那是版面不是標點，所以只擋 1 到 4 個。
    pattern: new RegExp(`(?<!${BOX})${BOX}{1,4}(?!${BOX})`),
    label: "拿製表線當破折號用",
    why: "看起來跟破折號一樣，一樣不要用。區段分隔線請整行拉滿。",
  },
];

function collectFiles(dir: string, found: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (!SKIP_DIRS.has(entry)) collectFiles(full, found);
      continue;
    }
    if (!SKIP_EXTENSIONS.has(extname(entry).toLowerCase())) found.push(full);
  }
  return found;
}

describe("禁用字串掃描", () => {
  const files = collectFiles(ROOT);

  it("掃到了檔案（掃不到東西的測試永遠會通過，那是假的綠燈）", () => {
    expect(files.length).toBeGreaterThan(5);
    expect(files.some((file) => file.endsWith("costing.ts"))).toBe(true);
  });

  it.each(FORBIDDEN)("整個 repo 不得出現：$label", ({ pattern, why }) => {
    const hits: string[] = [];

    for (const file of files) {
      let text: string;
      try {
        text = readFileSync(file, "utf8");
      } catch {
        continue;
      }

      text.split("\n").forEach((lineText, index) => {
        if (pattern.test(lineText)) hits.push(`${relative(ROOT, file)}:${index + 1}`);
      });
    }

    // 失敗訊息要直接寫出「為什麼不能用」，否則下一個人只會把字串換個寫法繞過去。
    expect(hits, `${why}\n出現在：\n${hits.join("\n")}`).toEqual([]);
  });
});
