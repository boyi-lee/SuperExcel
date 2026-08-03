// 分類、供應商、物料。
//
// 🚫 分類名稱是使用者自己取的，程式一律不認名稱只認 behavior。
//    手作皂叫「配方油脂」、電商叫「進貨成本」、代工叫「原料」，
//    對計算層來說都只是 MATERIAL。這裡不得出現任何依名稱分支的邏輯。

import { Button, Card, Field, Note, inputClass, money } from "../components/ui";
import { unitCostBase } from "../lib/derive";
import { formatUnitCost } from "../lib/costing";
import {
  BEHAVIOR_LABEL,
  newId,
  type Category,
  type CostBehavior,
  type Doc,
  type Material,
  type Supplier,
} from "../lib/doc";

const BEHAVIORS: CostBehavior[] = ["MATERIAL", "PROCESS", "AMORTIZED"];

/** 依「計價行為」給輸入提示。行為是程式認得的東西，分類名稱不是。 */
const BEHAVIOR_HINT: Record<CostBehavior, { unit: string; cost: string }> = {
  MATERIAL: {
    unit: "計價單位，例如 ml、g、個。BOM 的用量要用同一個單位。",
    cost: "每一個計價單位的價格。",
  },
  PROCESS: {
    unit: "通常是「次」或「批」。",
    cost: "每做一次的價格。BOM 用量填次數。",
  },
  AMORTIZED: {
    unit: "攤提的基準，例如「支」。",
    cost: "總支出 ÷ 預計攤提數量。模具 30000 元攤 3000 支就填 10。",
  },
};

export function MaterialsScreen({ doc, onChange }: { doc: Doc; onChange: (doc: Doc) => void }) {
  const categories = [...doc.categories].sort((a, b) => a.sortOrder - b.sortOrder);
  const missing = doc.materials.filter(
    (material) => unitCostBase(material, doc.settings.baseCurrency) === null,
  );

  const setCategory = (id: string, patch: Partial<Category>) =>
    onChange({
      ...doc,
      categories: doc.categories.map((category) => (category.id === id ? { ...category, ...patch } : category)),
    });

  const addCategory = () =>
    onChange({
      ...doc,
      categories: [
        ...doc.categories,
        {
          id: newId(),
          name: "",
          behavior: "MATERIAL",
          sortOrder: (doc.categories.at(-1)?.sortOrder ?? 0) + 10,
        },
      ],
    });

  const removeCategory = (id: string) => {
    const used = doc.materials.filter((material) => material.categoryId === id).length;
    if (used > 0) {
      alert(`還有 ${used} 項物料屬於這個分類，請先改到別的分類再刪。`);
      return;
    }
    onChange({ ...doc, categories: doc.categories.filter((category) => category.id !== id) });
  };

  const setSupplier = (id: string, patch: Partial<Supplier>) =>
    onChange({
      ...doc,
      suppliers: doc.suppliers.map((supplier) => (supplier.id === id ? { ...supplier, ...patch } : supplier)),
    });

  const addSupplier = () =>
    onChange({
      ...doc,
      suppliers: [...doc.suppliers, { id: newId(), name: "", contact: null, paymentTerms: null }],
    });

  const removeSupplier = (id: string) =>
    onChange({
      ...doc,
      suppliers: doc.suppliers.filter((supplier) => supplier.id !== id),
      // 供應商被刪掉時把引用清成 null，不留下指向不存在資料的 id。
      materials: doc.materials.map((material) =>
        material.supplierId === id ? { ...material, supplierId: null } : material,
      ),
    });

  const setMaterial = (id: string, patch: Partial<Material>) =>
    onChange({
      ...doc,
      materials: doc.materials.map((material) => (material.id === id ? { ...material, ...patch } : material)),
    });

  const addMaterial = () => {
    if (categories.length === 0) {
      alert("請先建立一個分類。");
      return;
    }
    onChange({
      ...doc,
      materials: [
        ...doc.materials,
        {
          id: newId(),
          name: "",
          categoryId: categories[0].id,
          supplierId: null,
          unit: "",
          // 🚫 預設為 null 不是 0。0 是「這項免費」，null 是「還沒查到價格」。
          unitCost: null,
          currency: doc.settings.baseCurrency,
          fxRate: null,
          scrapRate: null,
          note: null,
        },
      ],
    });
  };

  const removeMaterial = (id: string) => {
    const used = doc.products.filter((product) => product.lines.some((line) => line.materialId === id)).length;
    if (used > 0 && !confirm(`有 ${used} 項產品用到這項物料，刪掉會一併移除那些用料。確定？`)) return;
    onChange({
      ...doc,
      materials: doc.materials.filter((material) => material.id !== id),
      products: doc.products.map((product) => ({
        ...product,
        lines: product.lines.filter((line) => line.materialId !== id),
      })),
    });
  };

  return (
    <>
      <Card
        title="分類"
        action={<span className="text-xs text-stone-600">名稱自己取，計算方式由「計價行為」決定。</span>}
      >
        <div className="space-y-2">
          {categories.map((category) => (
            <div key={category.id} className="grid grid-cols-1 items-end gap-3 rounded-lg border border-stone-200 p-3 sm:grid-cols-2 lg:grid-cols-4">
              <Field label="分類名稱">
                <input
                  className={inputClass}
                  value={category.name}
                  placeholder="例如：配方油脂"
                  onChange={(event) => setCategory(category.id, { name: event.target.value })}
                />
              </Field>
              <Field label="計價行為" hint={BEHAVIOR_HINT[category.behavior].cost}>
                <select
                  className={inputClass}
                  value={category.behavior}
                  onChange={(event) => setCategory(category.id, { behavior: event.target.value as CostBehavior })}
                >
                  {BEHAVIORS.map((behavior) => (
                    <option key={behavior} value={behavior}>
                      {BEHAVIOR_LABEL[behavior]}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="排序">
                <input
                  className={inputClass}
                  type="number"
                  step="10"
                  value={category.sortOrder}
                  onChange={(event) => setCategory(category.id, { sortOrder: Number(event.target.value) || 0 })}
                />
              </Field>
              <Button variant="danger" onClick={() => removeCategory(category.id)}>
                刪除
              </Button>
            </div>
          ))}
          {categories.length === 0 ? <p className="text-sm text-stone-600">尚未建立分類。</p> : null}
        </div>
        <div className="mt-3">
          <Button variant="secondary" onClick={addCategory}>
            新增分類
          </Button>
        </div>
      </Card>

      <Card title="供應商" action={<span className="text-xs text-stone-600">選填。只是方便日後回頭問價。</span>}>
        <div className="space-y-2">
          {doc.suppliers.map((supplier) => (
            <div key={supplier.id} className="grid grid-cols-1 items-end gap-3 rounded-lg border border-stone-200 p-3 sm:grid-cols-2 lg:grid-cols-4">
              <Field label="名稱">
                <input
                  className={inputClass}
                  value={supplier.name}
                  onChange={(event) => setSupplier(supplier.id, { name: event.target.value })}
                />
              </Field>
              <Field label="聯絡方式">
                <input
                  className={inputClass}
                  value={supplier.contact ?? ""}
                  onChange={(event) =>
                    setSupplier(supplier.id, { contact: event.target.value === "" ? null : event.target.value })
                  }
                />
              </Field>
              <Field label="付款條件">
                <input
                  className={inputClass}
                  value={supplier.paymentTerms ?? ""}
                  placeholder="月結 30 天"
                  onChange={(event) =>
                    setSupplier(supplier.id, { paymentTerms: event.target.value === "" ? null : event.target.value })
                  }
                />
              </Field>
              <Button variant="danger" onClick={() => removeSupplier(supplier.id)}>
                刪除
              </Button>
            </div>
          ))}
          {doc.suppliers.length === 0 ? <p className="text-sm text-stone-600">尚未建立供應商。</p> : null}
        </div>
        <div className="mt-3">
          <Button variant="secondary" onClick={addSupplier}>
            新增供應商
          </Button>
        </div>
      </Card>

      <Card
        title="物料"
        action={<span className="text-xs text-stone-600">共 {doc.materials.length} 項</span>}
      >
        {missing.length > 0 ? (
          <div className="mb-4">
            <Note tone="warn">
              有 {missing.length} 項還沒有單價（或缺匯率）：
              {missing.map((material) => material.name || "未命名").join("、")}。
              用到它們的產品成本會顯示「－」，不會用 0 硬算出一個好看的毛利。
            </Note>
          </div>
        ) : null}

        <div className="space-y-3">
          {doc.materials.map((material) => {
            const category = doc.categories.find((item) => item.id === material.categoryId);
            const behavior = category?.behavior ?? "MATERIAL";
            const hint = BEHAVIOR_HINT[behavior];
            const foreign = Boolean(material.currency) && material.currency !== doc.settings.baseCurrency;
            const base = unitCostBase(material, doc.settings.baseCurrency);

            return (
              <div key={material.id} className="rounded-lg border border-stone-200 p-3">
                <div className="grid grid-cols-1 items-end gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <Field label="名稱">
                    <input
                      className={inputClass}
                      value={material.name}
                      onChange={(event) => setMaterial(material.id, { name: event.target.value })}
                    />
                  </Field>
                  <Field label="分類">
                    <select
                      className={inputClass}
                      value={material.categoryId}
                      onChange={(event) => setMaterial(material.id, { categoryId: event.target.value })}
                    >
                      {categories.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.name || "未命名"}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="供應商">
                    <select
                      className={inputClass}
                      value={material.supplierId ?? ""}
                      onChange={(event) =>
                        setMaterial(material.id, { supplierId: event.target.value === "" ? null : event.target.value })
                      }
                    >
                      <option value="">未指定</option>
                      {doc.suppliers.map((supplier) => (
                        <option key={supplier.id} value={supplier.id}>
                          {supplier.name || "未命名"}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="單位" hint={hint.unit}>
                    <input
                      className={inputClass}
                      value={material.unit}
                      onChange={(event) => setMaterial(material.id, { unit: event.target.value })}
                    />
                  </Field>
                  <Field label="單價" hint={hint.cost}>
                    <input
                      className={inputClass}
                      type="number"
                      step="0.0001"
                      min="0"
                      placeholder="未知"
                      value={material.unitCost ?? ""}
                      onChange={(event) =>
                        setMaterial(material.id, {
                          // 清空代表「還沒查到」，存 null 而不是 0。
                          unitCost: event.target.value === "" ? null : Number(event.target.value),
                        })
                      }
                    />
                  </Field>
                  <Field label="幣別">
                    <input
                      className={inputClass}
                      value={material.currency}
                      onChange={(event) =>
                        setMaterial(material.id, { currency: event.target.value.toUpperCase().slice(0, 3) })
                      }
                    />
                  </Field>
                  {foreign ? (
                    <Field label="匯率" hint={`1 ${material.currency} = ? ${doc.settings.baseCurrency}`}>
                      <input
                        className={inputClass}
                        type="number"
                        step="0.0001"
                        min="0"
                        value={material.fxRate ?? ""}
                        onChange={(event) =>
                          setMaterial(material.id, {
                            fxRate: event.target.value === "" ? null : Number(event.target.value),
                          })
                        }
                      />
                    </Field>
                  ) : null}
                  <Field label="耗損率" hint="耗損 10% 填 0.1">
                    <input
                      className={inputClass}
                      type="number"
                      step="0.01"
                      min="0"
                      max="0.99"
                      value={material.scrapRate ?? ""}
                      onChange={(event) =>
                        setMaterial(material.id, {
                          scrapRate: event.target.value === "" ? null : Number(event.target.value),
                        })
                      }
                    />
                  </Field>
                  <Button variant="danger" onClick={() => removeMaterial(material.id)}>
                    刪除
                  </Button>
                </div>

                <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-stone-600">
                  <span>
                    本位幣單價：
                    <span className="font-semibold text-stone-800">{formatUnitCost(base, "")}</span>
                    {material.unit ? ` / ${material.unit}` : ""}
                  </span>
                  {material.scrapRate ? (
                    <span>
                      耗損 {(material.scrapRate * 100).toFixed(1)}%
                      ，成本放大為 1 ÷ {(1 - material.scrapRate).toFixed(2)} 倍（不是乘 1.1）
                    </span>
                  ) : null}
                  {foreign && material.fxRate === null ? (
                    <span className="font-semibold text-amber-700">缺匯率，這項視為沒有單價。</span>
                  ) : null}
                </div>

                <input
                  className={`${inputClass} mt-2`}
                  placeholder="備註：報價日期、最小訂購量、替代料⋯⋯"
                  value={material.note ?? ""}
                  onChange={(event) =>
                    setMaterial(material.id, { note: event.target.value === "" ? null : event.target.value })
                  }
                />
              </div>
            );
          })}
          {doc.materials.length === 0 ? (
            <p className="text-sm text-stone-600">尚未建立物料。先建物料，再到「產品與用料」組成配方。</p>
          ) : null}
        </div>

        <div className="mt-3 flex items-center gap-3">
          <Button variant="secondary" onClick={addMaterial}>
            新增物料
          </Button>
          <span className="text-xs text-stone-600">
            已有單價的有 {money(doc.materials.length - missing.length)} 項。
          </span>
        </div>
      </Card>
    </>
  );
}
