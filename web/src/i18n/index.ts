import { pt, type Messages } from "./pt";
import { en } from "./en";

export type Lang = "pt" | "en";

const STORE_KEY = "sinaleiro-lang";
const dicts: Record<Lang, Messages> = { pt, en };

let lang: Lang = (localStorage.getItem(STORE_KEY) as Lang | null)
  ?? (navigator.language.toLowerCase().startsWith("pt") ? "pt" : "en");

const listeners: Array<(l: Lang) => void> = [];

export function getLang(): Lang {
  return lang;
}

export function setLang(l: Lang): void {
  if (l === lang) return;
  lang = l;
  localStorage.setItem(STORE_KEY, l);
  document.documentElement.lang = locale();
  document.title = t("app.title");
  listeners.forEach((fn) => fn(l));
}

export function onLangChange(fn: (l: Lang) => void): void {
  listeners.push(fn);
}

export function locale(): "pt-BR" | "en-US" {
  return lang === "pt" ? "pt-BR" : "en-US";
}

export function t<K extends keyof Messages>(key: K): Messages[K] {
  return dicts[lang][key];
}

/** Formata um número decimal conforme o idioma ativo (vírgula em PT, ponto em EN). */
export function fmtNum(v: number, digits = 1): string {
  return v.toLocaleString(locale(), { minimumFractionDigits: 0, maximumFractionDigits: digits });
}

/** Traduz uma palavra de COMPASS_PT vinda do payload Python. */
export function compass(dirKey: string): string {
  return t("compass")[dirKey] ?? dirKey;
}

export function roleLabel(role: "entrada" | "saída"): string {
  return role === "entrada" ? t("role.entry") : t("role.exit");
}

export function signalName(type: "Path" | "Block"): string {
  return type === "Path" ? t("signal.path") : t("signal.block");
}
