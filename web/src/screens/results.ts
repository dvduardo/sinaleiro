// R-01·v2 — centro de comando: mapa real + HUD + sidebar + lupa de junção.
import { reanalyze } from "../pipeline/analyzer";
import type { AnalysisPayload, Mode } from "../types";
import { mountMapView, renderMap, setSelectedPin, setSelectedLine, setStatusFilter, centerOnWorld, junctionByLabel } from "../results/mapView";
import { mountSidebar, renderSidebar, highlightGroup } from "../results/sidebar";
import { mountLens, openLens, openLineLens, closeLens } from "../results/lens";
import { downloadReport } from "../results/export";
import { buildTextReport } from "../results/report";
import { t } from "../i18n";
import { mountLangToggle } from "../i18n/toggle";

/** Como obter o payload do outro modo/alvo: o fluxo normal reanalisa no
 * worker (save já parseado); o modo demonstração busca o JSON pré-computado
 * e ignora o alvo de trens (controle desabilitado lá). */
export type ModeSwitcher = (mode: Mode, trainsTarget?: number) => Promise<AnalysisPayload>;
const workerSwitcher: ModeSwitcher = async (mode, trainsTarget) =>
  (await reanalyze(mode, trainsTarget)).payload;

const TRAINS_MIN = 1;
const TRAINS_MAX = 10;

let el: HTMLElement;
let payload: AnalysisPayload;
let saveKey = "";
let fileName = "";
let switchMode: ModeSwitcher = workerSwitcher;
let openLensLabel: string | null = null;
let openLineLensId: number | null = null;
let trainsTarget = 2;

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
      <div class="rtrains" id="rTrains" title="${t("results.trains.aria")}">
        <span>${t("results.trains.label")}</span>
        <button type="button" data-d="-1" aria-label="−">−</button>
        <b id="rTrainsN">2</b>
        <button type="button" data-d="1" aria-label="+">+</button>
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
          <span class="rchip lineonly"><i style="background:#FFB020"></i>${t("results.legend.lineSignal")}</span>
          <span class="rchip hintonly"><i style="background:#3FBF8F;border-radius:50%"></i>${t("results.legend.passingHint")}</span>
        </div>
        <div class="reanalyzing" id="rBusy">${t("results.reanalyzing")}</div>
      </div>
      <aside class="sidebar" id="rSidebar" aria-label="${t("results.sidebarAria")}"></aside>
    </div>
  `;

  mountLangToggle(el.querySelector("#langHost")!);

  const viewport = el.querySelector<HTMLElement>("#rViewport")!;
  mountMapView(viewport, (label) => selectJunction(label, false),
    (id) => selectLineSignal(id, false));
  mountSidebar(el.querySelector("#rSidebar")!);
  mountLens(viewport, () => {
    openLensLabel = null;
    openLineLensId = null;
    setSelectedPin(null);
    setSelectedLine(null);
  });

  el.querySelectorAll<HTMLButtonElement>(".rmode button").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const mode = btn.dataset.mode as Mode;
      if (mode === payload.mode) return;
      setModeButtons(mode, true);
      el.querySelector("#rBusy")!.classList.add("on");
      try {
        showResults(await switchMode(mode, trainsTarget), saveKey, fileName, switchMode);
      } catch {
        setModeButtons(payload.mode, false);
      } finally {
        el.querySelector("#rBusy")!.classList.remove("on");
      }
    });
  });

  el.querySelectorAll<HTMLButtonElement>("#rTrains button").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const next = Math.min(TRAINS_MAX, Math.max(TRAINS_MIN, trainsTarget + Number(btn.dataset.d)));
      if (next === trainsTarget) return;
      el.querySelector("#rBusy")!.classList.add("on");
      try {
        showResults(await switchMode(payload.mode, next), saveKey, fileName, switchMode);
      } catch {
        /* mantém o payload atual */
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

  trainsTarget = p.stats.trains_target ?? 2;
  (el.querySelector("#rFname") as HTMLElement).textContent =
    fname === "__demo__" ? t("results.demoName") : fname;
  const legend = el.querySelector("#rLegend")!;
  legend.classList.toggle("mixed", p.mode === "mixed");
  legend.classList.toggle("lines", (p.line_signals?.length ?? 0) > 0);
  legend.classList.toggle("hints", (p.passing_loop_hints?.length ?? 0) > 0);
  setModeButtons(p.mode, false);
  renderTrainsControl(p);
  renderStats(p);
  renderMap(p);
  closeLens();
  setSelectedPin(null);
  renderSidebar(p, key, {
    onLocate: (label, x, y) => {
      centerOnWorld(x, y);
      setSelectedPin(label);
    },
    onLocatePoint: (x, y) => {
      centerOnWorld(x, y);
      setSelectedPin(null);
    },
    onOpenLens: (label) => selectJunction(label, true),
    onOpenLineLens: (id) => selectLineSignal(id, true),
    onFilter: setStatusFilter,
  });
}

/** Controle "trens por linha": só faz sentido nos modos que conhecem o fluxo
 * (misto/mão única) e fica desabilitado na demonstração (payloads fixos). */
function renderTrainsControl(p: AnalysisPayload): void {
  const box = el.querySelector<HTMLElement>("#rTrains")!;
  box.classList.toggle("hidden", p.mode === "bidirectional");
  (el.querySelector("#rTrainsN") as HTMLElement).textContent = String(trainsTarget);
  const demo = fileName === "__demo__";
  box.querySelectorAll<HTMLButtonElement>("button").forEach((b) => {
    b.disabled = demo
      || (b.dataset.d === "-1" && trainsTarget <= TRAINS_MIN)
      || (b.dataset.d === "1" && trainsTarget >= TRAINS_MAX);
  });
}

export function rerenderResults(): void {
  const lens = openLensLabel;
  const lineLens = openLineLensId;
  mountResults(el);
  if (!payload) return;
  showResults(payload, saveKey, fileName, switchMode);
  if (lens) selectJunction(lens, false);
  else if (lineLens !== null) selectLineSignal(lineLens, false);
}

function selectJunction(label: string, panTo: boolean): void {
  const junction = junctionByLabel(payload, label);
  if (!junction) return;
  openLensLabel = label;
  openLineLensId = null;
  if (panTo) centerOnWorld(junction.x, junction.y);
  setSelectedPin(label);
  setSelectedLine(null);
  highlightGroup(label);
  openLens(payload, junction);
}

function selectLineSignal(id: number, panTo: boolean): void {
  const signal = payload.line_signals.find((s) => s.id === id);
  if (!signal) return;
  openLineLensId = id;
  openLensLabel = null;
  if (panTo) centerOnWorld(signal.x, signal.y);
  setSelectedPin(null);
  setSelectedLine(id);
  openLineLens(payload, signal);
}

function setModeButtons(mode: Mode, busy: boolean): void {
  el.querySelectorAll<HTMLButtonElement>(".rmode button").forEach((b) => {
    b.classList.toggle("on", b.dataset.mode === mode);
    b.disabled = busy;
  });
}

function renderStats(p: AnalysisPayload): void {
  const stats = el.querySelector("#rStats")!;
  const chips: string[] = [];
  // resumo da auditoria antes de tudo: numa malha já sinalizada é ele que
  // conta a história ("4 faltando · 69 revisar · 200 ok")
  if (p.stats.existing_signals > 0) {
    chips.push(
      `<span class="rchip st-missing"><b>${p.stats.missing}</b> ${t("results.stat.missing")}</span>`,
      `<span class="rchip st-retype"><b>${p.stats.retype}</b> ${t("results.stat.retype")}</span>`,
      `<span class="rchip st-ok"><b>${p.stats.ok}</b> ${t("results.stat.okDone")}</span>`,
    );
  } else {
    chips.push(`<span class="rchip"><b>${p.stats.recommendations}</b> ${t("results.stat.signals")}</span>`);
  }
  if (p.mode !== "bidirectional") {
    chips.push(`<span class="rchip"><b>${p.stats.line_signals ?? 0}</b> ${t("results.stat.lineSignals")}</span>`);
  }
  if ((p.stats.trains ?? 0) > 0) {
    chips.push(`<span class="rchip">${t("results.trains.inSave")(p.stats.trains)}</span>`);
  }
  chips.push(
    `<span class="rchip"><b>${p.stats.junctions}</b> ${t("results.stat.junctions")}</span>`,
    `<span class="rchip"><b>${p.stats.stations}</b> ${t("results.stat.stations")}</span>`,
  );
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
