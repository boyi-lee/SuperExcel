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
      <span className="text-xs font-medium text-stone-700">{label}</span>
      {children}
      {hint ? <span className="text-xs text-stone-600">{hint}</span> : null}
    </label>
  );
}

// ⚠️ 手機上 w-full，桌機才給固定寬度。以前寫死 w-40 的欄位在窄螢幕會擠成一條，
//    而這個工具的使用者常常是在倉庫、市集現場拿手機對成本。
export const inputClass =
  "w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500";

export function Card({ title, action, children }: { title?: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="rounded-xl border border-stone-200 bg-white p-4 sm:p-5">
      {title ? (
        <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="text-base font-semibold text-stone-900">{title}</h3>
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
    tone === "sub" ? "rounded-lg border border-stone-200 bg-stone-50" : "rounded-xl border border-stone-200 bg-white";

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
          className={`shrink-0 text-stone-400 transition-transform ${open ? "rotate-90" : ""}`}
        >
          ▶
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-base font-semibold text-stone-900">{title}</span>
          {summary ? <span className="mt-0.5 block text-xs text-stone-600">{summary}</span> : null}
        </span>
      </button>
      {open ? <div className="border-t border-stone-200 px-4 py-4 sm:px-5">{children}</div> : null}
    </section>
  );
}

/** 表單列。手機一欄、平板兩欄、桌機自動排。 */
export function Row({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">{children}</div>;
}

export function Note({ tone = "info", children }: { tone?: "info" | "warn" | "danger"; children: ReactNode }) {
  const styles = {
    info: "border-stone-200 bg-stone-50 text-stone-700",
    warn: "border-amber-200 bg-amber-50 text-amber-900",
    danger: "border-red-200 bg-red-50 text-red-800",
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
    primary: "bg-brand-600 text-white hover:bg-brand-700 disabled:bg-stone-300",
    secondary: "border border-stone-300 bg-white text-stone-800 hover:bg-stone-50",
    danger: "border border-red-200 bg-white text-red-700 hover:bg-red-50",
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
