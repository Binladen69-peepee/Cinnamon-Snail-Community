"use client";

import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import { Copy, Film, Loader2, Search, Trash2 } from "lucide-react";
import {
  deleteBunnyVideoAction,
  listBunnyLibraryAction,
  type LibraryRow,
} from "@/app/admin/videos/actions";
import { Badge, Button, EmptyState, fieldClass } from "@/components/app/ui";

const STATE: Record<LibraryRow["state"], { tone: "success" | "warning" | "danger" | "neutral"; label: string }> = {
  ready: { tone: "success", label: "Ready" },
  processing: { tone: "warning", label: "Processing" },
  uploading: { tone: "neutral", label: "Waiting for upload" },
  failed: { tone: "danger", label: "Failed" },
};

function formatLength(seconds: number) {
  if (!seconds) return null;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

/** The Bunny library, searchable, with which lessons use each video. */
export function BunnyLibrary() {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<{ items: LibraryRow[]; total: number; perPage: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [reload, setReload] = useState(0);

  useEffect(() => {
    const timer = setTimeout(() => {
      startTransition(async () => {
        const result = await listBunnyLibraryAction({ search, page });
        if (result.ok) {
          setData({ items: result.items, total: result.total, perPage: result.perPage });
          setError(null);
        } else {
          setError(result.error);
        }
      });
    }, 250);
    return () => clearTimeout(timer);
  }, [search, page, reload]);

  async function remove(row: LibraryRow) {
    if (!window.confirm(`Delete "${row.title || row.guid}" from Bunny? This cannot be undone.`)) return;
    const result = await deleteBunnyVideoAction(row.guid);
    if (result.ok) {
      setNotice("Deleted.");
      setReload((value) => value + 1);
    } else {
      setNotice(result.error);
    }
  }

  const pages = data ? Math.max(1, Math.ceil(data.total / data.perPage)) : 1;

  return (
    <div className="flex flex-col gap-3">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-foreground-muted" aria-hidden />
        <input
          value={search}
          onChange={(event) => {
            setSearch(event.target.value);
            setPage(1);
          }}
          placeholder="Search videos by title"
          aria-label="Search videos by title"
          className={fieldClass({ className: "pl-9" })}
        />
      </div>

      {notice ? (
        <p role="status" className="text-caption text-foreground-muted">
          {notice}
        </p>
      ) : null}

      {error ? (
        <p role="alert" className="text-caption font-medium text-danger">
          {error}
        </p>
      ) : !data ? (
        <p className="flex items-center gap-2 text-caption text-foreground-muted">
          <Loader2 className="size-3.5 animate-spin" aria-hidden />
          Loading the library…
        </p>
      ) : data.items.length === 0 ? (
        <EmptyState
          icon={<Film />}
          title={search ? "No videos match" : "No videos yet"}
          description="Upload a lesson video from the lesson editor, under a class's curriculum."
          size="sm"
        />
      ) : (
        <ul className="divide-y divide-separator rounded-card border border-border bg-surface">
          {data.items.map((row) => (
            <li key={row.guid} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center">
              <div className="min-w-0 flex-1">
                <p className="truncate text-label font-semibold text-foreground">{row.title || "Untitled video"}</p>
                <p className="mt-0.5 flex flex-wrap items-center gap-2 text-caption text-foreground-muted">
                  <Badge tone={STATE[row.state].tone}>
                    {row.state === "processing" && row.encodeProgress ? `${STATE[row.state].label} ${row.encodeProgress}%` : STATE[row.state].label}
                  </Badge>
                  {formatLength(row.length) ? <span className="tabular-nums">{formatLength(row.length)}</span> : null}
                  <code className="font-mono text-micro">{row.guid}</code>
                </p>
                <p className="mt-1 text-caption text-foreground-muted">
                  {row.lessons.length === 0 ? (
                    "Not used by any lesson"
                  ) : (
                    <>
                      Used by{" "}
                      {row.lessons.map((lesson, index) => (
                        <span key={lesson.id}>
                          {index > 0 ? ", " : null}
                          <Link href={`/admin/courses/${lesson.courseSlug}/edit`} className="text-link">
                            {lesson.courseTitle}: {lesson.title}
                          </Link>
                        </span>
                      ))}
                    </>
                  )}
                </p>
              </div>
              <div className="flex shrink-0 gap-1">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    void navigator.clipboard?.writeText(row.guid);
                    setNotice("Video id copied.");
                  }}
                >
                  <Copy className="size-4" aria-hidden />
                  Copy id
                </Button>
                {row.lessons.length === 0 ? (
                  <Button size="sm" variant="danger" onClick={() => void remove(row)}>
                    <Trash2 className="size-4" aria-hidden />
                    Delete
                  </Button>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}

      {data && pages > 1 ? (
        <div className="flex items-center justify-between gap-3">
          <Button size="sm" disabled={page <= 1 || pending} onClick={() => setPage((value) => value - 1)}>
            Previous
          </Button>
          <span className="text-caption tabular-nums text-foreground-muted">
            Page {page} of {pages}
          </span>
          <Button size="sm" disabled={page >= pages || pending} onClick={() => setPage((value) => value + 1)}>
            Next
          </Button>
        </div>
      ) : null}
    </div>
  );
}
