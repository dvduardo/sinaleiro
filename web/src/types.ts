/** Espelha o payload v3 de src/web_api.py — coordenadas em cm de mundo
 * (as mesmas que o jogador vê no jogo); +X = leste, +Y = sul. */

export type Mode = "mixed" | "bidirectional" | "oneway";
export type SignalType = "Path" | "Block";
/** Auditoria contra os sinais que o save já tem (coverage.py): "missing" =
 * braço vazio, coloque; "ok" = o tipo recomendado já está lá, nada a fazer;
 * "retype" = há sinal de outro tipo, revise (pode ser intencional). */
export type AuditStatus = "missing" | "ok" | "retype";
/** Classificação por trilho do modo misto (classify.py): mão única,
 * bidirecional confirmado (ponte no grafo), bidirecional presumido
 * (sem evidência — par completo por segurança) ou linha inacabada. */
export type TrackKind = "oneway" | "bi_confirmed" | "bi_assumed" | "stub";

export interface Stats {
  tracks: number;
  junctions: number;
  stations: number;
  existing_signals: number;
  existing_path: number;
  existing_block: number;
  recommendations: number;
  path: number;
  block: number;
  ambiguous: number;
  /** Auditoria dos sinais existentes: contagens por estado. */
  missing: number;
  retype: number;
  ok: number;
  /** Nº de composições (trens) no save. */
  trains: number;
  /** Alvo de trens por corrida usado no gap-fill de sinais de linha. */
  trains_target: number;
  line_signals: number;
  passing_loop_hints: number;
  directions_total?: number;
  directions_known?: number;
  inconsistent_junctions?: number;
  /** Só no modo misto: contagem de trilhos por classificação. */
  oneway_tracks?: number;
  bi_confirmed_tracks?: number;
  bi_assumed_tracks?: number;
  stub_tracks?: number;
}

export interface TrackGeom {
  name: string;
  /** [x0,y0] + [c1x,c1y,c2x,c2y,x,y] por segmento (bezier cúbico). */
  bez: number[];
  /** Modo mão única: +1/-1 = fluxo inferido, null = ambíguo.
   * Modo misto: presente só quando kind === "oneway". */
  direction?: 1 | -1 | null;
  /** Só no modo misto. */
  kind?: TrackKind;
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
  /** Só no modo misto: braços inacabados (sem recomendação) nesta junção. */
  stub_arms?: number;
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
  /** Só no modo misto: classificação do trilho desta aproximação
   * (nunca "stub" — braços inacabados não geram recomendação). */
  track_kind?: TrackKind;
  status: AuditStatus;
  /** Tipo do sinal que já existe no braço (quando status ≠ "missing"). */
  current_type: SignalType | null;
}

/** Sinal de Trecho sugerido ao longo de uma corrida de mão única para que
 * ela comporte `stats.trains_target` trens (line_signals.py). */
export interface LineSignal {
  id: number;
  /** Índice da corrida (cadeia de trilhos mão única) a que pertence. */
  run: number;
  x: number;
  y: number;
  z: number;
  /** Rumo do trem no ponto do sinal (0 = norte, horário); o poste fica à
   * perpendicular-direita desse rumo. */
  facing_deg: number;
  /** Distância desde o início da corrida, em metros. */
  arc_m: number;
  /** Comprimento do bloco resultante, em metros. */
  block_m: number;
  reason: string;
}

/** Metadados de uma corrida de mão única que recebeu sinais de linha —
 * suficientes para a lupa de trecho desenhar a corrida como uma reta com as
 * marcas de bloco (existentes + sugeridas). */
export interface LineRun {
  run: number;
  length_m: number;
  existing: { arc_m: number; type: SignalType }[];
}

/** Trecho bidirecional longo: não subdividir em blocos — considerar um
 * desvio (passing loop) no ponto indicado. */
export interface PassingLoopHint {
  x: number;
  y: number;
  length_m: number;
}

export interface AnalysisPayload {
  version: 3;
  mode: Mode;
  stats: Stats;
  tracks: TrackGeom[];
  /** [x, y, graus] — setas de fluxo (mão única; no misto, só trilhos oneway). */
  flow_arrows: [number, number, number][];
  stations: StationRef[];
  existing_signals: ExistingSignal[];
  junctions: Junction[];
  recommendations: Recommendation[];
  line_signals: LineSignal[];
  passing_loop_hints: PassingLoopHint[];
  /** Opcional para tolerar payloads v3 em cache gerados antes deste campo. */
  line_runs?: LineRun[];
  text_report: string;
}
