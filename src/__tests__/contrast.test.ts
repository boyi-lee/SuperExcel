// 文字對比度掃描。目標是 WCAG AA 的 4.5:1。
//
// ⚠️ 這條測試**真的去算對比度**，不是維護一份「不准用的 class」清單。
//    清單會過期，而且沒有人記得當初為什麼某個顏色被禁。
//    這裡直接從色票算 relative luminance，改色票的人立刻會知道有沒有踩線。
//
// 使用者是拿這個工具在看自己會不會賠錢的。看不清楚的數字比沒有數字更糟：
// 沒有數字他會去查，看錯數字他會直接下決定。

import { readFileSync, readdirSync, statSync } from "node:fs";
import { extname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const SRC = fileURLToPath(new URL("..", import.meta.url));

/** 色票。與 tailwind.config.js 同一組，改那邊記得改這邊，不然這條測試就白測了。 */
const PALETTE: Record<string, string> = {
  bg: "#131313",
  panel: "#1c1c1c",
  "panel-2": "#232323",
  line: "#2f2f2f",
  ink: "#ededed",
  "ink-2": "#9d9d9d",
  "ink-3": "#8e8e8e",
  acid: "#dcfd50",
  "acid-dim": "#8fa832",
  ok: "#7be495",
  warn: "#f2c94c",
  bad: "#ff7a7a",
  white: "#ffffff",
};

/**
 * 文字可能落在這幾個底色上。
 * ⚠️ 深色主題要對**最亮的那個底**都過關（對比最差的一組），不能只拿最深的底去算。
 */
const TEXT_SURFACES = ["bg", "panel", "panel-2"];

/** 深色字會出現在酸綠按鈕上。 */
const ACCENT_SURFACES = ["acid", "acid-dim"];

function relativeLuminance(hex: string): number {
  const channels = [1, 3, 5].map((offset) => Number.parseInt(hex.slice(offset, offset + 2), 16) / 255);
  const [r, g, b] = channels.map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrastRatio(a: string, b: string): number {
  const [light, dark] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x);
  return (light + 0.05) / (dark + 0.05);
}

function collectSources(dir: string, found: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry !== "__tests__") collectSources(full, found);
    } else if ([".tsx", ".ts"].includes(extname(entry))) {
      found.push(full);
    }
  }
  return found;
}

type Usage = { className: string; file: string; line: number };

function collectTextColors(): Usage[] {
  const usages: Usage[] = [];
  for (const file of collectSources(SRC)) {
    readFileSync(file, "utf8")
      .split("\n")
      .forEach((text, index) => {
        for (const match of text.matchAll(/\btext-(ink-2|ink-3|ink|acid-dim|acid|warn|bad|ok|bg|white)\b/g)) {
          usages.push({ className: match[1], file: relative(SRC, file), line: index + 1 });
        }
      });
  }
  return usages;
}

describe("WCAG AA 文字對比度", () => {
  const usages = collectTextColors();

  it("掃到了實際用到的文字顏色（掃不到東西的測試是假的綠燈）", () => {
    expect(usages.length).toBeGreaterThan(20);
    expect(new Set(usages.map((usage) => usage.className)).size).toBeGreaterThan(3);
  });

  it("對比度算式本身是對的（拿已知的值校準）", () => {
    // 純黑對純白是 21:1，這是定義上的最大值。
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 5);
    expect(contrastRatio("#ffffff", "#ffffff")).toBeCloseTo(1, 5);
    // 🚫 白字配酸綠底幾乎看不見，這是實際踩過的坑，留著當回歸測試。
    expect(contrastRatio(PALETTE.white, PALETTE.acid)).toBeLessThan(2);
    expect(contrastRatio(PALETTE.bg, PALETTE.acid)).toBeGreaterThan(4.5);
  });

  it("每個用到的色票都在調色盤裡（漏掉就等於沒檢查）", () => {
    const unknown = usages.filter((usage) => PALETTE[usage.className] === undefined);
    expect(unknown.map((usage) => `${usage.file}:${usage.line} text-${usage.className}`)).toEqual([]);
  });

  it("🚫 內文顏色對所有底色都要達到 4.5:1", () => {
    const failures: string[] = [];
    // bg 是按鈕上的深色字，另外一條測試管它。
    const onAccent = new Set(["bg"]);

    for (const usage of usages) {
      if (onAccent.has(usage.className)) continue;
      const color = PALETTE[usage.className];
      if (!color) continue;

      for (const surface of TEXT_SURFACES) {
        const ratio = contrastRatio(color, PALETTE[surface]);
        if (ratio < 4.5) {
          failures.push(
            `${usage.file}:${usage.line} text-${usage.className} 在 ${surface} 上只有 ${ratio.toFixed(2)}:1`,
          );
        }
      }
    }

    expect([...new Set(failures)]).toEqual([]);
  });

  it("🚫 酸綠按鈕上的深色字也要達到 4.5:1", () => {
    const failures = ACCENT_SURFACES.filter(
      (surface) => contrastRatio(PALETTE.bg, PALETTE[surface]) < 4.5,
    ).map((surface) => `深色字在 ${surface} 上只有 ${contrastRatio(PALETTE.bg, PALETTE[surface]).toFixed(2)}:1`);

    expect(failures).toEqual([]);
  });
});
