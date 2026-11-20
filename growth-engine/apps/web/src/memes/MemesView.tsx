import { useEffect, useState } from "react";

import { api, type MemeItem } from "../api";

import { PartsView, type PartsShelf } from "./PartsView";



const GREEN = "#33663f";

const HASHTAGS_GAP = "\n\n";



function postCaption(item: MemeItem): string {

  return [item.caption, item.hashtags].filter(Boolean).join(HASHTAGS_GAP);

}



async function copyText(text: string): Promise<void> {

  await navigator.clipboard.writeText(text);

}



async function saveMemeToPhotos(id: string): Promise<void> {

  const res = await fetch(`/api/memes/${encodeURIComponent(id)}/file`, { credentials: "include" });

  if (!res.ok) throw new Error("Could not load the meme. Hard-refresh and try again.");

  const blob = await res.blob();

  if (!blob.type.startsWith("video/") && blob.size < 1000) {

    throw new Error("Meme file is missing. Hard-refresh and try again.");

  }

  const file = new File([blob], `remedy-meme-${id}.mp4`, { type: "video/mp4" });

  const nav = navigator as Navigator & { canShare?: (data: ShareData) => boolean };

  if (typeof nav.share === "function" && nav.canShare?.({ files: [file] })) {

    await nav.share({ files: [file], title: "Remedy meme" });

    return;

  }

  window.location.href = `/api/memes/${encodeURIComponent(id)}/file?download=1`;

}



function MemeCard({

  item,

  onMessage,

  onChanged,

}: {

  item: MemeItem;

  onMessage: (s: string) => void;

  onChanged: (next: MemeItem) => void;

}) {

  const [saving, setSaving] = useState(false);

  const [busy, setBusy] = useState(false);

  const [reason, setReason] = useState("");

  const [rejecting, setRejecting] = useState(false);



  const copy = async (text: string, label: string) => {

    await copyText(text);

    onMessage(label);

  };



  const save = async () => {

    setSaving(true);

    try {

      await saveMemeToPhotos(item.id);

      onMessage("Share sheet opened — tap Save Video");

    } catch (err) {

      onMessage(err instanceof Error ? err.message : "Could not save the video");

    } finally {

      setSaving(false);

    }

  };



  const reject = async () => {

    setBusy(true);

    try {

      const res = await api.rejectMeme(item.id, reason.trim());

      if (!res.ok || !res.item) {

        onMessage(res.error ?? "Could not reject");

        return;

      }

      onChanged(res.item);

      setRejecting(false);

      onMessage("Rejected");

    } catch (err) {

      onMessage(err instanceof Error ? err.message : "Could not reject");

    } finally {

      setBusy(false);

    }

  };



  return (

    <article className="bg-white rounded-2xl border border-stone-200 p-4 space-y-3">

      <div className="flex items-start justify-between gap-3">

        <div>

          <p className="text-[11px] font-bold uppercase tracking-wide text-stone-400">{item.id}</p>

          <h3 className="text-base font-bold text-stone-900 mt-0.5">{item.title}</h3>

        </div>

      </div>

      <video

        src={`/api/memes/${encodeURIComponent(item.id)}/file`}

        controls

        playsInline

        preload="metadata"

        className="w-full max-w-[280px] mx-auto rounded-xl bg-black"

        style={{ aspectRatio: "9 / 16" }}

      />

      <p className="text-sm text-stone-700 whitespace-pre-line">{item.lines.join("\n")}</p>

      <p className="text-xs text-stone-500">{item.description}</p>

      {item.musicCredit ? <p className="text-[11px] text-stone-400">{item.musicCredit}</p> : null}

      <div className="grid grid-cols-2 gap-2">

        <button type="button" onClick={() => void copy(item.title, "Title copied")} className="py-3 rounded-xl bg-stone-100 text-sm font-bold">

          Copy title

        </button>

        <button

          type="button"

          onClick={() => void copy(postCaption(item), "Caption copied")}

          className="py-3 rounded-xl text-white text-sm font-bold"

          style={{ backgroundColor: GREEN }}

        >

          Copy caption

        </button>

      </div>

      <button

        type="button"

        onClick={() => void copy(item.description, "Description copied")}

        className="w-full py-2.5 rounded-xl bg-stone-50 border border-stone-200 text-xs font-bold"

      >

        Copy description

      </button>

      <button

        type="button"

        disabled={saving}

        onClick={() => void save()}

        className="w-full py-3.5 rounded-xl text-white text-sm font-bold disabled:opacity-40"

        style={{ backgroundColor: GREEN }}

      >

        {saving ? "Loading video…" : "Save to Photos"}

      </button>

      {rejecting ? (

        <div className="space-y-2">

          <input

            value={reason}

            onChange={(ev) => setReason(ev.target.value)}

            placeholder="Why reject it (optional)"

            maxLength={200}

            className="w-full rounded-xl border border-stone-200 px-3 py-2 text-sm"

          />

          <div className="grid grid-cols-2 gap-2">

            <button type="button" onClick={() => setRejecting(false)} className="py-2.5 rounded-xl bg-stone-100 text-sm font-bold">

              Cancel

            </button>

            <button type="button" disabled={busy} onClick={() => void reject()} className="py-2.5 rounded-xl bg-stone-900 text-white text-sm font-bold disabled:opacity-40">

              {busy ? "Rejecting…" : "Reject"}

            </button>

          </div>

        </div>

      ) : (

        <button type="button" onClick={() => setRejecting(true)} className="w-full py-2.5 text-sm font-semibold text-stone-500">

          Reject this meme

        </button>

      )}

    </article>

  );

}



export function MemesView({

  sub,

  formatId,

  libraryShelf,

  onSub,

  onFormatId,

  onLibraryShelf,

  onMessage,

}: {

  sub: "review" | "library";

  formatId: string | null;

  libraryShelf: PartsShelf;

  onSub: (next: "review" | "library") => void;

  onFormatId: (id: string | null) => void;

  onLibraryShelf: (next: PartsShelf) => void;

  onMessage: (s: string) => void;

}) {

  const [items, setItems] = useState<MemeItem[]>([]);

  const [loaded, setLoaded] = useState(false);



  useEffect(() => {

    if (sub !== "review") return;

    api

      .memes()

      .then((data) => setItems(data.items))

      .catch((err) => onMessage(err instanceof Error ? err.message : "Could not load memes"))

      .finally(() => setLoaded(true));

  }, [onMessage, sub]);



  const shown = items.filter((item) => item.status === "review");

  const reviewCount = shown.length;



  return (

    <div className={`${sub === "library" ? "max-w-5xl" : "max-w-lg"} space-y-4 pb-8`}>

      <div className="flex gap-2">

        {(

          [

            ["review", `Review (${reviewCount})`],

            ["library", "Library"],

          ] as const

        ).map(([id, label]) => (

          <button

            key={id}

            type="button"

            onClick={() => onSub(id)}

            className={`px-4 py-2 rounded-xl text-sm font-bold ${sub === id ? "text-white" : "bg-white text-stone-600 border border-stone-200"}`}

            style={sub === id ? { backgroundColor: GREEN } : undefined}

          >

            {label}

          </button>

        ))}

      </div>

      {sub === "library" ? (
        <PartsView shelf={libraryShelf} onShelf={onLibraryShelf} formatId={formatId} onFormatId={onFormatId} />
      ) : null}

      {sub === "review" ? (

        <p className="text-sm text-stone-600">Copy the title and caption, then save the video to Photos.</p>

      ) : null}

      {sub === "review" && !loaded ? <p className="text-sm text-stone-500">Loading…</p> : null}

      {sub === "review" && loaded && shown.length === 0 ? (

        <p className="text-sm text-stone-500">Nothing waiting in review.</p>

      ) : null}

      {sub === "review"

        ? shown.map((item) => (

            <MemeCard

              key={item.id}

              item={item}

              onMessage={onMessage}

              onChanged={(next) => setItems((prev) => prev.map((row) => (row.id === next.id ? next : row)))}

            />

          ))

        : null}

    </div>

  );

}


