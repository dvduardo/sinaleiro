/** Espelha o payload v1 de src/web_api.py — coordenadas em cm de mundo
 * (as mesmas que o jogador vê no jogo); +X = leste, +Y = sul. */

export type Mode = "bidirectional" | "oneway";
export type SignalType = "Path" | "Block";

export interface Stats {
  tracks: number;
  junctions: number;
  stations: number;
  existing_signals: number;
  recommendations: number;
  path: number;
  block: number;
  ambiguous: number;
  directions_total?: number;
  directions_known?: number;
  inconsistent_junctions?: number;
}

export interface TrackGeom {
  name: string;
  /** [x0,y0] + [c1x,c1y,c2x,c2y,x,y] por segmento (bezier cúbico). */
  bez: number[];
  /** Só no modo mão única: +1/-1 = fluxo inferido, null = ambíguo. */
  direction?: 1 | -1 | null;
}

export interface StationRef {
  name: string;
  x: number;
  y: number;
}

export interface ExistingSignal {
  x: number;
  y: number;
  type: SignalType;
}

export interface Junction {
  label: string;
  node_id: string;
  x: number;
  y: number;
  degree: number;
  nearest_station: string | null;
  rec_ids: number[];
}

export interface Recommendation {
  id: number;
  junction: string;
  track: string;
  type: SignalType;
  name_pt: string;
  role: "entrada" | "saída";
  x: number;
  y: number;
  z: number;
  approach_dir: string;
  /** Rumo junção→sinal (0 = norte, horário). */
  approach_deg: number;
  /** Rumo do trem governado pelo sinal no ponto do sinal; o poste fica à
   * perpendicular-direita desse rumo (regra do jogo). */
  facing_deg: number;
  setback_m: number;
  ambiguous: boolean;
  reason: string;
  nearest_station: string | null;
  nearest_station_m: number | null;
}

export interface AnalysisPayload {
  version: 1;
  mode: Mode;
  stats: Stats;
  tracks: TrackGeom[];
  /** [x, y, graus] — setas de fluxo, só no modo mão única. */
  flow_arrows: [number, number, number][];
  stations: StationRef[];
  existing_signals: ExistingSignal[];
  junctions: Junction[];
  recommendations: Recommendation[];
  text_report: string;
}
