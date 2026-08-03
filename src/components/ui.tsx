import { useState, type ReactNode } from "react";

export function Field({
  label,
  hint,
  children,
  className = "",
}: {
  label: string;
  hint?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={`flex flex-col gap-1 ${className}`}>
      <span className="text-xs font-medium text-ink-2">{label}</span>
      {children}
      {hint ? <span className="text-xs text-ink-3">{hint}</span> : null}
    </label>
  );
}

// ⚠️ 手機上 w-full，桌機才給固定寬度。以前寫死 w-40 的欄位在窄螢幕會擠成一條，
//    而這個工具的使用者常常是在倉庫、市集現場拿手機對成本。
export const inputClass =
  "w-full rounded-lg border border-line bg-panel px-3 py-2 text-sm focus:border-acid focus:outline-none focus:ring-1 focus:ring-acid";

export function Card({ title, action, children }: { title?: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="rounded-xl border border-line bg-panel p-4 sm:p-5">
      {title ? (
        <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="text-base font-semibold text-ink">{title}</h3>
          {action}
        </div>
      ) : null}
      {children}
    </section>
  );
}

/**
 * 風琴收合。
 *
 * ⚠️ 摘要列（summary）在收合時也要看得到重點數字：收起來就什麼都看不到的話，
 *    使用者只能一個一個展開找，那比不收合還慢。
 */
export function Accordion({
  title,
  summary,
  defaultOpen = false,
  tone = "default",
  children,
}: {
  title: ReactNode;
  summary?: ReactNode;
  defaultOpen?: boolean;
  tone?: "default" | "sub";
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const frame =
    tone === "sub" ? "rounded-lg border border-line bg-panel-2" : "rounded-xl border border-line bg-panel";

  return (
    <section className={frame}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        className="flex w-full items-center gap-3 px-4 py-3 text-left sm:px-5"
      >
        <span
          aria-hidden
          className={`shrink-0 text-ink-3 transition-transform ${open ? "rotate-90" : ""}`}
        >
          ▶
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-base font-semibold text-ink">{title}</span>
          {summary ? <span className="mt-0.5 block text-xs text-ink-3">{summary}</span> : null}
        </span>
      </button>
      {open ? <div className="border-t border-line px-4 py-4 sm:px-5">{children}</div> : null}
    </section>
  );
}

/** 表單列。手機一欄、平板兩欄、桌機自動排。 */
export function Row({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">{children}</div>;
}

export function Note({ tone = "info", children }: { tone?: "info" | "warn" | "danger"; children: ReactNode }) {
  const styles = {
    info: "border-line bg-panel-2 text-ink-2",
    warn: "border-warn/40 bg-warn/10 text-warn",
    danger: "border-bad/40 bg-bad/10 text-bad",
  }[tone];
  return <p className={`rounded-lg border px-4 py-3 text-sm ${styles}`}>{children}</p>;
}

export function Button({
  children,
  onClick,
  variant = "primary",
  type = "button",
  disabled,
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: "primary" | "secondary" | "danger";
  type?: "button" | "submit";
  disabled?: boolean;
}) {
  const styles = {
    // ⚠️ 停用狀態也要讀得懂。WCAG 雖然放過 disabled 元件，但看不清楚的按鈕
    //    會讓人以為畫面壞了，而不是知道自己還缺什麼才能按。
    // 🚫 酸綠底一定配深色字。白字配酸綠是 1.3:1，等於看不見。
    primary: "bg-acid text-bg hover:bg-acid-dim disabled:bg-line disabled:text-ink-3",
    secondary: "border border-line bg-panel text-ink hover:bg-panel-2",
    danger: "border border-bad/40 bg-panel text-bad hover:bg-bad/10",
  }[variant];
  return (
    <button type={type} onClick={onClick} disabled={disabled} className={`rounded-lg px-4 py-2 text-sm font-semibold ${styles}`}>
      {children}
    </button>
  );
}

export function pct(value: number | null | undefined, digits = 2): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "－";
  return `${(value * 100).toFixed(digits)}%`;
}

export function money(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "－";
  return value.toLocaleString("zh-TW", { maximumFractionDigits: 0 });
}
