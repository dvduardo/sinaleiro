// Mapa R-01·v2: mapa real do jogo + overlay SVG com trilhos, estações,
// sinais existentes e pinos de junção. Pan/zoom portado do JS inline de
// src/report.py (zoom no cursor, contra-escala dos marcadores) e estendido
// com Pointer Events para arrastar no toque e pinch com dois dedos.
import { MAP_SIZE, mapX, mapY } from "../map/calibration";
import type { AnalysisPayload, Junction } from "../types";

const SVG_NS = "http://www.w3.org/2000/svg";
// Zoom máximo: 0,2 px por cm de mundo (1 m = 20 px) — além disso o mapa de
// fundo não tem mais detalhe (e scales extremos apagam o render).
const MAX_SCALE = 0.2;

let viewport: HTMLElement;
let svg: SVGSVGElement;
let markers: SVGGElement[] = [];
// labels de estação para o declutter: posição em coordenadas de mapa e
// largura estimada do texto em px de tela (fonte mono → largura ∝ nº de chars)
let stationLabels: { el: SVGGElement; x: number; y: number; w: number }[] = [];
// pinos de junção como obstáculos: sempre visíveis e desenhados por cima,
// então um nome de estação embaixo deles seria ilegível
let pinBoxes: { x: number; y: number; w: number }[] = [];
let labelScale = -1;
let scale = 1, originX = 0, originY = 0, minScale = 0.001;
let focus: [number, number, number, number] = [0, 0, MAP_SIZE, MAP_SIZE];
let pinHandler: ((label: string) => void) | null = null;

export function mountMapView(vp: HTMLElement, onPinClick: (label: string) => void): void {
  viewport = vp;
  pinHandler = onPinClick;

  svg = document.createElementNS(SVG_NS, "svg");
  svg.classList.add("map");
  svg.setAttribute("viewBox", `0 0 ${MAP_SIZE} ${MAP_SIZE}`);
  svg.setAttribute("width", String(MAP_SIZE));
  svg.setAttribute("height", String(MAP_SIZE));
  viewport.prepend(svg);

  const base = import.meta.env.BASE_URL;
  const img = document.createElementNS(SVG_NS, "image");
  img.setAttribute("x", "0");
  img.setAttribute("y", "0");
  img.setAttribute("width", String(MAP_SIZE));
  img.setAttribute("height", String(MAP_SIZE));
  img.setAttribute("href", `${base}map/map_preview.jpg`);
  svg.appendChild(img);
  const full = new Image();
  full.onload = () => img.setAttribute("href", full.src);
  full.src = `${base}map/map_full.jpg`;

  for (const id of ["tracks", "flow", "stations", "existing", "pins"]) {
    const g = document.createElementNS(SVG_NS, "g");
    g.id = `layer-${id}`;
    svg.appendChild(g);
  }

  bindPanZoom();
  window.addEventListener("resize", fit);
}

export function renderMap(payload: AnalysisPayload): void {
  const tracks = layer("tracks");
  const flow = layer("flow");
  const stations = layer("stations");
  const existing = layer("existing");
  const pins = layer("pins");
  for (const g of [tracks, flow, stations, existing, pins]) g.innerHTML = "";
  markers = [];
  stationLabels = [];
  pinBoxes = [];
  labelScale = -1;

  // trilhos — path bezier direto dos pontos-chave do spline
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const track of payload.tracks) {
    const b = track.bez;
    let d = `M ${mapX(b[0])},${mapY(b[1])}`;
    minX = Math.min(minX, b[0]); maxX = Math.max(maxX, b[0]);
    minY = Math.min(minY, b[1]); maxY = Math.max(maxY, b[1]);
    for (let i = 2; i < b.length; i += 6) {
      d += ` C ${mapX(b[i])},${mapY(b[i + 1])} ${mapX(b[i + 2])},${mapY(b[i + 3])} ${mapX(b[i + 4])},${mapY(b[i + 5])}`;
      minX = Math.min(minX, b[i + 4]); maxX = Math.max(maxX, b[i + 4]);
      minY = Math.min(minY, b[i + 5]); maxY = Math.max(maxY, b[i + 5]);
    }
    const glow = pathEl(d, "trkglow");
    const line = pathEl(d, track.direction === null ? "trk amb" : "trk");
    if (track.direction === null) line.setAttribute("stroke-dasharray", "900 500");
    tracks.append(glow, line);
  }

  // vista inicial focada na malha
  const pad = 20000;
  if (minX < maxX) {
    focus = [mapX(minX - pad), mapY(minY - pad), (maxX - minX) + 2 * pad, (maxY - minY) + 2 * pad];
  } else {
    focus = [0, 0, MAP_SIZE, MAP_SIZE];
  }

  // setas de fluxo (mão única) — menores que no relatório CLI para não
  // engolir visualmente o traço do trilho
  for (const [x, y, deg] of payload.flow_arrows) {
    flow.appendChild(marker(mapX(x), mapY(y), "mk flowmk",
      `<polygon points="5,0 -3.5,-3.5 -3.5,3.5" transform="rotate(${deg.toFixed(0)})"/>`));
  }

  // estações — o <title> garante o nome no hover mesmo com o label ocultado
  // pelo declutter
  for (const s of payload.stations) {
    const mk = marker(mapX(s.x), mapY(s.y), "mk stamk",
      `<rect x="-8" y="-8" width="16" height="16" rx="3"/>` +
      `<text x="13" y="4">${escapeXml(s.name)}</text>` +
      `<title>${escapeXml(s.name)}</title>`);
    stationLabels.push({ el: mk, x: mapX(s.x), y: mapY(s.y), w: 13 + s.name.length * 6.7 });
    stations.appendChild(mk);
  }

  // sinais já existentes no save
  for (const s of payload.existing_signals) {
    existing.appendChild(marker(mapX(s.x), mapY(s.y), `mk sigmk ${s.type === "Path" ? "p" : "b"}`,
      `<circle r="5"/><title>Sinal existente (${s.type === "Path" ? "Trajeto" : "Trecho"})</title>`));
  }

  // pinos de junção
  for (const j of payload.junctions) {
    const warn = j.degree >= 4;
    const mk = marker(mapX(j.x), mapY(j.y), `mk jpin${warn ? " warn" : ""}`,
      `<circle class="jring" r="17"/><circle class="jc" r="9"/>` +
      `<text class="jl" x="12" y="4">${j.label}${warn ? " ⚠" : ""}</text>`);
    mk.dataset.j = j.label;
    mk.addEventListener("click", (e) => {
      e.stopPropagation();
      pinHandler?.(j.label);
    });
    pins.appendChild(mk);
    pinBoxes.push({ x: mapX(j.x), y: mapY(j.y), w: 12 + (j.label.length + (warn ? 2 : 0)) * 6.7 });
  }

  fit();
}

export function setSelectedPin(label: string | null): void {
  layer("pins").querySelectorAll<SVGGElement>(".jpin").forEach((p) => {
    p.classList.toggle("on", p.dataset.j === label);
  });
}

/** Centraliza numa coordenada de MUNDO, com zoom de nível de junção. */
export function centerOnWorld(x: number, y: number): void {
  const rect = viewport.getBoundingClientRect();
  scale = Math.min(Math.max(0.05, minScale), MAX_SCALE);
  originX = rect.width / 2 - mapX(x) * scale;
  originY = rect.height / 2 - mapY(y) * scale;
  apply();
}

// ---------- pan/zoom ----------

function clampView(): void {
  scale = Math.min(Math.max(scale, minScale), MAX_SCALE);
  const rect = viewport.getBoundingClientRect();
  const mapW = MAP_SIZE * scale, mapH = MAP_SIZE * scale;
  if (mapW <= rect.width) originX = (rect.width - mapW) / 2;
  else originX = Math.min(0, Math.max(rect.width - mapW, originX));
  if (mapH <= rect.height) originY = (rect.height - mapH) / 2;
  else originY = Math.min(0, Math.max(rect.height - mapH, originY));
}

function apply(): void {
  clampView();
  svg.style.transform = `translate(${originX}px, ${originY}px) scale(${scale})`;
  // tamanhos constantes na tela independentemente do zoom
  const inv = 1 / scale;
  for (const m of markers) m.setAttribute("transform", `scale(${inv})`);
  svg.style.setProperty("--tw", `${3.5 * inv}px`);
  svg.style.setProperty("--gw", `${9 * inv}px`);
  declutterStations();
}

/** Oculta nomes de estação que colidiriam na tela — com outros nomes ou com
 * pinos de junção (sempre visíveis, desenhados por cima). Como os marcadores
 * têm tamanho constante na tela, a colisão só depende do zoom — não do pan —
 * então o greedy roda apenas quando o scale muda. Ordem do payload = ordem
 * de prioridade estável (labels não piscam entre zooms); os ocultados mantêm
 * o quadrado e o nome no hover. */
function declutterStations(): void {
  if (scale === labelScale) return;
  labelScale = scale;
  // caixa do pino = círculo visível (r=9) + rótulo "Jn"; o anel r=17 só
  // aparece na seleção e pode sobrepor um nome momentaneamente
  const placed = pinBoxes.map((p) => ({
    x0: p.x * scale - 11, y0: p.y * scale - 11, x1: p.x * scale + p.w, y1: p.y * scale + 11,
  }));
  for (const s of stationLabels) {
    const sx = s.x * scale, sy = s.y * scale;
    const box = { x0: sx - 10, y0: sy - 11, x1: sx + s.w + 4, y1: sy + 11 };
    const hit = placed.some((p) => box.x0 < p.x1 && box.x1 > p.x0 && box.y0 < p.y1 && box.y1 > p.y0);
    s.el.classList.toggle("lbl-off", hit);
    if (!hit) placed.push(box);
  }
}

function fit(): void {
  const rect = viewport.getBoundingClientRect();
  if (!rect.width) {
    // tela ainda oculta (display:none) — tenta de novo quando ela pintar
    requestAnimationFrame(fit);
    return;
  }
  minScale = Math.min(rect.width / MAP_SIZE, rect.height / MAP_SIZE);
  const [fx, fy, fw, fh] = focus;
  scale = Math.min(rect.width / fw, rect.height / fh) * 0.95;
  originX = (rect.width - fw * scale) / 2 - fx * scale;
  originY = (rect.height - fh * scale) / 2 - fy * scale;
  apply();
}

function bindPanZoom(): void {
  viewport.addEventListener("wheel", (e) => {
    e.preventDefault();
    const rect = viewport.getBoundingClientRect();
    const mx = e.clientX - rect.left, my = e.clientY - rect.top;
    const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
    const next = Math.min(Math.max(scale * factor, minScale), MAX_SCALE);
    const wx = (mx - originX) / scale, wy = (my - originY) / scale;
    scale = next;
    originX = mx - wx * scale;
    originY = my - wy * scale;
    apply();
  }, { passive: false });

  // arrastar + pinch via Pointer Events. A captura do ponteiro só começa
  // depois de um pequeno arrasto — capturar já no pointerdown redirecionaria
  // o click para o viewport e os pinos de junção nunca receberiam o clique.
  const pointers = new Map<number, { x: number; y: number; sx: number; sy: number; drag: boolean }>();
  let pinchDist = 0;

  viewport.addEventListener("pointerdown", (e) => {
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, drag: false });
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      pinchDist = Math.hypot(a.x - b.x, a.y - b.y);
    }
  });

  viewport.addEventListener("pointermove", (e) => {
    const prev = pointers.get(e.pointerId);
    if (!prev) return;
    if (!prev.drag && Math.hypot(e.clientX - prev.sx, e.clientY - prev.sy) > 4) {
      prev.drag = true;
      viewport.setPointerCapture(e.pointerId);
      viewport.classList.add("dragging");
    }
    if (pointers.size === 1 && prev.drag) {
      originX += e.clientX - prev.x;
      originY += e.clientY - prev.y;
      apply();
    }
    prev.x = e.clientX;
    prev.y = e.clientY;
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      if (pinchDist > 0) {
        const rect = viewport.getBoundingClientRect();
        const cx = (a.x + b.x) / 2 - rect.left, cy = (a.y + b.y) / 2 - rect.top;
        const next = Math.min(Math.max(scale * (dist / pinchDist), minScale), MAX_SCALE);
        const wx = (cx - originX) / scale, wy = (cy - originY) / scale;
        scale = next;
        originX = cx - wx * scale;
        originY = cy - wy * scale;
        apply();
      }
      pinchDist = dist;
    }
  });

  const release = (e: PointerEvent) => {
    pointers.delete(e.pointerId);
    pinchDist = 0;
    if (!pointers.size) viewport.classList.remove("dragging");
  };
  viewport.addEventListener("pointerup", release);
  viewport.addEventListener("pointercancel", release);
}

// ---------- helpers ----------

function layer(id: string): SVGGElement {
  return svg.querySelector(`#layer-${id}`) as SVGGElement;
}

function pathEl(d: string, cls: string): SVGPathElement {
  const p = document.createElementNS(SVG_NS, "path");
  p.setAttribute("d", d);
  p.setAttribute("class", cls);
  return p;
}

/** Marcador autorado em px ao redor da própria origem, pregado no mapa com
 * translate; o grupo interno .mks é contra-escalado a cada zoom. */
function marker(x: number, y: number, cls: string, innerHtml: string): SVGGElement {
  const g = document.createElementNS(SVG_NS, "g");
  g.setAttribute("class", cls);
  g.setAttribute("transform", `translate(${x.toFixed(1)} ${y.toFixed(1)})`);
  const inner = document.createElementNS(SVG_NS, "g");
  inner.classList.add("mks");
  inner.innerHTML = innerHtml;
  g.appendChild(inner);
  markers.push(inner);
  return g;
}

function escapeXml(text: string): string {
  return text.replace(/[<>&"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

export function junctionByLabel(payload: AnalysisPayload, label: string): Junction | undefined {
  return payload.junctions.find((j) => j.label === label);
}
