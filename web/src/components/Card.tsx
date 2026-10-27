export function Card({
  title,
  subtitle,
  children,
  className = "",
}: {
  title?: string;
  subtitle?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`rounded-xl border border-line bg-surface p-5 ${className}`}>
      {title && <h2 className="text-[15px] font-semibold text-ink">{title}</h2>}
      {subtitle && <p className="mt-1 text-[13px] leading-snug text-ink-2">{subtitle}</p>}
      <div className={title || subtitle ? "mt-4" : ""}>{children}</div>
    </section>
  );
}

export function Kpi({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return (
    <div className="rounded-xl border border-line bg-surface px-5 py-4">
      <div className="text-[13px] text-ink-2">{label}</div>
      <div className="mt-1 text-[28px] font-semibold leading-tight tracking-tight text-ink">{value}</div>
      {detail && <div className="mt-1 text-[12px] text-muted">{detail}</div>}
    </div>
  );
}
