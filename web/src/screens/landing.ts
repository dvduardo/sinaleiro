// C-00 — a porta de entrada (aprovado)
import type { Mode } from "../types";
import type { ErrorCode } from "../worker/protocol";
import { t, fmtNum } from "../i18n";
import { mountLangToggle } from "../i18n/toggle";

export interface LandingCallbacks {
  onAnalyze: (file: File, mode: Mode) => void;
  onDemo: (mode: Mode) => void;
}

function modeNote(m: Mode): string {
  return m === "mixed" ? t("landing.modeNote.mixed")
    : m === "bidirectional" ? t("landing.modeNote.bidirectional")
    : t("landing.modeNote.oneway");
}

function errorText(code: ErrorCode): { title: string; hint: string } {
  return { title: t(`landing.error.${code}.title` as const), hint: t(`landing.error.${code}.hint` as const) };
}

let selectedFile: File | null = null;
let mode: Mode = "mixed";
let lastError: { code: ErrorCode; detail?: string } | null = null;
let cb: LandingCallbacks;
let el: HTMLElement;

export function mountLanding(root: HTMLElement, callbacks: LandingCallbacks): void {
  el = root;
  cb = callbacks;
  render();
}

function render(): void {
  el.innerHTML = `
    <div class="topbar">
      <svg class="logo" viewBox="0 0 26 26" aria-hidden="true"><rect x="1" y="1" width="24" height="24" rx="3" fill="none" stroke="#F27B2C" stroke-width="2"/><circle cx="13" cy="9" r="3.4" fill="#3FBF8F"/><circle cx="13" cy="18" r="3.4" fill="#E05038"/></svg>
      <div class="brand">${t("landing.brand")} <small>${t("landing.brandTag")}</small></div>
      <span style="flex:1"></span>
      <div id="langHost"></div>
    </div>
    <div class="core">
      <h1>${t("landing.h1")}</h1>
      <p class="lead">${t("landing.lead")}</p>
      <div class="errcard" id="errcard" role="alert"></div>
      <div class="drop" id="drop" role="button" tabindex="0" aria-label="${t("landing.dropAria")}">
        <svg class="di" viewBox="0 0 38 38" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M19 5v18M12 16l7 7 7-7" stroke-linecap="round" stroke-linejoin="round"/><path d="M6 27v4a2 2 0 0 0 2 2h22a2 2 0 0 0 2-2v-4" stroke-linecap="round"/></svg>
        <b id="dropTitle">${t("landing.dropTitle")}</b>
        <span id="dropHint">${t("landing.dropHint")}</span>
      </div>
      <input type="file" id="fileInput" accept=".sav" class="sr-only" aria-hidden="true" tabindex="-1">
      <div class="mode" role="group" aria-label="${t("landing.modeAria")}">
        <button type="button" data-mode="mixed">${t("landing.mode.mixed")}</button>
        <button type="button" data-mode="bidirectional">${t("landing.mode.bidirectional")}</button>
        <button type="button" data-mode="oneway">${t("landing.mode.oneway")}</button>
      </div>
      <p class="mode-note" id="modeNote">${modeNote(mode)}</p>
      <button type="button" class="cta" id="cta" ${selectedFile ? "" : "disabled"}>${t("landing.cta")}</button>
      <button type="button" class="demo-link" id="demoBtn">${t("landing.demoLink")}</button>
      <p class="privacy"><b>${t("landing.privacyLabel")}</b> ${t("landing.privacyText")}</p>
    </div>
    <footer>${t("landing.footer")}</footer>
  `;

  mountLangToggle(q("#langHost"));

  const drop = q("#drop");
  const input = q<HTMLInputElement>("#fileInput");
  const ctaBtn = q<HTMLButtonElement>("#cta");

  el.querySelectorAll<HTMLButtonElement>(".mode button").forEach((btn) => {
    btn.classList.toggle("on", btn.dataset.mode === mode);
  });

  if (selectedFile) applyFileUI(selectedFile);
  if (lastError) showError(lastError.code, lastError.detail);

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
      q("#modeNote").textContent = modeNote(mode);
    });
  });

  ctaBtn.addEventListener("click", () => {
    if (selectedFile) cb.onAnalyze(selectedFile, mode);
  });

  q("#demoBtn").addEventListener("click", () => cb.onDemo(mode));
}

export function rerenderLanding(): void {
  render();
}

function setFile(file: File | null): void {
  if (file && !file.name.toLowerCase().endsWith(".sav")) {
    showError("invalid-save", t("landing.invalidFile")(file.name));
    return;
  }
  hideError();
  selectedFile = file;
  applyFileUI(file);
}

function applyFileUI(file: File | null): void {
  const drop = q("#drop");
  const ctaBtn = q<HTMLButtonElement>("#cta");
  drop.classList.toggle("hasfile", !!file);
  if (file) {
    q("#dropTitle").innerHTML = `<span class="fname"></span>`;
    q(".fname").textContent = file.name;
    q("#dropHint").textContent = t("landing.dropHintFile")(fmtNum(file.size / 1e6));
  } else {
    q("#dropTitle").textContent = t("landing.dropTitle");
    q("#dropHint").textContent = t("landing.dropHint");
  }
  ctaBtn.disabled = !file;
}

export function showError(code: ErrorCode, detail?: string): void {
  lastError = { code, detail };
  const et = errorText(code);
  const card = q("#errcard");
  card.innerHTML = "";
  const title = document.createElement("b");
  title.textContent = et.title;
  card.appendChild(title);
  card.appendChild(document.createTextNode(et.hint));
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
  lastError = null;
  q("#errcard").classList.remove("on");
}

function q<T extends HTMLElement = HTMLElement>(sel: string): T {
  return el.querySelector(sel) as T;
}
