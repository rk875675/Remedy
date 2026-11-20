import { FORMAT_STUDIES, formatAssetUrl, formatCount, type FormatStudy } from "./formatLibrary";

const GREEN = "#33663f";

function StatsRow({ stats }: { stats: FormatStudy["stats"] }) {
  const items = [
    stats.views > 0 ? `${formatCount(stats.views)} views` : null,
    stats.likes > 0 ? `${formatCount(stats.likes)} likes` : null,
    stats.comments > 0 ? `${formatCount(stats.comments)} comments` : null,
    stats.shares != null && stats.shares > 0 ? `${formatCount(stats.shares)} shares` : null,
  ].filter((item): item is string => item != null);
  if (items.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs font-semibold text-stone-500">
      {items.map((label) => (
        <span key={label}>{label}</span>
      ))}
    </div>
  );
}

function FormatFeedCard({ study, onOpen }: { study: FormatStudy; onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="w-full overflow-hidden rounded-2xl border border-stone-200 bg-white text-left transition hover:border-stone-300"
    >
      <video
        src={formatAssetUrl(study.clip)}
        poster={formatAssetUrl(study.poster)}
        muted
        loop
        playsInline
        preload="metadata"
        className="aspect-[9/16] w-full max-h-[min(70vh,520px)] bg-black object-cover"
        onMouseEnter={(e) => void e.currentTarget.play().catch(() => undefined)}
        onMouseLeave={(e) => {
          e.currentTarget.pause();
          e.currentTarget.currentTime = 0;
        }}
      />
      <div className="space-y-1.5 p-3">
        <p className="line-clamp-2 text-sm font-bold leading-snug text-stone-900">{study.hook}</p>
        <StatsRow stats={study.stats} />
      </div>
    </button>
  );
}

function FormatDetail({ study, onBack }: { study: FormatStudy; onBack: () => void }) {
  return (
    <div className="max-w-lg space-y-4 pb-8">
      <button type="button" onClick={onBack} className="text-sm font-bold text-stone-600">
        ← Back to library
      </button>
      <div className="space-y-2">
        <h2 className="text-lg font-bold text-stone-900">{study.hook}</h2>
        <StatsRow stats={study.stats} />
        <p className="text-sm text-stone-600">{study.summary}</p>
        <p className="text-xs text-stone-500">
          Sound: {study.songTitle} — {study.songArtist}. {study.songNote}{" "}
          <a href={study.sourceUrl} target="_blank" rel="noreferrer" className="font-semibold" style={{ color: GREEN }}>
            Source
          </a>
        </p>
      </div>
      <video
        src={formatAssetUrl(study.clip)}
        controls
        playsInline
        preload="metadata"
        poster={formatAssetUrl(study.poster)}
        className="w-full max-w-sm rounded-2xl bg-black"
        style={{ aspectRatio: "9 / 16" }}
      />
      <div className="space-y-4">
        {study.parts.map((part) => (
          <section key={part.label} className="rounded-2xl border border-stone-200 bg-white p-4">
            <p className="text-[11px] font-bold uppercase tracking-wide text-stone-400">{part.label}</p>
            {part.kind === "audio" ? (
              <audio controls preload="none" src={formatAssetUrl(part.file)} className="mt-3 w-full" />
            ) : part.kind === "gif" ? (
              <div
                className="mt-3 flex max-w-sm items-center justify-center rounded-xl border border-stone-100 p-2"
                style={{
                  backgroundColor: "#e7e5e4",
                  backgroundImage:
                    "linear-gradient(45deg, #d6d3d1 25%, transparent 25%), linear-gradient(-45deg, #d6d3d1 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #d6d3d1 75%), linear-gradient(-45deg, transparent 75%, #d6d3d1 75%)",
                  backgroundSize: "16px 16px",
                  backgroundPosition: "0 0, 0 8px, 8px -8px, -8px 0",
                }}
              >
                <img src={formatAssetUrl(part.file)} alt={part.label} className="max-h-96 w-full object-contain" />
              </div>
            ) : part.kind === "text" ? (
              <div className="mt-3 max-w-sm rounded-xl bg-stone-900 px-4 py-5 text-center">
                <p className="text-sm font-bold leading-snug text-white">{part.body ?? study.hook}</p>
              </div>
            ) : (
              <img
                src={formatAssetUrl(part.file)}
                alt={part.label}
                className="mt-3 w-full max-w-sm rounded-xl border border-stone-100 object-cover"
              />
            )}
            <p className="mt-2 text-xs text-stone-600">{part.caption}</p>
          </section>
        ))}
      </div>
    </div>
  );
}

export function FormatLibraryView({
  formatId,
  onFormatId,
}: {
  formatId: string | null;
  onFormatId: (id: string | null) => void;
}) {
  const active = formatId ? FORMAT_STUDIES.find((row) => row.id === formatId) : undefined;

  if (active) {
    return <FormatDetail study={active} onBack={() => onFormatId(null)} />;
  }

  return (
    <div className="max-w-lg space-y-3 pb-8">
      <p className="text-sm text-stone-600">Reference formats to study. Tap one for parts.</p>
      {FORMAT_STUDIES.length === 0 ? <p className="text-sm text-stone-500">No formats yet.</p> : null}
      {FORMAT_STUDIES.map((study) => (
        <FormatFeedCard key={study.id} study={study} onOpen={() => onFormatId(study.id)} />
      ))}
    </div>
  );
}
