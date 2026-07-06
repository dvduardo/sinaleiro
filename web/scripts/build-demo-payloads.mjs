// Gera os payloads do modo demonstração ("experimentar sem save"): roda o
// pipeline CPython (src/web_api.py) sobre o save de demo e grava um JSON por
// modo em web/public/demo/. A saída é COMMITADA (o CI não tem saves) — rode
// de novo e commite quando o PAYLOAD_VERSION de web_api.py mudar ou quando
// quiser trocar o save de demonstração:
//
//   node scripts/build-demo-payloads.mjs [/caminho/para/Save.sav]
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const savePath = process.argv[2] ?? join(repoRoot, "saves", "Progresso_autosave_2.sav");
const outDir = join(repoRoot, "web", "public", "demo");

if (!existsSync(savePath)) {
  console.error(`demo: save não encontrado (${savePath})`);
  process.exit(1);
}

const venvPython = join(repoRoot, ".venv", "bin", "python3");
const python = existsSync(venvPython) ? venvPython : "python3";

mkdirSync(outDir, { recursive: true });
for (const mode of ["bidirectional", "oneway"]) {
  const flag = mode === "oneway" ? ["--mao-unica"] : [];
  const json = execFileSync(python, [join(repoRoot, "src", "web_api.py"), savePath, ...flag], {
    maxBuffer: 64 * 1024 * 1024,
    stdio: ["ignore", "pipe", "inherit"],
  }).toString();
  const outPath = join(outDir, `${mode}.json`);
  writeFileSync(outPath, json);
  const stats = JSON.parse(json).stats;
  console.log(`demo ${mode}: ${(json.length / 1024).toFixed(0)} KB — ${stats.recommendations} recomendações → ${outPath}`);
}
