// Copia o mapa do jogo para public/ e gera uma versão reduzida para o
// primeiro paint (o full de 2 MB troca por cima quando termina de carregar).
import { copyFileSync, existsSync, mkdirSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const src = join(repoRoot, "assets", "map_1.0.jpg");
const outDir = join(repoRoot, "web", "public", "map");
const full = join(outDir, "map_full.jpg");
const preview = join(outDir, "map_preview.jpg");

mkdirSync(outDir, { recursive: true });

const srcTime = statSync(src).mtimeMs;
const fresh = (p) => existsSync(p) && statSync(p).mtimeMs >= srcTime;

if (!fresh(full)) copyFileSync(src, full);
if (!fresh(preview)) {
  await sharp(src).resize(1250, 1250).jpeg({ quality: 70 }).toFile(preview);
}
console.log(`mapa: full ${(statSync(full).size / 1e6).toFixed(1)} MB, preview ${(statSync(preview).size / 1024).toFixed(0)} KB`);
