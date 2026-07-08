import { getLang, setLang, type Lang } from "./index";

/** Segmento PT | EN — mesmo componente visual dos botões de modo (.mode/.rmode). */
export function mountLangToggle(container: HTMLElement): void {
  const group = document.createElement("div");
  group.className = "langtoggle";
  group.setAttribute("role", "group");
  group.setAttribute("aria-label", "Language / Idioma");
  group.innerHTML = `
    <button type="button" data-lang="pt">PT</button>
    <button type="button" data-lang="en">EN</button>
  `;
  const sync = () => {
    const active = getLang();
    group.querySelectorAll<HTMLButtonElement>("button").forEach((b) => {
      const on = b.dataset.lang === active;
      b.classList.toggle("on", on);
      b.setAttribute("aria-pressed", String(on));
    });
  };
  group.querySelectorAll<HTMLButtonElement>("button").forEach((b) => {
    b.addEventListener("click", () => setLang(b.dataset.lang as Lang));
  });
  sync();
  container.appendChild(group);
}
