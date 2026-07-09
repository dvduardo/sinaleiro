import type { AnalysisPayload, Mode } from "../types";

export type Stage =
  | "pyodide"
  | "bundle"
  | "read"
  | "parse"
  | "graph"
  | "directions"
  | "signals"
  | "serialize";

export type WorkerRequest =
  | { type: "warmup" }
  | { type: "analyze"; save: ArrayBuffer; fileName: string; mode: Mode; trainsTarget?: number }
  | { type: "reanalyze"; mode: Mode; trainsTarget?: number };

export type ErrorCode = "invalid-save" | "no-rails" | "pyodide-load" | "internal";

export type WorkerResponse =
  | { type: "progress"; stage: Stage; pct: number }
  | { type: "result"; payload: AnalysisPayload; elapsedMs: number }
  | { type: "error"; code: ErrorCode; message: string };

/** Peso cumulativo de cada estágio — vira a % da barra de progresso. */
export const STAGE_WEIGHTS: Record<Stage, number> = {
  pyodide: 30,
  bundle: 5,
  read: 5,
  parse: 40,
  graph: 5,
  directions: 5,
  signals: 5,
  serialize: 5,
};

export const STAGE_ORDER: Stage[] = [
  "pyodide", "bundle", "read", "parse", "graph", "directions", "signals", "serialize",
];

/** % cumulativa ao INICIAR o estágio dado. */
export function stagePct(stage: Stage): number {
  let acc = 0;
  for (const s of STAGE_ORDER) {
    if (s === stage) return acc;
    acc += STAGE_WEIGHTS[s];
  }
  return acc;
}
