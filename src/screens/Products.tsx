// 產品、用料（BOM）與母子規格。
//
// ⚠️ 這裡最容易出錯的是「產出數量」：一鍋做 500 支，用量就要按整鍋填，
//    程式再除以 500。填成每支用量卻又填產出 500，成本會低估 500 倍。
//
// 🚫 子規格只存**與母規格的差異**，不複製整張 BOM。
//    複製的話，母規格改配方時其他規格不會跟著改，然後錯下去而且沒有人發現。

import { Accordion, Button, Card, Field, Note, inputClass, money } from "../components/ui";
import { formatUnitCost } from "../lib/costing";
import { computeProductCost, effectiveLines } from "../lib/derive";
import { newId, type BomLine, type Doc, type Product, type Variant } from "../lib/doc";

export function ProductsScreen({ doc, onChange }: { doc: Doc; onChange: (doc: Doc) => void }) {
  const setProduct = (id: string, patch: Partial<Product>) =>
    onChange({
      ...doc,
      products: doc.products.map((product) => (product.id === id ? { ...product, ...patch } : product)),
    });

  const setVariant = (product: Product, variantId: string, patch: Partial<Variant>) =>
    setProduct(product.id, {
      variants: product.variants.map((variant) => (variant.id === variantId ? { ...variant, ...patch } : variant)),
    });

  const addProduct = () =>
    onChange({
      ...doc,
      products: [
        ...doc.products,
        // 產出數量預設 1 表示「一次做一個」，這是最不會算錯的起點。
        { id: newId(), name: "", sku: null, details: null, price: null, outputQuantity: 1, lines: [], variants: [] },
      ],
    });

  const addLine = (lines: BomLine[], apply: (lines: BomLine[]) => void) => {
    if (doc.materials.length === 0) {
      alert("請先到「物料與供應商」建立物料。");
      return;
    }
    apply([...lines, { id: newId(), materialId: doc.materials[0].id, quantity: 0 }]);
  };

  /** 用料編輯器。母規格與子規格共用，差別只在提示文字。 */
  const LineEditor = ({
    product,
    lines,
    apply,
    variantMode,
  }: {
    product: Product;
    lines: BomLine[];
    apply: (lines: BomLine[]) => void;
    variantMode: boolean;
  }) => (
    <>
      <div className="space-y-2">
        {lines.map((line) => {
          const material = doc.materials.find((item) => item.id === line.materialId);
          const perOutput = product.outputQuantity > 0 ? line.quantity / product.outputQuantity : null;

          return (
            <div
              key={line.id}
              className="grid grid-cols-1 items-end gap-3 rounded-lg border border-line bg-panel p-3 sm:grid-cols-2 lg:grid-cols-4"
            >
              <Field label="物料">
                <select
                  className={inputClass}
                  value={line.materialId}
                  onChange={(event) =>
                    apply(
                      lines.map((item) => (item.id === line.id ? { ...item, materialId: event.target.value } : item)),
                    )
                  }
                >
                  {doc.materials.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name || "未命名"}
                    </option>
                  ))}
                </select>
              </Field>
              <Field
                label={`用量${material?.unit ? `（${material.unit}）` : ""}`}
                hint={
                  variantMode
                    ? "覆蓋母規格的用量。填 0 代表這個規格不用這一項。"
                    : product.outputQuantity > 1
                      ? `整批用量。每單位為 ${perOutput?.toFixed(4) ?? "－"}`
                      : undefined
                }
              >
                <input
                  className={inputClass}
                  type="number"
                  step="0.0001"
                  min="0"
                  value={line.quantity}
                  onChange={(event) =>
                    apply(
                      lines.map((item) =>
                        item.id === line.id ? { ...item, quantity: Number(event.target.value) || 0 } : item,
                      ),
                    )
                  }
                />
              </Field>
              <div className="text-xs text-ink-3 sm:pb-3">
                單價 {formatUnitCost(material?.unitCost ?? null, "")}
                {material?.currency && material.currency !== doc.settings.baseCurrency ? ` ${material.currency}` : ""}
                {material?.scrapRate ? `，耗損 ${(material.scrapRate * 100).toFixed(1)}%` : ""}
              </div>
              <div className="flex items-end">
                <Button variant="danger" onClick={() => apply(lines.filter((item) => item.id !== line.id))}>
                  刪除
                </Button>
              </div>
            </div>
          );
        })}
        {lines.length === 0 ? (
          <p className="text-sm text-ink-3">
            {variantMode ? "沒有差異，這個規格的成本與母規格相同。" : "還沒有用料。空的配方成本是「未知」，不是 0。"}
          </p>
        ) : null}
      </div>
      <div className="mt-3">
        <Button variant="secondary" onClick={() => addLine(lines, apply)}>
          {variantMode ? "新增差異用料" : "新增用料"}
        </Button>
      </div>
    </>
  );

  return (
    <div className="space-y-4">
      {doc.materials.length === 0 ? (
        <Note tone="warn">還沒有任何物料。請先到「物料與供應商」建立物料，才能組配方。</Note>
      ) : null}

      {doc.products.map((product) => {
        const baseCost = computeProductCost(doc, product);
        const variantCosts = product.variants.map((variant) => ({
          variant,
          cost: computeProductCost(doc, product, variant),
        }));

        return (
          <Accordion
            key={product.id}
            title={product.name || "未命名產品"}
            summary={
              <>
                {product.variants.length === 0
                  ? `單位成本 ${formatUnitCost(baseCost.unitCost)}　售價 ${
                      product.price === null ? "－" : money(product.price)
                    }`
                  : `${product.variants.length} 個規格　母規格成本 ${formatUnitCost(baseCost.unitCost)}`}
                {baseCost.missing.length > 0 ? (
                  <span className="ml-2 text-warn">缺 {baseCost.missing.length} 項單價</span>
                ) : null}
              </>
            }
          >
            {baseCost.missing.length > 0 ? (
              <div className="mb-4">
                <Note tone="warn">
                  缺 {baseCost.missing.length} 項單價：{baseCost.missing.join("、")}。
                  在補上之前，整張 BOM 的成本是「未知」，不做部分加總：加一半出來的成本一定偏低，
                  而偏低的成本會讓毛利看起來很好。
                </Note>
              </div>
            ) : null}

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Field label="產品名稱">
                <input
                  className={inputClass}
                  value={product.name}
                  onChange={(event) => setProduct(product.id, { name: event.target.value })}
                />
              </Field>
              <Field label="料號">
                <input
                  className={inputClass}
                  value={product.sku ?? ""}
                  onChange={(event) =>
                    setProduct(product.id, { sku: event.target.value === "" ? null : event.target.value })
                  }
                />
              </Field>
              <Field label="售價" hint={doc.settings.priceIncludesTax ? "含稅價" : "未稅價"}>
                <input
                  className={inputClass}
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="未定價"
                  value={product.price ?? ""}
                  onChange={(event) =>
                    setProduct(product.id, { price: event.target.value === "" ? null : Number(event.target.value) })
                  }
                />
              </Field>
              <Field label="一次產出數量" hint="一鍋做 500 支就填 500，下面的用量按整鍋填。">
                <input
                  className={inputClass}
                  type="number"
                  step="1"
                  min="1"
                  value={product.outputQuantity}
                  onChange={(event) => setProduct(product.id, { outputQuantity: Number(event.target.value) || 0 })}
                />
              </Field>
            </div>

            {!(product.outputQuantity > 0) ? (
              <div className="mt-4">
                <Note tone="danger">產出數量必須大於 0，否則成本無法計算（不能除以零）。</Note>
              </div>
            ) : null}

            <h4 className="mt-6 text-sm font-semibold text-ink">母規格用料</h4>
            <div className="mt-2">
              <LineEditor
                product={product}
                lines={product.lines}
                apply={(lines) => setProduct(product.id, { lines })}
                variantMode={false}
              />
            </div>

            {baseCost.byCategory.length > 0 ? (
              <div className="mt-5 overflow-x-auto">
                <table className="w-full min-w-[20rem] text-sm">
                  <thead>
                    <tr className="border-b border-line text-left text-xs text-ink-3">
                      <th className="py-2">分類</th>
                      <th className="py-2 text-right">每單位成本</th>
                      <th className="py-2 text-right">佔比</th>
                    </tr>
                  </thead>
                  <tbody>
                    {baseCost.byCategory.map((row) => (
                      <tr key={row.categoryId} className="border-b border-line">
                        <td className="py-2">{row.categoryName}</td>
                        <td className="py-2 text-right">{formatUnitCost(row.cost)}</td>
                        <td className="py-2 text-right text-ink-3">
                          {/* 分母未知時佔比也未知，不拿部分加總當分母。 */}
                          {baseCost.unitCost !== null && baseCost.unitCost > 0 && row.cost !== null
                            ? `${((row.cost / baseCost.unitCost) * 100).toFixed(1)}%`
                            : "－"}
                        </td>
                      </tr>
                    ))}
                    <tr className="font-semibold">
                      <td className="py-2">合計（每單位）</td>
                      <td className="py-2 text-right">{formatUnitCost(baseCost.unitCost)}</td>
                      <td className="py-2 text-right text-ink-3">{baseCost.lineCount} 項用料</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            ) : null}

            <h4 className="mt-6 text-sm font-semibold text-ink">
              規格（顏色、尺寸⋯⋯）
              <span className="ml-2 text-xs font-normal text-ink-3">
                只填與母規格不一樣的地方，沒有規格就留空。
              </span>
            </h4>

            <div className="mt-2 space-y-2">
              {variantCosts.map(({ variant, cost }) => (
                <Accordion
                  key={variant.id}
                  tone="sub"
                  title={variant.name || "未命名規格"}
                  summary={
                    <>
                      {`成本 ${formatUnitCost(cost.unitCost)}　售價 ${
                        (variant.price ?? product.price) === null ? "－" : money(variant.price ?? product.price)
                      }${variant.price === null ? "（沿用母規格）" : ""}　用料 ${
                        effectiveLines(product, variant).length
                      } 項`}
                      {cost.missing.length > 0 ? (
                        <span className="ml-2 text-warn">缺 {cost.missing.length} 項單價</span>
                      ) : null}
                    </>
                  }
                >
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    <Field label="規格名稱" hint="例如：黃色、L、無香">
                      <input
                        className={inputClass}
                        value={variant.name}
                        onChange={(event) => setVariant(product, variant.id, { name: event.target.value })}
                      />
                    </Field>
                    <Field label="料號">
                      <input
                        className={inputClass}
                        value={variant.sku ?? ""}
                        placeholder={product.sku ?? ""}
                        onChange={(event) =>
                          setVariant(product, variant.id, {
                            sku: event.target.value === "" ? null : event.target.value,
                          })
                        }
                      />
                    </Field>
                    <Field label="售價" hint="留空就沿用母規格售價。">
                      <input
                        className={inputClass}
                        type="number"
                        step="0.01"
                        min="0"
                        placeholder={product.price === null ? "未定價" : String(product.price)}
                        value={variant.price ?? ""}
                        onChange={(event) =>
                          setVariant(product, variant.id, {
                            price: event.target.value === "" ? null : Number(event.target.value),
                          })
                        }
                      />
                    </Field>
                    <div className="flex items-end">
                      <Button
                        variant="danger"
                        onClick={() => {
                          if (!confirm(`刪除規格「${variant.name || "未命名"}」？`)) return;
                          setProduct(product.id, {
                            variants: product.variants.filter((item) => item.id !== variant.id),
                          });
                        }}
                      >
                        刪除規格
                      </Button>
                    </div>
                  </div>

                  <h5 className="mt-5 text-sm font-semibold text-ink">與母規格的差異</h5>
                  <div className="mt-2">
                    <LineEditor
                      product={product}
                      lines={variant.lines}
                      apply={(lines) => setVariant(product, variant.id, { lines })}
                      variantMode
                    />
                  </div>

                  {cost.missing.length > 0 ? (
                    <div className="mt-4">
                      <Note tone="warn">
                        缺 {cost.missing.length} 項單價：{cost.missing.join("、")}。
                      </Note>
                    </div>
                  ) : null}
                </Accordion>
              ))}
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <Button
                variant="secondary"
                onClick={() =>
                  setProduct(product.id, {
                    variants: [...product.variants, { id: newId(), name: "", sku: null, details: null, price: null, lines: [] }],
                  })
                }
              >
                新增規格
              </Button>
              <Button
                variant="danger"
                onClick={() => {
                  if (!confirm("刪除這項產品？")) return;
                  onChange({ ...doc, products: doc.products.filter((item) => item.id !== product.id) });
                }}
              >
                刪除產品
              </Button>
            </div>
          </Accordion>
        );
      })}

      <Card>
        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={addProduct}>新增產品</Button>
          <span className="text-sm text-ink-3">
            目前 {money(doc.products.length)} 項產品、
            {money(doc.products.reduce((sum, product) => sum + product.variants.length, 0))} 個規格。
          </span>
        </div>
      </Card>
    </div>
  );
}
