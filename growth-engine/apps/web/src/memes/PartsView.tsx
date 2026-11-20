import { useMemo, type CSSProperties } from "react";

import { FormatLibraryView } from "./FormatLibraryView";
import {
  FORMAT_STUDIES,
  formatAssetUrl,
  formatCount,
  partMatchesShelf,
  type FormatPart,
  type FormatStudy,
  type LibraryShelf,
} from "./formatLibrary";

const GREEN = "#33663f";

export const PARTS_SHELVES = ["formats", "backgrounds", "gif", "text", "music"] as const;
export type PartsShelf = (typeof PARTS_SHELVES)[number];

export const DEFAULT_PARTS_SHELF: PartsShelf = "formats";

const SHELF_LABEL: Record<PartsShelf, string> = {
  formats: "Formats",
  backgrounds: "Background",
  gif: "GIF",
  text: "Text",
  music: "Music",
};

const LEGACY_SHELF: Record<string, PartsShelf> = {
  reactions: "gif",
  lines: "text",
  parts: "formats",
};

export function libraryShelfFromHash(): PartsShelf {
  const parts = window.location.hash.replace(/^#/, "").split("/");
  if (parts[0] !== "memes" || parts[1] !== "library" || !parts[2]) return DEFAULT_PARTS_SHELF;
  const token = parts[2];
  if (PARTS_SHELVES.includes(token as PartsShelf)) return token as PartsShelf;
  if (token in LEGACY_SHELF) return LEGACY_SHELF[token];
  return DEFAULT_PARTS_SHELF;
}

function shelfCount(shelf: PartsShelf): number {
  if (shelf === "formats") return FORMAT_STUDIES.length;
  let n = 0;
  for (const study of FORMAT_STUDIES) {
    if (shelf === "text") {
      const textParts = study.parts.filter((p) => partMatchesShelf(p, "text"));
      if (textParts.length > 0) n += textParts.length;
      else if (study.hook.trim()) n += 1;
      continue;
    }
    for (const part of study.parts) {
      if (partMatchesShelf(part, shelf)) n += 1;
    }
  }
  return n;
}

function checkerboardStyle(): CSSProperties {
  return {
    backgroundColor: "#e7e5e4",
    backgroundImage:
      "linear-gradient(45deg, #d6d3d1 25%, transparent 25%), linear-gradient(-45deg, #d6d3d1 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #d6d3d1 75%), linear-gradient(-45deg, transparent 75%, #d6d3d1 75%)",
    backgroundSize: "16px 16px",
    backgroundPosition: "0 0, 0 8px, 8px -8px, -8px 0",
  };
}

function PartCard({ study, part }: { study: FormatStudy; part: FormatPart }) {
  return (
    <li className="overflow-hidden rounded-2xl border border-stone-200 bg-white">
      {part.kind === "audio" ? (
        <div className="space-y-3 p-4">
          <p className="text-sm font-bold text-stone-900">{study.title}</p>
          <audio controls preload="none" src={formatAssetUrl(part.file)} className="w-full" />
          <p className="text-xs text-stone-600">{part.caption}</p>
        </div>
      ) : part.kind === "gif" ? (
        <>
          <div className="flex max-h-[420px] items-center justify-center p-2" style={checkerboardStyle()}>
            <img src={formatAssetUrl(part.file)} alt={part.label} className="max-h-[400px] w-full object-contain" />
          </div>
          <div className="space-y-1 p-3">
            <p className="text-sm font-bold text-stone-900">{study.title}</p>
            <p className="text-xs text-stone-600">{part.caption}</p>
          </div>
        </>
      ) : part.kind === "text" ? (
        <div className="space-y-3 p-4">
          <div className="rounded-xl bg-stone-900 px-4 py-6 text-center">
            <p className="text-sm font-bold leading-snug text-white">{part.body}</p>
          </div>
          <p className="text-sm font-bold text-stone-900">{study.title}</p>
          <p className="text-xs text-stone-600">{part.caption}</p>
        </div>
      ) : (
        <>
          <img src={formatAssetUrl(part.file)} alt={part.label} className="h-72 w-full object-cover" />
          <div className="space-y-1 p-3">
            <p className="text-sm font-bold text-stone-900">{study.title}</p>
            <p className="text-xs text-stone-600">{part.caption}</p>
          </div>
        </>
      )}
    </li>
  );
}

function FormatTextCard({ study }: { study: FormatStudy }) {
  return (
    <li className="space-y-3 rounded-2xl border border-stone-200 bg-white p-4">
      <div className="rounded-xl bg-stone-900 px-4 py-6 text-center">
        <p className="text-sm font-bold leading-snug text-white">{study.hook}</p>
      </div>
      <p className="text-sm font-bold text-stone-900">{study.title}</p>
      <p className="text-xs text-stone-500">
        {study.stats.views > 0 ? `${formatCount(study.stats.views)} views · ` : null}
        <a href={study.sourceUrl} target="_blank" rel="noreferrer" className="font-semibold" style={{ color: GREEN }}>
          Source
        </a>
      </p>
    </li>
  );
}

export function PartsView({
  shelf,
  onShelf,
  formatId,
  onFormatId,
}: {
  shelf: PartsShelf;
  onShelf: (next: PartsShelf) => void;
  formatId: string | null;
  onFormatId: (id: string | null) => void;
}) {
  const backgroundParts = useMemo(() => {
    const rows: { study: FormatStudy; part: FormatPart }[] = [];
    for (const study of FORMAT_STUDIES) {
      for (const part of study.parts) {
        if (partMatchesShelf(part, "backgrounds")) rows.push({ study, part });
      }
    }
    return rows;
  }, []);

  const gifParts = useMemo(() => {
    const rows: { study: FormatStudy; part: FormatPart }[] = [];
    for (const study of FORMAT_STUDIES) {
      for (const part of study.parts) {
        if (partMatchesShelf(part, "gif")) rows.push({ study, part });
      }
    }
    return rows;
  }, []);

  const textParts = useMemo(() => {
    const rows: { study: FormatStudy; part: FormatPart }[] = [];
    for (const study of FORMAT_STUDIES) {
      for (const part of study.parts) {
        if (partMatchesShelf(part, "text")) rows.push({ study, part });
      }
    }
    return rows;
  }, []);

  const musicParts = useMemo(() => {
    const rows: { study: FormatStudy; part: FormatPart }[] = [];
    for (const study of FORMAT_STUDIES) {
      for (const part of study.parts) {
        if (partMatchesShelf(part, "music")) rows.push({ study, part });
      }
    }
    return rows;
  }, []);

  const textHooks = useMemo(
    () => FORMAT_STUDIES.filter((s) => s.hook.trim() && !s.parts.some((p) => partMatchesShelf(p, "text"))),
    [],
  );

  return (
    <div className={`space-y-4 pb-8 ${shelf === "formats" ? "max-w-lg" : "max-w-5xl"}`}>
      <div className="flex gap-2 overflow-x-auto">
        {PARTS_SHELVES.map((id) => (
          <button
            key={id}
            type="button"
            onClick={() => onShelf(id)}
            className={`shrink-0 rounded-xl px-3 py-2 text-sm font-bold ${shelf === id ? "text-white" : "border border-stone-200 bg-white text-stone-600"}`}
            style={shelf === id ? { backgroundColor: GREEN } : undefined}
          >
            {SHELF_LABEL[id]} ({shelfCount(id)})
          </button>
        ))}
      </div>

      {shelf === "formats" ? <FormatLibraryView formatId={formatId} onFormatId={onFormatId} /> : null}

      {shelf === "backgrounds" ? (
        backgroundParts.length === 0 ? (
          <p className="text-sm text-stone-500">No backgrounds yet — add image parts on a format.</p>
        ) : (
          <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {backgroundParts.map(({ study, part }) => (
              <PartCard key={`${study.id}-${part.file}`} study={study} part={part} />
            ))}
          </ul>
        )
      ) : null}

      {shelf === "gif" ? (
        gifParts.length === 0 ? (
          <p className="text-sm text-stone-500">No GIF layers yet.</p>
        ) : (
          <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {gifParts.map(({ study, part }) => (
              <PartCard key={`${study.id}-${part.file}`} study={study} part={part} />
            ))}
          </ul>
        )
      ) : null}

      {shelf === "text" ? (
        textParts.length === 0 && textHooks.length === 0 ? (
          <p className="text-sm text-stone-500">No hook text yet.</p>
        ) : (
          <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {textHooks.map((study) => (
              <FormatTextCard key={study.id} study={study} />
            ))}
            {textParts.map(({ study, part }) => (
              <PartCard key={`${study.id}-${part.label}`} study={study} part={part} />
            ))}
          </ul>
        )
      ) : null}

      {shelf === "music" ? (
        musicParts.length === 0 ? (
          <p className="text-sm text-stone-500">No audio yet.</p>
        ) : (
          <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {musicParts.map(({ study, part }) => (
              <PartCard key={`${study.id}-${part.file}`} study={study} part={part} />
            ))}
          </ul>
        )
      ) : null}
    </div>
  );
}
