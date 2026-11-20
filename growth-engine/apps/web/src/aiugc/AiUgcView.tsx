import { useMemo, useState } from "react";
import { DOC_BLOCKS, DOC_UPDATED } from "./doc.data";
import { FORMATS } from "./formats.data";
import type { FormatSection, Learning, UgcFormat, WorkflowStep } from "./types";
import { LEARNINGS, WORKFLOW, WORKFLOW_SOURCE } from "./workflow.data";

const GREEN = "#33663f";

export type AiUgcSub = "workflow" | "formats" | "learnings";
export const AI_UGC_SUBS: AiUgcSub[] = ["workflow", "formats", "learnings"];

const SUB_LABEL: Record<AiUgcSub, string> = {
  workflow: "Workflow",
  formats: "Formats",
  learnings: "Learnings",
};

const SECTION_LABEL: Record<FormatSection, string> = {
  mascot: "Mascot",
  "ai-character": "AI armadillo",
  lindsey: "Lindsey",
  niche: "Niche",
};

function StepCard({ step, last }: { step: WorkflowStep; last: boolean }) {
  const ok = step.state === "works";
  const dot = ok ? GREEN : step.state === "needs-work" ? "#b45309" : "#a8a29e";
  return (
    <li className="relative pl-12">
      {!last && <span className="absolute left-[19px] top-10 bottom-0 w-0.5 bg-stone-200" aria-hidden />}
      <span
        className="absolute left-0 top-0 h-10 w-10 rounded-full text-white text-sm font-extrabold flex items-center justify-center"
        style={{ backgroundColor: dot }}
      >
        {step.n}
      </span>
      <div className="rounded-2xl bg-white border border-stone-200 px-4 py-3.5 mb-3">
        <div className="flex items-start justify-between gap-3">
          <p className="text-base font-extrabold leading-tight">{step.name}</p>
          <span
            className={`shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-bold ${
              ok ? "bg-green-100 text-green-800" : step.state === "needs-work" ? "bg-amber-100 text-amber-800" : "bg-stone-100 text-stone-600"
            }`}
          >
            {ok ? "Works" : step.state === "needs-work" ? "Needs work" : "Untested"}
          </span>
        </div>
        <p className="mt-1.5 text-[13px] text-stone-700 leading-snug">{step.what}</p>
        <dl className="mt-2.5 grid grid-cols-1 sm:grid-cols-3 gap-2 text-[12px]">
          <div className="rounded-xl bg-stone-50 px-3 py-2">
            <dt className="text-stone-500 font-semibold">Tool</dt>
            <dd className="text-stone-800">{step.tool}</dd>
          </div>
          <div className="rounded-xl bg-stone-50 px-3 py-2">
            <dt className="text-stone-500 font-semibold">Output</dt>
            <dd className="text-stone-800">{step.output}</dd>
          </div>
          <div className="rounded-xl bg-stone-50 px-3 py-2">
            <dt className="text-stone-500 font-semibold">Cost</dt>
            <dd className="text-stone-800">{step.cost}</dd>
          </div>
        </dl>
        {step.stateNote && <p className="mt-2 text-[12px] text-stone-600">{step.stateNote}</p>}
        {step.gate && (
          <p className="mt-2.5 rounded-xl bg-amber-50 border border-amber-200 px-3 py-2 text-[12px] font-semibold text-amber-900">
            ✋ {step.gate}
          </p>
        )}
      </div>
    </li>
  );
}

function WorkflowPanel() {
  const fixes = WORKFLOW.filter((s) => s.state === "needs-work").length;
  return (
    <div className="space-y-4">
      <section className="rounded-2xl px-4 py-4 text-white" style={{ backgroundColor: GREEN }}>
        <p className="text-lg font-extrabold">{WORKFLOW.length} steps, from reference video to finished mp4</p>
        <p className="text-[13px] text-white/85 mt-1">
          ✋ marks the points where you approve before we continue. {fixes} steps need work before the next video.
        </p>
        <p className="text-[11px] text-white/70 mt-2">{WORKFLOW_SOURCE}</p>
      </section>
      <ol>
        {WORKFLOW.map((step, i) => (
          <StepCard key={step.n} step={step} last={i === WORKFLOW.length - 1} />
        ))}
      </ol>
    </div>
  );
}

function Shots({ title, shots }: { title: string; shots: UgcFormat["original"] }) {
  if (shots.length === 0) return null;
  return (
    <div>
      <p className="text-[12px] font-bold text-stone-500 uppercase tracking-wide">{title}</p>
      <ol className="mt-1.5 space-y-1.5">
        {shots.map((s, i) => (
          <li key={i} className="flex gap-2 text-[13px] leading-snug">
            <span className="shrink-0 w-24 font-semibold tabular-nums text-stone-500">{s.time}</span>
            <span className="text-stone-800">{s.text}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

function FormatCard({ f, open, onToggle }: { f: UgcFormat; open: boolean; onToggle: () => void }) {
  const badge =
    f.status === "blocked"
      ? "bg-red-100 text-red-700"
      : f.status === "made"
        ? "bg-amber-100 text-amber-800"
        : "bg-stone-100 text-stone-700";
  return (
    <article className="rounded-2xl bg-white border border-stone-200">
      <button type="button" onClick={onToggle} className="w-full text-left px-4 py-3 flex items-center gap-3">
        <span className="shrink-0 w-11 text-sm font-extrabold" style={{ color: GREEN }}>
          {f.id}
        </span>
        <span className="flex-1 min-w-0">
          <span className="block text-[14px] font-bold leading-tight">{f.name}</span>
          <span className="block text-[12px] text-stone-500 mt-0.5">
            {f.views} · effort {f.effort} · {f.master.app}
          </span>
        </span>
        {f.status !== "ready" && (
          <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold ${badge}`}>
            {f.status === "blocked" ? "Blocked" : "Made"}
          </span>
        )}
        <span className="shrink-0 text-stone-400">{open ? "−" : "+"}</span>
      </button>
      {open && (
        <div className="border-t border-stone-100 px-4 py-4 space-y-4">
          {f.statusNote && <p className="rounded-xl bg-amber-50 px-3 py-2 text-[12px] text-amber-900">{f.statusNote}</p>}
          <div>
            <p className="text-[12px] font-bold text-stone-500 uppercase tracking-wide">Proof</p>
            <ul className="mt-1.5 space-y-1 text-[13px]">
              <li>
                <a className="underline font-semibold" style={{ color: GREEN }} href={f.master.url} target="_blank" rel="noreferrer">
                  {f.master.handle} · {f.master.views} views · {f.master.length}
                </a>{" "}
                <span className="text-stone-500">(master)</span>
              </li>
              {f.alsoProven.map((p) => (
                <li key={p.url}>
                  <a className="underline" style={{ color: GREEN }} href={p.url} target="_blank" rel="noreferrer">
                    {p.handle || "link"}
                    {p.views ? ` · ${p.views} views` : ""}
                  </a>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <p className="text-[12px] font-bold text-stone-500 uppercase tracking-wide">Why it works</p>
            <p className="mt-1 text-[13px] text-stone-800 leading-snug">{f.whyItWorks}</p>
          </div>
          <Shots title="The original, shot by shot" shots={f.original} />
          {f.originalNotes.length > 0 && (
            <ul className="space-y-1 text-[12px] text-stone-600">
              {f.originalNotes.map((n, i) => (
                <li key={i}>• {n}</li>
              ))}
            </ul>
          )}
          <div className="rounded-2xl bg-stone-50 px-3.5 py-3.5 space-y-3">
            <p className="text-sm font-extrabold">Remedy version</p>
            <p className="text-[13px]">
              <span className="font-semibold">Hook:</span> {f.remedy.hook}
            </p>
            <p className="text-[13px]">
              <span className="font-semibold">Character:</span> {f.remedy.character}
            </p>
            <Shots title="Shots" shots={f.remedy.shots} />
            <p className="text-[13px]">
              <span className="font-semibold">App beat:</span> {f.remedy.appBeat}
            </p>
            <p className="text-[13px]">
              <span className="font-semibold">Caption:</span> {f.remedy.caption}
            </p>
            <p className="text-[13px]">
              <span className="font-semibold">Effort:</span> {f.remedy.effort} · <span className="font-semibold">Needs:</span> {f.remedy.needs}
            </p>
            <p className="text-[12px] text-stone-600">
              <span className="font-semibold">Watch-outs:</span> {f.remedy.watchOuts}
            </p>
          </div>
        </div>
      )}
    </article>
  );
}

function FormatsPanel() {
  const [section, setSection] = useState<FormatSection | "all">("all");
  const [query, setQuery] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [openBlock, setOpenBlock] = useState<string | null>(null);

  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    return FORMATS.filter(
      (f) =>
        (section === "all" || f.section === section) &&
        (!q || `${f.id} ${f.name} ${f.master.app} ${f.remedy.hook}`.toLowerCase().includes(q)),
    );
  }, [section, query]);

  const sections: Array<FormatSection | "all"> = ["all", "mascot", "ai-character", "lindsey", "niche"];

  return (
    <div className="space-y-4">
      <section className="rounded-2xl bg-white border border-stone-200 px-4 py-3">
        <p className="text-base font-extrabold">{FORMATS.length} proven formats</p>
        <p className="text-[12px] text-stone-500 mt-0.5">{DOC_UPDATED}</p>
      </section>

      <div className="space-y-2">
        {DOC_BLOCKS.map((b) => (
          <section key={b.title} className="rounded-2xl bg-white border border-stone-200">
            <button
              type="button"
              onClick={() => setOpenBlock(openBlock === b.title ? null : b.title)}
              className="w-full text-left px-4 py-3 flex items-center justify-between"
            >
              <span className="text-[14px] font-bold">{b.title}</span>
              <span className="text-stone-400">{openBlock === b.title ? "−" : "+"}</span>
            </button>
            {openBlock === b.title && (
              <div className="border-t border-stone-100 px-4 py-3 space-y-2 text-[13px] text-stone-800 leading-snug">
                {b.intro && <p>{b.intro}</p>}
                {b.items.length > 0 && (
                  <ul className="space-y-1.5">
                    {b.items.map((it, i) => (
                      <li key={i}>• {it}</li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </section>
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        {sections.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setSection(s)}
            className={`min-h-9 rounded-full px-3.5 text-[13px] font-bold ${section === s ? "text-white" : "bg-white border border-stone-200 text-stone-700"}`}
            style={section === s ? { backgroundColor: GREEN } : undefined}
          >
            {s === "all" ? "All" : SECTION_LABEL[s]}
          </button>
        ))}
      </div>
      <input
        value={query}
        onChange={(ev) => setQuery(ev.target.value)}
        placeholder="Search formats"
        className="w-full rounded-xl border border-stone-200 bg-white px-3.5 py-2.5 text-sm"
      />

      <div className="space-y-2">
        {list.map((f) => (
          <FormatCard key={f.id} f={f} open={openId === f.id} onToggle={() => setOpenId(openId === f.id ? null : f.id)} />
        ))}
        {list.length === 0 && <p className="text-sm text-stone-500">No formats match.</p>}
      </div>
    </div>
  );
}

function LearningRow({ l }: { l: Learning }) {
  const good = l.verdict === "good";
  return (
    <li className="rounded-2xl bg-white border border-stone-200 px-4 py-3">
      <div className="flex items-center gap-2">
        <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${good ? "bg-green-100 text-green-800" : "bg-red-100 text-red-700"}`}>
          {good ? "Worked" : "Didn't work"}
        </span>
        <span className="text-[12px] font-semibold text-stone-500 capitalize">{l.area}</span>
      </div>
      <p className="mt-1.5 text-[13px] text-stone-800 leading-snug">{l.what}</p>
      <p className="mt-2 rounded-xl bg-stone-50 px-3 py-2 text-[13px] font-semibold leading-snug">
        Rule: <span className="font-normal">{l.rule}</span>
      </p>
    </li>
  );
}

function LearningsPanel() {
  const byVideo = useMemo(() => {
    const map = new Map<string, Learning[]>();
    for (const l of LEARNINGS) {
      const key = `${l.date} · ${l.video}`;
      map.set(key, [...(map.get(key) ?? []), l]);
    }
    return [...map.entries()];
  }, []);

  return (
    <div className="space-y-5">
      <section className="rounded-2xl px-4 py-4 text-white" style={{ backgroundColor: GREEN }}>
        <p className="text-lg font-extrabold">Every video teaches one rule</p>
        <p className="text-[13px] text-white/85 mt-1">After each review we log what worked, what didn't, and the rule we follow from now on.</p>
      </section>
      {byVideo.map(([video, rows]) => (
        <div key={video} className="space-y-2">
          <p className="text-sm font-extrabold">{video}</p>
          <ul className="space-y-2">
            {rows.map((l, i) => (
              <LearningRow key={i} l={l} />
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

export function AiUgcView({ sub, onSub }: { sub: AiUgcSub; onSub: (next: AiUgcSub) => void }) {
  return (
    <div className="max-w-xl mx-auto lg:max-w-4xl space-y-4 pb-8">
      <div className="grid grid-cols-3 gap-2">
        {AI_UGC_SUBS.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => onSub(s)}
            className={`min-h-11 rounded-xl text-sm font-bold ${sub === s ? "text-white" : "bg-white border border-stone-200 text-stone-700"}`}
            style={sub === s ? { backgroundColor: GREEN } : undefined}
          >
            {SUB_LABEL[s]}
          </button>
        ))}
      </div>
      {sub === "workflow" && <WorkflowPanel />}
      {sub === "formats" && <FormatsPanel />}
      {sub === "learnings" && <LearningsPanel />}
    </div>
  );
}
