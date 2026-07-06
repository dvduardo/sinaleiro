// Teste de paridade: roda o pipeline dentro do Pyodide (em Node) e compara o
// payload com o do CPython (src/web_api.py) no mesmo save. Também mede o
// tempo de parse sob WebAssembly. Pula com aviso se o save de teste não
// existir (CI não tem saves).
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadPyodide } from "pyodide";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const savePath = process.argv[2] ?? join(repoRoot, "saves", "Progresso_autosave_2.sav");
const bundlePath = join(repoRoot, "web", "public", "py", "bundle.zip");

if (!existsSync(savePath)) {
  console.warn(`smoke: save de teste não encontrado (${savePath}) — pulando.`);
  process.exit(0);
}

const venvPython = join(repoRoot, ".venv", "bin", "python3");
const python = existsSync(venvPython) ? venvPython : "python3";

let pyodideCache = null;

for (const mode of ["bidirectional", "oneway"]) {
  const flag = mode === "oneway" ? ["--mao-unica"] : [];

  const t0 = Date.now();
  const cpython = execFileSync(python, [join(repoRoot, "src", "web_api.py"), savePath, ...flag], {
    maxBuffer: 64 * 1024 * 1024,
    stdio: ["ignore", "pipe", "ignore"],
  }).toString();
  const cpythonMs = Date.now() - t0;

  const pyodideJson = await runPyodide(mode);
  if (cpython.trim() === pyodideJson.trim()) {
    const stats = JSON.parse(pyodideJson).stats;
    console.log(`smoke ${mode}: paridade OK — ${stats.recommendations} recomendações (CPython ${cpythonMs} ms)`);
  } else {
    console.error(`smoke ${mode}: PAYLOADS DIFERENTES entre CPython e Pyodide`);
    process.exit(1);
  }
}

async function runPyodide(mode) {
  if (!pyodideCache) {
    const t0 = Date.now();
    const py = await loadPyodide();
    py.FS.mkdirTree("/app");
    // Buffer do Node é uma view no pool interno; o Pyodide precisa do
    // ArrayBuffer exato, senão descompacta lixo e aborta
    const zipBuf = readFileSync(bundlePath);
    py.unpackArchive(zipBuf.buffer.slice(zipBuf.byteOffset, zipBuf.byteOffset + zipBuf.byteLength), "zip", { extractDir: "/app" });
    py.runPython('import sys; sys.path.insert(0, "/app/src")');
    py.runPython("import web_api");
    console.log(`smoke: Pyodide carregado em ${Date.now() - t0} ms`);

    const saveBytes = readFileSync(savePath);
    const t1 = Date.now();
    py.globals.set("save_bytes", new Uint8Array(saveBytes));
    py.runPython("web_api.load_save(save_bytes.to_py()); del save_bytes");
    console.log(`smoke: parse de ${(saveBytes.length / 1e6).toFixed(1)} MB no Pyodide em ${Date.now() - t1} ms`);
    pyodideCache = py;
  }
  const py = pyodideCache;
  py.globals.set("mode", mode);
  const t2 = Date.now();
  const out = py.runPython("web_api.analyze(mode)");
  console.log(`smoke: analyze(${mode}) no Pyodide em ${Date.now() - t2} ms`);
  return out;
}
