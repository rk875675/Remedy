import { useState } from "react";
import { PIN_POSTS, PIN_SITE_URL, pinCaption, pinSlideSrc, type PinPost } from "./content";

const GREEN = "#33663f";

async function copyText(text: string): Promise<void> {
  await navigator.clipboard.writeText(text);
}

async function sharePinPhotos(post: PinPost): Promise<void> {
  const files: File[] = [];
  for (let i = 0; i < post.slides.length; i++) {
    const res = await fetch(pinSlideSrc(post.id, i));
    if (!res.ok) throw new Error(`Could not load slide ${i + 1}.`);
    const blob = await res.blob();
    files.push(new File([blob], `remedy-pin-${post.id}-${String(i + 1).padStart(2, "0")}.jpg`, { type: "image/jpeg" }));
  }
  const nav = navigator as Navigator & { canShare?: (data: ShareData) => boolean };
  if (typeof nav.share === "function" && nav.canShare?.({ files })) {
    await nav.share({ files, title: post.label });
    return;
  }
  if (typeof nav.share === "function") {
    for (let start = 0; start < files.length; start += 6) {
      const chunk = files.slice(start, start + 6);
      if (nav.canShare?.({ files: chunk })) {
        await nav.share({ files: chunk, title: post.label });
      }
    }
    return;
  }
  for (const file of files) {
    const url = URL.createObjectURL(file);
    const a = document.createElement("a");
    a.href = url;
    a.download = file.name;
    a.click();
    URL.revokeObjectURL(url);
  }
}

function PinKit({ post, onCopied }: { post: PinPost; onCopied: (s: string) => void }) {
  const [saving, setSaving] = useState(false);
  const copy = async (text: string, label: string) => {
    await copyText(text);
    onCopied(label);
  };
  const save = async () => {
    setSaving(true);
    try {
      await sharePinPhotos(post);
      onCopied("Share sheet opened — tap Save Images");
    } catch (err) {
      onCopied(err instanceof Error ? err.message : "Could not save the photos");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-white rounded-2xl border-2 border-emerald-200 p-4 space-y-3 lg:p-5">
      <div>
        <p className="text-[11px] font-bold uppercase tracking-wide text-emerald-800">This post · {post.slot}</p>
        <p className="text-sm font-bold text-stone-900 mt-0.5">{post.label}</p>
        <p className="text-xs text-stone-600 mt-1">{post.purpose}</p>
      </div>
      <button
        type="button"
        disabled={saving}
        onClick={() => save()}
        className="w-full py-3.5 rounded-xl text-white text-sm font-bold disabled:opacity-40"
        style={{ backgroundColor: GREEN }}
      >
        {saving ? "Loading photos…" : `Save all ${post.slides.length} photos`}
      </button>
      <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(240px,320px)] lg:gap-6 lg:items-start">
        <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1 lg:grid lg:grid-cols-4 xl:grid-cols-4 lg:overflow-visible lg:mx-0 lg:px-0 lg:pb-0">
          {post.slides.map((_, i) => (
            <a
              key={pinSlideSrc(post.id, i)}
              href={pinSlideSrc(post.id, i)}
              target="_blank"
              rel="noreferrer"
              className="shrink-0 w-24 rounded-xl overflow-hidden border border-stone-200 bg-[#FAF7F4] lg:w-full"
            >
              <img src={pinSlideSrc(post.id, i)} alt={`${post.label} slide ${i + 1}`} className="w-full aspect-[4/5] object-cover" />
              <p className="text-center text-[10px] font-bold text-white py-1 bg-stone-900">{i + 1}</p>
            </a>
          ))}
        </div>
        <div className="space-y-3 mt-3 lg:mt-0">
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={() => copy(post.title, "Title copied")} className="py-3 rounded-xl bg-stone-100 text-sm font-bold">
              Copy title
            </button>
            <button
              type="button"
              onClick={() => copy(pinCaption(post), "Caption copied")}
              className="py-3 rounded-xl text-white text-sm font-bold"
              style={{ backgroundColor: GREEN }}
            >
              Copy caption
            </button>
          </div>
          <button
            type="button"
            onClick={() => copy(PIN_SITE_URL, "Website copied — put this in the bio, not the caption")}
            className="w-full py-2.5 rounded-xl bg-stone-50 border border-stone-200 text-xs font-bold"
          >
            Copy website for bio
          </button>
          <ol className="text-[11px] text-stone-600 space-y-1 list-decimal pl-4">
            <li>Save all photos, then post the carousel once.</li>
            <li>Paste the title and caption. Website goes in the bio, not the caption.</li>
            <li>Pin it. These stay out of the queue.</li>
          </ol>
          <p className="text-[11px] text-stone-500 whitespace-pre-wrap leading-relaxed">{post.caption}</p>
        </div>
      </div>
    </div>
  );
}

export function PinsView({ onCopied }: { onCopied: (s: string) => void }) {
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-sm font-bold text-stone-900">Pinned posts</h2>
        <p className="text-[11px] text-stone-500 mt-1 max-w-2xl">
          Three one-time carousels for the top of each account. The slot that converts a new visitor is the same one consumer apps keep pinned: what it is, why a program beats a playlist, and who it is for. Nothing here is in the queue.
        </p>
      </div>
      {PIN_POSTS.map((post) => (
        <PinKit key={post.id} post={post} onCopied={onCopied} />
      ))}
    </div>
  );
}
