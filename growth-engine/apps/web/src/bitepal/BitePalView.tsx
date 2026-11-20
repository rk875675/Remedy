import { useEffect, useMemo, useState, type ReactNode } from "react";
import { api } from "../api";
import { BITEPAL_SLIDES, type BitePalSection, type BitePalSlide } from "./slides";

const GREEN = "#33663f";

const SECTIONS: Array<{ id: BitePalSection; label: string }> = [
  { id: "onboarding", label: "Onboarding" },
  { id: "paywall", label: "Paywall" },
  { id: "in-app", label: "In app" },
];

type Filter = "all" | BitePalSection;

function slideSrc(slide: BitePalSlide): string {
  return `/bitepal/${slide.file}`;
}

export function BitePalView() {
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [labels, setLabels] = useState<Record<string, string>>({});
  const [filter, setFilter] = useState<Filter>("all");
  const [open, setOpen] = useState<BitePalSlide | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [error, setError] = useState("");

  const labelFor = (slide: BitePalSlide): string => labels[slide.id] ?? slide.label;

  useEffect(() => {
    api
      .bitepalHidden()
      .then((res) => setHidden(new Set(res.ids)))
      .catch(() => setError("Could not load deleted slides. Showing the full set."));
    api
      .bitepalLabels()
      .then((res) => setLabels(res.labels))
      .catch(() => setError("Could not load your descriptions. Showing the originals."));
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const visible = useMemo(
    () => BITEPAL_SLIDES.filter((slide) => !hidden.has(slide.id)),
    [hidden],
  );

  const shown = filter === "all" ? visible : visible.filter((slide) => slide.section === filter);

  const onSaveLabel = async (slide: BitePalSlide, next: string) => {
    const res = await api.saveBitepalLabel(slide.id, next);
    if (!res.ok) throw new Error(res.error ?? "Could not save the description");
    setLabels((prev) => {
      const copy = { ...prev };
      if (res.label) copy[slide.id] = res.label;
      else delete copy[slide.id];
      return copy;
    });
  };

  const onDelete = async (slide: BitePalSlide) => {
    if (!window.confirm(`Delete “${labelFor(slide)}”?`)) return;
    setDeleting(slide.id);
    setError("");
    try {
      const res = await api.deleteBitepalSlide(slide.id);
      if (!res.ok || !res.ids) throw new Error(res.error ?? "Delete failed");
      setHidden(new Set(res.ids));
      setOpen((current) => (current?.id === slide.id ? null : current));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setDeleting(null);
    }
  };

  return (
    <div className="space-y-6">
      <section className="rounded-2xl bg-white border border-stone-200 px-4 py-4">
        <p className="text-sm text-stone-700 leading-snug">
          Every distinct screen from the Nov 14 BitePal recording, in the order it happened.
          Type-on animation and the paywall countdown are one frame each. The Google account
          list and the Apple ID payment sheet are not here — those frames show personal emails.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <FilterButton active={filter === "all"} onClick={() => setFilter("all")}>
            All ({visible.length})
          </FilterButton>
          {SECTIONS.map((section) => {
            const count = visible.filter((slide) => slide.section === section.id).length;
            return (
              <FilterButton
                key={section.id}
                active={filter === section.id}
                onClick={() => setFilter(section.id)}
              >
                {section.label} ({count})
              </FilterButton>
            );
          })}
        </div>
        {error && <p className="mt-3 text-xs text-amber-800">{error}</p>}
      </section>

      {SECTIONS.filter((section) => filter === "all" || filter === section.id).map((section) => {
        const slides = shown.filter((slide) => slide.section === section.id);
        if (slides.length === 0) return null;
        return (
          <section key={section.id} className="space-y-3">
            <h3 className="text-lg font-extrabold tracking-tight" style={{ color: GREEN }}>
              {section.label}
              <span className="ml-2 text-sm font-semibold text-stone-400">{slides.length}</span>
            </h3>
            <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3">
              {slides.map((slide) => {
                const n = BITEPAL_SLIDES.findIndex((row) => row.id === slide.id) + 1;
                return (
                  <article key={slide.id} className="bg-white rounded-2xl border border-stone-200">
                    <button
                      type="button"
                      onClick={() => setOpen(slide)}
                      className="block w-full overflow-hidden rounded-t-2xl bg-stone-100"
                    >
                      <img
                        src={slideSrc(slide)}
                        alt={labelFor(slide)}
                        loading="lazy"
                        decoding="async"
                        className="w-full object-contain"
                      />
                    </button>
                    <div className="p-3 space-y-2">
                      <p className="text-[11px] font-bold text-stone-400 tabular-nums">
                        {String(n).padStart(2, "0")}
                      </p>
                      <DescriptionField value={labelFor(slide)} onSave={(next) => onSaveLabel(slide, next)} />
                      <button
                        type="button"
                        onClick={() => { void onDelete(slide); }}
                        disabled={deleting === slide.id}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold border border-red-200 text-red-600 bg-red-50 ${deleting === slide.id ? "opacity-50" : ""}`}
                      >
                        {deleting === slide.id ? "…" : "Delete"}
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          </section>
        );
      })}

      {open && (
        <div
          className="fixed inset-0 z-50 bg-stone-900/80 flex items-center justify-center p-4"
          onClick={() => setOpen(null)}
        >
          <div
            className="max-h-full max-w-sm w-full overflow-auto"
            onClick={(event) => event.stopPropagation()}
          >
            <img src={slideSrc(open)} alt={labelFor(open)} className="w-full rounded-2xl bg-white" />
            <div className="mt-3 rounded-2xl bg-white p-3">
              <DescriptionField value={labelFor(open)} onSave={(next) => onSaveLabel(open, next)} />
            </div>
            <div className="mt-3 flex justify-end">
              <button
                type="button"
                onClick={() => { void onDelete(open); }}
                disabled={deleting === open.id}
                className="shrink-0 px-3 py-1.5 rounded-lg text-xs font-bold border border-red-300 text-red-100"
              >
                {deleting === open.id ? "…" : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function DescriptionField({
  value,
  onSave,
}: {
  value: string;
  onSave: (next: string) => Promise<void>;
}) {
  const [text, setText] = useState(value);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  useEffect(() => { setText(value); }, [value]);

  const commit = async () => {
    const next = text.trim();
    if (next === value.trim()) return;
    setSaving(true);
    setSaveError("");
    try {
      await onSave(next);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Could not save");
    } finally {
      setSaving(false);
    }
  };

  return (
    <label className="block">
      <span className="text-[10px] font-bold uppercase tracking-wide text-stone-400">Description</span>
      <textarea
        value={text}
        rows={6}
        maxLength={800}
        onChange={(event) => setText(event.target.value)}
        onBlur={() => { void commit(); }}
        className="mt-1 w-full resize-y rounded-lg border border-stone-200 px-2 py-1.5 text-xs leading-snug text-stone-800"
      />
      {saving && <span className="text-[10px] text-stone-400">Saving…</span>}
      {saveError && <span className="text-[10px] text-red-600">{saveError}</span>}
    </label>
  );
}

function FilterButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-3 py-1.5 rounded-xl text-sm font-bold ${active ? "text-white" : "bg-stone-100 text-stone-600"}`}
      style={active ? { backgroundColor: GREEN } : undefined}
    >
      {children}
    </button>
  );
}
