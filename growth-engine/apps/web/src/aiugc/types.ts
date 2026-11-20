export type FormatSection = "mascot" | "ai-character" | "lindsey" | "niche";
export type Effort = "low" | "medium" | "high";
export type FormatStatus = "ready" | "blocked" | "made";

export type ProofLink = {
  url: string;
  views: string;
  handle: string;
};

export type Shot = {
  time: string;
  text: string;
};

export type UgcFormat = {
  id: string;
  section: FormatSection;
  name: string;
  views: string;
  effort: Effort;
  status: FormatStatus;
  statusNote?: string;
  master: ProofLink & { app: string; length: string };
  alsoProven: ProofLink[];
  whyItWorks: string;
  original: Shot[];
  originalNotes: string[];
  remedy: {
    character: string;
    hook: string;
    shots: Shot[];
    appBeat: string;
    caption: string;
    effort: string;
    needs: string;
    watchOuts: string;
  };
};

export type DocBlock = {
  title: string;
  intro?: string;
  items: string[];
};

export type WorkflowStep = {
  n: number;
  name: string;
  what: string;
  tool: string;
  output: string;
  cost: string;
  gate?: string;
  state: "works" | "needs-work" | "untested";
  stateNote?: string;
};

export type Learning = {
  date: string;
  video: string;
  area: "idea" | "hook" | "script" | "voice" | "picture" | "motion" | "edit" | "process";
  verdict: "bad" | "good";
  what: string;
  rule: string;
};
