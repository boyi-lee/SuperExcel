// 中文標點掃描。
//
// 中文句子裡要用全形逗號，不要用半形的。混用起來字距忽寬忽窄，
// 而且複製到活動頁之後看起來像沒校對過。
//
// ⚠️ 只掃**非測試檔**。測試裡會故意放半形逗號來驗 CSV 跳脫，
//    那是刻意的測試資料不是行文，掃到它只會逼人把一條真正的測試改弱。

import { readFileSync, readdirSync, statSync } from "node:fs";
import { extname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const ROOT = fileURLToPath(new URL("../..", import.meta.url));

const SKIP_DIRS = new Set([".git", "node_modules", "dist", ".vite", "coverage", ".vercel", "__tests__"]);
const SCAN_EXTENSIONS = new Set([".ts", ".tsx", ".md", ".html"]);

/** 中日韓統一表意文字。用碼位判斷，不列舉字。 */
const HAN = "[\\u4e00-\\u9fff]";

/**
 * 半形逗號緊鄰中文字就是行文用錯了。
 * 🚫 不能只掃「半形逗號」本身：程式碼裡到處都是逗號，那樣會全部誤報。
 */
const HALF_WIDTH_COMMA = new RegExp(`${HAN}\\s*,|,\\s*${HAN}`);

function collectFiles(dir: string, found: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (!SKIP_DIRS.has(entry)) collectFiles(full, found);
    } else if (SCAN_EXTENSIONS.has(extname(entry))) {
      found.push(full);
    }
  }
  return found;
}

describe("中文標點", () => {
  const files = collectFiles(ROOT);

  it("掃到了檔案（掃不到東西的測試永遠會通過）", () => {
    expect(files.length).toBeGreaterThan(10);
    expect(files.some((file) => file.endsWith("README.md"))).toBe(true);
  });

  it("規則本身是對的（拿已知的例子校準）", () => {
    expect(HALF_WIDTH_COMMA.test("這裡直接補就好,不用跑回產品頁")).toBe(true);
    expect(HALF_WIDTH_COMMA.test("這裡直接補就好，不用跑回產品頁")).toBe(false);
    // 純程式碼裡的逗號不該被誤判。
    expect(HALF_WIDTH_COMMA.test("const a = [1, 2, 3];")).toBe(false);
  });

  it("🚫 中文句子裡不得使用半形逗號", () => {
    const hits: string[] = [];

    for (const file of files) {
      let text: string;
      try {
        text = readFileSync(file, "utf8");
      } catch {
        continue;
      }

      text.split("\n").forEach((line, index) => {
        if (HALF_WIDTH_COMMA.test(line)) hits.push(`${relative(ROOT, file)}:${index + 1}`);
      });
    }

    expect(hits, `中文句子要用全形逗號「，」。\n出現在：\n${hits.join("\n")}`).toEqual([]);
  });
});
