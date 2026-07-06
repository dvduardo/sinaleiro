// C-00 — a porta de entrada (aprovado)
import type { Mode } from "../types";
import type { ErrorCode } from "../worker/protocol";

export interface LandingCallbacks {
  onAnalyze: (file: File, mode: Mode) => void;
}

const MODE_NOTES: Record<Mode, string> = {
  bidirectional: "// cada aproximação de junção recebe o par Trajeto + Trecho",
  oneway: "// entradas recebem Trajeto, saídas só Trecho — a mão é inferida do seu layout",
};

const ERROR_TEXTS: Record<ErrorCode, { title: string; hint: string }> = {
  "invalid-save": {
    title: "Não conseguimos ler esse arquivo.",
    hint: "Confira se é um save do Satisfactory (.sav) — normalmente em %LocalAppData%/FactoryGame/Saved/SaveGames.",
  },
  "no-rails": {
    title: "O save foi lido, mas não tem trilhos de trem.",
    hint: "Construa uma ferrovia no seu mundo e salve de novo — aí sim temos o que sinalizar.",
  },
  "pyodide-load": {
    title: "Falha ao carregar o motor de análise.",
    hint: "Verifique sua conexão e recarregue a página — o download só acontece uma vez.",
  },
  internal: {
    title: "Algo deu errado durante a análise.",
    hint: "Tente de novo; se persistir, pode ser um save muito grande para este dispositivo — tente no desktop.",
  },
};

let selectedFile: File | null = null;
let mode: Mode = "bidirectional";
let el: HTMLElement;

export function mountLanding(root: HTMLElement, cb: LandingCallbacks): void {
  el = root;
  el.innerHTML = `
    <div class="topbar">
      <svg class="logo" viewBox="0 0 26 26" aria-hidden="true"><rect x="1" y="1" width="24" height="24" rx="3" fill="none" stroke="#F27B2C" stroke-width="2"/><circle cx="13" cy="9" r="3.4" fill="#3FBF8F"/><circle cx="13" cy="18" r="3.4" fill="#E05038"/></svg>
      <div class="brand">Sinaleiro <small>planejador de sinais ferroviários · não oficial</small></div>
    </div>
    <div class="core">
      <h1>Seu save entra. Um plano de sinalização sai.</h1>
      <p class="lead">Lemos a malha ferroviária do seu mundo, encontramos cada junção e dizemos exatamente onde colocar Sinais de Trajeto e de Trecho — com coordenadas e motivo.</p>
      <div class="errcard" id="errcard" role="alert"></div>
      <div class="drop" id="drop" role="button" tabindex="0" aria-label="Anexar arquivo de save">
        <svg class="di" viewBox="0 0 38 38" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M19 5v18M12 16l7 7 7-7" stroke-linecap="round" stroke-linejoin="round"/><path d="M6 27v4a2 2 0 0 0 2 2h22a2 2 0 0 0 2-2v-4" stroke-linecap="round"/></svg>
        <b id="dropTitle">Arraste seu arquivo .sav aqui</b>
        <span id="dropHint">ou clique para procurar · encontramos ele em %LocalAppData%/FactoryGame</span>
      </div>
      <input type="file" id="fileInput" accept=".sav" class="sr-only" aria-hidden="true" tabindex="-1">
      <div class="mode" role="group" aria-label="Modo dos trilhos">
        <button type="button" class="on" data-mode="bidirectional">⇄ Trilhos bidirecionais</button>
        <button type="button" data-mode="oneway">→ Mão única</button>
      </div>
      <p class="mode-note" id="modeNote">${MODE_NOTES.bidirectional}</p>
      <button type="button" class="cta" id="cta" disabled>Analisar malha ▸</button>
      <p class="privacy"><b>Privacidade:</b> a análise roda inteira no seu navegador — o save nunca sai da sua máquina.</p>
    </div>
    <footer>Projeto de fã, sem afiliação com a Coffee Stain Studios. Mapa © Satisfactory.</footer>
  `;

  const drop = q("#drop");
  const input = q<HTMLInputElement>("#fileInput");
  const ctaBtn = q<HTMLButtonElement>("#cta");

  function setFile(file: File | null) {
    if (file && !file.name.toLowerCase().endsWith(".sav")) {
      showError("invalid-save", `"${file.name}" não é um arquivo .sav.`);
      return;
    }
    hideError();
    selectedFile = file;
    drop.classList.toggle("hasfile", !!file);
    if (file) {
      q("#dropTitle").innerHTML = `<span class="fname"></span>`;
      q(".fname").textContent = file.name;
      q("#dropHint").textContent =
        `${(file.size / 1e6).toFixed(1).replace(".", ",")} MB · clique para trocar de arquivo`;
    } else {
      q("#dropTitle").textContent = "Arraste seu arquivo .sav aqui";
      q("#dropHint").textContent = "ou clique para procurar · encontramos ele em %LocalAppData%/FactoryGame";
    }
    ctaBtn.disabled = !file;
  }

  drop.addEventListener("click", () => input.click());
  drop.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      input.click();
    }
  });
  input.addEventListener("change", () => setFile(input.files?.[0] ?? null));

  drop.addEventListener("dragover", (e) => {
    e.preventDefault();
    drop.classList.add("dragover");
  });
  drop.addEventListener("dragleave", () => drop.classList.remove("dragover"));
  drop.addEventListener("drop", (e) => {
    e.preventDefault();
    drop.classList.remove("dragover");
    setFile(e.dataTransfer?.files?.[0] ?? null);
  });

  el.querySelectorAll<HTMLButtonElement>(".mode button").forEach((btn) => {
    btn.addEventListener("click", () => {
      mode = btn.dataset.mode as Mode;
      el.querySelectorAll(".mode button").forEach((b) => b.classList.toggle("on", b === btn));
      q("#modeNote").textContent = MODE_NOTES[mode];
    });
  });

  ctaBtn.addEventListener("click", () => {
    if (selectedFile) cb.onAnalyze(selectedFile, mode);
  });
}

export function showError(code: ErrorCode, detail?: string): void {
  const t = ERROR_TEXTS[code];
  const card = q("#errcard");
  card.innerHTML = "";
  const title = document.createElement("b");
  title.textContent = t.title;
  card.appendChild(title);
  card.appendChild(document.createTextNode(t.hint));
  if (detail && code !== "internal") {
    const d = document.createElement("div");
    d.className = "mono";
    d.style.cssText = "margin-top:6px;font-size:.66rem;opacity:.7";
    d.textContent = detail;
    card.appendChild(d);
  }
  card.classList.add("on");
}

function hideError(): void {
  q("#errcard").classList.remove("on");
}

function q<T extends HTMLElement = HTMLElement>(sel: string): T {
  return el.querySelector(sel) as T;
}
