import { useEffect, useState } from "react";
import { api, type FormatRef } from "../api";

const GREEN = "#33663f";

function when(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

export function FormatsView({ onMessage }: { onMessage: (s: string) => void }) {
  const [url, setUrl] = useState("");
  const [note, setNote] = useState("");
  const [items, setItems] = useState<FormatRef[]>([]);
  const [busy, setBusy] = useState(false);

  async function load(): Promise<void> {
    const data = await api.formats();
    setItems(data.items);
  }

  useEffect(() => {
    load().catch((err) => onMessage(err instanceof Error ? err.message : "Could not load formats"));
  }, [onMessage]);

  async function save(): Promise<void> {
    const link = url.trim();
    if (!link) {
      onMessage("Paste a link first");
      return;
    }
    setBusy(true);
    try {
      const res = await api.addFormat(link, note.trim());
      if (!res.ok || !res.item) {
        onMessage(res.error ?? "Could not save");
        return;
      }
      setItems((prev) => [res.item as FormatRef, ...prev]);
      setUrl("");
      setNote("");
      onMessage("Saved");
    } catch (err) {
      onMessage(err instanceof Error ? err.message : "Could not save");
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string): Promise<void> {
    setItems((prev) => prev.filter((item) => item.id !== id));
    try {
      const res = await api.deleteFormat(id);
      if (!res.ok) onMessage(res.error ?? "Could not delete");
    } catch (err) {
      onMessage(err instanceof Error ? err.message : "Could not delete");
      load().catch(() => undefined);
    }
  }

  return (
    <div className="max-w-lg space-y-4 pb-8">
      <p className="text-sm text-stone-600">
        Paste a TikTok or Reel link. Optional note if you already know the POV line. Saved links are pulled into Memes → Library with{" "}
        <code className="rounded bg-stone-100 px-1 py-0.5 text-xs">python scripts/sync-formats-inbox.py --password …</code> on your machine.
      </p>
      <input
        value={url}
        onChange={(ev) => setUrl(ev.target.value)}
        placeholder="https://www.tiktok.com/..."
        inputMode="url"
        autoCapitalize="none"
        autoCorrect="off"
        className="w-full rounded-xl border border-stone-200 bg-white px-3 py-3 text-base text-stone-800"
      />
      <input
        value={note}
        onChange={(ev) => setNote(ev.target.value)}
        placeholder="Note (optional)"
        maxLength={200}
        className="w-full rounded-xl border border-stone-200 bg-white px-3 py-3 text-base text-stone-800"
      />
      <button
        type="button"
        disabled={busy}
        onClick={() => void save()}
        className="w-full rounded-xl py-3 text-base font-bold text-white disabled:opacity-40"
        style={{ backgroundColor: GREEN }}
      >
        {busy ? "Saving…" : "Save link"}
      </button>
      <ul className="space-y-2">
        {items.map((item) => (
          <li key={item.id} className="rounded-xl border border-stone-200 bg-white px-3 py-3">
            {item.note ? <p className="text-sm font-semibold text-stone-800">{item.note}</p> : null}
            <a href={item.url} target="_blank" rel="noreferrer" className="mt-1 block break-all text-sm font-semibold" style={{ color: GREEN }}>
              {item.url}
            </a>
            <div className="mt-2 flex items-center justify-between">
              <span className="text-[11px] text-stone-400">{when(item.createdAt)}</span>
              <button type="button" onClick={() => void remove(item.id)} className="text-xs font-semibold text-stone-500">
                Delete
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
