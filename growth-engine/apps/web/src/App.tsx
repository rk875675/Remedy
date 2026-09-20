import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import {
  api,
  loadSnapshot,
  type Post,
  type Hook,
  type Learning,
  type Summary,
  type Settings,
  type Formula,
  type TemplateStat,
  type PipelineStep,
  type CalendarItem,
  type IllustrationAsset,
  type ScreenshotAsset,
  type CropRequest,
  type DimensionSummary,
  type Experiment,
  type AssetCoverage,
  type CycleState,
  type AssetRating,
  type Signal,
  type SignalDimension,
  type TestableDimension,
  SIGNAL_DIMENSIONS,
  TESTABLE_DIMENSIONS,
  autoScreenshotDescription,
  cropDescriptionFor,
  APP_STORE_URL,
  shotThumbSrc,
  type StudioMe,
} from "./api";
import { UgcView } from "./ugc/UgcView";

function appStoreUrl(settings?: Settings | null): string {
  return typeof settings?.appStoreUrl === "string" && settings.appStoreUrl ? settings.appStoreUrl : APP_STORE_URL;
}

type Tab = "review" | "library" | "insights" | "studio" | "engine" | "images" | "svgs" | "settings" | "ugc";
type ImagesSub = "all" | "ss" | "crop";
type UgcSub = "sohan" | "ai";
type InsightsSub = "overview" | "learning";
const TABS: Tab[] = ["review", "library", "insights", "studio", "engine", "images", "svgs", "settings", "ugc"];
const CREATOR_TABS: Tab[] = ["insights", "library", "studio", "ugc"];
const GREEN = "#33663f";
const CREAM = "#f7f2e9";
const IMAGES_SUBS: ImagesSub[] = ["all", "ss", "crop"];
const UGC_SUBS: UgcSub[] = ["sohan", "ai"];
const INSIGHTS_SUBS: InsightsSub[] = ["overview", "learning"];

function tabFromHash(): Tab {
  const id = window.location.hash.replace(/^#/, "").split("/")[0] as Tab;
  return TABS.includes(id) ? id : "review";
}

function imagesSubFromHash(): ImagesSub {
  const parts = window.location.hash.replace(/^#/, "").split("/");
  const sub = parts[1] as ImagesSub;
  return parts[0] === "images" && IMAGES_SUBS.includes(sub) ? sub : "all";
}

function ugcSubFromHash(): UgcSub {
  const parts = window.location.hash.replace(/^#/, "").split("/");
  const sub = parts[1] as UgcSub;
  return parts[0] === "ugc" && UGC_SUBS.includes(sub) ? sub : "sohan";
}

function insightsSubFromHash(): InsightsSub {
  const parts = window.location.hash.replace(/^#/, "").split("/");
  const sub = parts[1] as InsightsSub;
  return parts[0] === "insights" && INSIGHTS_SUBS.includes(sub) ? sub : "overview";
}

function hashFor(tab: Tab, imagesSub: ImagesSub = "all", ugcSub: UgcSub = "sohan", insightsSub: InsightsSub = "overview"): string {
  if (tab === "images" && imagesSub !== "all") return `#images/${imagesSub}`;
  if (tab === "ugc" && ugcSub !== "sohan") return `#ugc/${ugcSub}`;
  if (tab === "insights" && insightsSub !== "overview") return `#insights/${insightsSub}`;
  return `#${tab}`;
}

function writeHash(tab: Tab, imagesSub: ImagesSub = "all", ugcSub: UgcSub = "sohan", insightsSub: InsightsSub = "overview"): void {
  const next = hashFor(tab, imagesSub, ugcSub, insightsSub);
  if (window.location.hash !== next) history.replaceState(null, "", next);
}

const REJECT_CHIPS = [
  { label: "Didn't follow the hook", reason: "Body slides don't continue the hook — generic after slide 1." },
  { label: "Weak hook", reason: "Hook is weak, generic, or overused." },
  { label: "Bad crop", reason: "Screenshot is a raw full screen, not a library crop." },
  { label: "Layout", reason: "Text overlap, cutoff, or spacing is wrong." },
  { label: "Wrong length", reason: "Carousel is too short or the template doesn't fit this hook." },
] as const;

function RejectReasonEditor({
  value,
  onChange,
  onConfirm,
  onCancel,
  busy,
  compact = false,
}: {
  value: string;
  onChange: (v: string) => void;
  onConfirm: () => void;
  onCancel: () => void;
  busy?: boolean;
  compact?: boolean;
}) {
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        {REJECT_CHIPS.map((c) => (
          <button
            key={c.label}
            type="button"
            onClick={() => onChange(c.reason)}
            className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${
              value === c.reason ? "border-red-400 bg-red-50 text-red-800" : "border-stone-200 bg-stone-50 text-stone-700"
            }`}
          >
            {c.label}
          </button>
        ))}
      </div>
      <input
        value={value}
        onChange={(ev) => onChange(ev.target.value)}
        placeholder="Why? Tap a chip or type — teaches the next batch."
        maxLength={200}
        className="w-full rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm text-stone-800"
        autoFocus
        onKeyDown={(ev) => { if (ev.key === "Enter") onConfirm(); }}
      />
      <div className="flex gap-2">
        <button
          disabled={busy}
          onClick={onConfirm}
          className={`${compact ? "flex-1 py-1.5 text-xs" : "flex-1 py-2 text-sm"} rounded-xl bg-red-600 text-white font-bold disabled:opacity-40`}
        >
          Confirm reject
        </button>
        <button
          onClick={onCancel}
          className={`${compact ? "px-3 py-1.5 text-xs" : "px-4 py-2 text-sm"} rounded-xl bg-stone-100 font-bold`}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

function statusTone(status: string): "stone" | "green" | "red" | "amber" {
  if (status === "approved" || status === "published" || status === "winner") return "green";
  if (status === "rejected" || status === "failed" || status === "dud" || status === "loser") return "red";
  if (status === "draft_sent" || status === "queued") return "amber";
  return "stone";
}

function Badge({ children, tone = "stone" }: { children: React.ReactNode; tone?: "stone" | "green" | "red" | "amber" }) {
  const tones: Record<string, string> = {
    stone: "bg-stone-200 text-stone-700",
    green: "bg-green-100 text-green-800",
    red: "bg-red-100 text-red-700",
    amber: "bg-amber-100 text-amber-800",
  };
  return <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wide ${tones[tone]}`}>{children}</span>;
}

function countStatus(posts: Post[], status: string): number {
  return posts.filter((p) => p.status === status).length;
}

async function copyText(text: string): Promise<void> {
  await navigator.clipboard.writeText(text);
}

const SITE_URL = "https://remedyrecoveries.com";

function isComingSoonPost(post: Post): boolean {
  return post.prelaunch === true || post.id === 56;
}

function captionForManual(post: Post): string {
  return [post.caption, post.hashtags].filter(Boolean).join("\n\n");
}

async function shareShortToPhotos(postId: number): Promise<void> {
  const res = await fetch(`/api/shorts/${postId}`, { credentials: "include" });
  if (!res.ok) throw new Error("Could not load the Short. Hard-refresh and try again.");
  const blob = await res.blob();
  if (!blob.type.startsWith("video/") && blob.size < 1000) {
    throw new Error("Short file is missing. Hard-refresh and try again.");
  }
  const file = new File([blob], `remedy-${postId}-short.mp4`, { type: "video/mp4" });
  const nav = navigator as Navigator & { canShare?: (data: ShareData) => boolean };
  if (typeof nav.share === "function" && nav.canShare?.({ files: [file] })) {
    await nav.share({ files: [file], title: "Remedy Short" });
    return;
  }
  window.location.href = `/api/shorts/${postId}?download=1`;
}

async function shareSlidesToPhotos(postId: number, count: number): Promise<void> {
  const files: File[] = [];
  for (let i = 0; i < count; i++) {
    const res = await fetch(`/api/slides/${postId}/${i}`, { credentials: "include" });
    if (!res.ok) throw new Error(`Could not load slide ${i + 1}. Hard-refresh and try again.`);
    const blob = await res.blob();
    files.push(
      new File([blob], `remedy-${postId}-slide-${String(i + 1).padStart(2, "0")}.jpg`, { type: "image/jpeg" }),
    );
  }
  const nav = navigator as Navigator & { canShare?: (data: ShareData) => boolean };
  if (typeof nav.share !== "function") {
    window.location.href = `/api/slides/${postId}/0?download=1`;
    return;
  }
  if (nav.canShare?.({ files })) {
    await nav.share({ files, title: "Remedy slides" });
    return;
  }
  for (let start = 0; start < files.length; start += 6) {
    const chunk = files.slice(start, start + 6);
    if (nav.canShare?.({ files: chunk })) {
      await nav.share({ files: chunk, title: "Remedy slides" });
    }
  }
}


function ManualPostKit({
  post,
  remainingAfter,
  onCopied,
  onCompleted,
}: {
  post: Post;
  remainingAfter: number;
  onCopied: (s: string) => void;
  onCompleted: () => Promise<void>;
}) {
  const [savingSlides, setSavingSlides] = useState(false);
  const [savingShort, setSavingShort] = useState(false);
  const [completing, setCompleting] = useState(false);
  const copy = async (text: string, label: string) => {
    await copyText(text);
    onCopied(label);
  };
  const saveSlides = async () => {
    setSavingSlides(true);
    try {
      await shareSlidesToPhotos(post.id, post.slides.length);
      onCopied("Share sheet opened — tap Save Images");
    } catch (err) {
      onCopied(err instanceof Error ? err.message : "Could not save the photos");
    } finally {
      setSavingSlides(false);
    }
  };
  const saveShort = async () => {
    setSavingShort(true);
    try {
      await shareShortToPhotos(post.id);
      onCopied("Share sheet opened — tap Save Video");
    } catch (err) {
      onCopied(err instanceof Error ? err.message : "Could not save the Short");
    } finally {
      setSavingShort(false);
    }
  };
  const markDone = async () => {
    setCompleting(true);
    try {
      await onCompleted();
    } finally {
      setCompleting(false);
    }
  };
  return (
    <div className="bg-white rounded-2xl border-2 border-emerald-200 p-4 space-y-3 lg:p-5">
      <div>
        <p className="text-[11px] font-bold uppercase tracking-wide text-emerald-800">This post</p>
        <p className="text-sm font-bold text-stone-900 mt-0.5">
          #{post.id}
          {isComingSoonPost(post) ? " · coming soon · no App Store link" : ""}
        </p>
        <p className="text-xs text-stone-600 mt-1">
          Save the photos and the silent Short, add music when you post, then tap Mark completed. That deletes the Short to save space.
        </p>
      </div>
      <button
        type="button"
        disabled={savingSlides || post.slides.length === 0}
        onClick={() => saveSlides()}
        className="w-full py-3.5 rounded-xl text-white text-sm font-bold disabled:opacity-40"
        style={{ backgroundColor: GREEN }}
      >
        {savingSlides ? "Loading photos…" : `Save all ${post.slides.length} photos`}
      </button>
      <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(240px,320px)] lg:gap-6 lg:items-start">
        <div className="space-y-3">
          <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1 lg:grid lg:grid-cols-4 xl:grid-cols-5 lg:overflow-visible lg:mx-0 lg:px-0 lg:pb-0">
            {post.slides.map((s) => (
              <a
                key={s.id}
                href={`/api/slides/${post.id}/${s.idx}`}
                target="_blank"
                rel="noreferrer"
                className="shrink-0 w-24 rounded-xl overflow-hidden border border-stone-200 bg-black lg:w-full"
              >
                <img src={s.url} alt={`Slide ${s.idx + 1}`} className="w-full aspect-[9/16] object-cover" />
                <p className="text-center text-[10px] font-bold text-white py-1 bg-stone-900">{s.idx + 1}</p>
              </a>
            ))}
          </div>
        </div>
        <div className="space-y-3 mt-3 lg:mt-0">
          {post.shortUrl ? (
            <div className="space-y-2">
              <video
                src={`/api/shorts/${post.id}`}
                controls
                playsInline
                preload="metadata"
                className="w-full max-w-[220px] mx-auto rounded-xl bg-black lg:max-w-none"
                style={{ aspectRatio: "9 / 16" }}
              />
              <button
                type="button"
                disabled={savingShort}
                onClick={() => saveShort()}
                className="w-full py-3.5 rounded-xl text-white text-sm font-bold disabled:opacity-40"
                style={{ backgroundColor: GREEN }}
              >
                {savingShort ? "Loading video…" : "Save Short to Photos"}
              </button>
              <p className="text-[11px] text-stone-500 text-center">No sound — add viral music when you post.</p>
            </div>
          ) : (
            <p className="text-xs text-stone-500">No Short on this post — photos only.</p>
          )}
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => copy(post.tiktokTitle, "Title copied")}
              className="py-3 rounded-xl bg-stone-100 text-sm font-bold"
            >
              Copy title
            </button>
            <button
              type="button"
              onClick={() => copy(captionForManual(post), "Caption copied")}
              className="py-3 rounded-xl text-white text-sm font-bold"
              style={{ backgroundColor: GREEN }}
            >
              Copy caption
            </button>
          </div>
          <button
            type="button"
            onClick={() => copy(SITE_URL, "Website copied — put this in the bio, not the caption")}
            className="w-full py-2.5 rounded-xl bg-stone-50 border border-stone-200 text-xs font-bold"
          >
            Copy website for bio
          </button>
          <ol className="text-[11px] text-stone-600 space-y-1 list-decimal pl-4">
            <li>Save all photos + the silent Short, then add music when you post.</li>
            <li>Paste the title and caption. Website goes in the bio, not the caption.</li>
            {isComingSoonPost(post) && <li>Do not paste any App Store link.</li>}
          </ol>
          <button
            type="button"
            disabled={completing}
            onClick={() => markDone()}
            className="w-full py-3.5 rounded-xl text-white text-sm font-bold disabled:opacity-40"
            style={{ backgroundColor: GREEN }}
          >
            {completing
              ? "Deleting Short…"
              : remainingAfter > 0
                ? `Mark completed — next reel (${remainingAfter} left)`
                : "Mark completed — queue empty"}
          </button>
        </div>
      </div>
    </div>
  );
}

function buildTemplates(posts: Post[], fromSnap?: TemplateStat[]): TemplateStat[] {
  if (fromSnap && fromSnap.length) return fromSnap;
  const ids = Array.from(new Set(posts.map((p) => p.templateId))).sort();
  return ids.map((id) => {
    const used = posts.filter((p) => p.templateId === id);
    return {
      id,
      name: `Template ${id}`,
      description: "",
      slideKinds: [],
      used: used.length,
      approved: used.filter((p) => ["approved", "draft_sent", "published"].includes(p.status)).length,
      rejected: used.filter((p) => p.status === "rejected").length,
    };
  });
}

function buildPipeline(posts: Post[], fromSnap?: PipelineStep[]): PipelineStep[] {
  if (fromSnap && fromSnap.length) return fromSnap;
  return [
    { id: "queued", label: "Review queue", count: countStatus(posts, "queued") },
    { id: "approved", label: "Approved", count: countStatus(posts, "approved") },
    { id: "draft_sent", label: "Drafts sent", count: countStatus(posts, "draft_sent") },
    { id: "published", label: "Published", count: countStatus(posts, "published") },
    { id: "rejected", label: "Rejected / learned", count: countStatus(posts, "rejected") },
    { id: "failed", label: "Failed", count: countStatus(posts, "failed") },
  ];
}

function buildCalendar(posts: Post[], fromSnap?: CalendarItem[]): CalendarItem[] {
  if (fromSnap && fromSnap.length) return fromSnap;
  return posts
    .filter((p) => p.scheduledAt)
    .sort((a, b) => String(a.scheduledAt).localeCompare(String(b.scheduledAt)))
    .map((p) => ({
      id: p.id,
      hookText: p.hookText,
      templateId: p.templateId,
      status: p.status,
      scheduledAt: p.scheduledAt,
    }));
}

function LoginScreen({ onDone }: { onDone: () => void }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    const res = await api.login(password);
    setBusy(false);
    if (res.ok) onDone();
    else setError(res.error ?? "Login failed.");
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-6" style={{ background: CREAM }}>
      <form onSubmit={submit} className="w-full max-w-sm bg-white rounded-2xl border border-stone-200 p-6 space-y-4">
        <div>
          <h1 className="text-xl font-bold" style={{ color: GREEN }}>
            Remedy Studio
          </h1>
          <p className="text-xs text-stone-500 mt-1">
            Enter the studio password. This browser stays signed in after that.
          </p>
        </div>
        <label className="block text-xs font-semibold text-stone-600">
          Studio password
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2 text-sm font-normal"
            autoComplete="current-password"
            required
          />
        </label>
        {error && <p className="text-xs text-red-600">{error}</p>}
        <button
          type="submit"
          disabled={busy}
          className="w-full rounded-lg py-2 text-sm font-semibold text-white disabled:opacity-60"
          style={{ background: GREEN }}
        >
          {busy ? "Signing in…" : "Enter the studio"}
        </button>
      </form>
    </div>
  );
}

export default function App() {
  const [tab, setTabState] = useState<Tab>(tabFromHash);
  const [imagesSub, setImagesSubState] = useState<ImagesSub>(imagesSubFromHash);
  const [ugcSub, setUgcSubState] = useState<UgcSub>(ugcSubFromHash);
  const [insightsSub, setInsightsSubState] = useState<InsightsSub>(insightsSubFromHash);
  const [me, setMe] = useState<StudioMe>({ email: "", role: "operator", creatorSlug: null });
  const [posts, setPosts] = useState<Post[]>([]);
  const [hooks, setHooks] = useState<Hook[]>([]);
  const [formulas, setFormulas] = useState<Formula[]>([]);
  const [learnings, setLearnings] = useState<Learning[]>([]);
  const [templates, setTemplates] = useState<TemplateStat[]>([]);
  const [pipeline, setPipeline] = useState<PipelineStep[]>([]);
  const [calendar, setCalendar] = useState<CalendarItem[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [mode, setMode] = useState<"live" | "cloud">("cloud");
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [studioId, setStudioId] = useState<number | null>(null);
  const [message, setMessage] = useState("");
  const [needsLogin, setNeedsLogin] = useState(false);

  const applySnapshot = (snap: NonNullable<Awaited<ReturnType<typeof loadSnapshot>>>) => {
    setPosts(snap.posts);
    setHooks(snap.hooks);
    setFormulas(snap.formulas ?? []);
    setLearnings(snap.learnings);
    setTemplates(buildTemplates(snap.posts, snap.templates));
    setPipeline(buildPipeline(snap.posts, snap.pipeline));
    setCalendar(buildCalendar(snap.posts, snap.calendar));
    setSummary(snap.summary);
    setSettings(snap.settings);
    setMode("cloud");
    setUpdatedAt(snap.updatedAt);
  };

  const refresh = useCallback(async () => {
    const who = await api.me();
    if (who.authRequired) {
      setNeedsLogin(true);
      return;
    }
    setNeedsLogin(false);
    const [health, snap] = await Promise.all([
      fetch("/api/health")
        .then(async (r) => (r.ok ? (await r.json()) as { engine?: string; snapshotOnly?: boolean } : null))
        .catch(() => null),
      loadSnapshot(true).catch(() => null),
    ]);
    setMe(who);
    const live = health?.engine === "live" && !health.snapshotOnly;
    if (!live) {
      if (!snap) throw new Error("Failed to load");
      applySnapshot(snap);
      return;
    }
    const [all, h, l, s, st] = await Promise.all([
      api.posts(),
      api.hooks(),
      api.learnings(),
      api.summary(),
      api.settings(),
    ]);
    setPosts(all);
    setHooks(h);
    setLearnings(l);
    setSummary(s);
    setSettings(st);
    setFormulas(snap?.formulas ?? []);
    setTemplates(buildTemplates(all, snap?.templates));
    setPipeline(buildPipeline(all, snap?.pipeline));
    setCalendar(buildCalendar(all, snap?.calendar));
    setMode("live");
    setUpdatedAt(new Date().toISOString());
  }, []);

  useEffect(() => {
    refresh().catch((err) => setMessage(err instanceof Error ? err.message : "Failed to load"));
  }, [refresh]);

  useEffect(() => {
    const onHash = () => {
      setTabState(tabFromHash());
      setImagesSubState(imagesSubFromHash());
      setUgcSubState(ugcSubFromHash());
      setInsightsSubState(insightsSubFromHash());
    };
    window.addEventListener("hashchange", onHash);
    if (window.location.hash) writeHash(tabFromHash(), imagesSubFromHash(), ugcSubFromHash(), insightsSubFromHash());
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  const setTab = (next: Tab) => {
    setTabState(next);
    writeHash(
      next,
      next === "images" ? imagesSub : "all",
      next === "ugc" ? ugcSub : "sohan",
      next === "insights" ? insightsSub : "overview",
    );
  };

  const setImagesSub = (next: ImagesSub) => {
    setImagesSubState(next);
    writeHash("images", next, ugcSub, insightsSub);
  };

  const setUgcSub = (next: UgcSub) => {
    setUgcSubState(next);
    writeHash("ugc", imagesSub, next, insightsSub);
  };

  const setInsightsSub = (next: InsightsSub) => {
    setInsightsSubState(next);
    writeHash("insights", imagesSub, ugcSub, next);
  };

  useEffect(() => {
    if (me.role === "creator" && !CREATOR_TABS.includes(tab)) setTab("insights");
  }, [me.role, tab]);

  const openStudio = (id: number) => {
    setStudioId(id);
    setTab("studio");
  };

  const allTabs: Array<[Tab, string]> = [
    ["review", `Review (${posts.filter((p) => p.status === "queued" && !p.ctaReview).length})`],
    ["images", "Images"],
    ["svgs", "SVGs"],
    ["library", "Library"],
    ["insights", "Insights"],
    ["studio", "Studio"],
    ["ugc", "UGC"],
    ["engine", "Engine"],
    ["settings", "Settings"],
  ];
  const tabs = me.role === "creator" ? allTabs.filter(([id]) => CREATOR_TABS.includes(id)) : allTabs;

  if (needsLogin) {
    return (
      <LoginScreen
        onDone={() => refresh().catch((err) => setMessage(err instanceof Error ? err.message : "Failed to load"))}
      />
    );
  }

  return (
    <div className="min-h-screen lg:flex" style={{ background: CREAM }}>
      <aside className="hidden lg:flex w-60 shrink-0 sticky top-0 h-screen flex-col border-r border-stone-200 bg-white/90 px-4 py-6">
        <h1 className="text-lg font-extrabold tracking-tight px-2" style={{ color: GREEN }}>
          Remedy Growth Engine
        </h1>
        <p className="text-[11px] text-stone-500 px-2 mt-1 mb-6">v20 · Crop descriptions</p>
        <nav className="space-y-1">
          {tabs.map(([id, label]) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={`w-full text-left px-3 py-2.5 rounded-xl text-sm font-semibold ${tab === id ? "text-white" : "text-stone-600 hover:bg-stone-100"}`}
              style={tab === id ? { backgroundColor: GREEN } : undefined}
            >
              {label}
            </button>
          ))}
        </nav>
        <div className="mt-auto px-2">
          <Badge tone={mode === "live" ? "green" : "amber"}>{mode === "live" ? "PC connected" : "Phone / cloud"}</Badge>
        </div>
      </aside>

      <div className="flex-1 min-w-0 pb-20 lg:pb-10">
        <header className="sticky top-0 z-10 px-4 lg:px-8 pt-6 pb-3" style={{ background: `${CREAM}f2`, backdropFilter: "blur(12px)" }}>
          {(settings?.analyticsEnabled !== true || settings?.learningEnabled !== true || settings?.generateEnabled !== true) && (
            <div className="mb-3 rounded-xl px-3 py-2 border border-amber-200/80 bg-amber-50/90 text-amber-900">
              <p className="text-xs font-semibold tracking-wide">
                Hold · analytics and learning are paused
              </p>
              <p className="text-[11px] text-amber-800/80 mt-0.5 leading-snug">
                No metric pulls, diagnosis, or evolve — we cannot track posts yet. Turn this back on at slide.remedyrecoveries.com when you start measuring.
                {settings?.generateEnabled !== true ? " Generate is also paused (no new carousels)." : ""}
              </p>
            </div>
          )}
          <div className="flex items-start justify-between gap-3">
            <div>
              <h1 className="text-xl font-extrabold tracking-tight lg:hidden" style={{ color: GREEN }}>
                {tab === "ugc" ? "UGC" : "Remedy Growth Engine"}
              </h1>
              <h2 className="hidden lg:block text-2xl font-extrabold tracking-tight" style={{ color: GREEN }}>
                {tab === "ugc" ? "UGC" : tabs.find(([id]) => id === tab)?.[1] ?? "Studio"}
              </h2>
              <p className="text-xs text-stone-500">
                {tab === "ugc"
                  ? me.role === "creator"
                    ? "Upload a video. It lands under Your videos."
                    : "Sohan or AI uploads land under Your videos."
                  : `${mode === "live" ? "Live engine on this machine" : "Cloud studio"} · ${posts.length} posts · generate on PC, review anywhere`}
              </p>
            </div>
            <span className="lg:hidden">
              <Badge tone={mode === "live" ? "green" : "amber"}>{mode === "live" ? "PC connected" : "Phone / cloud"}</Badge>
            </span>
          </div>
          {updatedAt && <p className="text-[10px] text-stone-400 mt-1">Updated {new Date(updatedAt).toLocaleString()}</p>}
          {message && <p className="text-xs text-amber-800 mt-2">{message}</p>}
        </header>

        <main className="px-4 lg:px-8">
          {tab === "review" && (
            <ReviewView
              posts={posts}
              pipeline={pipeline}
              live={mode === "live"}
              generateEnabled={settings?.generateEnabled === true}
              settings={settings}
              onRefresh={refresh}
              onOpen={openStudio}
              onMessage={setMessage}
            />
          )}
          {tab === "images" && <ImagesView sub={imagesSub} onSub={setImagesSub} />}
          {tab === "svgs" && <SvgsView />}
          {tab === "library" && <LibraryView posts={posts} templates={templates} calendar={calendar} onOpen={openStudio} />}
          {tab === "insights" && (
            <InsightsView posts={posts} summary={summary} sub={insightsSub} onSub={setInsightsSub} onOpen={openStudio} />
          )}
          {tab === "studio" && (
            <StudioView
              posts={posts}
              focusId={studioId}
              onFocus={setStudioId}
              onBackToReview={() => setTab("review")}
              onRefresh={refresh}
              onMessage={setMessage}
              canEdit={me.role === "operator"}
              generateEnabled={settings?.generateEnabled === true}
              manualCurrentId={settings?.manualPosting?.currentPostId ?? null}
              manualCompletedIds={settings?.manualPosting?.completedIds ?? []}
            />
          )}
          {tab === "ugc" && <UgcView me={me} sub={ugcSub} onSub={setUgcSub} onMessage={setMessage} />}
          {tab === "engine" && (
            <EngineView
              posts={posts}
              hooks={hooks}
              formulas={formulas}
              learnings={learnings}
              templates={templates}
              pipeline={pipeline}
              calendar={calendar}
              summary={summary}
              settings={settings}
              live={mode === "live"}
              onRefresh={refresh}
              onOpen={openStudio}
            />
          )}
          {tab === "settings" && <SettingsView settings={settings} live={mode === "live"} posts={posts} pipeline={pipeline} />}
        </main>
      </div>

      <nav className="lg:hidden fixed bottom-0 inset-x-0 bg-white/95 border-t border-stone-200 flex text-[10px] pb-[env(safe-area-inset-bottom)]">
        {tabs.map(([id, label]) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`flex-1 py-3.5 font-semibold ${tab === id ? "text-white" : "text-stone-500"}`}
            style={tab === id ? { backgroundColor: GREEN } : undefined}
          >
            {id === "review" ? "Review" : id === "ugc" ? "UGC" : label}
          </button>
        ))}
      </nav>
    </div>
  );
}

function nextQueuedId(posts: Post[], currentId: number): number | null {
  const queue = posts.filter((p) => p.status === "queued");
  const idx = queue.findIndex((p) => p.id === currentId);
  if (idx === -1) return queue[0]?.id ?? null;
  return queue[idx + 1]?.id ?? null;
}

function remainingAfterCurrent(posts: Post[], currentId: number | null, completedIds: number[]): number {
  return posts.filter((p) => p.status === "approved" && p.id !== currentId && !completedIds.includes(p.id)).length;
}

async function completeManualReel(postId: number, onMessage: (s: string) => void, onRefresh: () => Promise<void>): Promise<void> {
  const result = await api.completeManual(postId);
  if (!result.ok) throw new Error(result.error ?? "Could not mark completed");
  onMessage(result.currentPostId ? `Next reel is #${result.currentPostId}` : "Queue empty");
  await onRefresh();
}

function ReviewView({
  posts,
  pipeline,
  live,
  generateEnabled,
  settings,
  onRefresh,
  onOpen,
  onMessage,
}: {
  posts: Post[];
  pipeline: PipelineStep[];
  live: boolean;
  generateEnabled: boolean;
  settings: Settings | null;
  onRefresh: () => Promise<void>;
  onOpen: (id: number) => void;
  onMessage: (s: string) => void;
}) {
  const queue = posts.filter((p) => p.status === "queued" && !p.ctaReview);
  const ctaReview = posts.filter((p) => p.ctaReview && p.status === "queued");
  const approved = posts.filter((p) => p.status === "approved");
  const inReview = posts.filter((p) => (p.status === "queued" || p.status === "approved") && !p.ctaReview);
  const shorts = inReview;
  const [reviewSub, setReviewSub] = useState<"queue" | "shorts" | "cta">("queue");
  const [busy, setBusy] = useState(false);
  const [abPromptId, setAbPromptId] = useState<number | null>(null);
  const [abDimension, setAbDimension] = useState<"auto" | TestableDimension>("auto");

  const act = async (fn: () => Promise<unknown>, label: string): Promise<boolean> => {
    setBusy(true);
    try {
      await fn();
      onMessage(label);
      await onRefresh();
      return true;
    } catch (err) {
      onMessage(err instanceof Error ? err.message : "Failed — needs the engine on your PC for this action");
      return false;
    } finally {
      setBusy(false);
    }
  };

  const approvePost = async (post: Post) => {
    const nextId = nextQueuedId(posts, post.id);
    const ok = await act(() => api.approve(post.id), `Approved #${post.id}`);
    if (!ok) return;
    if (nextId != null) onOpen(nextId);
    else if (generateEnabled && !post.experiment) setAbPromptId(post.id);
  };

  const createAbVariant = async () => {
    if (abPromptId === null) return;
    const dim = abDimension === "auto" ? undefined : abDimension;
    setBusy(true);
    try {
      const result = await api.createVariant(abPromptId, dim);
      if (!result.ok) throw new Error(result.error ?? "Variant failed");
      onMessage(
        result.queued
          ? "A/B variant queued — it will be generated when the PC engine syncs."
          : `A/B variant #${result.variantPostId} created (testing ${result.dimension}) — review it in the queue.`,
      );
      await onRefresh();
    } catch (err) {
      onMessage(err instanceof Error ? err.message : "Variant failed");
    } finally {
      setBusy(false);
      setAbPromptId(null);
      setAbDimension("auto");
    }
  };

  const currentId = settings?.manualPosting?.currentPostId ?? null;
  const completedIds = settings?.manualPosting?.completedIds ?? [];
  const current = currentId != null ? posts.find((p) => p.id === currentId) : undefined;

  return (
    <div className="space-y-4">
      {current ? (
        <ManualPostKit
          post={current}
          remainingAfter={remainingAfterCurrent(posts, current.id, completedIds)}
          onCopied={onMessage}
          onCompleted={() => completeManualReel(current.id, onMessage, onRefresh)}
        />
      ) : (
        <div className="lg:hidden bg-white rounded-2xl border border-stone-200 p-4">
          <p className="text-sm font-bold text-stone-900">Nothing left to post</p>
          <p className="text-xs text-stone-500 mt-1">When the next carousel is ready, it will show up here.</p>
        </div>
      )}
      <div className="hidden lg:block space-y-4">
      <div className="grid grid-cols-3 md:grid-cols-6 gap-2">
        {pipeline.map((step) => (
          <div key={step.id} className="bg-white rounded-xl p-2 text-center border border-stone-200">
            <div className="text-lg font-extrabold">{step.count}</div>
            <div className="text-[9px] uppercase tracking-wide text-stone-500">{step.label}</div>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          disabled={busy || queue.length === 0}
          onClick={() => act(() => api.approveAll(), `Approved ${queue.length}`)}
          className="flex-1 lg:flex-none lg:px-6 py-3 rounded-xl text-white font-bold disabled:opacity-40"
          style={{ backgroundColor: GREEN }}
        >
          Approve all
        </button>
        <button
          disabled={busy || !live || !generateEnabled}
          onClick={() => act(() => api.generate(), "Generating… this takes a few minutes")}
          className="px-4 py-3 rounded-xl bg-stone-800 text-white font-bold disabled:opacity-40"
          title={generateEnabled ? "Generate a new batch on this PC" : "Generate is paused"}
        >
          Generate
        </button>
        <button
          disabled={busy || !live || approved.length === 0}
          onClick={() =>
            act(async () => {
              const res = await api.sendDrafts();
              if (!res.ok) throw new Error("Send failed — needs the PC engine");
              if (res.failed) throw new Error(`${res.sent} sent, ${res.failed} failed`);
            }, `Sent ${approved.length} live`)
          }
          className="px-4 py-3 rounded-xl bg-stone-100 text-stone-800 font-bold disabled:opacity-40"
        >
          Send now
        </button>
      </div>
      <div className="flex gap-1">
        {(
          [
            ["queue", `Queue (${queue.length})`],
            ["cta", `CTA (${ctaReview.length})`],
            ["shorts", `YouTube Shorts (${shorts.length})`],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setReviewSub(id)}
            className={`px-3 py-1.5 rounded-full text-[11px] font-bold ${reviewSub === id ? "text-white" : "bg-white border border-stone-200"}`}
            style={reviewSub === id ? { backgroundColor: GREEN } : undefined}
          >
            {label}
          </button>
        ))}
      </div>
      {!live && (
        <p className="text-[11px] text-stone-500">
          Cloud studio: approve, reject, and library edits save immediately. Generate still runs on your PC. Auto-post is off.
        </p>
      )}

      {abPromptId !== null && generateEnabled && (
        <div className="bg-white rounded-2xl border-2 p-4 space-y-2" style={{ borderColor: GREEN }}>
          <p className="text-sm font-bold">Approved #{abPromptId} — create an A/B variant?</p>
          <p className="text-[11px] text-stone-500">
            Same post with exactly ONE change, posted 24-48h apart. The result becomes a signal the engine learns from.
          </p>
          <div className="flex flex-wrap gap-2 items-center">
            <select
              value={abDimension}
              onChange={(ev) => setAbDimension(ev.target.value as "auto" | TestableDimension)}
              className="rounded-lg border border-stone-200 px-2 py-2 text-xs font-semibold bg-white"
            >
              <option value="auto">Auto (least-tested)</option>
              <option value="hook">Different hook</option>
              <option value="template">Different template</option>
              <option value="asset">Different screenshots</option>
              <option value="visual">Different visual style</option>
              <option value="music">Different YouTube music</option>
              <option value="shot_scale">Different screenshot size</option>
            </select>
            <button
              disabled={busy}
              onClick={createAbVariant}
              className="px-4 py-2 rounded-lg text-white text-xs font-bold disabled:opacity-40"
              style={{ backgroundColor: GREEN }}
            >
              Create variant
            </button>
            <button onClick={() => { setAbPromptId(null); setAbDimension("auto"); }} className="px-3 py-2 rounded-lg bg-stone-100 text-xs font-bold">
              Skip
            </button>
          </div>
        </div>
      )}

      {reviewSub === "cta" && (
        <section className="space-y-3">
          <div>
            <h2 className="text-sm font-bold text-stone-900">New last-slide options</h2>
            <p className="text-[11px] text-stone-500 mt-1">
              Gallery of last-slide layouts. New posts pick the best match for the hook — these stay in this tab and do not replace This post.
            </p>
          </div>
          {ctaReview.length === 0 ? (
            <p className="text-sm text-stone-500">No CTA options in review yet.</p>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {ctaReview.map((post) => {
                const last = post.slides[post.slides.length - 1];
                return (
                  <button
                    key={post.id}
                    type="button"
                    onClick={() => onOpen(post.id)}
                    className="text-left bg-white rounded-2xl border border-stone-200 overflow-hidden"
                  >
                    {last?.url ? (
                      <img src={last.url} alt="" className="w-full bg-stone-100 object-cover" style={{ aspectRatio: "4 / 5" }} />
                    ) : (
                      <div className="w-full bg-stone-100" style={{ aspectRatio: "4 / 5" }} />
                    )}
                    <div className="p-3 space-y-1">
                      <p className="text-[10px] font-bold uppercase tracking-wide text-emerald-800">
                        {post.ctaLayoutLabel ?? post.ctaLayout ?? "CTA"} · #{post.id}
                      </p>
                      <p className="text-sm font-bold leading-snug">{last?.headline || "Remedy"}</p>
                      <p className="text-xs text-stone-500">{last?.sub || "Coming soon on the App Store"}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </section>
      )}

      {reviewSub === "queue" && (
        <>
          <div className="lg:grid lg:grid-cols-2 xl:grid-cols-3 lg:gap-4">
            {queue.map((post) => (
              <PostCard
                key={post.id}
                post={post}
                busy={busy}
                onOpen={onOpen}
                onApprove={() => approvePost(post)}
                onReject={(reason) => act(() => api.reject(post.id, reason), `Rejected #${post.id}`)}
              />
            ))}
          </div>
          {queue.length === 0 && <p className="text-sm text-stone-500 text-center lg:text-left py-6">Queue is clear.</p>}

          {approved.length > 0 && (
            <section>
              <h2 className="text-xs font-bold uppercase tracking-wide text-stone-500 mb-2">Approved — ready to send live</h2>
              <div className="lg:grid lg:grid-cols-2 xl:grid-cols-3 lg:gap-4">
                {approved.map((post) => (
                  <PostCard key={post.id} post={post} busy={busy} onOpen={onOpen} />
                ))}
              </div>
            </section>
          )}
        </>
      )}

      {reviewSub === "shorts" && (
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2 items-center">
            <button
              disabled={busy}
              onClick={() =>
                act(async () => {
                  const res = await api.buildShorts();
                  if (!res.ok) throw new Error(res.error ?? "Build failed — needs the PC engine");
                }, "Building YouTube Shorts…")
              }
              className="px-4 py-2 rounded-xl bg-stone-800 text-white text-xs font-bold disabled:opacity-40"
            >
              Build missing Shorts
            </button>
            <p className="text-[11px] text-stone-500">
              In-review carousels only. Shorts are silent so you can add music when you post.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {shorts.map((post) => (
              <div key={post.id} className="bg-white rounded-2xl border border-stone-200 overflow-hidden">
                {post.shortUrl ? (
                  <video
                    src={post.shortUrl}
                    controls
                    playsInline
                    preload="metadata"
                    className="w-full bg-black"
                    style={{ aspectRatio: "9 / 16" }}
                  />
                ) : (
                  <div className="w-full bg-stone-100 flex items-center justify-center text-xs text-stone-500" style={{ aspectRatio: "9 / 16" }}>
                    Preview not built yet
                  </div>
                )}
                <div className="p-3 space-y-1">
                  <p className="text-xs font-bold text-stone-800">#{post.id} · {post.status}</p>
                  <p className="text-sm font-semibold leading-snug">{post.hookText}</p>
                  <p className="text-[11px] text-stone-500">
                    {post.shortBedLabel && post.shortBedLabel !== "No sound"
                      ? `YouTube music: ${post.shortBedLabel}`
                      : "No sound — add music when you post"}
                  </p>
                  <button type="button" onClick={() => onOpen(post.id)} className="text-xs font-bold" style={{ color: GREEN }}>
                    Open in Studio
                  </button>
                </div>
              </div>
            ))}
            {shorts.length === 0 && (
              <p className="text-sm text-stone-500 col-span-full py-6">
                Nothing in review. Approve or generate carousels — each one gets a silent 9:16 Short.
              </p>
            )}
          </div>
        </div>
      )}
      </div>
    </div>
  );
}

function PostCard({
  post,
  busy,
  onOpen,
  onApprove,
  onReject,
}: {
  post: Post;
  busy: boolean;
  onOpen: (id: number) => void;
  onApprove?: () => void;
  onReject?: (reason?: string) => void;
}) {
  const cover = post.slides[0]?.url;
  const [rejecting, setRejecting] = useState(false);
  const [rejectReason, setRejectReason] = useState("");

  const handleReject = () => {
    onReject?.(rejectReason.trim() || undefined);
    setRejecting(false);
    setRejectReason("");
  };

  return (
    <div className="bg-white rounded-2xl p-4 shadow-sm border border-stone-200 mb-3 lg:mb-0 lg:flex lg:gap-4 lg:items-start">
      <div className="lg:flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <Badge tone={statusTone(post.status)}>{post.status.replace("_", " ")}</Badge>
          <Badge>Template {post.templateId}</Badge>
          {post.shotScale && <Badge>{post.shotScale}</Badge>}
          <Badge tone={post.confidence >= 65 ? "green" : "stone"}>conf {post.confidence.toFixed(0)}</Badge>
          {post.hookSource === "evolved" && <Badge tone="amber">evolved</Badge>}
          {post.experiment && <Badge tone="amber">A/B with #{post.experiment.partnerId}</Badge>}
          {post.scheduledAt && <Badge>{new Date(post.scheduledAt).toLocaleString()}</Badge>}
        </div>
        <p className="font-bold mt-2 leading-snug">{post.hookText}</p>
        <p className="text-xs text-stone-500 line-clamp-2 mt-2 hidden lg:block">{post.caption}</p>
        <div className="hidden lg:flex gap-2 mt-3">
          {onApprove && (
            <button disabled={busy} onClick={onApprove} className="px-4 py-2 rounded-lg text-white text-sm font-semibold disabled:opacity-40" style={{ backgroundColor: GREEN }}>
              Approve
            </button>
          )}
          {onReject && !rejecting && (
            <button disabled={busy} onClick={() => setRejecting(true)} className="px-4 py-2 rounded-lg bg-stone-200 text-sm font-semibold disabled:opacity-40">
              Reject
            </button>
          )}
        </div>
        {onReject && rejecting && (
          <div className="hidden lg:block mt-2">
            <RejectReasonEditor
              value={rejectReason}
              onChange={setRejectReason}
              onConfirm={handleReject}
              onCancel={() => { setRejecting(false); setRejectReason(""); }}
              busy={busy}
              compact
            />
          </div>
        )}
      </div>
      <button type="button" onClick={() => onOpen(post.id)} className="block w-full lg:w-40 lg:shrink-0 mt-2 lg:mt-0 text-left">
        {cover ? (
          <img src={cover} alt="" loading="lazy" className="w-full rounded-xl border border-stone-200 object-cover max-h-[420px] lg:max-h-none lg:aspect-[4/5]" />
        ) : (
          <div className="h-40 lg:h-auto lg:aspect-[4/5] rounded-xl bg-stone-100" />
        )}
        <p className="text-[11px] text-stone-500 mt-1">{post.slides.length} slides · tap for studio</p>
      </button>
      <p className="text-xs text-stone-500 line-clamp-2 mt-2 lg:hidden">{post.caption}</p>
      <div className="flex gap-2 mt-3 lg:hidden">
        {onApprove && (
          <button disabled={busy} onClick={onApprove} className="flex-1 py-2 rounded-lg text-white text-sm font-semibold disabled:opacity-40" style={{ backgroundColor: GREEN }}>
            Approve
          </button>
        )}
        {onReject && !rejecting && (
          <button disabled={busy} onClick={() => setRejecting(true)} className="flex-1 py-2 rounded-lg bg-stone-200 text-sm font-semibold disabled:opacity-40">
            Reject
          </button>
        )}
      </div>
      {onReject && rejecting && (
        <div className="lg:hidden mt-2">
          <RejectReasonEditor
            value={rejectReason}
            onChange={setRejectReason}
            onConfirm={handleReject}
            onCancel={() => { setRejecting(false); setRejectReason(""); }}
            busy={busy}
            compact
          />
        </div>
      )}
    </div>
  );
}

function LibraryView({
  posts,
  templates,
  calendar,
  onOpen,
}: {
  posts: Post[];
  templates: TemplateStat[];
  calendar: CalendarItem[];
  onOpen: (id: number) => void;
}) {
  const [filter, setFilter] = useState("all");
  const [template, setTemplate] = useState("all");
  const shown = posts.filter((p) => (filter === "all" || p.status === filter) && (template === "all" || p.templateId === template));

  return (
    <div className="space-y-3">
      {calendar.length > 0 && (
        <section className="bg-white rounded-2xl border border-stone-200 p-3">
          <h2 className="text-xs font-bold uppercase tracking-wide text-stone-500 mb-2">Scheduled</h2>
          <div className="flex gap-2 overflow-x-auto">
            {calendar.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => onOpen(item.id)}
                className="min-w-[160px] text-left rounded-xl border border-stone-200 p-2"
              >
                <Badge tone={statusTone(item.status)}>{item.status.replace("_", " ")}</Badge>
                <p className="text-[11px] font-bold mt-1 line-clamp-2">{item.hookText}</p>
                <p className="text-[10px] text-stone-400 mt-1">{item.scheduledAt ? new Date(item.scheduledAt).toLocaleString() : "unscheduled"}</p>
              </button>
            ))}
          </div>
        </section>
      )}

      <div className="flex gap-1 overflow-x-auto pb-1">
        {["all", "queued", "approved", "draft_sent", "rejected", "published", "failed"].map((s) => (
          <button
            key={s}
            onClick={() => setFilter(s)}
            className={`px-3 py-1.5 rounded-full text-[11px] font-bold whitespace-nowrap ${filter === s ? "text-white" : "bg-white text-stone-600 border border-stone-200"}`}
            style={filter === s ? { backgroundColor: GREEN } : undefined}
          >
            {s.replace("_", " ")}
          </button>
        ))}
      </div>
      <div className="flex gap-1 overflow-x-auto pb-1">
        <button
          onClick={() => setTemplate("all")}
          className={`px-3 py-1.5 rounded-full text-[11px] font-bold ${template === "all" ? "text-white" : "bg-white text-stone-600 border border-stone-200"}`}
          style={template === "all" ? { backgroundColor: GREEN } : undefined}
        >
          All templates
        </button>
        {templates.map((t) => (
          <button
            key={t.id}
            onClick={() => setTemplate(t.id)}
            className={`px-3 py-1.5 rounded-full text-[11px] font-bold ${template === t.id ? "text-white" : "bg-white text-stone-600 border border-stone-200"}`}
            style={template === t.id ? { backgroundColor: GREEN } : undefined}
          >
            {t.id} · {t.used}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2 lg:gap-3">
        {shown.map((p) => (
          <button key={p.id} type="button" onClick={() => onOpen(p.id)} className="bg-white rounded-xl overflow-hidden border border-stone-200 text-left">
            <img src={p.slides[0]?.url} alt="" loading="lazy" className="w-full aspect-[4/5] object-cover bg-stone-100" />
            <div className="p-2">
              <Badge tone={statusTone(p.status)}>{p.status.replace("_", " ")}</Badge>
              <p className="text-xs font-bold mt-1 line-clamp-2">{p.hookText}</p>
            </div>
          </button>
        ))}
      </div>
      {shown.length === 0 && <p className="text-sm text-stone-500 text-center py-8">Nothing in this filter.</p>}
    </div>
  );
}

function StudioView({
  posts,
  focusId,
  onFocus,
  onBackToReview,
  onRefresh,
  onMessage,
  canEdit = true,
  generateEnabled = false,
  manualCurrentId = null,
  manualCompletedIds = [],
}: {
  posts: Post[];
  focusId: number | null;
  onFocus: (id: number) => void;
  onBackToReview: () => void;
  onRefresh: () => Promise<void>;
  onMessage: (s: string) => void;
  canEdit?: boolean;
  generateEnabled?: boolean;
  manualCurrentId?: number | null;
  manualCompletedIds?: number[];
}) {
  const start = posts.find((p) => p.id === focusId) ?? posts[0];
  const [postId, setPostId] = useState(start?.id ?? 0);
  const [busy, setBusy] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [abDimension, setAbDimension] = useState<"auto" | TestableDimension>("auto");
  const post = posts.find((p) => p.id === postId) ?? start;
  const queued = canEdit && post?.status === "queued";

  useEffect(() => {
    if (focusId != null) setPostId(focusId);
  }, [focusId]);

  const selectPost = (id: number) => {
    setPostId(id);
    onFocus(id);
    setRejecting(false);
    setRejectReason("");
  };

  const act = async (fn: () => Promise<unknown>, label: string) => {
    setBusy(true);
    try {
      await fn();
      onMessage(label);
      setRejecting(false);
      setRejectReason("");
      await onRefresh();
    } catch (err) {
      onMessage(err instanceof Error ? err.message : "Failed — needs the engine on your PC for this action");
    } finally {
      setBusy(false);
    }
  };

  const approveAndAdvance = async () => {
    if (!post) return;
    const nextId = nextQueuedId(posts, post.id);
    setBusy(true);
    try {
      await api.approve(post.id);
      onMessage(`Approved #${post.id}`);
      setRejecting(false);
      setRejectReason("");
      await onRefresh();
      if (nextId != null && nextId !== post.id) selectPost(nextId);
      else onBackToReview();
    } catch (err) {
      onMessage(err instanceof Error ? err.message : "Failed — needs the engine on your PC for this action");
    } finally {
      setBusy(false);
    }
  };

  if (!post) return <p className="text-sm text-stone-500 py-8 text-center">No posts yet.</p>;

  const actions = queued ? (
    <div className="space-y-2">
      <div className="flex gap-2">
        <button
          disabled={busy}
          onClick={() => approveAndAdvance()}
          className="flex-1 py-2.5 rounded-xl text-white text-sm font-bold disabled:opacity-40"
          style={{ backgroundColor: GREEN }}
        >
          Approve
        </button>
        {!rejecting && (
          <button
            disabled={busy}
            onClick={() => setRejecting(true)}
            className="flex-1 py-2.5 rounded-xl bg-stone-200 text-sm font-bold disabled:opacity-40"
          >
            Reject
          </button>
        )}
      </div>
      {rejecting && (
        <RejectReasonEditor
          value={rejectReason}
          onChange={setRejectReason}
          onConfirm={() => act(() => api.reject(post.id, rejectReason.trim() || undefined), `Rejected #${post.id}`)}
          onCancel={() => { setRejecting(false); setRejectReason(""); }}
          busy={busy}
        />
      )}
    </div>
  ) : null;

  const canAb = generateEnabled && canEdit && post && ["queued", "approved"].includes(post.status) && !post.experiment;
  const abSection = canAb ? (
    <div className="rounded-xl border border-stone-200 p-3 space-y-2">
      <p className="text-xs font-bold">A/B test this post</p>
      <p className="text-[11px] text-stone-500">Creates a variant with ONE change, scheduled 24-48h after this one.</p>
      <div className="flex gap-2">
        <select
          value={abDimension}
          onChange={(ev) => setAbDimension(ev.target.value as "auto" | TestableDimension)}
          className="flex-1 rounded-lg border border-stone-200 px-2 py-2 text-xs font-semibold bg-white"
        >
          <option value="auto">Auto (least-tested)</option>
          <option value="hook">Different hook</option>
          <option value="template">Different template</option>
          <option value="asset">Different screenshots</option>
          <option value="visual">Different visual style</option>
          <option value="music">Different YouTube music</option>
          <option value="shot_scale">Different screenshot size</option>
        </select>
        <button
          disabled={busy}
          onClick={() =>
            act(async () => {
              const result = await api.createVariant(post.id, abDimension === "auto" ? undefined : abDimension);
              if (!result.ok) throw new Error(result.error ?? "Variant failed");
            }, `A/B variant requested for #${post.id}`)
          }
          className="px-4 py-2 rounded-lg text-white text-xs font-bold disabled:opacity-40"
          style={{ backgroundColor: GREEN }}
        >
          Create variant
        </button>
      </div>
    </div>
  ) : null;

  return (
    <div className="space-y-3">
      <div className="flex gap-2 overflow-x-auto">
        {posts.map((p) => (
          <button
            key={p.id}
            onClick={() => selectPost(p.id)}
            className={`px-3 py-1.5 rounded-full text-[11px] font-bold whitespace-nowrap ${p.id === post.id ? "text-white" : "bg-white border border-stone-200"}`}
            style={p.id === post.id ? { backgroundColor: GREEN } : undefined}
          >
            #{p.id} {p.templateId}
          </button>
        ))}
      </div>
      <div className="lg:grid lg:grid-cols-[380px_minmax(0,1fr)] lg:gap-6 lg:items-start">
      <div className="bg-black rounded-2xl overflow-hidden lg:sticky lg:top-24">
        <div key={post.id} className="max-h-[70vh] lg:max-h-[78vh] overflow-y-auto snap-y snap-mandatory">
          {post.slides.map((s) => (
            <figure key={s.id} className="snap-start">
              <img src={s.url} alt={s.headline} className="w-full" />
              {(s.headline || s.kind) && (
                <figcaption className="px-3 py-2 text-[11px] text-stone-300 bg-black">
                  {s.idx + 1}. {s.kind}
                  {s.headline ? ` · ${s.headline}` : ""}
                </figcaption>
              )}
            </figure>
          ))}
        </div>
      </div>
      <div className="bg-white rounded-2xl p-4 border border-stone-200 space-y-3 mt-3 lg:mt-0">
        {actions}
        {abSection}
        <div className="flex gap-2 flex-wrap">
          <Badge tone={statusTone(post.status)}>{post.status.replace("_", " ")}</Badge>
          <Badge>Template {post.templateId}</Badge>
          {post.shotScaleLabel && <Badge>{post.shotScale}: {post.shotScaleLabel}</Badge>}
          <Badge>{post.slides.length} slides</Badge>
          <Badge tone={post.confidence >= 65 ? "green" : "stone"}>conf {post.confidence.toFixed(0)}</Badge>
          {post.experiment && <Badge tone="amber">A/B with #{post.experiment.partnerId}</Badge>}
        </div>
        <p className="font-bold">{post.hookText}</p>
        <p className="text-sm text-stone-600">{post.tiktokTitle}</p>
        <p className="text-xs text-stone-500 whitespace-pre-wrap">{post.caption}</p>
        <p className="text-xs text-stone-400">{post.hashtags}</p>
        {post.analytics.length > 0 && (
          <div className="grid grid-cols-3 gap-2 pt-2">
            {["views", "likes", "saves"].map((k) => {
              const n = post.analytics.reduce((sum, a) => sum + Number(a[k as keyof typeof a] ?? 0), 0);
              return (
                <div key={k} className="rounded-xl bg-stone-50 p-2 text-center">
                  <div className="text-sm font-extrabold">{n}</div>
                  <div className="text-[9px] uppercase text-stone-500">{k}</div>
                </div>
              );
            })}
          </div>
        )}
        {post && post.id === manualCurrentId && (
          <ManualPostKit
            post={post}
            remainingAfter={remainingAfterCurrent(posts, post.id, manualCompletedIds)}
            onCopied={onMessage}
            onCompleted={() => completeManualReel(post.id, onMessage, onRefresh)}
          />
        )}
        <button type="button" onClick={() => copyText(captionForManual(post))} className="w-full py-2.5 rounded-xl bg-stone-800 text-white text-sm font-bold">
          Copy caption + hashtags
        </button>
        {post && !isComingSoonPost(post) && (
          <button type="button" onClick={() => copyText(APP_STORE_URL)} className="w-full py-2.5 rounded-xl bg-stone-100 text-sm font-bold">
            Copy App Store link
          </button>
        )}
      </div>
      </div>
    </div>
  );
}

const MECHANISM_META: Record<string, { label: string; why: string }> = {
  punchy: { label: "Pattern interrupt", why: "1–2 lines on mute. Blunt beats polished. Specific beats short." },
  callout: { label: "Self-diagnosis", why: "'If you…' names the viewer. 2x stronger on TikTok." },
  mistake: { label: "Mistake / stop", why: "Loss aversion. Forces a self-audit they have to resolve." },
  open_loop: { label: "Undefined this", why: "Gap only closes by swiping. 'This', 'the one', slide N." },
  listicle: { label: "Numbered list", why: "Carousel king. Needs a twist so swipe has a job." },
  contrarian: { label: "Trusted = dangerous", why: "Common advice is the problem. Comments + swipes." },
  story: { label: "Mid-story", why: "Start in the middle. Brain needs the ending." },
  result: { label: "Result first", why: "Payoff before method. Specific beats vague." },
  constraint: { label: "Constraint filter", why: "15 min / no gym / 3 days does the targeting." },
  identity: { label: "POV / identity", why: "Drops them into a scene or tribe." },
  how_to: { label: "Do this instead", why: "Swap / routine. Pre-handle the objection." },
  wish_i_knew: { label: "Wish I knew", why: "Hindsight as a gift. Huge save format." },
  save_bait: { label: "Save this if", why: "Primes the save before they evaluate." },
  permission: { label: "You don't need", why: "Relief. Removes the expensive path." },
  relatable: { label: "Shared wince", why: "One specific moment. Recognition stops the thumb." },
  challenge: { label: "Follow along", why: "Day 1 / N days. Native series behavior." },
  stat_based: { label: "Hard number", why: "Concrete numbers feel measured." },
  myth_bust: { label: "Myth / fact", why: "Two-beat contrast. Fast to read." },
  problem_solution: { label: "Problem named", why: "Names the pain. Weak unless the usual fix is wrong." },
  curiosity: { label: "Curiosity gap", why: "Legacy open loop." },
  transformation: { label: "Before / after", why: "Legacy result." },
  social_proof: { label: "Borrowed authority", why: "PT / bandwagon. Easy to sound like an ad." },
};

function hookWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function HooksBankView({
  hooks,
  formulas,
  hookFilter,
  onFilter,
}: {
  hooks: Hook[];
  formulas: Formula[];
  hookFilter: string;
  onFilter: (next: string) => void;
}) {
  const unused = hooks.filter((h) => h.status === "candidate");
  const short = hooks.filter((h) => hookWords(h.text) <= 6);
  const categories = Array.from(new Set(hooks.map((h) => h.category)));
  const visible = hooks
    .filter((h) => {
      if (hookFilter === "unused") return h.status === "candidate";
      if (hookFilter === "short") return hookWords(h.text) <= 6;
      if (hookFilter === "all") return true;
      return h.category === hookFilter;
    })
    .sort((a, b) => {
      if (a.status === "candidate" && b.status !== "candidate") return -1;
      if (b.status === "candidate" && a.status !== "candidate") return 1;
      return b.id - a.id;
    });
  const formulasByCat = new Map<string, Formula[]>();
  for (const f of formulas) {
    const list = formulasByCat.get(f.category) ?? [];
    list.push(f);
    formulasByCat.set(f.category, list);
  }

  return (
    <>
      <section className="bg-white rounded-2xl p-4 border border-stone-200 space-y-3">
        <div>
          <h2 className="font-bold text-sm">Hook system</h2>
          <p className="text-xs text-stone-500 mt-1 leading-relaxed">
            First slide = mute thumbnail. Name the avatar or the back-pain problem so the algorithm
            can classify it. 1–2 lines. Vague “this” / save / slide-N lines are last-resort.
          </p>
        </div>
        <div className="grid grid-cols-3 gap-2">
          {[
            [String(hooks.length), "in bank"],
            [String(unused.length), "unused"],
            [String(short.length), "≤6 words"],
          ].map(([n, label]) => (
            <div key={label} className="rounded-xl bg-stone-50 px-3 py-2">
              <div className="text-xl font-extrabold">{n}</div>
              <div className="text-[10px] uppercase tracking-wide text-stone-500">{label}</div>
            </div>
          ))}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {(
            [
              ["unused", `Unused (${unused.length})`],
              ["short", `Short (${short.length})`],
              ["all", `All (${hooks.length})`],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => onFilter(id)}
              className={`text-[11px] font-bold px-2.5 py-1 rounded-full border ${
                hookFilter === id ? "bg-stone-900 text-white border-stone-900" : "bg-white text-stone-600 border-stone-200"
              }`}
            >
              {label}
            </button>
          ))}
          {categories.map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => onFilter(cat)}
              className={`text-[11px] font-semibold px-2.5 py-1 rounded-full border ${
                hookFilter === cat ? "bg-stone-900 text-white border-stone-900" : "bg-white text-stone-600 border-stone-200"
              }`}
            >
              {MECHANISM_META[cat]?.label ?? cat}
            </button>
          ))}
        </div>
      </section>

      <section className="bg-white rounded-2xl p-4 border border-stone-200">
        <h2 className="font-bold text-sm mb-1">Mechanics</h2>
        <p className="text-[11px] text-stone-500 mb-3">Why each type stops the scroll — used to write, not just label.</p>
        <div className="grid md:grid-cols-2 gap-2">
          {Object.entries(MECHANISM_META)
            .filter(([id]) => !["problem_solution", "curiosity", "transformation", "social_proof"].includes(id))
            .map(([id, meta]) => (
              <button
                key={id}
                type="button"
                onClick={() => onFilter(id)}
                className="text-left rounded-xl border border-stone-100 px-3 py-2 hover:border-stone-300"
              >
                <p className="text-xs font-bold">{meta.label}</p>
                <p className="text-[11px] text-stone-500 leading-snug">{meta.why}</p>
              </button>
            ))}
        </div>
      </section>

      <section className="bg-white rounded-2xl p-4 border border-stone-200">
        <h2 className="font-bold text-sm mb-2">
          Bank <span className="text-stone-400 font-semibold">({visible.length})</span>
        </h2>
        {visible.length === 0 && <p className="text-xs text-stone-500">Nothing in this filter.</p>}
        {visible.map((h) => (
          <div key={h.id} className="py-2 border-b border-stone-100 last:border-0 flex justify-between gap-3">
            <div>
              <p className="text-sm font-semibold leading-tight">{h.text}</p>
              <p className="text-[10px] text-stone-500">
                {MECHANISM_META[h.category]?.label ?? h.category} · {hookWords(h.text)}w · {h.source}
              </p>
            </div>
            <div className="text-right shrink-0">
              <Badge tone={statusTone(h.status)}>{h.status}</Badge>
              <div className="text-xs font-bold mt-1">{h.score.toFixed(1)}</div>
            </div>
          </div>
        ))}
      </section>

      {formulas.length > 0 && (
        <section className="bg-white rounded-2xl p-4 border border-stone-200">
          <h2 className="font-bold text-sm mb-2">Formulas</h2>
          {Array.from(formulasByCat.entries()).map(([cat, list]) => (
            <div key={cat} className="mb-3 last:mb-0">
              <p className="text-[11px] font-bold uppercase tracking-wide text-stone-400 mb-1">
                {MECHANISM_META[cat]?.label ?? cat}
              </p>
              {list.map((f) => (
                <div key={f.id} className="py-1.5 border-b border-stone-50 last:border-0">
                  <div className="flex justify-between gap-3">
                    <p className="text-sm font-medium">{f.template}</p>
                    <span className="text-xs font-bold shrink-0">{f.score.toFixed(1)}</span>
                  </div>
                  {f.notes && <p className="text-[10px] text-stone-400">{f.notes}</p>}
                </div>
              ))}
            </div>
          ))}
        </section>
      )}
    </>
  );
}

function EngineView({
  posts,
  hooks,
  formulas,
  learnings,
  templates,
  pipeline,
  calendar,
  summary,
  settings,
  live,
  onRefresh,
  onOpen,
}: {
  posts: Post[];
  hooks: Hook[];
  formulas: Formula[];
  learnings: Learning[];
  templates: TemplateStat[];
  pipeline: PipelineStep[];
  calendar: CalendarItem[];
  summary: Summary | null;
  settings: Settings | null;
  live: boolean;
  onRefresh: () => Promise<void>;
  onOpen: (id: number) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [pane, setPane] = useState<"pipeline" | "hooks" | "templates" | "learn">("pipeline");
  const [hookFilter, setHookFilter] = useState<"unused" | "short" | "all" | string>("unused");
  const count = (arr: Array<{ count: number }> | undefined, match: (x: { status?: string; diagnosis?: string }) => boolean) =>
    (arr as Array<{ status?: string; diagnosis?: string; count: number }> | undefined)?.filter(match).reduce((s, x) => s + x.count, 0) ?? 0;

  return (
    <div className="space-y-4">
      <div className="flex gap-1 overflow-x-auto">
        {(
          [
            ["pipeline", "Pipeline"],
            ["hooks", "Hooks"],
            ["templates", "Templates"],
            ["learn", "Learn"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            onClick={() => setPane(id)}
            className={`px-3 py-1.5 rounded-full text-[11px] font-bold ${pane === id ? "text-white" : "bg-white border border-stone-200"}`}
            style={pane === id ? { backgroundColor: GREEN } : undefined}
          >
            {label}
          </button>
        ))}
      </div>

      {pane === "pipeline" && (
        <>
          <div className="flex gap-2">
            <button
              disabled={busy || !live || settings?.analyticsEnabled !== true}
              onClick={async () => {
                setBusy(true);
                try {
                  await api.pullAnalytics();
                  await onRefresh();
                } finally {
                  setBusy(false);
                }
              }}
              className="flex-1 py-2.5 rounded-xl bg-stone-800 text-white text-sm font-bold disabled:opacity-40"
              title={settings?.analyticsEnabled === true ? "Pull BrightBean metrics" : "Analytics is paused"}
            >
              Pull analytics
            </button>
            <button
              disabled={busy || !live}
              onClick={async () => {
                setBusy(true);
                try {
                  await api.runCycle();
                  await onRefresh();
                } finally {
                  setBusy(false);
                }
              }}
              className="flex-1 py-2.5 rounded-xl text-white text-sm font-bold disabled:opacity-40"
              style={{ backgroundColor: GREEN }}
            >
              Daily cycle
            </button>
          </div>
          <ol className="bg-white rounded-2xl border border-stone-200 divide-y divide-stone-100">
            {[
              "Generate slideshows on the PC (Cursor + Sharp)",
              "Review queue here — approve keepers, reject to teach the engine",
              "Approved posts get a schedule slot",
              "TikTok send is paused — nothing goes to TikTok until you turn it back on",
              "BrightBean pulls follower counts + post metrics. Diagnosis waits 48h and compares same-era reach — one flop never bans a slide",
            ].map((step, i) => (
              <li key={step} className="p-3.5 text-sm flex gap-3">
                <span className="font-extrabold" style={{ color: GREEN }}>
                  {i + 1}
                </span>
                <span>{step}</span>
              </li>
            ))}
          </ol>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
            {pipeline.map((step) => (
              <div key={step.id} className="bg-white rounded-xl p-3 border border-stone-200">
                <div className="text-2xl font-extrabold">{step.count}</div>
                <div className="text-[10px] uppercase tracking-wide text-stone-500">{step.label}</div>
              </div>
            ))}
          </div>
          {calendar.length > 0 && (
            <section className="bg-white rounded-2xl p-4 border border-stone-200">
              <h2 className="font-bold text-sm mb-2">Schedule</h2>
              {calendar.map((item) => (
                <button key={item.id} type="button" onClick={() => onOpen(item.id)} className="w-full text-left py-2 border-b border-stone-100 last:border-0">
                  <div className="flex justify-between gap-3">
                    <p className="text-sm font-semibold line-clamp-1">{item.hookText}</p>
                    <Badge tone={statusTone(item.status)}>{item.status.replace("_", " ")}</Badge>
                  </div>
                  <p className="text-[10px] text-stone-400">{item.scheduledAt ? new Date(item.scheduledAt).toLocaleString() : "—"}</p>
                </button>
              ))}
            </section>
          )}
        </>
      )}

      {pane === "hooks" && (
        <HooksBankView hooks={hooks} formulas={formulas} hookFilter={hookFilter} onFilter={setHookFilter} />
      )}

      {pane === "templates" && (
        <div className="grid md:grid-cols-2 gap-2">
          {templates.map((t) => (
            <div key={t.id} className="bg-white rounded-2xl p-4 border border-stone-200">
              <div className="flex items-center justify-between">
                <h3 className="font-extrabold">
                  {t.id} · {t.name}
                </h3>
                <Badge>{t.used} used</Badge>
              </div>
              {t.description && <p className="text-xs text-stone-500 mt-1">{t.description}</p>}
              {t.preferMusic && <p className="text-[11px] text-stone-600 mt-1">Music factor on — drafts get a TikTok search cue</p>}
              {t.slideKinds.length > 0 && <p className="text-[10px] text-stone-400 mt-2">{t.slideKinds.join(" → ")}</p>}
              <p className="text-[11px] mt-2">
                {t.approved} kept · {t.rejected} rejected
              </p>
            </div>
          ))}
        </div>
      )}

      {pane === "learn" && (
        <>
          <div className="grid grid-cols-2 gap-2">
            {[
              ["Queued", count(summary?.statusCounts, (x) => x.status === "queued")],
              ["Approved", count(summary?.statusCounts, (x) => x.status === "approved")],
              ["Rejected", count(summary?.statusCounts, (x) => x.status === "rejected")],
              ["Published", summary?.totalPublished ?? 0],
            ].map(([label, value]) => (
              <div key={String(label)} className="bg-white rounded-xl p-3 border border-stone-200">
                <div className="text-2xl font-extrabold">{value}</div>
                <div className="text-[10px] uppercase tracking-wide text-stone-500">{label}</div>
              </div>
            ))}
          </div>
          <div className="bg-white rounded-2xl p-4 border border-stone-200">
            <h2 className="font-bold text-sm mb-1">Diagnosis matrix</h2>
            <p className="text-[11px] text-stone-500 mb-3">
              Labels wait 48h. Ratings (0–100) move a few points per post either way — a flop does not ban a slide, a hit does not lock it in. Hard rules still need 3 agreeing same-era posts.
            </p>
            <div className="grid grid-cols-2 gap-2">
              {[
                { label: "Winner", key: "winner", desc: "top-quartile reach + engagement vs same-era peers", tone: "green" as const },
                { label: "Typical", key: "typical", desc: "middle of the pack — no rule written", tone: "stone" as const },
                { label: "Weak CTA", key: "weak_cta", desc: "reach without engagement (same era)", tone: "amber" as const },
                { label: "Weak hook", key: "weak_hook", desc: "engagement without reach (same era)", tone: "amber" as const },
                { label: "Dud", key: "dud", desc: "bottom-quartile on both, and well below the era median", tone: "red" as const },
              ].map((m) => (
                <div key={m.key} className="rounded-xl border border-stone-200 p-3">
                  <div className="flex items-center justify-between">
                    <Badge tone={m.tone}>{m.label}</Badge>
                    <span className="text-xl font-extrabold">{count(summary?.diagnosisCounts, (x) => x.diagnosis === m.key)}</span>
                  </div>
                  <p className="text-[10px] text-stone-500 mt-1.5">{m.desc}</p>
                </div>
              ))}
            </div>
          </div>
          <section className="bg-white rounded-2xl p-4 border border-stone-200">
            <h2 className="font-bold text-sm mb-2">Learnings</h2>
            <p className="text-[11px] text-stone-500 mb-2">
              Full history stays here. Generation only sees confirmed rules (3+ same-era posts, or a large A/B) plus your manual rejects — never a single unlucky carousel.
            </p>
            {learnings.map((l) => (
              <div key={l.id} className="py-2 border-b border-stone-100 last:border-0">
                <Badge tone={l.kind === "rule" ? "green" : l.kind === "failure" ? "red" : "stone"}>{l.kind}</Badge>
                <p className="text-sm mt-1">{l.content}</p>
              </div>
            ))}
            {learnings.length === 0 && <p className="text-xs text-stone-500">No learnings yet — reject a few and they show up here.</p>}
          </section>
          <p className="text-[11px] text-stone-400">{posts.length} posts in this snapshot.</p>
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Insights tab — what works, experiments, asset coverage, signal feed
// ---------------------------------------------------------------------------

const DIMENSION_LABEL: Record<SignalDimension, string> = {
  hook: "Hooks",
  copy: "Copy",
  layout: "Layout",
  template: "Templates",
  asset: "Assets",
  visual: "Visual style",
  timing: "Timing",
  music: "YouTube music",
  shot_scale: "Screenshot size",
};

const SIGNAL_SOURCE_LABEL: Record<string, string> = {
  manual_reject: "your feedback",
  experiment: "A/B result",
  diagnosis: "analytics",
  rule_promotion: "promoted rule",
  migration: "legacy",
};

const DIAGNOSIS_META: Array<{ key: string; label: string; desc: string; tone: "green" | "stone" | "amber" | "red" }> = [
  { key: "winner", label: "Winner", desc: "Top-quartile reach + engagement vs same-era peers", tone: "green" },
  { key: "typical", label: "Typical", desc: "Middle of the pack — no rule written", tone: "stone" },
  { key: "weak_cta", label: "Weak CTA", desc: "Reach without engagement", tone: "amber" },
  { key: "weak_hook", label: "Weak hook", desc: "Engagement without reach", tone: "amber" },
  { key: "dud", label: "Dud", desc: "Bottom-quartile on both vs era median", tone: "red" },
];

function compactNum(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1).replace(/\.0$/, "")}k`;
  return String(Math.round(n));
}

function postViews(p: Post): number {
  return p.totalViews ?? p.analytics.reduce((sum, a) => sum + a.views, 0);
}

function postEngagement(p: Post): number {
  return p.totalEngagement ?? p.analytics.reduce((sum, a) => sum + a.likes + a.comments + a.shares + a.saves, 0);
}

function diagnosisCount(rows: Array<{ diagnosis: string; count: number }> | undefined, key: string): number {
  return rows?.filter((x) => x.diagnosis === key).reduce((s, x) => s + x.count, 0) ?? 0;
}

function confidenceTone(confidence: number): "green" | "amber" | "stone" {
  if (confidence >= 60) return "green";
  if (confidence >= 30) return "amber";
  return "stone";
}

function SummaryCards({ summaries, direction }: { summaries: DimensionSummary[]; direction: "prefer" | "avoid" }) {
  const filtered = summaries.filter((s) => s.direction === direction);
  const byDimension = new Map<SignalDimension, DimensionSummary[]>();
  for (const s of filtered) {
    const list = byDimension.get(s.dimension) ?? [];
    list.push(s);
    byDimension.set(s.dimension, list);
  }
  if (filtered.length === 0) {
    return (
      <p className="text-xs text-stone-500">
        {direction === "prefer"
          ? "Nothing proven yet. A pattern needs 3 same-era posts (or 2 agreeing A/B tests) before it shapes new slides."
          : "No avoid-patterns confirmed yet. One flop is luck — we wait for a repeated same-era gap."}
      </p>
    );
  }
  return (
    <div className="grid md:grid-cols-2 gap-2">
      {Array.from(byDimension.entries()).map(([dim, list]) => (
        <div key={dim} className="rounded-xl border border-stone-200 p-3">
          <p className="text-xs font-bold uppercase tracking-wide text-stone-400 mb-2">{DIMENSION_LABEL[dim]}</p>
          {list.map((s) => (
            <div key={`${s.category}-${s.direction}`} className="mb-2 last:mb-0">
              <p className="text-sm leading-snug">{s.summary}</p>
              <div className="flex gap-2 items-center mt-1">
                <Badge tone={confidenceTone(s.confidence)}>{s.confidence.toFixed(0)}% confident</Badge>
                <span className="text-[10px] text-stone-400">{s.evidenceCount} signals · {s.category.replace(/_/g, " ")}</span>
              </div>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

/** The explore/exploit loop: where we are, what's been tested, what's next. */
function CycleCard({ cycle }: { cycle: CycleState }) {
  const [showHistory, setShowHistory] = useState(false);
  const cur = cycle.current;
  const isDiversity = cur.phase === "diversity";
  const cov = cur.coverage;

  const bars: Array<{ label: string; tested: number; total: number; newCount: number }> = [
    { label: "Templates", ...cov.allTime.templates, newCount: cov.newlyTested.templates.length },
    { label: "Screenshots", ...cov.allTime.screenshots, newCount: cov.newlyTested.screenshots.length },
    { label: "SVGs", ...cov.allTime.svgs, newCount: cov.newlyTested.svgs.length },
    { label: "Hook formulas", ...cov.allTime.formulas, newCount: cov.newlyTested.formulas.length },
    { label: "Color/style combos", ...cov.allTime.styleCombos, newCount: cov.newlyTested.styleCombos.length },
    ...(cov.allTime.music
      ? [{ label: "YouTube music", ...cov.allTime.music, newCount: cov.newlyTested.music?.length ?? 0 }]
      : []),
    ...(cov.allTime.shotScales
      ? [{ label: "Screenshot size", ...cov.allTime.shotScales, newCount: cov.newlyTested.shotScales?.length ?? 0 }]
      : []),
  ];

  const newChips = [
    ...cov.newlyTested.templates.map((t) => `template ${t}`),
    ...cov.newlyTested.styleCombos,
    ...cov.newlyTested.screenshots,
  ].slice(0, 10);

  const phaseSteps = isDiversity
    ? ["Diversity — testing untested combos", "A/B — best parts head-to-head", "Rollup — learnings feed the next round"]
    : ["Diversity done", "A/B — best parts head-to-head", "Rollup — learnings feed the next round"];
  const activeStep = isDiversity ? 0 : 1;

  return (
    <section className="bg-white rounded-2xl p-4 border-2 space-y-3" style={{ borderColor: GREEN }}>
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="font-bold text-sm" style={{ color: GREEN }}>
            Learning cycle — round {cur.number}
          </h2>
          <p className="text-[11px] text-stone-500">
            {cur.warmup
              ? `Warmup at ${cur.dailyCap ?? "?"}/day — rounds stay small (~${cur.target} ${isDiversity ? "posts" : "A/B tests"}). At 10/day this becomes ${cur.fullPaceTargets?.diversity ?? 40} diversity / ${cur.fullPaceTargets?.ab ?? 15} A/B.`
              : `Full pace at ${cur.dailyCap ?? 10}/day — diversity ${cur.fullPaceTargets?.diversity ?? 40} posts, then ${cur.fullPaceTargets?.ab ?? 15} A/B tests.`}
          </p>
        </div>
        <Badge tone={isDiversity ? "green" : "amber"}>{isDiversity ? "DIVERSITY PHASE" : "A/B PHASE"}</Badge>
      </div>

      <div className="flex items-center gap-2 text-[10px] font-semibold">
        {phaseSteps.map((step, i) => (
          <div key={step} className="flex items-center gap-2 min-w-0">
            {i > 0 && <span className="text-stone-300">→</span>}
            <span
              className={`px-2 py-1 rounded-full whitespace-nowrap ${
                i === activeStep ? "text-white" : i < activeStep ? "bg-stone-100 text-stone-500" : "bg-stone-50 text-stone-400"
              }`}
              style={i === activeStep ? { backgroundColor: GREEN } : undefined}
            >
              {step}
            </span>
          </div>
        ))}
      </div>

      <div>
        <div className="flex justify-between text-[11px] font-semibold mb-1">
          <span>{isDiversity ? "Round progress" : "Experiments"}</span>
          <span className="text-stone-500">{cur.progressLabel}</span>
        </div>
        <div className="h-2 rounded-full bg-stone-100 overflow-hidden">
          <div className="h-full rounded-full transition-all" style={{ width: `${Math.round(cur.progress * 100)}%`, backgroundColor: GREEN }} />
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
        {bars.map((b) => (
          <div key={b.label} className="rounded-xl bg-stone-50 p-2">
            <p className="text-[10px] text-stone-500 font-semibold">{b.label}</p>
            <p className="text-sm font-bold">
              {b.tested}<span className="text-stone-400 font-semibold text-[11px]">/{b.total}</span>
            </p>
            <div className="h-1 rounded-full bg-stone-200 overflow-hidden mt-1">
              <div className="h-full rounded-full" style={{ width: `${b.total ? Math.round((b.tested / b.total) * 100) : 0}%`, backgroundColor: GREEN }} />
            </div>
            {b.newCount > 0 && <p className="text-[9px] font-bold mt-0.5" style={{ color: GREEN }}>+{b.newCount} this round</p>}
          </div>
        ))}
      </div>

      {newChips.length > 0 && (
        <div>
          <p className="text-[10px] font-bold text-stone-500 mb-1">First-time tests this round</p>
          <div className="flex flex-wrap gap-1">
            {newChips.map((c) => (
              <span key={c} className="text-[9px] px-1.5 py-0.5 rounded bg-green-50 text-green-800 font-semibold">{c}</span>
            ))}
          </div>
        </div>
      )}

      <p className="text-[10px] text-stone-400">
        Still untested: {cov.stillCold.templates.length} templates · {cov.stillCold.screenshots.length} screenshots · {cov.stillCold.svgs.length} SVGs · {cov.stillCold.styleCombos.length}+ style combos — the next diversity round targets these automatically.
      </p>

      {cycle.history.length > 0 && (
        <div>
          <button
            type="button"
            onClick={() => setShowHistory((v) => !v)}
            className="text-[11px] font-bold text-stone-500"
          >
            {showHistory ? "Hide" : "Show"} past rounds ({cycle.history.length})
          </button>
          {showHistory && (
            <div className="space-y-2 mt-2">
              {cycle.history.map((h) => (
                <div key={`${h.number}-${h.phase}-${h.startedAt}`} className="rounded-xl border border-stone-100 p-2">
                  <div className="flex items-center gap-2">
                    <Badge tone={h.phase === "diversity" ? "green" : "amber"}>
                      {h.phase === "diversity" ? "diversity" : "A/B"} #{h.number}
                    </Badge>
                    <span className="text-[10px] text-stone-400">
                      {new Date(h.startedAt).toLocaleDateString()} — {h.concludedAt ? new Date(h.concludedAt).toLocaleDateString() : "?"}
                    </span>
                  </div>
                  {h.summary && (
                    <p className="text-[10px] text-stone-500 mt-1">
                      {h.summary.shipped} shipped · {h.summary.signalsGathered} signals ·{" "}
                      {h.summary.newlyTested.templates.length + h.summary.newlyTested.screenshots.length + h.summary.newlyTested.styleCombos.length}{" "}
                      first-time tests
                      {h.summary.experimentResults.length > 0 &&
                        ` · experiments: ${h.summary.experimentResults.map((e) => `${e.dimension}${e.winner && e.winner !== "tie" ? ` (+${e.liftPct ?? 0}%)` : e.winner === "tie" ? " (tie)" : ""}`).join(", ")}`}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function AudienceCard({ cycle }: { cycle: CycleState }) {
  const platforms = cycle.audience?.platforms ?? [];
  const policy = cycle.policy;
  return (
    <section className="bg-white rounded-2xl p-4 border border-stone-200 space-y-3">
      <div>
        <h2 className="font-bold text-sm">Audience era (BrightBean)</h2>
        <p className="text-[11px] text-stone-500">
          Follower count is the denominator. A post freezes the count from its first measurement, so later growth cannot make early carousels look like failures.
        </p>
      </div>
      {platforms.length === 0 ? (
        <p className="text-xs text-stone-500">
          Nothing pulled yet — hit Pull analytics on Engine. BrightBean is the analytics source even before the first post ships; that snapshot is the baseline.
        </p>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {platforms.map((p) => (
            <div key={p.platform} className="rounded-xl bg-stone-50 p-3">
              <p className="text-[10px] uppercase tracking-wide text-stone-500 font-bold">{p.platform}</p>
              <p className="text-xl font-extrabold">{p.followers > 0 ? p.followers.toLocaleString() : "—"}</p>
              <p className="text-[10px] text-stone-400">
                {p.available === false
                  ? (p.unavailableReason ?? "analytics not enabled")
                  : p.followerDelta != null
                    ? `${p.followerDelta > 0 ? "+" : ""}${p.followerDelta} / 30d`
                    : "followers"}
              </p>
            </div>
          ))}
        </div>
      )}
      {policy && (
        <p className="text-[10px] text-stone-400">
          Rules: wait {policy.matureHours}h · {policy.minCohort}+ mature peers · winner ≥ {policy.winnerMultiple}× era median · dud ≤ {policy.dudMultiple}× · {policy.replicateN} agreeing posts before a slide rule · same era = followers within {policy.followerBand}× (or {policy.eraDays} days if count unknown).
        </p>
      )}
    </section>
  );
}

function RatingsCard({ ratings }: { ratings: AssetRating[] }) {
  const groups: Array<{ dim: AssetRating["dimension"]; label: string }> = [
    { dim: "template", label: "Templates" },
    { dim: "hook_category", label: "Hook styles" },
    { dim: "screenshot", label: "Screenshots" },
    { dim: "svg", label: "SVGs" },
    { dim: "youtube_music", label: "YouTube music" },
    { dim: "shot_scale", label: "Screenshot size" },
  ];
  return (
    <section className="bg-white rounded-2xl p-4 border border-stone-200 space-y-3">
      <div>
        <h2 className="font-bold text-sm">Slide ratings (0–100)</h2>
        <p className="text-[11px] text-stone-500">
          Everything starts at 50. A strong or weak post moves a rating a few points — never enough to crown or cripple it. Floor 12, ceiling 88. Generation uses these as soft weights.
        </p>
      </div>
      {ratings.length === 0 ? (
        <p className="text-xs text-stone-500">No ratings yet — they appear after the first posts are 48h old.</p>
      ) : (
        <div className="grid md:grid-cols-2 gap-2">
          {groups.map(({ dim, label }) => {
            const rows = ratings.filter((r) => r.dimension === dim).sort((a, b) => b.score - a.score);
            if (rows.length === 0) return null;
            return (
              <div key={dim} className="rounded-xl border border-stone-200 p-3">
                <p className="text-[10px] uppercase tracking-wide text-stone-400 font-bold mb-2">{label}</p>
                {rows.slice(0, 8).map((r) => (
                  <div key={r.key} className="flex items-center gap-2 mb-1.5 last:mb-0">
                    <span className="text-xs font-semibold w-10 tabular-nums">{Math.round(r.score)}</span>
                    <div className="flex-1 h-1.5 rounded-full bg-stone-100 overflow-hidden">
                      <div className="h-full rounded-full" style={{ width: `${r.score}%`, backgroundColor: GREEN }} />
                    </div>
                    <span className="text-[10px] text-stone-400 truncate max-w-[40%]">{r.key}</span>
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

function InsightsView({
  posts,
  summary,
  sub,
  onSub,
  onOpen,
}: {
  posts: Post[];
  summary: Summary | null;
  sub: InsightsSub;
  onSub: (next: InsightsSub) => void;
  onOpen: (id: number) => void;
}) {
  const [summaries, setSummaries] = useState<DimensionSummary[]>([]);
  const [experiments, setExperiments] = useState<Experiment[]>([]);
  const [coverage, setCoverage] = useState<AssetCoverage | null>(null);
  const [signals, setSignals] = useState<Signal[]>([]);
  const [cycle, setCycle] = useState<CycleState | null>(null);
  const [ratings, setRatings] = useState<AssetRating[]>([]);
  const [signalFilter, setSignalFilter] = useState<"all" | SignalDimension>("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [su, ex, cov, sig, cyc, rats] = await Promise.all([
          api.insightSummaries(),
          api.experiments(),
          api.coverage(),
          api.signals(),
          api.cycle().catch(() => null),
          api.ratings().catch(() => []),
        ]);
        if (cancelled) return;
        setSummaries(su);
        setExperiments(ex);
        setCoverage(cov);
        setSignals(sig);
        setCycle(cyc);
        setRatings(rats);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load insights");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const concluded = experiments.filter((e) => e.status === "concluded");
  const running = experiments.filter((e) => e.status === "pending" || e.status === "active");
  const visibleSignals = signalFilter === "all" ? signals : signals.filter((s) => s.dimension === signalFilter);

  const coverageSections: Array<{ label: string; stats: Array<{ name: string; publishedUses: number; views: number; reach?: number; cold: boolean }> }> = coverage
    ? [
        { label: "Screenshots", stats: coverage.screenshots },
        { label: "SVGs / illustrations", stats: coverage.svgs },
        { label: "Templates", stats: coverage.templates },
        { label: "Hook formulas", stats: coverage.formulas.map((f) => ({ ...f, name: f.name })) },
        { label: "YouTube music", stats: coverage.music ?? [] },
        { label: "Screenshot size", stats: coverage.shotScales ?? [] },
      ]
    : [];

  if (loading) return <p className="text-sm text-stone-500 text-center py-8">Loading insights…</p>;
  if (error) return <p className="text-sm text-amber-800 text-center py-8">{error}</p>;

  const pills: Array<[InsightsSub, string]> = [
    ["overview", "Overview"],
    ["learning", "Learning"],
  ];

  return (
    <div className="space-y-4 pb-10">
      <div className="flex gap-2">
        {pills.map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => onSub(id)}
            className={`px-3 py-1.5 rounded-full text-xs font-bold ${sub === id ? "text-white" : "bg-white border border-stone-200"}`}
            style={sub === id ? { backgroundColor: GREEN } : undefined}
          >
            {label}
          </button>
        ))}
      </div>

      {sub === "overview" ? (
        <InsightsOverview
          posts={posts}
          summary={summary}
          summaries={summaries}
          experiments={experiments}
          coverage={coverage}
          cycle={cycle}
          onOpen={onOpen}
        />
      ) : (
        <InsightsLearning
          summaries={summaries}
          experiments={experiments}
          coverage={coverage}
          coverageSections={coverageSections}
          signals={signals}
          visibleSignals={visibleSignals}
          signalFilter={signalFilter}
          onSignalFilter={setSignalFilter}
          cycle={cycle}
          ratings={ratings}
          running={running}
          concluded={concluded}
          onOpen={onOpen}
        />
      )}
    </div>
  );
}

function InsightsOverview({
  posts,
  summary,
  summaries,
  experiments,
  coverage,
  cycle,
  onOpen,
}: {
  posts: Post[];
  summary: Summary | null;
  summaries: DimensionSummary[];
  experiments: Experiment[];
  coverage: AssetCoverage | null;
  cycle: CycleState | null;
  onOpen: (id: number) => void;
}) {
  const published = posts.filter((p) => p.status === "published");
  const judged = published.filter((p) => p.diagnosis);
  const views = published.reduce((s, p) => s + postViews(p), 0);
  const engagement = published.reduce((s, p) => s + postEngagement(p), 0);
  const saveRate = views > 0 ? (published.reduce((s, p) => s + p.analytics.reduce((n, a) => n + a.saves, 0), 0) / views) * 100 : 0;
  const followers = (cycle?.audience?.platforms ?? []).reduce((s, p) => s + (p.followers ?? 0), 0);
  const running = experiments.filter((e) => e.status === "pending" || e.status === "active");
  const concluded = experiments.filter((e) => e.status === "concluded");
  const winners = concluded.filter((e) => e.winner && e.winner !== "tie");
  const prefer = summaries.filter((s) => s.direction === "prefer").sort((a, b) => b.confidence - a.confidence);
  const avoid = summaries.filter((s) => s.direction === "avoid").sort((a, b) => b.confidence - a.confidence);
  const topPosts = [...published]
    .filter((p) => postViews(p) > 0)
    .sort((a, b) => postViews(b) - postViews(a) || postEngagement(b) - postEngagement(a))
    .slice(0, 6);
  const diagnosisRows = DIAGNOSIS_META.map((m) => ({
    ...m,
    count: diagnosisCount(summary?.diagnosisCounts, m.key) || judged.filter((p) => p.diagnosis === m.key).length,
  }));
  const diagnosisTotal = diagnosisRows.reduce((s, r) => s + r.count, 0);
  const cold = coverage
    ? {
        screenshots: coverage.screenshots.filter((s) => s.cold).length,
        svgs: coverage.svgs.filter((s) => s.cold).length,
        templates: coverage.templates.filter((s) => s.cold).length,
      }
    : { screenshots: 0, svgs: 0, templates: 0 };
  const coldTotal = cold.screenshots + cold.svgs + cold.templates;
  const kpis: Array<{ value: string; label: string; hint: string }> = [
    { value: String(published.length), label: "Published", hint: judged.length ? `${judged.length} judged` : "waiting 48h" },
    { value: views ? compactNum(views) : "—", label: "Views", hint: engagement ? `${compactNum(engagement)} eng` : "after first pull" },
    { value: views ? `${saveRate.toFixed(1)}%` : "—", label: "Save rate", hint: "saves ÷ views" },
    { value: followers ? compactNum(followers) : "—", label: "Followers", hint: "era denominator" },
    { value: String(running.length), label: "Open A/Bs", hint: `${concluded.length} concluded` },
  ];

  return (
    <div className="space-y-4">
      <section className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
        {kpis.map((k) => (
          <div key={k.label} className="bg-white rounded-2xl border border-stone-200 px-3 py-3">
            <p className="text-2xl font-extrabold tabular-nums tracking-tight">{k.value}</p>
            <p className="text-[11px] font-bold text-stone-700 mt-0.5">{k.label}</p>
            <p className="text-[10px] text-stone-400">{k.hint}</p>
          </div>
        ))}
      </section>

      <section className="bg-white rounded-2xl p-4 border border-stone-200 space-y-3">
        <div>
          <h2 className="font-bold text-sm">Outcome mix</h2>
          <p className="text-[11px] text-stone-500">Same-era diagnosis after 48h. Mid-pack is luck — only winners and repeated duds change what we ship.</p>
        </div>
        {diagnosisTotal === 0 ? (
          <p className="text-xs text-stone-500">No judged posts yet. Labels appear once a carousel is 48h old and has same-era peers.</p>
        ) : (
          <>
            <div className="h-3 rounded-full overflow-hidden flex bg-stone-100">
              {diagnosisRows.filter((r) => r.count > 0).map((r) => (
                <div
                  key={r.key}
                  className={r.tone === "green" ? "bg-green-600" : r.tone === "red" ? "bg-red-500" : r.tone === "amber" ? "bg-amber-400" : "bg-stone-400"}
                  style={{ width: `${Math.round((r.count / diagnosisTotal) * 100)}%` }}
                  title={`${r.label}: ${r.count}`}
                />
              ))}
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
              {diagnosisRows.map((r) => (
                <div key={r.key} className="rounded-xl bg-stone-50 p-2">
                  <div className="flex items-center justify-between gap-1">
                    <Badge tone={r.tone}>{r.label}</Badge>
                    <span className="text-lg font-extrabold tabular-nums">{r.count}</span>
                  </div>
                  <p className="text-[10px] text-stone-400 mt-1 leading-snug">{r.desc}</p>
                </div>
              ))}
            </div>
          </>
        )}
      </section>

      <section className="bg-white rounded-2xl p-4 border border-stone-200 space-y-3">
        <div>
          <h2 className="font-bold text-sm">Best performing slides</h2>
          <p className="text-[11px] text-stone-500">
            Slide-level ranking (which frame holds swipe-through) once enough carousels have mature analytics. Empty until then.
          </p>
        </div>
        <div className="rounded-xl border border-dashed border-stone-200 bg-stone-50 px-4 py-10 text-center">
          <p className="text-sm font-semibold text-stone-600">No slide rankings yet</p>
          <p className="text-[11px] text-stone-400 mt-1 max-w-md mx-auto">
            Needs mature posts with per-slide drop-off. Until that lands, use winning posts and confirmed prefer/avoid rules below.
          </p>
        </div>
      </section>

      <section className="bg-white rounded-2xl p-4 border border-stone-200 space-y-3">
        <div>
          <h2 className="font-bold text-sm">Winning posts</h2>
          <p className="text-[11px] text-stone-500">Highest views among published carousels. Open one to reuse the hook, template, or screenshot.</p>
        </div>
        {topPosts.length === 0 ? (
          <p className="text-xs text-stone-500">Nothing ranked yet — publish, wait 48h, then Pull analytics on Engine.</p>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
            {topPosts.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => onOpen(p.id)}
                className="text-left bg-stone-50 rounded-xl overflow-hidden border border-stone-100"
              >
                {p.slides[0]?.url ? (
                  <img src={p.slides[0].url} alt="" loading="lazy" className="w-full aspect-[4/5] object-cover bg-stone-100" />
                ) : (
                  <div className="w-full aspect-[4/5] bg-stone-200" />
                )}
                <div className="p-2 space-y-1">
                  <div className="flex items-center justify-between gap-1">
                    <span className="text-sm font-extrabold tabular-nums">{compactNum(postViews(p))}</span>
                    {p.diagnosis && <Badge tone={statusTone(p.diagnosis)}>{p.diagnosis.replace("_", " ")}</Badge>}
                  </div>
                  <p className="text-[11px] font-semibold line-clamp-2">{p.hookText}</p>
                  <p className="text-[10px] text-stone-400">
                    {p.templateId} · {compactNum(postEngagement(p))} eng
                  </p>
                </div>
              </button>
            ))}
          </div>
        )}
      </section>

      <div className="grid md:grid-cols-2 gap-4">
        <section className="bg-white rounded-2xl p-4 border border-stone-200 space-y-3">
          <div>
            <h2 className="font-bold text-sm" style={{ color: GREEN }}>Ship more of</h2>
            <p className="text-[11px] text-stone-500">Confirmed prefer-patterns only. Needs 3 same-era posts or 2 agreeing A/Bs.</p>
          </div>
          {prefer.length === 0 ? (
            <p className="text-xs text-stone-500">Nothing proven yet. Early posts stay mid-pack until the same pattern repeats.</p>
          ) : (
            prefer.map((s) => (
              <div key={`${s.dimension}-${s.category}`} className="rounded-xl border border-stone-100 p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[10px] font-bold uppercase tracking-wide text-stone-400">{DIMENSION_LABEL[s.dimension]}</p>
                  <Badge tone={confidenceTone(s.confidence)}>{s.confidence.toFixed(0)}%</Badge>
                </div>
                <p className="text-sm mt-1 leading-snug">{s.summary}</p>
              </div>
            ))
          )}
        </section>
        <section className="bg-white rounded-2xl p-4 border border-stone-200 space-y-3">
          <div>
            <h2 className="font-bold text-sm text-red-700">Stop doing</h2>
            <p className="text-[11px] text-stone-500">Confirmed anti-patterns. One flop is luck — rejects teach immediately.</p>
          </div>
          {avoid.length === 0 ? (
            <p className="text-xs text-stone-500">No avoid-pattern confirmed yet.</p>
          ) : (
            avoid.map((s) => (
              <div key={`${s.dimension}-${s.category}`} className="rounded-xl border border-stone-100 p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[10px] font-bold uppercase tracking-wide text-stone-400">{DIMENSION_LABEL[s.dimension]}</p>
                  <Badge tone={confidenceTone(s.confidence)}>{s.confidence.toFixed(0)}%</Badge>
                </div>
                <p className="text-sm mt-1 leading-snug">{s.summary}</p>
              </div>
            ))
          )}
        </section>
      </div>

      <section className="bg-white rounded-2xl p-4 border border-stone-200 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h2 className="font-bold text-sm">A/B winners</h2>
            <p className="text-[11px] text-stone-500">Only concluded pairs. Lift is views-per-follower in the same era.</p>
          </div>
          <span className="text-[11px] text-stone-400">{winners.length} decided · {running.length} running</span>
        </div>
        {winners.length === 0 ? (
          <p className="text-xs text-stone-500">
            {running.length > 0
              ? `${running.length} test${running.length === 1 ? "" : "s"} still maturing.`
              : "No decided tests yet. Approve a post and hit Create variant."}
          </p>
        ) : (
          winners.map((exp) => (
            <div key={exp.id} className="rounded-xl border border-stone-200 p-3">
              <div className="flex items-center gap-2 flex-wrap">
                <Badge>{DIMENSION_LABEL[exp.dimension as SignalDimension] ?? exp.dimension}</Badge>
                {exp.liftPct != null && <Badge tone="green">{exp.winner?.toUpperCase()} +{exp.liftPct.toFixed(0)}%</Badge>}
              </div>
              <div className="grid grid-cols-2 gap-2 mt-2">
                {(
                  [
                    ["A", exp.postAId, exp.hookAText, exp.postAStatus],
                    ["B", exp.postBId, exp.hookBText, exp.postBStatus],
                  ] as const
                ).map(([side, id, hookText, status]) => (
                  <button
                    key={side}
                    type="button"
                    onClick={() => onOpen(id)}
                    className={`text-left rounded-lg border p-2 ${exp.winner === side.toLowerCase() ? "border-green-600 bg-green-50" : "border-stone-100"}`}
                  >
                    <p className="text-[10px] font-bold text-stone-400">{side} · #{id} · {status.replace("_", " ")}</p>
                    <p className="text-xs font-semibold line-clamp-2 mt-0.5">{hookText}</p>
                  </button>
                ))}
              </div>
            </div>
          ))
        )}
      </section>

      <section className="bg-white rounded-2xl p-4 border border-stone-200 space-y-3">
        <div>
          <h2 className="font-bold text-sm">Still untested</h2>
          <p className="text-[11px] text-stone-500">Cold assets have never shipped. Diversity rounds pick these first so we stop guessing.</p>
        </div>
        {coldTotal === 0 ? (
          <p className="text-xs text-stone-500">Every screenshot, SVG, and template has shipped at least once — or the catalog is empty.</p>
        ) : (
          <div className="grid grid-cols-3 gap-2">
            {[
              ["Screenshots", cold.screenshots],
              ["SVGs", cold.svgs],
              ["Templates", cold.templates],
            ].map(([label, n]) => (
              <div key={String(label)} className="rounded-xl bg-stone-50 p-3 text-center">
                <p className="text-2xl font-extrabold tabular-nums">{n}</p>
                <p className="text-[10px] uppercase tracking-wide text-stone-500 font-bold">{label}</p>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function InsightsLearning({
  summaries,
  experiments,
  coverage,
  coverageSections,
  signals,
  visibleSignals,
  signalFilter,
  onSignalFilter,
  cycle,
  ratings,
  running,
  concluded,
  onOpen,
}: {
  summaries: DimensionSummary[];
  experiments: Experiment[];
  coverage: AssetCoverage | null;
  coverageSections: Array<{ label: string; stats: Array<{ name: string; publishedUses: number; views: number; reach?: number; cold: boolean }> }>;
  signals: Signal[];
  visibleSignals: Signal[];
  signalFilter: "all" | SignalDimension;
  onSignalFilter: (next: "all" | SignalDimension) => void;
  cycle: CycleState | null;
  ratings: AssetRating[];
  running: Experiment[];
  concluded: Experiment[];
  onOpen: (id: number) => void;
}) {
  return (
    <div className="space-y-4">
      {cycle && <CycleCard cycle={cycle} />}
      {cycle && <AudienceCard cycle={cycle} />}
      <RatingsCard ratings={ratings} />

      <section className="bg-white rounded-2xl p-4 border border-stone-200 space-y-3">
        <div>
          <h2 className="font-bold text-sm" style={{ color: GREEN }}>What works</h2>
          <p className="text-[11px] text-stone-500">
            Compared as views-per-follower in the same follower era — early posts at 40 followers are never judged against later posts at 4,000. A post waits 48h. Mid-pack is typical (luck). Generation only uses a pattern after 3 independent same-era posts agree, or 2 A/B tests agree.
          </p>
        </div>
        <SummaryCards summaries={summaries} direction="prefer" />
      </section>

      <section className="bg-white rounded-2xl p-4 border border-stone-200 space-y-3">
        <div>
          <h2 className="font-bold text-sm text-red-700">What to avoid</h2>
          <p className="text-[11px] text-stone-500">
            Confirmed anti-patterns only. Your rejects teach immediately. A flop from analytics does not ban a template or screenshot until it repeats in the same follower era.
          </p>
        </div>
        <SummaryCards summaries={summaries} direction="avoid" />
      </section>

      <section className="bg-white rounded-2xl p-4 border border-stone-200 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-bold text-sm">A/B experiments</h2>
          <span className="text-[11px] text-stone-400">{running.length} running · {concluded.length} concluded</span>
        </div>
        {experiments.length === 0 && (
          <p className="text-xs text-stone-500">
            No experiments yet. Approve a post and hit "Create variant" — the pair posts 24-48h apart and the winner becomes a signal.
          </p>
        )}
        {experiments.map((exp) => (
          <div key={exp.id} className="rounded-xl border border-stone-200 p-3">
            <div className="flex items-center gap-2 flex-wrap">
              <Badge tone={exp.status === "concluded" ? "green" : exp.status === "cancelled" ? "red" : "amber"}>{exp.status}</Badge>
              <Badge>{DIMENSION_LABEL[exp.dimension as SignalDimension] ?? exp.dimension}</Badge>
              {exp.winner && exp.winner !== "tie" && exp.liftPct != null && (
                <Badge tone="green">{exp.winner.toUpperCase()} won +{exp.liftPct.toFixed(0)}%</Badge>
              )}
              {exp.winner === "tie" && <Badge>tie</Badge>}
            </div>
            <div className="grid grid-cols-2 gap-2 mt-2">
              {(
                [
                  ["A", exp.postAId, exp.hookAText, exp.postAStatus],
                  ["B", exp.postBId, exp.hookBText, exp.postBStatus],
                ] as const
              ).map(([side, id, hookText, status]) => (
                <button
                  key={side}
                  type="button"
                  onClick={() => onOpen(id)}
                  className={`text-left rounded-lg border p-2 ${exp.winner === side.toLowerCase() ? "border-green-600 bg-green-50" : "border-stone-100"}`}
                >
                  <p className="text-[10px] font-bold text-stone-400">{side} · #{id} · {status.replace("_", " ")}</p>
                  <p className="text-xs font-semibold line-clamp-2 mt-0.5">{hookText}</p>
                </button>
              ))}
            </div>
            {exp.variableDetail && (
              <p className="text-[10px] text-stone-400 mt-1.5 line-clamp-2">
                Tested: {exp.variableDetail.a} vs {exp.variableDetail.b}
              </p>
            )}
          </div>
        ))}
      </section>

      {coverage && (
        <section className="bg-white rounded-2xl p-4 border border-stone-200 space-y-3">
          <div>
            <h2 className="font-bold text-sm">Asset coverage</h2>
            <p className="text-[11px] text-stone-500">
              Cold assets have never shipped — the engine pushes at least one into each batch so everything gets tested.
            </p>
          </div>
          {coverageSections.map(({ label, stats }) => {
            const tested = stats.filter((s) => !s.cold);
            const cold = stats.filter((s) => s.cold);
            const score = (s: { views: number; reach?: number; publishedUses: number }) =>
              s.publishedUses >= 3 ? (s.reach ?? s.views) : -1;
            const top = [...tested].filter((s) => s.publishedUses >= 3).sort((a, b) => score(b) - score(a)).slice(0, 3).filter((s) => (s.reach ?? s.views) > 0);
            const worst = [...tested]
              .filter((s) => s.publishedUses >= 3)
              .sort((a, b) => score(a) - score(b))
              .slice(0, 3)
              .filter((s) => !top.some((t) => t.name === s.name));
            return (
              <div key={label} className="rounded-xl border border-stone-200 p-3">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-bold">{label}</p>
                  <span className="text-[11px] text-stone-500">
                    {tested.length}/{stats.length} tested{cold.length > 0 ? ` · ${cold.length} cold` : ""}
                  </span>
                </div>
                <div className="h-1.5 rounded-full bg-stone-100 mt-2 overflow-hidden">
                  <div
                    className="h-full rounded-full"
                    style={{ backgroundColor: GREEN, width: `${stats.length ? Math.round((tested.length / stats.length) * 100) : 0}%` }}
                  />
                </div>
                {top.length > 0 && (
                  <p className="text-[11px] text-stone-600 mt-2">
                    <span className="font-bold text-green-800">Top (3+ posts, reach):</span> {top.map((s) => `${s.name} (${s.publishedUses} posts)`).join(", ")}
                  </p>
                )}
                {worst.length > 0 && (
                  <p className="text-[11px] text-stone-600 mt-1">
                    <span className="font-bold text-red-700">Lagging (3+ posts, not banned):</span> {worst.map((s) => `${s.name} (${s.publishedUses} posts)`).join(", ")}
                  </p>
                )}
                {cold.length > 0 && (
                  <p className="text-[11px] text-stone-400 mt-1 line-clamp-2">
                    <span className="font-bold">Never tested:</span> {cold.map((s) => s.name).join(", ")}
                  </p>
                )}
              </div>
            );
          })}
        </section>
      )}

      <section className="bg-white rounded-2xl p-4 border border-stone-200 space-y-3">
        <div>
          <h2 className="font-bold text-sm">Signal feed</h2>
          <p className="text-[11px] text-stone-500">Every unit of learning, newest first: classified rejections, A/B results, analytics diagnoses.</p>
        </div>
        <div className="flex gap-1.5 flex-wrap">
          {(["all", ...SIGNAL_DIMENSIONS] as const).map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => onSignalFilter(d)}
              className={`text-[11px] font-bold px-2.5 py-1 rounded-full border ${
                signalFilter === d ? "bg-stone-900 text-white border-stone-900" : "bg-white text-stone-600 border-stone-200"
              }`}
            >
              {d === "all" ? `All (${signals.length})` : DIMENSION_LABEL[d]}
            </button>
          ))}
        </div>
        {visibleSignals.length === 0 && <p className="text-xs text-stone-500">No signals here yet.</p>}
        {visibleSignals.map((s) => (
          <div key={s.id} className="py-2 border-b border-stone-100 last:border-0">
            <div className="flex items-center gap-2 flex-wrap">
              <Badge tone={s.direction === "prefer" ? "green" : "red"}>{s.direction}</Badge>
              <Badge>{DIMENSION_LABEL[s.dimension]}</Badge>
              <span className="text-[10px] text-stone-400">
                {SIGNAL_SOURCE_LABEL[s.source] ?? s.source} · {s.category.replace(/_/g, " ")} · {new Date(s.createdAt).toLocaleDateString()}
              </span>
            </div>
            <p className="text-sm mt-1 leading-snug">{s.content}</p>
            {s.postId != null && (
              <button type="button" onClick={() => onOpen(s.postId!)} className="text-[11px] font-bold mt-0.5" style={{ color: GREEN }}>
                Post #{s.postId} →
              </button>
            )}
          </div>
        ))}
      </section>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Images tab — all screenshots + crop + phone upload
// ---------------------------------------------------------------------------

interface CropBox { x: number; y: number; w: number; h: number }
type DragKind = "move" | "nw" | "ne" | "sw" | "se";

function shotDescription(entry: ScreenshotAsset): string {
  if (isCroppedEntry(entry)) {
    if (entry.description?.startsWith("Crop:")) return entry.description;
    return cropDescriptionFor(entry.source ?? "", entry.description);
  }
  return (
    entry.description
    || autoScreenshotDescription(entry.file, { cropped: false, source: entry.source })
  );
}

function isCroppedEntry(entry: ScreenshotAsset): boolean {
  return Boolean(entry.cropped) || entry.file.startsWith("crop_");
}

async function makeThumb(blob: Blob): Promise<Blob | undefined> {
  try {
    const img = await createImageBitmap(blob);
    const maxW = 540;
    const scale = Math.min(1, maxW / img.width);
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(img.width * scale));
    canvas.height = Math.max(1, Math.round(img.height * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) return undefined;
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return await new Promise((resolve) => {
      canvas.toBlob((out) => resolve(out ?? undefined), "image/jpeg", 0.7);
    });
  } catch {
    return undefined;
  }
}

function nextCropName(source: string, existing: string[]): string {
  const stem = source.replace(/\.[^.]+$/, "").replace(/[^a-z0-9._-]+/gi, "_").toLowerCase();
  const base = `crop_${stem}`;
  if (!existing.includes(`${base}.png`)) return `${base}.png`;
  let n = 2;
  while (existing.includes(`${base}_${n}.png`)) n += 1;
  return `${base}_${n}.png`;
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

function applyCropDrag(kind: DragKind, start: CropBox, dx: number, dy: number): CropBox {
  const min = 0.08;
  if (kind === "move") {
    return {
      x: clamp(start.x + dx, 0, 1 - start.w),
      y: clamp(start.y + dy, 0, 1 - start.h),
      w: start.w,
      h: start.h,
    };
  }
  let { x, y, w, h } = start;
  if (kind.includes("w")) {
    const nx = clamp(x + dx, 0, x + w - min);
    w += x - nx;
    x = nx;
  }
  if (kind.includes("e")) w = clamp(w + dx, min, 1 - x);
  if (kind.includes("n")) {
    const ny = clamp(y + dy, 0, y + h - min);
    h += y - ny;
    y = ny;
  }
  if (kind.includes("s")) h = clamp(h + dy, min, 1 - y);
  return { x, y, w, h };
}

function cropImageToBlob(img: HTMLImageElement, box: CropBox): Promise<Blob> {
  const sx = Math.round(img.naturalWidth * box.x);
  const sy = Math.round(img.naturalHeight * box.y);
  const sw = Math.max(1, Math.round(img.naturalWidth * box.w));
  const sh = Math.max(1, Math.round(img.naturalHeight * box.h));
  const canvas = document.createElement("canvas");
  canvas.width = sw;
  canvas.height = sh;
  const ctx = canvas.getContext("2d");
  if (!ctx) return Promise.reject(new Error("Could not crop"));
  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) reject(new Error("Could not crop"));
      else resolve(blob);
    }, "image/png");
  });
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
  useEffect(() => { setText(value); }, [value]);

  const commit = async () => {
    const next = text.trim();
    if (next === value.trim()) return;
    setSaving(true);
    try {
      await onSave(next);
    } finally {
      setSaving(false);
    }
  };

  return (
    <label className="block">
      <span className="text-[10px] font-bold uppercase tracking-wide text-stone-400">Description</span>
      <input
        value={text}
        maxLength={160}
        onChange={(ev) => setText(ev.target.value)}
        onBlur={() => { void commit(); }}
        placeholder="e.g. Home — today's session card"
        className="mt-1 w-full rounded-lg border border-stone-200 px-2 py-1.5 text-xs text-stone-800"
      />
      {saving && <span className="text-[10px] text-stone-400">Saving…</span>}
    </label>
  );
}

function CropEditor({
  file,
  src,
  initialDescription,
  onCancel,
  onSave,
  saving,
}: {
  file: string;
  src: string;
  initialDescription: string;
  onCancel: () => void;
  onSave: (blob: Blob, description: string) => Promise<void>;
  saving: boolean;
}) {
  const imgRef = useRef<HTMLImageElement>(null);
  const dragRef = useRef<{ kind: DragKind; startX: number; startY: number; startBox: CropBox; width: number; height: number } | null>(null);
  const [box, setBox] = useState<CropBox>({ x: 0.08, y: 0.1, w: 0.84, h: 0.42 });
  const [description, setDescription] = useState(initialDescription);

  useEffect(() => {
    const onMove = (ev: PointerEvent) => {
      const drag = dragRef.current;
      if (!drag) return;
      ev.preventDefault();
      const dx = (ev.clientX - drag.startX) / drag.width;
      const dy = (ev.clientY - drag.startY) / drag.height;
      setBox(applyCropDrag(drag.kind, drag.startBox, dx, dy));
    };
    const onUp = () => { dragRef.current = null; };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, []);

  const beginDrag = (kind: DragKind, ev: { clientX: number; clientY: number; preventDefault: () => void; stopPropagation: () => void }) => {
    const img = imgRef.current;
    if (!img) return;
    ev.preventDefault();
    ev.stopPropagation();
    const rect = img.getBoundingClientRect();
    dragRef.current = {
      kind,
      startX: ev.clientX,
      startY: ev.clientY,
      startBox: box,
      width: rect.width,
      height: rect.height,
    };
  };

  const save = async () => {
    const img = imgRef.current;
    if (!img || !img.naturalWidth) return;
    const blob = await cropImageToBlob(img, box);
    await onSave(blob, description.trim());
  };

  const handles: Array<[DragKind, string]> = [
    ["nw", "left-0 top-0 -translate-x-1/2 -translate-y-1/2"],
    ["ne", "right-0 top-0 translate-x-1/2 -translate-y-1/2"],
    ["sw", "left-0 bottom-0 -translate-x-1/2 translate-y-1/2"],
    ["se", "right-0 bottom-0 translate-x-1/2 translate-y-1/2"],
  ];

  return (
    <div className="bg-white rounded-2xl border border-stone-200 p-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-bold text-stone-800">Crop {file}</p>
        <button onClick={onCancel} className="text-xs font-bold text-stone-500">Change screenshot</button>
      </div>
      <p className="text-xs text-stone-500">Drag the box. Corners resize. Description must say what this crop shows — not the full screenshot.</p>
      <div className="relative w-fit max-w-full mx-auto select-none" style={{ touchAction: "none" }}>
        <img
          ref={imgRef}
          src={src}
          alt={file}
          className="block max-h-[70vh] max-w-full"
          draggable={false}
        />
        <div className="absolute inset-0">
          <div
            className="absolute border-2 border-white cursor-move"
            style={{
              left: `${box.x * 100}%`,
              top: `${box.y * 100}%`,
              width: `${box.w * 100}%`,
              height: `${box.h * 100}%`,
              boxShadow: "0 0 0 9999px rgba(0,0,0,0.45)",
            }}
            onPointerDown={(ev) => beginDrag("move", ev)}
          >
            {handles.map(([kind, pos]) => (
              <button
                key={kind}
                type="button"
                aria-label={`Resize ${kind}`}
                className={`absolute w-4 h-4 bg-white border border-stone-400 rounded-sm ${pos}`}
                onPointerDown={(ev) => beginDrag(kind, ev)}
              />
            ))}
          </div>
        </div>
      </div>
      <label className="block">
        <span className="text-[10px] font-bold uppercase tracking-wide text-stone-400">Description</span>
        <input
          value={description}
          maxLength={160}
          onChange={(ev) => setDescription(ev.target.value)}
          placeholder="Crop: what's in the box. Use for when."
          className="mt-1 w-full rounded-lg border border-stone-200 px-2 py-1.5 text-xs text-stone-800"
        />
      </label>
      <button
        onClick={() => { void save(); }}
        disabled={saving}
        className="w-full px-5 py-3 rounded-xl text-white text-sm font-bold disabled:opacity-50"
        style={{ backgroundColor: GREEN }}
      >
        {saving ? "Saving…" : "Save crop"}
      </button>
    </div>
  );
}

function ShotCard({
  entry,
  previewTs,
  deleting,
  onSaveDescription,
  onDelete,
}: {
  entry: ScreenshotAsset;
  previewTs: number;
  deleting: string | null;
  onSaveDescription: (file: string, description: string) => Promise<void>;
  onDelete: (file: string) => void;
}) {
  return (
    <div className="bg-white rounded-2xl border border-stone-200 overflow-hidden">
      <img
        src={shotThumbSrc(entry, previewTs)}
        alt={entry.file}
        loading="lazy"
        decoding="async"
        className="w-full object-contain bg-stone-100"
      />
      <div className="p-3 space-y-2">
        <p className="text-xs font-bold text-stone-700">{entry.file}</p>
        <DescriptionField
          value={shotDescription(entry)}
          onSave={(next) => onSaveDescription(entry.file, next)}
        />
        <button
          onClick={() => onDelete(entry.file)}
          disabled={deleting === entry.file}
          className={`shrink-0 px-3 py-1.5 rounded-lg text-xs font-bold border border-red-200 text-red-600 bg-red-50 ${deleting === entry.file ? "opacity-50" : ""}`}
        >
          {deleting === entry.file ? "…" : "Delete"}
        </button>
      </div>
    </div>
  );
}

function ImagesView({ sub, onSub }: { sub: ImagesSub; onSub: (next: ImagesSub) => void }) {
  const [entries, setEntries] = useState<ScreenshotAsset[]>([]);
  const [cropRequests, setCropRequests] = useState<CropRequest[]>([]);
  const [error, setError] = useState("");
  const [uploading, setUploading] = useState(false);
  const [previewTs, setPreviewTs] = useState(Date.now());
  const [deleting, setDeleting] = useState<string | null>(null);
  const [fulfilling, setFulfilling] = useState<string | null>(null);
  const [cropSource, setCropSource] = useState<ScreenshotAsset | null>(null);
  const [cropSaving, setCropSaving] = useState(false);
  const [pickingCrop, setPickingCrop] = useState(false);

  const load = useCallback((fresh = false) => {
    if (!fresh) {
      loadSnapshot()
        .then((s) => {
          setEntries((prev) => (prev.length > 0 ? prev : (s.screenshots ?? [])));
        })
        .catch(() => {});
    }
    api.screenshots()
      .then((ss) => setEntries(ss))
      .catch(() => setError("Could not load screenshots."));
    api.cropRequests()
      .then((cr) => setCropRequests(cr))
      .catch(() => {});
  }, []);

  useEffect(() => { load(); }, [load]);

  const originals = entries.filter((e) => !isCroppedEntry(e));
  const cropped = entries.filter(isCroppedEntry);
  const pendingRequests = cropRequests.filter((r) => !r.fulfilled);

  const onUpload = async (files: FileList | null) => {
    if (!files?.length) return;
    setUploading(true);
    setError("");
    try {
      for (const file of Array.from(files)) {
        const res = await api.uploadScreenshot(file, {
          description: autoScreenshotDescription(file.name.toLowerCase()),
          thumb: await makeThumb(file),
        });
        if (!res.ok) throw new Error(res.error ?? "Upload failed");
      }
      setPreviewTs(Date.now());
      load(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const onDelete = async (file: string) => {
    if (!window.confirm(`Delete ${file}?`)) return;
    setDeleting(file);
    setError("");
    try {
      const res = await api.deleteScreenshot(file);
      if (!res.ok) throw new Error(res.error ?? "Delete failed");
      setPreviewTs(Date.now());
      load(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setDeleting(null);
    }
  };

  const onSaveDescription = async (file: string, description: string) => {
    const res = await api.saveScreenshotMeta(file, description);
    if (!res.ok) throw new Error(res.error ?? "Could not save description");
    setEntries((prev) => prev.map((e) => (e.file === file ? { ...e, description } : e)));
  };

  const onFulfill = async (reqId: string, files: FileList | null) => {
    if (!files?.length) return;
    setFulfilling(reqId);
    setError("");
    try {
      const res = await api.fulfillCropRequest(reqId, files[0]!);
      if (!res.ok) throw new Error(res.error ?? "Upload failed");
      setPreviewTs(Date.now());
      load(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setFulfilling(null);
    }
  };

  const onDismissRequest = async (reqId: string) => {
    try {
      await api.deleteCropRequest(reqId);
      load();
    } catch { /* ignore */ }
  };

  const onSaveCrop = async (blob: Blob, description: string) => {
    if (!cropSource) return;
    setCropSaving(true);
    setError("");
    try {
      const name = nextCropName(cropSource.file, entries.map((e) => e.file));
      const file = new File([blob], name, { type: "image/png" });
      const sourceDesc = shotDescription(cropSource);
      const suggested = cropDescriptionFor(cropSource.file, sourceDesc);
      const trimmed = description.trim();
      const res = await api.uploadScreenshot(file, {
        description: !trimmed || trimmed === sourceDesc.trim() ? suggested : trimmed,
        source: cropSource.file,
        cropped: true,
        thumb: await makeThumb(blob),
      });
      if (!res.ok) throw new Error(res.error ?? "Upload failed");
      setPreviewTs(Date.now());
      setCropSource(null);
      setPickingCrop(false);
      load(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setCropSaving(false);
    }
  };

  const shotProps = {
    previewTs,
    deleting,
    onSaveDescription,
    onDelete,
  };

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-2xl border border-stone-200 p-4 space-y-3">
        <div className="flex gap-2">
          {([
            ["all", "All SS"],
            ["ss", "SS"],
            ["crop", "Crop"],
          ] as const).map(([id, label]) => (
            <button
              key={id}
              onClick={() => {
                setCropSource(null);
                setPickingCrop(false);
                onSub(id);
              }}
              className={`px-4 py-2 rounded-xl text-sm font-bold ${sub === id ? "text-white" : "bg-stone-100 text-stone-600"}`}
              style={sub === id ? { backgroundColor: GREEN } : undefined}
            >
              {label}
            </button>
          ))}
        </div>
        {sub === "all" && (
          <p className="text-xs text-stone-500">
            Every screenshot and crop. Descriptions tell the engine when to use each one.
          </p>
        )}
        {sub === "ss" && (
          <>
            <label className="block">
              <input
                type="file"
                accept="image/*"
                multiple
                className="sr-only"
                onChange={(ev) => onUpload(ev.target.files)}
              />
              <span
                className="block w-full text-center px-5 py-3.5 rounded-xl text-white text-sm font-bold"
                style={{ backgroundColor: GREEN }}
              >
                {uploading ? "Uploading…" : "Upload from Photos"}
              </span>
            </label>
            <p className="text-xs text-stone-500">
              Uploaded screenshots only. Add a short description so the engine picks the right one.
            </p>
          </>
        )}
        {sub === "crop" && !cropSource && !pickingCrop && (
          <button
            type="button"
            onClick={() => setPickingCrop(true)}
            className="block w-full text-center px-5 py-3.5 rounded-xl text-white text-sm font-bold"
            style={{ backgroundColor: GREEN }}
          >
            Crop a screenshot
          </button>
        )}
        {error && <p className="text-xs text-red-600">{error}</p>}
      </div>

      {sub === "all" && (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {originals.map((e) => <ShotCard key={e.file} entry={e} {...shotProps} />)}
          {cropped.length > 0 && (
            <>
              <div className="col-span-full"><p className="text-xs font-bold text-stone-400 uppercase tracking-wide">Crops</p></div>
              {cropped.map((e) => <ShotCard key={e.file} entry={e} {...shotProps} />)}
            </>
          )}
          {entries.length === 0 && <p className="text-sm text-stone-500">No screenshots yet — upload from the SS tab.</p>}
        </div>
      )}

      {sub === "ss" && (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {originals.map((e) => <ShotCard key={e.file} entry={e} {...shotProps} />)}
          {originals.length === 0 && <p className="text-sm text-stone-500">No screenshots yet — upload from Photos.</p>}
        </div>
      )}

      {sub === "crop" && (
        <div className="space-y-4">
          {pendingRequests.length > 0 && !cropSource && (
            <div className="space-y-3">
              <p className="text-xs font-bold uppercase tracking-wide text-amber-700">Engine crop requests</p>
              {pendingRequests.map((req) => (
                <div key={req.id} className="bg-white rounded-2xl border border-amber-200 p-4 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-bold text-stone-800">Crop needed: {req.sourceFile}</p>
                      <p className="text-xs text-stone-600 mt-1">{req.description}</p>
                      <p className="text-[10px] text-stone-400 mt-1">Requested {new Date(req.createdAt).toLocaleDateString()}</p>
                    </div>
                    <button onClick={() => onDismissRequest(req.id)} className="shrink-0 text-[10px] font-bold text-stone-400">Dismiss</button>
                  </div>
                  <label className="block">
                    <input type="file" accept="image/*" className="sr-only" onChange={(ev) => onFulfill(req.id, ev.target.files)} />
                    <span
                      className={`block w-full text-center px-5 py-3 rounded-xl text-white text-sm font-bold ${fulfilling === req.id ? "opacity-50" : ""}`}
                      style={{ backgroundColor: GREEN }}
                    >
                      {fulfilling === req.id ? "Uploading…" : "Upload cropped screenshot"}
                    </span>
                  </label>
                </div>
              ))}
            </div>
          )}

          {cropSource ? (
            <CropEditor
              file={cropSource.file}
              src={api.rawUrl(cropSource.file)}
              initialDescription={cropDescriptionFor(cropSource.file, shotDescription(cropSource))}
              onCancel={() => { setCropSource(null); setPickingCrop(false); }}
              onSave={onSaveCrop}
              saving={cropSaving}
            />
          ) : pickingCrop ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-xs font-bold uppercase tracking-wide text-stone-400">Pick a screenshot to crop</p>
                <button type="button" onClick={() => setPickingCrop(false)} className="text-xs font-bold text-stone-500">Cancel</button>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                {originals.map((e) => (
                  <button
                    key={e.file}
                    type="button"
                    onClick={() => setCropSource(e)}
                    className="bg-white rounded-2xl border border-stone-200 overflow-hidden text-left hover:border-stone-400"
                  >
                    <img src={shotThumbSrc(e, previewTs)} alt={e.file} loading="lazy" decoding="async" className="w-full object-contain bg-stone-100 max-h-48" />
                    <div className="p-2">
                      <p className="text-xs font-bold text-stone-700">{e.file}</p>
                      <p className="text-[11px] text-stone-500 mt-0.5">{shotDescription(e)}</p>
                    </div>
                  </button>
                ))}
                {originals.length === 0 && (
                  <p className="text-sm text-stone-500 col-span-full py-4">Upload screenshots on the SS tab first.</p>
                )}
              </div>
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {cropped.map((e) => <ShotCard key={e.file} entry={e} {...shotProps} />)}
              {cropped.length === 0 && (
                <p className="text-sm text-stone-500 col-span-full">No crops yet. Tap Crop a screenshot to make one.</p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

const SVG_THEMES = ["all", "office", "pain", "recovery", "lifestyle", "rejected"] as const;
const SVG_SOURCES = ["all", "Remedy flat", "Remedy original", "illlustrations.co", "Open Doodles"] as const;
const SVG_KITS = ["svgs", "people"] as const;

function isPeopleAsset(i: IllustrationAsset): boolean {
  return i.source === "Remedy people" || i.fit === "photo";
}

function SvgsView() {
  const [items, setItems] = useState<IllustrationAsset[]>([]);
  const [kit, setKit] = useState<(typeof SVG_KITS)[number]>("svgs");
  const [theme, setTheme] = useState<(typeof SVG_THEMES)[number]>("all");
  const [source, setSource] = useState<(typeof SVG_SOURCES)[number]>("all");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [preview, setPreview] = useState<IllustrationAsset | null>(null);

  useEffect(() => {
    loadSnapshot()
      .then((s) => setItems(s.illustrations ?? []))
      .catch(() => setError("Could not load SVGs."));
  }, []);

  useEffect(() => {
    if (!preview) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setPreview(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [preview]);

  if (!items.length && !error) {
    return <p className="text-sm text-stone-500 py-8 text-center">Loading…</p>;
  }

  const isEnabled = (i: IllustrationAsset) => i.enabled !== false;
  const inKit = items.filter((i) => (kit === "people" ? isPeopleAsset(i) : !isPeopleAsset(i)));
  const rejectedCount = inKit.filter((i) => !isEnabled(i)).length;
  const visible = inKit.filter((i) => {
    if (theme === "rejected") return !isEnabled(i);
    if (!isEnabled(i)) return false;
    if (theme !== "all" && !i.themes?.includes(theme)) return false;
    if (kit === "svgs" && source !== "all" && i.source !== source) return false;
    return true;
  });

  const toggle = async (item: IllustrationAsset) => {
    const next = !isEnabled(item);
    setBusy(item.id);
    setError("");
    try {
      const res = await api.setIllustrationEnabled(item.id, next);
      if (!res.ok) throw new Error(res.error ?? "Update failed");
      setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, enabled: next } : i)));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Update failed");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-2xl border border-stone-200 p-4">
        <h2 className="font-bold text-sm">Carousel visuals</h2>
        <p className="text-xs text-stone-500 mt-1">
          {kit === "people"
            ? "Photoreal AI people. Same reject/enable as SVGs. Person posts are 6–10 slides: cover plus a later slide (2nd / 3rd / 4th / 5th or a combo) — never only the title, never every slide."
            : "Licensed cover illustrations (MIT / CC0, ads-safe) plus Remedy-owned kits. Remedy flat is the Hinge-style scene set. Reject anything you don't like — it drops out of new slides."}
        </p>
        <div className="flex flex-wrap gap-2 mt-3">
          {SVG_KITS.map((k) => (
            <button
              key={k}
              onClick={() => {
                setKit(k);
                setTheme("all");
                setSource("all");
              }}
              className={`px-3 py-1 rounded-full text-xs font-semibold border ${
                kit === k
                  ? "bg-stone-900 text-white border-stone-900"
                  : "bg-white text-stone-600 border-stone-200"
              }`}
            >
              {k === "svgs"
                ? `SVGs (${items.filter((i) => !isPeopleAsset(i) && isEnabled(i)).length})`
                : `People (${items.filter((i) => isPeopleAsset(i) && isEnabled(i)).length})`}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-2 mt-3">
          {SVG_THEMES.map((t) => (
            <button
              key={t}
              onClick={() => setTheme(t)}
              className={`px-3 py-1 rounded-full text-xs font-semibold border ${
                theme === t
                  ? "bg-green-800 text-white border-green-800"
                  : "bg-white text-stone-600 border-stone-200"
              }`}
            >
              {t === "all"
                ? `All (${inKit.length - rejectedCount})`
                : t === "rejected"
                  ? `Rejected (${rejectedCount})`
                  : t}
            </button>
          ))}
        </div>
        {kit === "svgs" && (
        <div className="flex flex-wrap gap-2 mt-2">
          {SVG_SOURCES.map((s) => (
            <button
              key={s}
              onClick={() => setSource(s)}
              className={`px-3 py-1 rounded-full text-xs font-semibold border ${
                source === s
                  ? "bg-amber-700 text-white border-amber-700"
                  : "bg-white text-stone-600 border-stone-200"
              }`}
            >
              {s === "all" ? "All types" : s}
            </button>
          ))}
        </div>
        )}
        {error && <p className="text-xs text-red-600 mt-2">{error}</p>}
      </div>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {visible.map((item) => (
          <div
            key={item.id}
            className={`bg-white rounded-2xl border overflow-hidden ${
              isEnabled(item) ? "border-stone-200" : "border-red-200 opacity-70"
            }`}
          >
            {item.svg ? (
              <div dangerouslySetInnerHTML={{ __html: item.svg }} className="[&>svg]:w-full [&>svg]:h-auto" />
            ) : (
              <button
                type="button"
                onClick={() => setPreview(item)}
                className="block w-full bg-stone-100 cursor-zoom-in"
              >
                <img src={item.url} alt={item.name} className="w-full h-56 object-cover" loading="lazy" />
              </button>
            )}
            <div className="p-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-bold">
                    {item.name}
                    {!isEnabled(item) && <span className="ml-2 text-[10px] font-bold text-red-600">REJECTED</span>}
                  </p>
                  <p className="text-xs text-stone-500">{item.description}</p>
                  <p className="text-[10px] text-stone-400 mt-1">
                    {item.source} · {item.license}
                    {item.fit ? ` · ${item.fit}` : ""}
                    {item.themes?.length ? ` · ${item.themes.join(", ")}` : ""}
                  </p>
                </div>
                <button
                  onClick={() => toggle(item)}
                  disabled={busy === item.id}
                  className={`shrink-0 px-3 py-1.5 rounded-lg text-xs font-bold border ${
                    isEnabled(item)
                      ? "border-red-200 text-red-600 bg-red-50"
                      : "border-green-700 text-white bg-green-700"
                  } ${busy === item.id ? "opacity-50" : ""}`}
                >
                  {busy === item.id ? "…" : isEnabled(item) ? "Reject" : "Enable"}
                </button>
              </div>
            </div>
          </div>
        ))}
        {visible.length === 0 && (
          <p className="text-sm text-stone-500 col-span-full py-6 text-center">
            {theme === "rejected" ? "Nothing rejected yet." : "No SVGs in this theme."}
          </p>
        )}
      </div>
      {preview?.url && (
        <button
          type="button"
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4 md:p-10"
          onClick={() => setPreview(null)}
          aria-label="Close preview"
        >
          <img
            src={preview.url}
            alt={preview.name}
            className="max-h-full max-w-full object-contain rounded-xl shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          />
        </button>
      )}
    </div>
  );
}

function SettingsView({
  settings,
  live,
  posts,
  pipeline,
}: {
  settings: Settings | null;
  live: boolean;
  posts: Post[];
  pipeline: PipelineStep[];
}) {
  const [code, setCode] = useState("");
  const [bbToken, setBbToken] = useState("");
  const [connectMsg, setConnectMsg] = useState("");
  if (!settings) return <p className="text-sm text-stone-500 py-8 text-center">Loading…</p>;

  const bb = settings.brightbean;
  const publisher = bb?.publisher ?? "native";
  const accountLine = (mapped: string) => {
    const a = bb?.accounts.find((x) => x.mapped === mapped);
    if (!a) return "not on this key";
    return a.status === "connected" ? (a.handle || a.name || "connected") : a.status;
  };

  const rows: Array<[string, string]> = [
    ["Mode", live ? "Live engine (this device / PC)" : "Cloud studio (phone anytime)"],
    ["Today's cap", `${settings.todayCap} on each connected platform`],
    ["Daily generate", settings.generateEnabled === true ? (settings.generateAt ?? "4:30 AM — if the queue is clear") : "PAUSED — off until you say so"],
    ["Analytics", settings.analyticsEnabled === true ? "on" : "PAUSED — no pulls until we can track posts"],
    ["Learning", settings.learningEnabled === true ? "on" : "PAUSED — no diagnosis or evolve"],
    ["Ramp start", settings.rampStartDate || "off"],
    ["Ramp cap", `${settings.rampCap} per platform`],
    ["Expire shorts", settings.expireShorts === true ? "48h after publish" : "off until you start posting"],
    ["Platforms", settings.platforms],
    ["Publisher", publisher === "brightbean" ? "BrightBean" : "native APIs"],
    ["Auto-send timer", settings.autoPublish ? "on" : "off"],
    ["Send · TikTok", "live (silent carousel for now)"],
    ["Send · IG / Facebook", "live carousel"],
    ["Send · YouTube", "silent Short — add music when you post"],
    ["Text generation", String(settings.llmProvider)],
    ["R2 slides", settings.r2Configured ? "slides.remedyrecoveries.com" : "missing"],
    ["TikTok account", publisher === "brightbean" ? accountLine("tiktok") : (settings.tiktokConnected ? "connected (native)" : "not set")],
    ["Instagram", publisher === "brightbean" ? accountLine("instagram") : (settings.instagramConfigured ? "configured" : "not set")],
    ["Facebook", publisher === "brightbean" ? accountLine("facebook") : (settings.facebookConfigured ? "configured" : "not set")],
    ["YouTube", bb?.youtubeConnected || settings.youtubeConfigured ? `${accountLine("youtube")} — slideshow Short` : "not connected"],
    ["TikTok inbox (later)", settings.tiktokNativeConnected ? "native connected" : "optional — music later"],
    ["Pending phone actions", String(settings.pendingCount ?? 0)],
    ["Library size", String(posts.length)],
  ];

  return (
    <div className="space-y-4 lg:grid lg:grid-cols-2 lg:gap-4 lg:space-y-0">
      <div className="bg-white rounded-2xl border border-stone-200 divide-y divide-stone-100 lg:col-span-2">
        {rows.map(([k, v]) => (
          <div key={k} className="flex items-center justify-between p-3.5 gap-3">
            <span className="text-sm text-stone-600">{k}</span>
            <span className="text-sm font-bold text-right">{v}</span>
          </div>
        ))}
      </div>
      <div className="bg-white rounded-2xl border border-stone-200 p-4 space-y-2">
        <h3 className="text-sm font-bold">Links for bios</h3>
        <p className="text-xs text-stone-600">Until the app is for sale, bio link is the website only. No App Store URL in captions.</p>
        <p className="text-xs text-stone-600 break-all">{SITE_URL}</p>
        <div className="flex gap-2">
          <button type="button" onClick={() => copyText(SITE_URL)} className="px-3 py-2 rounded-lg bg-stone-800 text-white text-xs font-semibold">
            Copy website
          </button>
          <a href={SITE_URL} target="_blank" rel="noreferrer" className="px-3 py-2 rounded-lg bg-stone-100 text-xs font-semibold">
            Open
          </a>
        </div>
        <p className="text-[11px] text-stone-400 pt-2">App Store (do not use yet): {appStoreUrl(settings)}</p>
      </div>
      <div className="bg-white rounded-2xl border border-stone-200 p-4">
        <h3 className="text-sm font-bold mb-2">Hosts</h3>
        <p className="text-xs text-stone-600">
          Public images: <code>slides.remedyrecoveries.com</code> (TikTok pulls these — do not password).
        </p>
        <p className="text-xs text-stone-600 mt-1">
          This studio: <code>slide.remedyrecoveries.com</code> (studio password — one login per browser).
        </p>
      </div>
      <div className="bg-white rounded-2xl border border-stone-200 p-4 text-xs text-stone-600 space-y-2">
        <p className="font-bold text-sm text-stone-900">How this stays free</p>
        <p>Images and this dashboard live on Cloudflare. New slideshows still render on your PC (Sharp + Cursor). After each generate, the cloud copy updates so your phone always has the latest.</p>
        <p>
          Pipeline now: {pipeline.map((s) => `${s.label} ${s.count}`).join(" · ")}.
        </p>
      </div>
      <div className={`rounded-2xl border p-4 space-y-3 lg:col-span-2 ${bb?.connected ? "bg-white border-emerald-200" : "bg-white border-stone-200"}`}>
        <h3 className="text-sm font-bold">BrightBean</h3>
        <p className="text-xs text-stone-600">
          Send now goes live on TikTok, Instagram, Facebook, and YouTube. YouTube is a slideshow Short with a free CC-BY bed.
          TikTok catalog music can wait — no inbox draft step right now.
        </p>
        {bb?.configured ? (
          <div className="space-y-2">
            <p className="text-xs text-stone-700">
              {bb.workspace ? <span className="font-semibold">{bb.workspace}</span> : "Workspace"} · API key set
            </p>
            <ul className="text-xs text-stone-600 space-y-1">
              {(bb.accounts.length ? bb.accounts : []).map((a) => (
                <li key={a.id}>
                  {a.mapped}: {a.handle || a.name} — {a.status}
                </li>
              ))}
              {bb.accounts.length === 0 && <li>No accounts on this key yet — refresh after connecting channels in BrightBean.</li>}
            </ul>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={!live}
                onClick={async () => {
                  const res = await api.brightbeanRefresh();
                  setConnectMsg(res.ok ? "Accounts refreshed" : (res.error ?? "Refresh failed — needs the PC engine"));
                  if (res.ok) location.reload();
                }}
                className="px-3 py-2 rounded-lg bg-stone-100 text-xs font-semibold disabled:opacity-40"
              >
                Refresh accounts
              </button>
              <button
                type="button"
                disabled={!live}
                onClick={async () => {
                  if (!confirm("Disconnect BrightBean from this engine? Social accounts stay in BrightBean.")) return;
                  await api.brightbeanDisconnect();
                  setConnectMsg("Disconnected");
                  location.reload();
                }}
                className="px-3 py-2 rounded-lg bg-red-50 text-red-700 border border-red-200 text-xs font-semibold disabled:opacity-40"
              >
                Disconnect
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            <p className="text-xs text-stone-600">
              In BrightBean: Organization Settings → API Keys → Issue new key. Tick create_posts, publish_directly, upload_media, view_analytics. Select all accounts. Paste the key here (PC engine only).
            </p>
            {live ? (
              <div className="flex gap-2">
                <input
                  value={bbToken}
                  onChange={(e) => setBbToken(e.target.value)}
                  placeholder="bb_studio_…"
                  className="flex-1 border border-stone-300 rounded-xl px-3 py-2 text-sm"
                  autoComplete="off"
                />
                <button
                  type="button"
                  onClick={async () => {
                    const res = await api.brightbeanConnect(bbToken.trim());
                    setConnectMsg(res.ok ? "Connected" : (res.error ?? "Failed"));
                    if (res.ok) {
                      setBbToken("");
                      location.reload();
                    }
                  }}
                  className="px-4 rounded-xl bg-emerald-600 text-white text-sm font-bold"
                >
                  Connect
                </button>
              </div>
            ) : (
              <p className="text-xs text-stone-500">Open Settings on the PC engine to paste the key.</p>
            )}
          </div>
        )}
        {connectMsg && <p className="text-xs text-stone-500">{connectMsg}</p>}
      </div>
      {settings.tiktokNativeAppConfigured && settings.tiktokNativeConnected && (
        <div className="bg-white rounded-2xl border border-emerald-200 p-4 space-y-3">
          <h3 className="text-sm font-bold">TikTok inbox (music)</h3>
          <p className="text-xs text-stone-600">Inbox drafts so you can add a sound in the TikTok app. BrightBean still posts IG/FB/YouTube.</p>
          <button
            onClick={async () => {
              if (!confirm("Disconnect native TikTok?")) return;
              await api.tiktokDisconnect();
              setConnectMsg("Disconnected native TikTok.");
              location.reload();
            }}
            className="w-full py-2.5 rounded-xl bg-red-50 text-red-700 border border-red-200 text-sm font-semibold"
          >
            Disconnect TikTok
          </button>
        </div>
      )}
      {settings.tiktokNativeAppConfigured && !settings.tiktokNativeConnected && (
        <div className="bg-white rounded-2xl border border-stone-200 p-4 space-y-3">
          <h3 className="text-sm font-bold">TikTok inbox (music)</h3>
          <p className="text-xs text-stone-600">Reconnect to drop carousels in your TikTok inbox so you can add a sound. Without this, TikTok is a BrightBean draft (no catalog track).</p>
          <button
            onClick={async () => {
              if (typeof settings.tiktokAuthUrl === "string" && settings.tiktokAuthUrl) {
                window.open(settings.tiktokAuthUrl, "_blank");
                return;
              }
              const res = await api.tiktokAuthUrl();
              if (res.ok && res.url) window.open(res.url, "_blank");
              else setConnectMsg(res.error ?? "Failed");
            }}
            className="w-full py-2.5 rounded-xl bg-black text-white text-sm font-bold"
          >
            Open TikTok authorization
          </button>
          {live && (
            <div className="flex gap-2">
              <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="Paste code" className="flex-1 border border-stone-300 rounded-xl px-3 py-2 text-sm" />
              <button
                onClick={async () => {
                  const res = await api.tiktokExchange(code);
                  setConnectMsg(res.ok ? "Connected" : (res.error ?? "Failed"));
                }}
                className="px-4 rounded-xl bg-emerald-600 text-white text-sm font-bold"
              >
                Connect
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
