import "./styles/tokens.css";
import "./styles/base.css";
import "./styles/landing.css";
import "./styles/loading.css";
import "./styles/results.css";
import "./styles/lens.css";

import { analyze, warmup, onProgress, AnalysisError } from "./pipeline/analyzer";
import { mountLanding, showError } from "./screens/landing";
import { mountLoading, startLoading, loadingProgress } from "./screens/loading";
import { mountResults, showResults } from "./screens/results";

type ScreenName = "landing" | "loading" | "results";

const app = document.getElementById("app")!;
app.innerHTML = `
  <section class="screen landing" id="scr-landing"></section>
  <section class="screen loading" id="scr-loading" aria-label="Analisando o save"></section>
  <section class="screen results" id="scr-results"></section>
`;

const screens: Record<ScreenName, HTMLElement> = {
  landing: document.getElementById("scr-landing")!,
  loading: document.getElementById("scr-loading")!,
  results: document.getElementById("scr-results")!,
};

function show(name: ScreenName): void {
  (Object.keys(screens) as ScreenName[]).forEach((k) => {
    screens[k].classList.toggle("on", k === name);
  });
}

// tempo mínimo na tela de carregamento, para o painel não "piscar" quando o
// Pyodide já está quente e o save é pequeno
const MIN_LOADING_MS = 1600;

mountLoading(screens.loading);
mountResults(screens.results);
mountLanding(screens.landing, {
  onAnalyze: async (file, mode) => {
    show("loading");
    startLoading(file.name, file.size);
    const t0 = performance.now();
    try {
      // chave estável p/ persistir a checklist deste save (o conteúdo muda a
      // cada autosave; nome+modo é o que identifica "a mesma malha" p/ o jogador)
      const saveKey = await digest(`${file.name}`);
      const result = await analyze(file, mode);
      const wait = MIN_LOADING_MS - (performance.now() - t0);
      if (wait > 0) await sleep(wait);
      show("results");
      showResults(result.payload, saveKey, file.name);
    } catch (err) {
      show("landing");
      if (err instanceof AnalysisError) showError(err.code, err.message);
      else showError("internal", String(err));
    }
  },
});

onProgress(loadingProgress);

show("landing");
warmup(); // baixa Pyodide + bundle enquanto o usuário escolhe o arquivo

async function digest(text: string): Promise<string> {
  const data = new TextEncoder().encode(text);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(hash)].slice(0, 8).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
