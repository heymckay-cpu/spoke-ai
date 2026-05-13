import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import { Link } from "wouter";
import type { QaAttachment } from "@workspace/api-client-react";
import { cn } from "@/lib/utils";

// Render a single structured attachment from the QA agent. Today only
// `table` is supported; charts can extend the discriminator without
// touching the persisted history.

function formatCell(value: unknown): string {
  if (value == null) return "—";
  if (typeof value === "number") {
    if (Number.isInteger(value)) return value.toLocaleString("en-US");
    return value.toLocaleString("en-US", { maximumFractionDigits: 2 });
  }
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return String(value);
}

function compareCells(a: unknown, b: unknown): number {
  // Sort nulls last regardless of direction (the dir flip is applied by the
  // caller). Numeric > numeric; everything else falls back to string compare.
  const aNull = a == null;
  const bNull = b == null;
  if (aNull && bNull) return 0;
  if (aNull) return 1;
  if (bNull) return -1;
  if (typeof a === "number" && typeof b === "number") return a - b;
  if (typeof a === "boolean" && typeof b === "boolean") return Number(a) - Number(b);
  return String(a).localeCompare(String(b), undefined, { numeric: true });
}

interface QaAttachmentTableProps {
  attachment: QaAttachment;
}

export function QaAttachmentTable({ attachment }: QaAttachmentTableProps) {
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  if (attachment.type !== "table") return null;
  const deepKey = attachment.deepLinkColumn ?? null;

  const sortedRows = useMemo(() => {
    if (!sortKey) return attachment.rows;
    const copy = [...attachment.rows];
    copy.sort((r1, r2) => {
      const v1 = (r1 as Record<string, unknown>)[sortKey];
      const v2 = (r2 as Record<string, unknown>)[sortKey];
      const c = compareCells(v1, v2);
      return sortDir === "asc" ? c : -c;
    });
    return copy;
  }, [attachment.rows, sortKey, sortDir]);

  function toggleSort(key: string) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  return (
    <div
      className="my-3 overflow-hidden rounded-md border border-border bg-card"
      data-testid="qa-attachment-table"
    >
      <div className="border-b border-border bg-muted/40 px-3 py-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {attachment.title}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-background/40">
              {attachment.columns.map((col) => {
                const isActive = sortKey === col.key;
                const Icon = isActive
                  ? sortDir === "asc"
                    ? ArrowUp
                    : ArrowDown
                  : ArrowUpDown;
                return (
                  <th
                    key={col.key}
                    className={cn(
                      "px-3 py-2 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground",
                      col.align === "right" && "text-right",
                    )}
                  >
                    <button
                      type="button"
                      onClick={() => toggleSort(col.key)}
                      className={cn(
                        "inline-flex items-center gap-1 transition-colors hover:text-foreground",
                        col.align === "right" && "flex-row-reverse",
                        isActive && "text-foreground",
                      )}
                      data-testid={`qa-attachment-sort-${col.key}`}
                      aria-label={`Sort by ${col.label}`}
                    >
                      <span>{col.label}</span>
                      <Icon className="h-3 w-3 opacity-60" aria-hidden="true" />
                    </button>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {sortedRows.map((row, i) => (
              <tr
                key={i}
                className="border-b border-border/50 last:border-0 hover:bg-muted/30"
                data-testid="qa-attachment-row"
              >
                {attachment.columns.map((col) => {
                  const raw = (row as Record<string, unknown>)[col.key];
                  const display = formatCell(raw);
                  const href = (row as Record<string, unknown>)[`${col.key}Href`];
                  const isDeep = deepKey === col.key && typeof href === "string";
                  return (
                    <td
                      key={col.key}
                      className={cn(
                        "px-3 py-2 tabular-nums",
                        col.align === "right" && "text-right",
                      )}
                    >
                      {isDeep ? (
                        <Link
                          href={href as string}
                          className="font-medium text-primary hover:underline"
                          data-testid="qa-attachment-link"
                        >
                          {display}
                        </Link>
                      ) : (
                        display
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
            {sortedRows.length === 0 && (
              <tr>
                <td
                  colSpan={attachment.columns.length}
                  className="px-3 py-3 text-center text-xs text-muted-foreground"
                >
                  No rows.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
