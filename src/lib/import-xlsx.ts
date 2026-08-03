// 匯入既有的成本試算 Excel（.xlsx）。
//
// 用 fflate 解壓 + DOMParser 讀 sheet XML，刻意不引入 SheetJS：
// 這個工具整包要能靜態部署，多一個大型相依只為了讀幾張表並不划算，
// 而且 .xlsx 就是一包 zip 裡的 XML，讀它需要的東西瀏覽器本來就有。
//
// 匯入的原則和計算層一致：**看不懂就說看不懂，不要猜一個數字填進去**。
//   - 認不出來的欄位不匯入，列進 warnings 讓使用者自己看
//   - 缺單價的物料匯入成 unitCost = null，不是 0
//   - 新建的分類一律預設「依用量計價」並提醒去確認，不從分類名稱猜行為
//   - 稅率不從表格匯入（見下方說明）

import { strFromU8, unzipSync } from "fflate";
import {
  newId,
  type Category,
  type CostBehavior,
  type DiscountTier,
  type Doc,
  type Material,
  type Product,
  type Rate,
  type RateKind,
} from "./doc";

export type XlsxImportResult =
  | {
      ok: true;
      doc: Doc;
      summary: { rates: number; materials: number; products: number };
      warnings: string[];
    }
  | { ok: false; error: string };

// ──────────────────────────────────────────────────────────── zip 與 XML

const REL_NS = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";

function parseXml(text: string): Document | null {
  const parsed = new DOMParser().parseFromString(text, "application/xml");
  return parsed.getElementsByTagName("parsererror").length > 0 ? null : parsed;
}

/** 把元素底下所有 <t> 的文字接起來。共用字串可能被拆成多個 run。 */
function textOf(node: Element | undefined): string {
  if (!node) return "";
  const parts = Array.from(node.getElementsByTagName("t")).map((item) => item.textContent ?? "");
  return parts.length > 0 ? parts.join("") : (node.textContent ?? "");
}

/** "AB12" → 27（0 起算）。 */
function colIndex(ref: string): number {
  let n = 0;
  for (const ch of ref) {
    const code = ch.charCodeAt(0);
    if (code < 65 || code > 90) break;
    n = n * 26 + (code - 64);
  }
  return n - 1;
}

type Grid = string[][];

function readSharedStrings(xml: string | undefined): string[] {
  if (!xml) return [];
  const parsed = parseXml(xml);
  if (!parsed) return [];
  return Array.from(parsed.getElementsByTagName("si")).map((si) => textOf(si));
}

function readSheet(xml: string, shared: string[]): Grid {
  const parsed = parseXml(xml);
  if (!parsed) return [];

  const grid: Grid = [];
  for (const row of Array.from(parsed.getElementsByTagName("row"))) {
    const cells: string[] = [];
    let width = 0;

    for (const cell of Array.from(row.getElementsByTagName("c"))) {
      const index = colIndex(cell.getAttribute("r") ?? "");
      if (index < 0) continue;

      const type = cell.getAttribute("t");
      let text: string;
      if (type === "inlineStr") {
        text = textOf(cell.getElementsByTagName("is")[0]);
      } else {
        const raw = cell.getElementsByTagName("v")[0]?.textContent ?? "";
        // t="e" 是公式錯誤（#DIV/0! 之類）。當作空白，不當作 0。
        text = type === "s" ? (shared[Number(raw)] ?? "") : type === "e" ? "" : raw;
      }

      cells[index] = text.trim();
      width = Math.max(width, index + 1);
    }

    grid.push(Array.from({ length: width }, (_, index) => cells[index] ?? ""));
  }
  return grid;
}

type SheetData = { name: string; grid: Grid };

function readWorkbook(files: Record<string, Uint8Array>): SheetData[] {
  const shared = readSharedStrings(files["xl/sharedStrings.xml"] && strFromU8(files["xl/sharedStrings.xml"]));

  const workbook = files["xl/workbook.xml"] && parseXml(strFromU8(files["xl/workbook.xml"]));
  const rels = files["xl/_rels/workbook.xml.rels"] && parseXml(strFromU8(files["xl/_rels/workbook.xml.rels"]));

  const targetById = new Map<string, string>();
  if (rels) {
    for (const rel of Array.from(rels.getElementsByTagName("Relationship"))) {
      const id = rel.getAttribute("Id");
      const target = rel.getAttribute("Target");
      if (id && target) targetById.set(id, target.replace(/^\/?xl\//, "").replace(/^\//, ""));
    }
  }

  const sheets: SheetData[] = [];
  if (workbook) {
    for (const sheet of Array.from(workbook.getElementsByTagName("sheet"))) {
      const name = sheet.getAttribute("name") ?? "";
      const id = sheet.getAttributeNS(REL_NS, "id") ?? sheet.getAttribute("r:id") ?? "";
      const path = `xl/${targetById.get(id) ?? ""}`;
      const file = files[path];
      if (file) sheets.push({ name, grid: readSheet(strFromU8(file), shared) });
    }
  }

  // workbook.xml 讀不到時退回直接掃 worksheets 目錄，至少不是整包失敗。
  if (sheets.length === 0) {
    for (const path of Object.keys(files).filter((key) => key.startsWith("xl/worksheets/") && key.endsWith(".xml"))) {
      sheets.push({ name: path.slice("xl/worksheets/".length, -4), grid: readSheet(strFromU8(files[path]), shared) });
    }
  }

  return sheets;
}

// ──────────────────────────────────────────────────────────── 數值解析

/** 金額文字轉數字。看不懂就回 null，不回 0。 */
export function parseNumber(text: string): number | null {
  const trimmed = text.trim();
  if (trimmed === "") return null;

  const percent = /[%％]\s*$/.test(trimmed);
  const cleaned = trimmed
    .replace(/[%％]/g, "")
    .replace(/[,，\s]/g, "")
    .replace(/^(NT\$|NT|US\$|TWD|USD|\$|＄)/i, "")
    .replace(/元$/, "");

  const value = Number(cleaned);
  if (!Number.isFinite(value)) return null;
  return percent ? value / 100 : value;
}

/**
 * 比率文字轉 0 至 1 的數字。
 * ⚠️ 「3」在費率欄幾乎都是 3% 而不是 300%，因此大於 1 時視為百分比並提醒。
 *    這是猜測，所以一定要留下 warning，不能靜靜地改掉使用者的數字。
 */
function parseRate(text: string, label: string, warnings: string[]): number | null {
  const value = parseNumber(text);
  if (value === null) return null;
  if (value > 1) {
    warnings.push(`${label} 的值是 ${text}，已當作 ${value}% 匯入（即 ${value / 100}）。請確認。`);
    return value / 100;
  }
  return value;
}

// ──────────────────────────────────────────────────────────── 欄位辨識

type FieldKey =
  | "product"
  | "material"
  | "sku"
  | "unitCost"
  | "price"
  | "quantity"
  | "outputQuantity"
  | "unit"
  | "supplier"
  | "category"
  | "scrapRate"
  | "currency"
  | "fxRate"
  | "rateValue"
  | "usageShare"
  | "amountValue"
  | "kind"
  | "name"
  | "note";

/**
 * 表頭關鍵字。順序就是優先序：先比對到的先佔走那一欄，
 * 所以「產品名稱」會被認成 product 而不是 name，「單位成本」會被認成 unitCost 而不是 unit。
 */
const FIELD_PATTERNS: [FieldKey, RegExp][] = [
  ["outputQuantity", /產出|批量|一次做|產能/],
  ["unitCost", /單價|單位成本|進價|採購價|成本/],
  ["price", /售價|定價|零售價|標價/],
  ["quantity", /用量|使用量|投入量|配方量/],
  ["product", /產品|商品|成品/],
  ["material", /物料|材料|原料|品項/],
  ["sku", /料號|sku|貨號|編號/i],
  ["supplier", /供應商|廠商|供貨/],
  ["category", /分類|類別|群組/],
  ["scrapRate", /耗損|損耗|報廢/],
  ["currency", /幣別|幣種/],
  ["fxRate", /匯率/],
  ["rateValue", /費率|比率|抽成|手續費|趴數/],
  ["usageShare", /佔比|占比|比重|使用率/],
  ["amountValue", /運費|金額|每筆/],
  ["kind", /類型|種類/],
  ["unit", /單位/],
  ["name", /名稱|品名|項目/],
  ["note", /備註|說明|註記/],
];

type Header = { row: number; columns: Partial<Record<FieldKey, number>> };

function detectHeader(grid: Grid): Header | null {
  let best: Header | null = null;

  for (let row = 0; row < Math.min(grid.length, 30); row += 1) {
    const columns: Partial<Record<FieldKey, number>> = {};

    grid[row].forEach((cell, index) => {
      if (cell === "") return;
      for (const [field, pattern] of FIELD_PATTERNS) {
        if (columns[field] !== undefined) continue;
        if (pattern.test(cell)) {
          columns[field] = index;
          return;
        }
      }
    });

    const score = Object.keys(columns).length;
    if (score >= 2 && score > Object.keys(best?.columns ?? {}).length) best = { row, columns };
  }

  return best;
}

const cellAt = (grid: Grid, row: number, index: number | undefined): string =>
  index === undefined ? "" : (grid[row]?.[index] ?? "");

// ──────────────────────────────────────────────────────────── 匯入

/** 費率種類只從明確的「類型」欄或表頭語意判斷，判斷不出來就不匯入。 */
function detectRateKind(text: string): RateKind | null {
  if (/物流|運費|宅配|超商|包材|出貨/.test(text)) return "LOGISTICS";
  if (/金流|刷卡|信用卡|手續費|支付/.test(text)) return "PAYMENT";
  if (/通路|平台|抽成|上架/.test(text)) return "CHANNEL";
  if (/分攤|固定費用|管銷|管理|研發|行銷/.test(text)) return "OVERHEAD";
  if (/退貨|退款|退換/.test(text)) return "RETURN";
  return null;
}

type Draft = {
  categories: Category[];
  materials: Material[];
  products: Product[];
  rates: Rate[];
  discountTiers: DiscountTier[];
};

// ──────────────────────────────────────────────────────────── 完整版專用匯入
//
// ⚠️ 通用的表頭辨識讀不動完整版：它的表頭是多層合併儲存格，
//    而且三張物料表的欄位順序各不相同。
//    所以先認出「這是完整版」，再照它的實際結構讀。
//
// 🚫 這裡仍然只認**表頭文字**不認欄位字母。
//    寫死 AD 欄之後，使用者插入一欄就整份匯錯而且沒有人會發現。

/** 完整版三張物料表。behavior 來自這張表的角色，不是使用者取的分類名稱。 */
const FULL_MATERIAL_SHEETS: {
  sheet: string;
  categoryName: string;
  behavior: CostBehavior;
  nameHeader: string;
  supplierHeader: string;
}[] = [
  {
    sheet: "02 BOM-2 生產物料表",
    categoryName: "生產物料",
    behavior: "MATERIAL",
    nameHeader: "生產物料標準名稱",
    supplierHeader: "供應商",
  },
  {
    sheet: "02 BOM-3 包裝物料表",
    categoryName: "包裝物料",
    behavior: "MATERIAL",
    nameHeader: "包裝物料標準名稱",
    supplierHeader: "供應商",
  },
  {
    sheet: "02 BOM-4 模治具表",
    categoryName: "模治具攤提",
    // 模治具是一次性支出攤到每一單位，行為上是攤提不是投入物。
    behavior: "AMORTIZED",
    nameHeader: "模治具標準名稱",
    supplierHeader: "模治具供應商",
  },
];

const FULL_DISCOUNT_SHEET = "05 折扣變價";

/** 這份檔案是不是完整版。認得出來才走專用路徑。 */
export function isFullWorkbook(sheets: readonly SheetData[]): boolean {
  const names = new Set(sheets.map((sheet) => sheet.name));
  return FULL_MATERIAL_SHEETS.filter((spec) => names.has(spec.sheet)).length >= 2;
}

/** 在指定列範圍內找出「這個表頭文字在第幾欄」。找不到回 -1。 */
function findColumn(grid: Grid, headerRow: number, header: string): number {
  const row = grid[headerRow] ?? [];
  return row.findIndex((cell) => cell.replace(/\s+/g, "") === header.replace(/\s+/g, ""));
}

/** 找出表頭在第幾列：從前 6 列裡挑出含有指定文字的那一列。 */
function findHeaderRow(grid: Grid, header: string): number {
  for (let row = 0; row < Math.min(grid.length, 6); row += 1) {
    if (findColumn(grid, row, header) >= 0) return row;
  }
  return -1;
}

function importFullMaterials(sheets: readonly SheetData[], draft: Draft, warnings: string[]): number {
  let count = 0;

  for (const spec of FULL_MATERIAL_SHEETS) {
    const sheet = sheets.find((item) => item.name === spec.sheet);
    if (!sheet) continue;

    const headerRow = findHeaderRow(sheet.grid, spec.nameHeader);
    if (headerRow < 0) {
      warnings.push(`「${spec.sheet}」找不到「${spec.nameHeader}」這一欄，整張未匯入。`);
      continue;
    }

    const nameCol = findColumn(sheet.grid, headerRow, spec.nameHeader);
    const costCol = findColumn(sheet.grid, headerRow, "單位成本");
    const unitCol = sheet.grid[headerRow].reduce(
      // 「計量單位」在同一張表出現兩次，單位成本旁邊那一個才是用量單位。
      (best, cell, index) => (cell.replace(/\s+/g, "") === "計量單位" && index < costCol ? index : best),
      -1,
    );
    const supplierCol = findColumn(sheet.grid, headerRow, spec.supplierHeader);
    const currencyCol = findColumn(sheet.grid, headerRow, "貨幣單位");

    if (costCol < 0) {
      warnings.push(`「${spec.sheet}」找不到「單位成本」這一欄，整張未匯入。`);
      continue;
    }

    let category = draft.categories.find((item) => item.name === spec.categoryName);
    if (!category) {
      category = {
        id: newId(),
        name: spec.categoryName,
        behavior: spec.behavior,
        sortOrder: (draft.categories.at(-1)?.sortOrder ?? 0) + 10,
      };
      draft.categories.push(category);
    }

    for (let row = headerRow + 1; row < sheet.grid.length; row += 1) {
      const name = cellAt(sheet.grid, row, nameCol).trim();
      if (name === "") continue;

      const label = `${spec.sheet} 第 ${row + 1} 列「${name}」`;
      const costText = cellAt(sheet.grid, row, costCol);
      const unitCost = parseNumber(costText);
      if (costText !== "" && unitCost === null) {
        warnings.push(`${label} 的單位成本「${costText}」看不懂，已當作沒有單價匯入。`);
      }

      const supplierName = cellAt(sheet.grid, row, supplierCol).trim();
      const fields = {
        categoryId: category.id,
        unit: cellAt(sheet.grid, row, unitCol).trim(),
        unitCost,
        currency: cellAt(sheet.grid, row, currencyCol).trim().toUpperCase() || "TWD",
        // 完整版沒有耗損率欄位，留 null 由使用者自己補。
        scrapRate: null,
        note: supplierName ? `供應商：${supplierName}` : null,
      };

      const existing = draft.materials.find((item) => item.name === name);
      if (existing) Object.assign(existing, fields);
      else draft.materials.push({ id: newId(), name, supplierId: null, fxRate: null, ...fields });
      count += 1;
    }
  }

  return count;
}

function importFullDiscountTiers(sheets: readonly SheetData[], draft: Draft, warnings: string[]): number {
  const sheet = sheets.find((item) => item.name === FULL_DISCOUNT_SHEET);
  if (!sheet) return 0;

  const headerRow = findHeaderRow(sheet.grid, "金額");
  if (headerRow < 0) {
    warnings.push(`「${FULL_DISCOUNT_SHEET}」找不到折扣表的表頭，未匯入。`);
    return 0;
  }

  const amountCol = findColumn(sheet.grid, headerRow, "金額");
  // ⚠️ 完整版這三欄的標題是「最低折扣／中間折扣／最低折扣」，第一與第三個同名。
  //    所以照位置取金額欄右邊連續三欄，不靠標題分辨。
  const [lightCol, midCol, deepCol] = [amountCol + 1, amountCol + 2, amountCol + 3];

  let count = 0;
  for (let row = headerRow + 1; row < sheet.grid.length; row += 1) {
    const threshold = parseNumber(cellAt(sheet.grid, row, amountCol));
    const light = parseNumber(cellAt(sheet.grid, row, lightCol));
    const mid = parseNumber(cellAt(sheet.grid, row, midCol));
    const deep = parseNumber(cellAt(sheet.grid, row, deepCol));
    if (threshold === null || light === null || mid === null || deep === null) continue;
    // 折數應該落在 0 到 1，超出範圍代表讀到別的區塊了，停下來而不是硬收。
    if (light > 1 || mid > 1 || deep > 1) continue;

    draft.discountTiers.push({ id: newId(), threshold, light, mid, deep });
    count += 1;
  }

  if (count === 0) warnings.push(`「${FULL_DISCOUNT_SHEET}」的折扣表沒有讀到可用的列。`);
  return count;
}

function importMaterials(
  sheet: SheetData,
  header: Header,
  draft: Draft,
  baseCurrency: string,
  warnings: string[],
): number {
  const { columns } = header;
  let count = 0;

  for (let row = header.row + 1; row < sheet.grid.length; row += 1) {
    const name = (cellAt(sheet.grid, row, columns.material) || cellAt(sheet.grid, row, columns.name)).trim();
    if (name === "") continue;

    const label = `${sheet.name} 第 ${row + 1} 列「${name}」`;
    const categoryName = cellAt(sheet.grid, row, columns.category).trim();

    let category = draft.categories.find((item) => item.name === categoryName);
    if (!category && categoryName !== "") {
      // 🚫 不從分類名稱猜計價行為。程式只認 behavior，名稱是使用者的事。
      category = {
        id: newId(),
        name: categoryName,
        behavior: "MATERIAL",
        sortOrder: (draft.categories.at(-1)?.sortOrder ?? 0) + 10,
      };
      draft.categories.push(category);
      warnings.push(`新增分類「${categoryName}」，計價行為預設為「依用量計價」，請到分類頁確認是否正確。`);
    }

    const supplierName = cellAt(sheet.grid, row, columns.supplier).trim();
    const unitCostText = cellAt(sheet.grid, row, columns.unitCost);
    const unitCost = parseNumber(unitCostText);
    if (unitCostText !== "" && unitCost === null) {
      warnings.push(`${label} 的單價「${unitCostText}」看不懂，已當作沒有單價匯入（不會用 0 代替）。`);
    }

    const scrapText = cellAt(sheet.grid, row, columns.scrapRate);
    const scrapRate = scrapText === "" ? null : parseRate(scrapText, `${label} 的耗損率`, warnings);
    if (scrapRate !== null && scrapRate >= 1) {
      warnings.push(`${label} 的耗損率為 ${scrapRate}，代表投入全部報廢，已略過這個值。`);
    }

    const currency = cellAt(sheet.grid, row, columns.currency).trim().toUpperCase() || baseCurrency;
    const fields = {
      unit: cellAt(sheet.grid, row, columns.unit).trim(),
      unitCost,
      currency,
      fxRate: parseNumber(cellAt(sheet.grid, row, columns.fxRate)),
      scrapRate: scrapRate !== null && scrapRate < 1 ? scrapRate : null,
      note: cellAt(sheet.grid, row, columns.note).trim() || null,
    };

    if (currency !== baseCurrency && fields.fxRate === null) {
      warnings.push(`${label} 的幣別是 ${currency} 但沒有匯率，這項會被當成沒有單價。`);
    }
    if (supplierName !== "") {
      warnings.push(`${label} 的供應商「${supplierName}」未自動建立，請到物料頁指定。`);
    }

    const existing = draft.materials.find((item) => item.name === name);
    if (existing) {
      Object.assign(existing, fields, category ? { categoryId: category.id } : {});
    } else {
      draft.materials.push({
        id: newId(),
        name,
        categoryId: category?.id ?? draft.categories[0]?.id ?? "",
        supplierId: null,
        ...fields,
      });
    }
    count += 1;
  }

  return count;
}

function importProducts(sheet: SheetData, header: Header, draft: Draft, warnings: string[]): number {
  const { columns } = header;
  let count = 0;

  for (let row = header.row + 1; row < sheet.grid.length; row += 1) {
    const name = (cellAt(sheet.grid, row, columns.product) || cellAt(sheet.grid, row, columns.name)).trim();
    if (name === "") continue;

    const priceText = cellAt(sheet.grid, row, columns.price);
    const price = parseNumber(priceText);
    if (priceText !== "" && price === null) {
      warnings.push(`${sheet.name} 第 ${row + 1} 列「${name}」的售價「${priceText}」看不懂，已當作未定價。`);
    }

    const outputQuantity = parseNumber(cellAt(sheet.grid, row, columns.outputQuantity));
    const fields = {
      sku: cellAt(sheet.grid, row, columns.sku).trim() || null,
      price,
      outputQuantity: outputQuantity !== null && outputQuantity > 0 ? outputQuantity : 1,
    };

    const existing = draft.products.find((item) => item.name === name);
    if (existing) Object.assign(existing, fields);
    else draft.products.push({ id: newId(), name, lines: [], variants: [], ...fields });
    count += 1;
  }

  return count;
}

function importBom(sheet: SheetData, header: Header, draft: Draft, warnings: string[]): number {
  const { columns } = header;
  let count = 0;

  for (let row = header.row + 1; row < sheet.grid.length; row += 1) {
    const productName = cellAt(sheet.grid, row, columns.product).trim();
    const materialName = cellAt(sheet.grid, row, columns.material).trim();
    if (productName === "" || materialName === "") continue;

    const label = `${sheet.name} 第 ${row + 1} 列`;
    const product = draft.products.find((item) => item.name === productName);
    const material = draft.materials.find((item) => item.name === materialName);

    if (!product) {
      warnings.push(`${label}：找不到產品「${productName}」，這一列的用料沒有匯入。`);
      continue;
    }
    if (!material) {
      warnings.push(`${label}：找不到物料「${materialName}」，這一列的用料沒有匯入。`);
      continue;
    }

    const quantity = parseNumber(cellAt(sheet.grid, row, columns.quantity));
    if (quantity === null) {
      warnings.push(`${label}：「${materialName}」沒有用量，這一列的用料沒有匯入。`);
      continue;
    }

    const line = product.lines.find((item) => item.materialId === material.id);
    if (line) line.quantity = quantity;
    else product.lines.push({ id: newId(), materialId: material.id, quantity });
    count += 1;
  }

  return count;
}

function importRates(sheet: SheetData, header: Header, draft: Draft, warnings: string[]): number {
  const { columns } = header;
  let count = 0;

  for (let row = header.row + 1; row < sheet.grid.length; row += 1) {
    const name = cellAt(sheet.grid, row, columns.name).trim();
    if (name === "") continue;

    const label = `${sheet.name} 第 ${row + 1} 列「${name}」`;

    // 🚫 營業稅不當成一般費率匯入。稅率要存稅率本身加上「售價是否含稅」，
    //    當成費率匯入會讓「含稅／未稅」這個前提消失，日後沒有人知道要改哪個數字。
    if (/營業稅|稅率|稅金|加值稅/.test(name)) {
      warnings.push(`${label} 看起來是營業稅，未匯入。請到「費率設定」填稅率本身並勾選售價是否含稅。`);
      continue;
    }

    const kindText = `${cellAt(sheet.grid, row, columns.kind)} ${name} ${sheet.name}`;
    const kind = detectRateKind(kindText);
    if (!kind) {
      warnings.push(`${label} 判斷不出屬於哪一種費率，未匯入。請到「費率設定」自行新增。`);
      continue;
    }

    const isAmount = kind === "LOGISTICS";
    const valueText = isAmount
      ? cellAt(sheet.grid, row, columns.amountValue) || cellAt(sheet.grid, row, columns.rateValue)
      : cellAt(sheet.grid, row, columns.rateValue) || cellAt(sheet.grid, row, columns.amountValue);

    const value = isAmount ? parseNumber(valueText) : parseRate(valueText, `${label} 的費率`, warnings);
    if (value === null) {
      warnings.push(`${label} 沒有可辨識的數值，未匯入。`);
      continue;
    }

    const shareText = cellAt(sheet.grid, row, columns.usageShare);
    const rate: Rate = {
      id: newId(),
      kind,
      name,
      value,
      usageShare: shareText === "" ? null : parseRate(shareText, `${label} 的使用佔比`, warnings),
      packagingCost: null,
      handlingCost: null,
    };

    const existing = draft.rates.find((item) => item.kind === kind && item.name === name);
    if (existing) Object.assign(existing, { value: rate.value, usageShare: rate.usageShare });
    else draft.rates.push(rate);
    count += 1;
  }

  return count;
}

/**
 * 從 .xlsx 匯入。
 * 讀得懂的匯入，讀不懂的列進 warnings：不猜、不補 0、不靜靜跳過。
 */
export async function importSuperExcel(buffer: ArrayBuffer, base: Doc): Promise<XlsxImportResult> {
  const bytes = new Uint8Array(buffer);

  // 舊版 .xls 是 OLE 複合檔不是 zip，訊息要講清楚，不然使用者只會看到「解壓失敗」。
  if (bytes[0] === 0xd0 && bytes[1] === 0xcf) {
    return { ok: false, error: "這是舊版 .xls 檔。請用 Excel 另存成 .xlsx 再匯入。" };
  }
  if (!(bytes[0] === 0x50 && bytes[1] === 0x4b)) {
    return { ok: false, error: "這不是有效的 .xlsx 檔案。" };
  }

  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(bytes);
  } catch {
    return { ok: false, error: "檔案解壓失敗，可能已損毀或有密碼保護。" };
  }

  let sheets: SheetData[];
  try {
    sheets = readWorkbook(files);
  } catch {
    return { ok: false, error: "讀取工作表時失敗，這個檔案的格式可能不受支援。" };
  }

  if (sheets.length === 0) return { ok: false, error: "檔案裡沒有找得到的工作表。" };

  const warnings: string[] = [];
  const draft: Draft = {
    categories: base.categories.map((item) => ({ ...item })),
    materials: base.materials.map((item) => ({ ...item })),
    products: base.products.map((item) => ({ ...item, lines: item.lines.map((line) => ({ ...line })) })),
    rates: base.rates.map((item) => ({ ...item })),
    discountTiers: base.discountTiers.map((item) => ({ ...item })),
  };

  const summary = { rates: 0, materials: 0, products: 0 };
  const bomSheets: { sheet: SheetData; header: Header }[] = [];

  /*
    先認完整版。它的表頭是多層合併儲存格，通用的表頭辨識讀不動，
    而且三張物料表的欄位順序各不相同，只能照它的實際結構讀。
    認不出來就整份走通用路徑。
  */
  const full = isFullWorkbook(sheets);
  const handledByFullPath = new Set<string>();

  if (full) {
    summary.materials += importFullMaterials(sheets, draft, warnings);
    const tiers = importFullDiscountTiers(sheets, draft, warnings);

    for (const spec of FULL_MATERIAL_SHEETS) handledByFullPath.add(spec.sheet);
    handledByFullPath.add(FULL_DISCOUNT_SHEET);

    warnings.push(
      `認出這是完整版試算表，已用專用路徑讀取物料與折扣表（折扣級距 ${tiers} 列）。` +
        "產品、BOM 對應與各項優惠設定結構太自由，沒有匯入，請在對應分頁自行建立。",
    );
  }

  for (const sheet of sheets) {
    if (handledByFullPath.has(sheet.name)) continue;
    const header = detectHeader(sheet.grid);
    if (!header) {
      warnings.push(`工作表「${sheet.name}」找不到可辨識的表頭，整張未匯入。`);
      continue;
    }

    const { columns } = header;
    const hasName = columns.name !== undefined || columns.material !== undefined || columns.product !== undefined;

    if (columns.product !== undefined && columns.material !== undefined && columns.quantity !== undefined) {
      // BOM 需要產品與物料都已存在，留到最後再處理。
      bomSheets.push({ sheet, header });
    } else if (columns.price !== undefined && hasName) {
      summary.products += importProducts(sheet, header, draft, warnings);
    } else if (columns.unitCost !== undefined && hasName) {
      summary.materials += importMaterials(sheet, header, draft, base.settings.baseCurrency, warnings);
    } else if ((columns.rateValue !== undefined || columns.amountValue !== undefined) && hasName) {
      summary.rates += importRates(sheet, header, draft, warnings);
    } else {
      warnings.push(`工作表「${sheet.name}」的欄位認不出來（沒有單價、售價或費率欄），整張未匯入。`);
    }
  }

  let bomLines = 0;
  for (const { sheet, header } of bomSheets) bomLines += importBom(sheet, header, draft, warnings);
  if (bomLines > 0) warnings.push(`匯入了 ${bomLines} 筆用料，請到「產品與用料」確認每項產品的產出數量是否正確。`);

  if (summary.products > 0) {
    warnings.push(
      `匯入的售價一律視為與「費率設定」中的「售價為含稅價」設定一致（目前是${
        base.settings.priceIncludesTax ? "含稅" : "未稅"
      }），請確認。`,
    );
  }

  return {
    ok: true,
    doc: { ...base, ...draft },
    summary,
    warnings,
  };
}
