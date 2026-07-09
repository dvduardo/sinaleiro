/// <reference lib="webworker" />
// Hospeda o Pyodide e roda o pipeline Python (src/web_api.py). O worker vive
// a sessão inteira: o save parseado fica nos globals do módulo Python, então
// trocar o modo (reanalyze) não re-parseia o arquivo.
import { loadPyodide, type PyodideInterface } from "pyodide";
import { stagePct, type Stage, type WorkerRequest, type WorkerResponse, type ErrorCode } from "./protocol";

const PYODIDE_CDN = "https://cdn.jsdelivr.net/pyodide/v0.27.7/full/";

declare const self: DedicatedWorkerGlobalScope;

function post(msg: WorkerResponse, transfer?: Transferable[]) {
  self.postMessage(msg, transfer ?? []);
}

function progress(stage: Stage) {
  post({ type: "progress", stage, pct: stagePct(stage) });
}

let pyodideReady: Promise<PyodideInterface> | null = null;

function ensurePyodide(): Promise<PyodideInterface> {
  pyodideReady ??= (async () => {
    progress("pyodide");
    const py = await loadPyodide({ indexURL: PYODIDE_CDN });

    progress("bundle");
    const resp = await fetch(new URL(`${import.meta.env.BASE_URL}py/bundle.zip`, self.location.origin));
    if (!resp.ok) throw new Error(`bundle.zip: HTTP ${resp.status}`);
    py.FS.mkdirTree("/app");
    py.unpackArchive(await resp.arrayBuffer(), "zip", { extractDir: "/app" });
    py.runPython('import sys; sys.path.insert(0, "/app/src")');
    py.globals.set("js_progress", (stage: string) => progress(stage as Stage));
    py.runPython("import web_api");
    return py;
  })();
  return pyodideReady;
}

function errorCode(err: unknown): ErrorCode {
  const text = String(err);
  if (text.includes("InvalidSaveError")) return "invalid-save";
  if (text.includes("NoRailsError")) return "no-rails";
  return "internal";
}

function errorMessage(err: unknown): string {
  const text = err instanceof Error ? err.message : String(err);
  // do traceback Python, a última linha é a que interessa
  const lines = text.trimEnd().split("\n");
  return lines[lines.length - 1].slice(0, 500);
}

async function runAnalyze(py: PyodideInterface, mode: string, trainsTarget: number | undefined,
  saveBytes?: Uint8Array) {
  const t0 = performance.now();
  if (saveBytes) {
    progress("read");
    py.globals.set("save_bytes", saveBytes);
    py.runPython("web_api.load_save(save_bytes.to_py(), progress=js_progress); del save_bytes");
  }
  py.globals.set("mode", mode);
  py.globals.set("trains_target", trainsTarget ?? null);
  const json = py.runPython(
    "web_api.analyze(mode, trains_target if trains_target is not None else web_api.DEFAULT_TRAINS_TARGET, progress=js_progress)",
  ) as string;
  post({ type: "result", payload: JSON.parse(json), elapsedMs: performance.now() - t0 });
}

self.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  const msg = event.data;
  if (msg.type === "warmup") {
    // warmup falho fica silencioso: o analyze tenta de novo e aí sim reporta
    await ensurePyodide().catch(() => { pyodideReady = null; });
    return;
  }
  let py: PyodideInterface;
  try {
    py = await ensurePyodide();
  } catch (err) {
    pyodideReady = null;
    post({ type: "error", code: "pyodide-load", message: errorMessage(err) });
    return;
  }
  try {
    if (msg.type === "analyze") {
      await runAnalyze(py, msg.mode, msg.trainsTarget, new Uint8Array(msg.save));
    } else {
      await runAnalyze(py, msg.mode, msg.trainsTarget);
    }
  } catch (err) {
    post({ type: "error", code: errorCode(err), message: errorMessage(err) });
  }
};
