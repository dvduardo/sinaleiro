// C-02 — mesa do despachante, âmbar FICSIT (aprovado)
// O log e a barra são alimentados pelos estágios REAIS do worker.
import type { Stage } from "../worker/protocol";
import { t, fmtNum } from "../i18n";

const N_BLOCKS = 18;

let el: HTMLElement;
let logEl: HTMLElement;
let cells: HTMLElement[] = [];
let lines: { stamp: string; html: string }[] = [];
let t0 = 0;

export function mountLoading(root: HTMLElement): void {
  el = root;
  el.innerHTML = `
    <div class="diag" aria-hidden="true">
      <svg viewBox="0 0 420 300">
        <path class="rline" d="M20 250 C 90 240, 120 180, 180 170 S 300 150, 400 140"/>
        <path class="rline d2" d="M180 170 C 200 120, 240 90, 310 70 S 380 40, 405 30"/>
        <path class="rline d3" d="M180 170 C 160 220, 200 260, 280 265 S 380 250, 405 230"/>
        <path class="rline d4" d="M310 70 C 330 110, 330 180, 310 205"/>
        <circle class="jnode" cx="180" cy="170" r="6"/>
        <circle class="jping" cx="180" cy="170" r="12"/>
        <circle class="jnode" cx="310" cy="70" r="6"/>
        <circle class="jping" cx="310" cy="70" r="12"/>
        <circle class="jnode" cx="310" cy="205" r="5"/>
        <text x="192" y="164" fill="#FFD9B0" font-family="monospace" font-size="12">J1</text>
        <text x="322" y="64" fill="#FFD9B0" font-family="monospace" font-size="12">J2</text>
        <text x="322" y="222" fill="#FFD9B0" font-family="monospace" font-size="12">J4</text>
      </svg>
    </div>
    <div class="dlog" aria-live="polite"></div>
    <div class="dbar">
      <span class="lbl">${t("loading.progress")}</span>
      <div class="blocks" aria-hidden="true"></div>
    </div>
  `;
  logEl = el.querySelector(".dlog")!;
  const blocksEl = el.querySelector(".blocks")!;
  cells = [];
  for (let i = 0; i < N_BLOCKS; i++) {
    const c = document.createElement("i");
    blocksEl.appendChild(c);
    cells.push(c);
  }
}

export function startLoading(fileName: string, sizeBytes: number): void {
  t0 = performance.now();
  lines = [];
  pushLine(t("loading.banner"));
  pushLine(t("loading.received")(escapeHtml(fileName), fmtNum(sizeBytes / 1e6)));
  render(0);
}

export function loadingProgress(stage: Stage, pct: number): void {
  pushLine(t(`loading.stage.${stage}` as const));
  render(pct);
}

function pushLine(html: string): void {
  const s = (performance.now() - t0) / 1000;
  const stamp = `[${String(Math.floor(s / 60)).padStart(2, "0")}:${String(Math.floor(s % 60)).padStart(2, "0")}]`;
  lines.push({ stamp, html });
}

function render(pct: number): void {
  logEl.innerHTML = "";
  for (const line of lines.slice(-8)) {
    const d = document.createElement("div");
    d.className = "ln";
    d.innerHTML = `${line.stamp} ${line.html}`;
    logEl.appendChild(d);
  }
  const cur = document.createElement("div");
  cur.className = "ln cur";
  cur.textContent = "> ";
  logEl.appendChild(cur);
  const lit = Math.round((pct / 100) * N_BLOCKS);
  cells.forEach((c, i) => c.classList.toggle("lit", i < lit));
}

function escapeHtml(text: string): string {
  const d = document.createElement("div");
  d.textContent = text;
  return d.innerHTML;
}
