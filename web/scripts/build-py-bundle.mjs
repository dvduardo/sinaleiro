// Empacota o pipeline Python (src/ + vendor/) num zip que o worker descompacta
// no FS do Pyodide, preservando o layout relativo para o path-hack de
// parse_save.py (../vendor/sat_sav_parse) continuar funcionando.
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { zipSync } from "fflate";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const outDir = join(repoRoot, "web", "public", "py");

const FILES = [
  "src/parse_save.py",
  "src/graph.py",
  "src/directions.py",
  "src/geometry.py",
  "src/signal_rules.py",
  "src/report.py",
  "src/web_api.py",
  "vendor/sat_sav_parse/sav_parse.py",
  "vendor/sat_sav_parse/sav_data/data.py",
  "vendor/sat_sav_parse/sav_data/readableNames.py",
];

const entries = {};
for (const rel of FILES) {
  entries[rel] = readFileSync(join(repoRoot, rel));
}

const zip = zipSync(entries, { level: 9 });
const hash = createHash("sha1").update(zip).digest("hex").slice(0, 12);

mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, "bundle.zip"), zip);
writeFileSync(join(outDir, "bundle.json"), JSON.stringify({ hash }));
console.log(`py bundle: ${FILES.length} arquivos, ${(zip.length / 1024).toFixed(0)} KB, hash ${hash}`);
