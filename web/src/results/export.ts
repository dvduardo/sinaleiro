/** Baixa a checklist em texto (mesmo formato do CLI: sinais_recomendados.txt). */
export function downloadReport(text: string, mode: string): void {
  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = mode === "oneway" ? "sinais_recomendados_mao_unica.txt" : "sinais_recomendados.txt";
  a.click();
  URL.revokeObjectURL(url);
}
