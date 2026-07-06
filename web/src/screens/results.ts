// R-01·v2 — centro de comando: mapa real + HUD + sidebar + lupa de junção.
import { reanalyze } from "../pipeline/analyzer";
import type { AnalysisPayload, Mode } from "../types";
import { mountMapView, renderMap, setSelectedPin, centerOnWorld, junctionByLabel } from "../results/mapView";
import { mountSidebar, renderSidebar, highlightGroup } from "../results/sidebar";
import { mountLens, openLens, closeLens } from "../results/lens";
import { downloadReport } from "../results/export";

let el: HTMLElement;
let payload: AnalysisPayload;
let saveKey = "";
let fileName = "";

export function mountResults(root: HTMLElement): void {
  el = root;
  el.innerHTML = `
    <div class="rtop">
      <span class="brand">
        <svg viewBox="0 0 26 26" aria-hidden="true"><rect x="1" y="1" width="24" height="24" rx="3" fill="none" stroke="#F27B2C" stroke-width="2"/><circle cx="13" cy="9" r="3.4" fill="#3FBF8F"/><circle cx="13" cy="18" r="3.4" fill="#E05038"/></svg>
        Sinaleiro
      </span>
      <span class="fname" id="rFname"></span>
      <div class="rstats" id="rStats"></div>
      <span class="spacer"></span>
      <div class="rmode" role="group" aria-label="Modo dos trilhos">
        <button type="button" data-mode="bidirectional">⇄ Bidirecional</button>
        <button type="button" data-mode="oneway">→ Mão única</button>
      </div>
      <button type="button" class="rbtn" id="rExport">⭳ Checklist .txt</button>
      <button type="button" class="rbtn" id="rNew">Novo save</button>
    </div>
    <div class="rmain">
      <div class="viewport" id="rViewport">
        <div class="legend">
          <span class="rchip"><i style="background:var(--acc)"></i>Junção — clique no pino para abrir a lupa</span>
          <span class="rchip"><i style="background:var(--path)"></i>Sinal existente (Trajeto)</span>
          <span class="rchip"><i style="background:var(--block)"></i>Sinal existente (Trecho)</span>
          <span class="rchip"><i style="background:var(--sta)"></i>Estação</span>
        </div>
        <div class="reanalyzing" id="rBusy">recalculando sinais…</div>
      </div>
      <aside class="sidebar" id="rSidebar" aria-label="Plano de instalação"></aside>
    </div>
  `;

  const viewport = el.querySelector<HTMLElement>("#rViewport")!;
  mountMapView(viewport, (label) => selectJunction(label, false));
  mountSidebar(el.querySelector("#rSidebar")!);
  mountLens(viewport, () => setSelectedPin(null));

  el.querySelectorAll<HTMLButtonElement>(".rmode button").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const mode = btn.dataset.mode as Mode;
      if (mode === payload.mode) return;
      setModeButtons(mode, true);
      el.querySelector("#rBusy")!.classList.add("on");
      try {
        const result = await reanalyze(mode);
        showResults(result.payload, saveKey, fileName);
      } catch {
        setModeButtons(payload.mode, false);
      } finally {
        el.querySelector("#rBusy")!.classList.remove("on");
      }
    });
  });

  el.querySelector("#rExport")!.addEventListener("click", () => {
    downloadReport(payload.text_report, payload.mode);
  });
  el.querySelector("#rNew")!.addEventListener("click", () => location.reload());
}

export function showResults(p: AnalysisPayload, key: string, fname: string): void {
  payload = p;
  saveKey = key;
  fileName = fname;

  (el.querySelector("#rFname") as HTMLElement).textContent = fname;
  setModeButtons(p.mode, false);
  renderStats(p);
  renderMap(p);
  closeLens();
  setSelectedPin(null);
  renderSidebar(p, key, {
    onLocate: (label, x, y) => {
      centerOnWorld(x, y);
      setSelectedPin(label);
    },
    onOpenLens: (label) => selectJunction(label, true),
  });
}

function selectJunction(label: string, panTo: boolean): void {
  const junction = junctionByLabel(payload, label);
  if (!junction) return;
  if (panTo) centerOnWorld(junction.x, junction.y);
  setSelectedPin(label);
  highlightGroup(label);
  openLens(payload, junction);
}

function setModeButtons(mode: Mode, busy: boolean): void {
  el.querySelectorAll<HTMLButtonElement>(".rmode button").forEach((b) => {
    b.classList.toggle("on", b.dataset.mode === mode);
    b.disabled = busy;
  });
}

function renderStats(p: AnalysisPayload): void {
  const stats = el.querySelector("#rStats")!;
  const chips: string[] = [
    `<span class="rchip"><b>${p.stats.recommendations}</b> sinais</span>`,
    `<span class="rchip"><b>${p.stats.junctions}</b> junções</span>`,
    `<span class="rchip"><b>${p.stats.stations}</b> estações</span>`,
  ];
  if (p.mode === "oneway") {
    const known = p.stats.directions_known ?? 0;
    const total = p.stats.directions_total ?? 0;
    chips.push(`<span class="rchip"><b>${total ? Math.round((known / total) * 100) : 0}%</b> mão inferida</span>`);
    if (p.stats.ambiguous > 0) {
      chips.push(`<span class="rchip warn"><b>${p.stats.ambiguous}</b> ambíguos</span>`);
    }
    if ((p.stats.inconsistent_junctions ?? 0) > 0) {
      chips.push(`<span class="rchip warn"><b>${p.stats.inconsistent_junctions}</b> junções suspeitas</span>`);
    }
  }
  stats.innerHTML = chips.join("");
}
