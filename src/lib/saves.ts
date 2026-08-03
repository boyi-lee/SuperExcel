// 多份存檔。
//
// ⚠️ 這**不是備份**，它跟主檔存在同一個 localStorage 裡。
//    清除瀏覽器資料的時候，這幾份會跟主檔一起消失。
//    真正的備份只有一種：下載 JSON 到你自己的硬碟。
//
// 那為什麼還要做？因為多數人想要的是「試試看另一組費率、不想弄丟現在這組」，
// 那是版本切換不是備份。把兩件事分清楚，使用者才不會以為自己有備份。

import { normalizeDoc, type Doc } from "./doc";

export type SavedSlot = {
  id: string;
  name: string;
  savedAt: string;
  doc: Doc;
};

const STORAGE_KEY = "superexcel.saves.v1";

/** 存幾份就夠。超過就變成沒有人整理的垃圾堆，而且會撐爆 localStorage 配額。 */
export const MAX_SLOTS = 10;

export function loadSlots(): SavedSlot[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as SavedSlot[];
    if (!Array.isArray(parsed)) return [];
    // 舊版存的 doc 可能缺欄位，讀出來時一併補齊。
    return parsed
      .filter((slot) => slot && typeof slot.id === "string" && slot.doc)
      .map((slot) => ({ ...slot, doc: normalizeDoc(slot.doc) }));
  } catch {
    return [];
  }
}

export type SaveResult = { ok: true; slots: SavedSlot[] } | { ok: false; error: string };

function persist(slots: SavedSlot[]): SaveResult {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(slots));
    return { ok: true, slots };
  } catch {
    // 🚫 配額滿了要明講，不能默默失敗。使用者會以為自己存好了。
    return {
      ok: false,
      error: "瀏覽器的儲存空間滿了，這一份沒有存進去。請先刪掉幾份舊的，或改用「下載存檔」。",
    };
  }
}

export function saveSlot(slots: readonly SavedSlot[], slot: SavedSlot): SaveResult {
  const existing = slots.findIndex((item) => item.id === slot.id);
  const next = existing >= 0 ? slots.map((item, index) => (index === existing ? slot : item)) : [...slots, slot];

  if (next.length > MAX_SLOTS) {
    return { ok: false, error: `最多只能存 ${MAX_SLOTS} 份。請先刪掉一些不要的。` };
  }
  return persist(next);
}

export function deleteSlot(slots: readonly SavedSlot[], id: string): SaveResult {
  return persist(slots.filter((slot) => slot.id !== id));
}
