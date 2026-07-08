// Lupa de junção (R-01·v2): esquemático que mostra, para cada sinal
// recomendado, o trilho, o lado, o sentido e a distância — gerado a partir
// dos ângulos reais do payload (approach_deg / facing_deg / setback_m).
//
// Convenções do glifo (idênticas ao pitch aprovado): o chevron aponta no
// sentido do trem que vai LER o sinal; com rotate(facing − 90) o poste do
// glifo cai naturalmente do lado direito desse trem — a regra do jogo.
import { fmtXY } from "../map/calibration";
import type { AnalysisPayload, Junction, Mode, Recommendation } from "../types";
import { t, compass } from "../i18n";

const CX = 150, CY = 100;      // centro do esquemático (viewBox 300×200)
const SPOKE_R = 92;            // comprimento de cada aproximação
const SIG_AT = 56;             // distância do glifo ao longo da aproximação
const SIDE_OFF = 15;           // afastamento lateral do glifo

let panel: HTMLElement;
let onClose: (() => void) | null = null;

export function mountLens(host: HTMLElement, closed: () => void): void {
  onClose = closed;
  panel = document.createElement("aside");
  panel.className = "jpanel";
  panel.setAttribute("aria-label", t("lens.aria"));
  host.appendChild(panel);
}

export function closeLens(): void {
  panel.classList.remove("on");
}

export function openLens(payload: AnalysisPayload, junction: Junction): void {
  const recs = junction.rec_ids.map((id) => payload.recommendations[id]);
  const mode = payload.mode;
  const oneway = mode === "oneway";
  const hasAmb = recs.some((r) => r.ambiguous);
  const hasAssumed = mode === "mixed" && recs.some((r) => r.track_kind === "bi_assumed");
  const stubArms = mode === "mixed" ? (junction.stub_arms ?? 0) : 0;
  const xCrossing = junction.degree >= 4;
  const allPath = recs.length > 0 && recs.every((r) => r.type === "Path");

  const flags: string[] = [];
  if (oneway) flags.push(t("lens.flag.oneway"));
  if (stubArms > 0) flags.push(t("lens.flag.stub"));
  if (xCrossing) flags.push(t("lens.flag.crossing"));
  const title = t("lens.title")(junction.label, recs.length, flags.join(" · "));

  const near = recs[0]?.nearest_station
    ? t("lens.near")(Math.round(recs[0].nearest_station_m ?? 0), recs[0].nearest_station)
    : t("lens.noStation");

  panel.innerHTML = `
    <div class="jp-head">
      <h4>${escapeHtml(title)}
        <span class="jps">${fmtXY(junction.x, junction.y)} · ${escapeHtml(near)}
          <button type="button" class="jp-copy" data-copy="${junction.x} ${junction.y}">${t("lens.copy")}</button>
        </span>
      </h4>
      <button type="button" class="jp-x" aria-label="${t("lens.closeAria")}">✕</button>
    </div>
    <div class="jp-body">
      ${schematicSvg(recs, mode)}
      ${legendHtml(recs, mode)}
      ${stepsHtml(recs, junction, mode, xCrossing, allPath)}
      ${notesHtml(mode, hasAmb, hasAssumed, stubArms, xCrossing, allPath)}
    </div>
  `;

  panel.querySelector(".jp-x")!.addEventListener("click", () => {
    closeLens();
    onClose?.();
  });
  panel.querySelector<HTMLButtonElement>(".jp-copy")!.addEventListener("click", (e) => {
    const btn = e.currentTarget as HTMLButtonElement;
    navigator.clipboard?.writeText(btn.dataset.copy ?? "").then(() => {
      btn.textContent = t("lens.copied");
      setTimeout(() => { btn.textContent = t("lens.copy"); }, 1500);
    });
  });

  panel.scrollTop = 0;
  panel.classList.add("on");
}

// ---------- geometria do esquemático ----------

/** Vetor unitário na tela para um rumo-bússola (0 = norte, horário). */
function unit(bearingDeg: number): [number, number] {
  const rad = (bearingDeg * Math.PI) / 180;
  return [Math.sin(rad), -Math.cos(rad)];
}

interface Spoke {
  deg: number;
  recs: Recommendation[];
  flow: "in" | "out" | null; // sentido do fluxo mão única (null = ambíguo/bidirecional)
  assumed: boolean; // modo misto: bidirecional presumido (tracejado neutro)
}

function buildSpokes(recs: Recommendation[], mode: Mode): Spoke[] {
  // um raio por aproximação (trilho); recomendações do mesmo trilho compartilham o raio
  const byTrack = new Map<string, Recommendation[]>();
  for (const rec of recs) {
    const list = byTrack.get(rec.track) ?? [];
    list.push(rec);
    byTrack.set(rec.track, list);
  }
  const spokes: Spoke[] = [];
  for (const list of byTrack.values()) {
    let flow: Spoke["flow"] = null;
    if (mode === "oneway" && list.length === 1 && !list[0].ambiguous) {
      flow = list[0].role === "entrada" ? "in" : "out";
    } else if (mode === "mixed" && list.length === 1 && list[0].track_kind === "oneway") {
      flow = list[0].role === "entrada" ? "in" : "out";
    }
    const assumed = mode === "mixed" && list[0].track_kind === "bi_assumed";
    spokes.push({ deg: list[0].approach_deg, recs: list, flow, assumed });
  }
  return spokes;
}

function schematicSvg(recs: Recommendation[], mode: Mode): string {
  const spokes = buildSpokes(recs, mode);
  const parts: string[] = [];

  // trilhos (aproximações)
  for (const spoke of spokes) {
    const [ux, uy] = unit(spoke.deg);
    const x2 = CX + ux * SPOKE_R, y2 = CY + uy * SPOKE_R;
    const amb = spoke.recs.some((r) => r.ambiguous);
    const cls = amb ? " amb" : spoke.assumed ? " assumed" : "";
    parts.push(`<path class="strack${cls}" d="M${CX} ${CY} L${x2.toFixed(1)} ${y2.toFixed(1)}"/>`);
    parts.push(`<path class="strackin" d="M${CX} ${CY} L${x2.toFixed(1)} ${y2.toFixed(1)}"/>`);
    if (spoke.flow) {
      // pontilhado animado no sentido do fluxo
      const d = spoke.flow === "in"
        ? `M${x2.toFixed(1)} ${y2.toFixed(1)} L${CX} ${CY}`
        : `M${CX} ${CY} L${x2.toFixed(1)} ${y2.toFixed(1)}`;
      parts.push(`<path class="sflow" d="${d}"/>`);
    }
  }

  parts.push(`<circle class="sjun" cx="${CX}" cy="${CY}" r="5"/>`);

  // cota "≈ N m" na primeira aproximação
  const first = spokes[0];
  if (first) {
    const [ux, uy] = unit(first.deg);
    // perpendicular (lado oposto ao primeiro glifo, para não colidir)
    const [px, py] = [-uy, ux];
    const off = 14;
    const ax = CX + px * off, ay = CY + py * off;
    const bx = CX + ux * SIG_AT + px * off, by = CY + uy * SIG_AT + py * off;
    parts.push(`<line class="sdim" x1="${ax.toFixed(1)}" y1="${ay.toFixed(1)}" x2="${bx.toFixed(1)}" y2="${by.toFixed(1)}"/>`);
    const setback = first.recs[0].setback_m;
    const tx = (ax + bx) / 2 + px * 12, ty = (ay + by) / 2 + py * 12;
    parts.push(`<text class="sdimt" x="${tx.toFixed(1)}" y="${ty.toFixed(1)}" text-anchor="middle">${t("lens.dim")(fmtM(setback))}</text>`);
  }

  // glifos de sinal
  for (const spoke of spokes) {
    const [ux, uy] = unit(spoke.deg);
    const sx = CX + ux * SIG_AT, sy = CY + uy * SIG_AT;
    for (const rec of spoke.recs) {
      const [fx, fy] = unit(rec.facing_deg + 90); // perpendicular-direita do trem
      const gx = sx + fx * SIDE_OFF, gy = sy + fy * SIDE_OFF;
      const rot = rec.facing_deg - 90;
      const lamp = rec.type === "Path" ? "slampP" : "slampB";
      const chev = rec.type === "Path" ? "schevP" : "schevB";
      parts.push(
        `<g transform="translate(${gx.toFixed(1)} ${gy.toFixed(1)}) rotate(${rot.toFixed(1)})">` +
        `<line class="spost" x1="0" y1="-20" x2="0" y2="-6"/>` +
        `<circle class="${lamp}" r="4.2"/>` +
        `<path class="schev ${chev}" d="M8 -4 l7 4 -7 4"/></g>`,
      );
    }
    // rótulo da direção da aproximação, na ponta do raio
    const lx = CX + ux * (SPOKE_R + 2) + 4, ly = CY + uy * (SPOKE_R + 2);
    const anchor = ux < -0.3 ? "end" : ux > 0.3 ? "start" : "middle";
    parts.push(`<text class="slbl" x="${lx.toFixed(1)}" y="${ly.toFixed(1)}" text-anchor="${anchor}">${escapeHtml(compass(spoke.recs[0].approach_dir))}</text>`);
  }

  return `<svg viewBox="0 0 300 200" aria-hidden="true">${parts.join("")}</svg>`;
}

// ---------- textos ----------

function legendHtml(recs: Recommendation[], mode: Mode): string {
  const hasPath = recs.some((r) => r.type === "Path");
  const hasBlock = recs.some((r) => r.type === "Block");
  const rows: string[] = [];
  if (hasPath) {
    rows.push(`<span><i class="lp"></i>${t("lens.legend.path")}</span>`);
  }
  if (hasBlock) {
    if (mode === "oneway") {
      rows.push(`<span><i class="lb"></i>${t("lens.legend.block.oneway")}</span>`);
    } else if (mode === "mixed") {
      rows.push(`<span><i class="lb"></i>${t("lens.legend.block.mixed")}</span>`);
    } else {
      rows.push(`<span><i class="lb"></i>${t("lens.legend.block.bidirectional")}</span>`);
    }
  }
  return `<div class="jp-leg">${rows.join("")}</div>`;
}

function stepsHtml(
  recs: Recommendation[],
  junction: Junction,
  mode: Mode,
  xCrossing: boolean,
  allPath: boolean,
): string {
  const near = recs[0]?.nearest_station
    ? t("lens.step.whereNear")(Math.round(recs[0].nearest_station_m ?? 0), escapeHtml(recs[0].nearest_station))
    : "";
  const setback = fmtM(recs[0]?.setback_m ?? 20);
  const steps: string[] = [
    `<li>${t("lens.step.where")(near)}</li>`,
    `<li>${t("lens.step.distance")(setback)}</li>`,
  ];
  if (xCrossing && allPath) {
    steps.push(`<li>${t("lens.step.onlyPath")}</li>`);
  } else if (mode === "oneway") {
    steps.push(`<li>${t("lens.step.oneway")}</li>`);
  } else if (mode === "mixed") {
    steps.push(`<li>${t("lens.step.mixed")}</li>`);
  } else {
    steps.push(`<li>${t("lens.step.bidirectional")}</li>`);
  }
  void junction;
  return `<ol class="jp-steps">${steps.join("")}</ol>`;
}

function notesHtml(
  mode: Mode,
  hasAmb: boolean,
  hasAssumed: boolean,
  stubArms: number,
  xCrossing: boolean,
  allPath: boolean,
): string {
  const notes: string[] = [];
  if (xCrossing) {
    notes.push(`<p class="jp-note warn">${t("lens.note.crossing")}</p>`);
  }
  if (hasAmb) {
    notes.push(`<p class="jp-note">${t("lens.note.ambiguous")}</p>`);
  }
  if (hasAssumed) {
    notes.push(`<p class="jp-note">${t("lens.note.assumed")}</p>`);
  }
  if (stubArms > 0) {
    notes.push(`<p class="jp-note">${t("lens.note.stub")(stubArms)}</p>`);
  }
  if (mode !== "oneway" || !allPath) {
    notes.push(`<p class="jp-note">${t("lens.note.rightHand")}</p>`);
  }
  return notes.join("");
}

function fmtM(v: number): string {
  return Number.isInteger(v) ? String(v) : v.toFixed(1).replace(".", ",");
}

function escapeHtml(text: string): string {
  return text.replace(/[<>&"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" }[c]!));
}
