// Fachada do worker de análise para a thread da página. Um worker por
// sessão; uma análise em voo por vez.
import type { AnalysisPayload, Mode } from "../types";
import type { Stage, WorkerRequest, WorkerResponse, ErrorCode } from "../worker/protocol";

export interface AnalysisResult {
  payload: AnalysisPayload;
  elapsedMs: number;
}

export class AnalysisError extends Error {
  constructor(public code: ErrorCode, message: string) {
    super(message);
  }
}

type ProgressHandler = (stage: Stage, pct: number) => void;

let worker: Worker | null = null;
let inFlight: { resolve: (r: AnalysisResult) => void; reject: (e: Error) => void } | null = null;
let progressHandler: ProgressHandler | null = null;

function ensureWorker(): Worker {
  if (worker) return worker;
  worker = new Worker(new URL("../worker/analyze.worker.ts", import.meta.url), { type: "module" });
  worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
    const msg = event.data;
    if (msg.type === "progress") {
      progressHandler?.(msg.stage, msg.pct);
    } else if (msg.type === "result") {
      inFlight?.resolve({ payload: msg.payload, elapsedMs: msg.elapsedMs });
      inFlight = null;
    } else {
      inFlight?.reject(new AnalysisError(msg.code, msg.message));
      inFlight = null;
    }
  };
  worker.onerror = (event) => {
    inFlight?.reject(new AnalysisError("internal", event.message || "falha no worker"));
    inFlight = null;
  };
  return worker;
}

function send(req: WorkerRequest, transfer?: Transferable[]): Promise<AnalysisResult> {
  if (inFlight) return Promise.reject(new AnalysisError("internal", "análise já em andamento"));
  const w = ensureWorker();
  return new Promise((resolve, reject) => {
    inFlight = { resolve, reject };
    w.postMessage(req, transfer ?? []);
  });
}

/** Baixa o Pyodide + bundle em segundo plano (chame na landing). */
export function warmup(): void {
  ensureWorker().postMessage({ type: "warmup" } satisfies WorkerRequest);
}

export function onProgress(handler: ProgressHandler): void {
  progressHandler = handler;
}

export async function analyze(file: File, mode: Mode, trainsTarget?: number): Promise<AnalysisResult> {
  const buf = await file.arrayBuffer();
  return send({ type: "analyze", save: buf, fileName: file.name, mode, trainsTarget }, [buf]);
}

export function reanalyze(mode: Mode, trainsTarget?: number): Promise<AnalysisResult> {
  return send({ type: "reanalyze", mode, trainsTarget });
}
