"use client";

import { useMemo, useState } from "react";

export type Column<T> = {
  key: string;
  label: string;
  value: (row: T) => string | number;
  render?: (row: T) => React.ReactNode;
  align?: "left" | "right";
  title?: string;
};

export function SortableTable<T>({
  rows,
  columns,
  rowKey,
  initialSort,
  maxHeight,
}: {
  rows: T[];
  columns: Column<T>[];
  rowKey: (row: T) => string;
  initialSort?: { key: string; dir: "asc" | "desc" };
  maxHeight?: number;
}) {
  const [sort, setSort] = useState(initialSort ?? { key: columns[0].key, dir: "asc" as const });

  const sorted = useMemo(() => {
    const col = columns.find((c) => c.key === sort.key);
    if (!col) return rows;
    const factor = sort.dir === "asc" ? 1 : -1;
    return [...rows].sort((a, b) => {
      const va = col.value(a);
      const vb = col.value(b);
      if (typeof va === "number" && typeof vb === "number") return (va - vb) * factor;
      return String(va).localeCompare(String(vb)) * factor;
    });
  }, [rows, columns, sort]);

  const onSort = (key: string, align?: "left" | "right") =>
    setSort((s) =>
      s.key === key
        ? { key, dir: s.dir === "asc" ? "desc" : "asc" }
        : { key, dir: align === "right" ? "desc" : "asc" }, // numbers start high, text starts A-Z
    );

  return (
    <div className="overflow-auto rounded-lg border border-line" style={{ maxHeight }}>
      <table className="w-full border-collapse text-[13px]">
        <thead className="sticky top-0 z-10 bg-surface">
          <tr>
            {columns.map((c) => {
              const active = sort.key === c.key;
              return (
                <th
                  key={c.key}
                  scope="col"
                  title={c.title}
                  aria-sort={active ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}
                  className={`border-b border-line px-3 py-2 font-medium whitespace-nowrap text-ink-2 ${
                    c.align === "right" ? "text-right" : "text-left"
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => onSort(c.key, c.align)}
                    className={`inline-flex items-center gap-1 hover:text-ink ${active ? "text-ink" : ""}`}
                  >
                    {c.label}
                    <span aria-hidden className="w-2 text-[10px] text-muted">
                      {active ? (sort.dir === "asc" ? "▲" : "▼") : ""}
                    </span>
                  </button>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {sorted.map((row) => (
            <tr key={rowKey(row)} className="border-b border-line last:border-0 hover:bg-hover">
              {columns.map((c) => (
                <td
                  key={c.key}
                  className={`px-3 py-1.5 whitespace-nowrap text-ink ${
                    c.align === "right" ? "tabular text-right" : "text-left"
                  }`}
                >
                  {c.render ? c.render(row) : c.value(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
