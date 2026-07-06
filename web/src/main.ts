// Spike M2: página crua para validar o pipeline Pyodide fim-a-fim e medir o
// tempo de parse. Substituída pela UI real no M3.
import { analyze, reanalyze, warmup, onProgress, AnalysisError } from "./pipeline/analyzer";
import type { Mode } from "./types";

const app = document.getElementById("app")!;
app.innerHTML = `
  <h1>Sinaleiro — spike M2</h1>
  <p><input type="file" id="file" accept=".sav"></p>
  <p>
    <label><input type="radio" name="mode" value="bidirectional" checked> Bidirecional</label>
    <label><input type="radio" name="mode" value="oneway"> Mão única</label>
    <button id="rerun" disabled>Reanalisar (troca de modo)</button>
  </p>
  <pre id="log" style="background:#111;color:#0f0;padding:12px;min-height:200px"></pre>
`;

const log = document.getElementById("log")!;
const fileInput = document.getElementById("file") as HTMLInputElement;
const rerunBtn = document.getElementById("rerun") as HTMLButtonElement;

function line(text: string) {
  log.textContent += text + "\n";
}

function mode(): Mode {
  return (document.querySelector('input[name="mode"]:checked') as HTMLInputElement).value as Mode;
}

onProgress((stage, pct) => line(`[${pct}%] ${stage} @ ${(performance.now() / 1000).toFixed(1)}s`));

function show(result: { payload: { stats: unknown }; elapsedMs: number }) {
  line(`OK em ${(result.elapsedMs / 1000).toFixed(1)}s`);
  line(JSON.stringify(result.payload.stats, null, 2));
  rerunBtn.disabled = false;
}

function fail(err: unknown) {
  const e = err as AnalysisError;
  line(`ERRO ${e.code ?? "?"}: ${e.message}`);
}

fileInput.addEventListener("change", () => {
  const file = fileInput.files?.[0];
  if (!file) return;
  log.textContent = "";
  line(`analisando ${file.name} (${(file.size / 1e6).toFixed(1)} MB), modo ${mode()}…`);
  analyze(file, mode()).then(show, fail);
});

rerunBtn.addEventListener("click", () => {
  line(`reanalisando no modo ${mode()}…`);
  reanalyze(mode()).then(show, fail);
});

warmup();
line("warmup do Pyodide disparado…");
