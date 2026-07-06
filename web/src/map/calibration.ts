/* Calibração mundo→mapa (mesmos valores de src/report.py, estabelecidos pela
 * comunidade para o mapa 1.0). Coordenadas do mundo em cm; +X = leste,
 * +Y = sul — eixos já batem com a tela. */
export const MAP_X_MIN = -324698.832031;
export const MAP_Y_MIN = -375000.0;
export const MAP_SIZE = 750000.0;

export function mapX(worldX: number): number {
  return worldX - MAP_X_MIN;
}

export function mapY(worldY: number): number {
  return worldY - MAP_Y_MIN;
}

/** "−294.946" — número inteiro com separador de milhar e menos tipográfico. */
export function fmtCoord(v: number): string {
  const s = Math.round(Math.abs(v)).toLocaleString("pt-BR");
  return (v < 0 ? "−" : "") + s;
}

/** "X −294.946 · Y −86.800" */
export function fmtXY(x: number, y: number): string {
  return `X ${fmtCoord(x)} · Y ${fmtCoord(y)}`;
}
