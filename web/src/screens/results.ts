// R-01·v2 — centro de comando: mapa real + HUD + sidebar + lupa de junção.
import { reanalyze } from "../pipeline/analyzer";
import type { AnalysisPayload, Mode } from "../types";
import { mountMapView, renderMap, setSelectedPin, centerOnWorld, junctionByLabel } from "../results/mapView";
import { mountSidebar, renderSidebar, highlightGroup } from "../results/sidebar";
import { mountLens, openLens, closeLens } from "../results/lens";
import { downloadReport } from "../results/export";
import { buildTextReport } from "../results/report";
import { t } from "../i18n";
import { mountLangToggle } from "../i18n/toggle";

/** Como obter o payload do outro modo: o fluxo normal reanalisa no worker
 * (save já parseado); o modo demonstração busca o JSON pré-computado. */
export type ModeSwitcher = (mode: Mode) => Promise<AnalysisPayload>;
const workerSwitcher: ModeSwitcher = async (mode) => (await reanalyze(mode)).payload;

let el: HTMLElement;
let payload: AnalysisPayload;
let saveKey = "";
let fileName = "";
let switchMode: ModeSwitcher = workerSwitcher;
let openLensLabel: string | null = null;

export function mountResults(root: HTMLElement): void {
  el = root;
  el.innerHTML = `
    <div class="rtop">
      <span class="brand">
        <svg viewBox="0 0 26 26" aria-hidden="true"><rect x="1" y="1" width="24" height="24" rx="3" fill="none" stroke="#F27B2C" stroke-width="2"/><circle cx="13" cy="9" r="3.4" fill="#3FBF8F"/><circle cx="13" cy="18" r="3.4" fill="#E05038"/></svg>
        ${t("landing.brand")}
      </span>
      <span class="fname" id="rFname"></span>
      <div class="rstats" id="rStats"></div>
      <span class="spacer"></span>
      <div class="rmode" role="group" aria-label="${t("results.modeAria")}">
        <button type="button" data-mode="mixed">${t("results.mode.mixed")}</button>
        <button type="button" data-mode="bidirectional">${t("results.mode.bidirectional")}</button>
        <button type="button" data-mode="oneway">${t("results.mode.oneway")}</button>
      </div>
      <div id="langHost"></div>
      <button type="button" class="rbtn" id="rExport">${t("results.export")}</button>
      <button type="button" class="rbtn" id="rNew">${t("results.new")}</button>
    </div>
    <div class="rmain">
      <div class="viewport" id="rViewport">
        <div class="legend" id="rLegend">
          <span class="rchip"><i style="background:var(--acc)"></i>${t("results.legend.junction")}</span>
          <span class="rchip"><i style="background:var(--path)"></i>${t("results.legend.path")}</span>
          <span class="rchip"><i style="background:var(--block)"></i>${t("results.legend.block")}</span>
          <span class="rchip"><i style="background:var(--sta)"></i>${t("results.legend.station")}</span>
          <span class="rchip mixedonly"><i style="background:#3FBF8F"></i>${t("results.legend.bidirectional")}</span>
          <span class="rchip mixedonly"><i style="background:#8A8F98"></i>${t("results.legend.stub")}</span>
        </div>
        <div class="reanalyzing" id="rBusy">${t("results.reanalyzing")}</div>
      </div>
      <aside class="sidebar" id="rSidebar" aria-label="${t("results.sidebarAria")}"></aside>
    </div>
  `;

  mountLangToggle(el.querySelector("#langHost")!);

  const viewport = el.querySelector<HTMLElement>("#rViewport")!;
  mountMapView(viewport, (label) => selectJunction(label, false));
  mountSidebar(el.querySelector("#rSidebar")!);
  mountLens(viewport, () => {
    openLensLabel = null;
    setSelectedPin(null);
  });

  el.querySelectorAll<HTMLButtonElement>(".rmode button").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const mode = btn.dataset.mode as Mode;
      if (mode === payload.mode) return;
      setModeButtons(mode, true);
      el.querySelector("#rBusy")!.classList.add("on");
      try {
        showResults(await switchMode(mode), saveKey, fileName, switchMode);
      } catch {
        setModeButtons(payload.mode, false);
      } finally {
        el.querySelector("#rBusy")!.classList.remove("on");
      }
    });
  });

  el.querySelector("#rExport")!.addEventListener("click", () => {
    downloadReport(buildTextReport(payload), payload.mode);
  });
  el.querySelector("#rNew")!.addEventListener("click", () => location.reload());
}

export function showResults(p: AnalysisPayload, key: string, fname: string,
  switcher: ModeSwitcher = workerSwitcher): void {
  payload = p;
  saveKey = key;
  fileName = fname;
  switchMode = switcher;

  (el.querySelector("#rFname") as HTMLElement).textContent =
    fname === "__demo__" ? t("results.demoName") : fname;
  el.querySelector("#rLegend")!.classList.toggle("mixed", p.mode === "mixed");
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

export function rerenderResults(): void {
  const lens = openLensLabel;
  mountResults(el);
  if (!payload) return;
  showResults(payload, saveKey, fileName, switchMode);
  if (lens) selectJunction(lens, false);
}

function selectJunction(label: string, panTo: boolean): void {
  const junction = junctionByLabel(payload, label);
  if (!junction) return;
  openLensLabel = label;
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
    `<span class="rchip"><b>${p.stats.recommendations}</b> ${t("results.stat.signals")}</span>`,
    `<span class="rchip"><b>${p.stats.junctions}</b> ${t("results.stat.junctions")}</span>`,
    `<span class="rchip"><b>${p.stats.stations}</b> ${t("results.stat.stations")}</span>`,
  ];
  if (p.mode === "mixed") {
    chips.push(`<span class="rchip"><b>${p.stats.oneway_tracks ?? 0}</b> ${t("results.stat.oneway")}</span>`);
    const bi = (p.stats.bi_confirmed_tracks ?? 0) + (p.stats.bi_assumed_tracks ?? 0);
    chips.push(`<span class="rchip"><b>${bi}</b> ${t("results.stat.bidirectional")}</span>`);
    if ((p.stats.bi_assumed_tracks ?? 0) > 0) {
      // presumido é resultado normal no misto: chip neutro, sem .warn
      chips.push(`<span class="rchip"><b>${p.stats.bi_assumed_tracks}</b> ${t("results.stat.assumed")}</span>`);
    }
    if ((p.stats.stub_tracks ?? 0) > 0) {
      chips.push(`<span class="rchip"><b>${p.stats.stub_tracks}</b> ${t("results.stat.stubs")}</span>`);
    }
    if ((p.stats.inconsistent_junctions ?? 0) > 0) {
      chips.push(`<span class="rchip warn"><b>${p.stats.inconsistent_junctions}</b> ${t("results.stat.suspectJunctions")}</span>`);
    }
  } else if (p.mode === "oneway") {
    const known = p.stats.directions_known ?? 0;
    const total = p.stats.directions_total ?? 0;
    chips.push(`<span class="rchip"><b>${total ? Math.round((known / total) * 100) : 0}%</b> ${t("results.stat.inferredHand")}</span>`);
    if (p.stats.ambiguous > 0) {
      chips.push(`<span class="rchip warn"><b>${p.stats.ambiguous}</b> ${t("results.stat.ambiguous")}</span>`);
    }
    if ((p.stats.inconsistent_junctions ?? 0) > 0) {
      chips.push(`<span class="rchip warn"><b>${p.stats.inconsistent_junctions}</b> ${t("results.stat.suspectJunctions")}</span>`);
    }
  }
  stats.innerHTML = chips.join("");
}
