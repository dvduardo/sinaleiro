// Sidebar: plano de instalação agrupado por junção, com checkboxes que
// persistem no navegador (por save + modo). Cada recomendação carrega o
// estado da auditoria (➕ falta / ⚠ revisar tipo / ✓ já ok) e um filtro por
// estado esconde o que não interessa; sinais de linha e dicas de desvio
// entram como grupos próprios no fim da lista.
import { fmtXY } from "../map/calibration";
import type { AnalysisPayload, AuditStatus } from "../types";
import { t, compass, roleLabel, signalName } from "../i18n";

export type StatusFilter = "all" | AuditStatus;

export interface SidebarCallbacks {
  onLocate: (junctionLabel: string, x: number, y: number) => void;
  /** Localiza um ponto sem junção associada (sinal de linha / dica). */
  onLocatePoint: (x: number, y: number) => void;
  onOpenLens: (junctionLabel: string) => void;
  /** Abre a lupa de trecho de um sinal de linha. */
  onOpenLineLens: (id: number) => void;
  onFilter: (filter: StatusFilter) => void;
}

let el: HTMLElement;
let storeKey = "";
// chaves "r<id>" (recomendações de junção) e "l<id>" (sinais de linha)
let done = new Set<string>();
let total = 0;
let filter: StatusFilter = "all";

export function mountSidebar(root: HTMLElement): void {
  el = root;
  filter = "all";
}

export function renderSidebar(payload: AnalysisPayload, saveKey: string, cb: SidebarCallbacks): void {
  storeKey = `sinaleiro-done-${saveKey}-${payload.mode}`;
  done = loadDone(storeKey);
  // "X de N": só o que pede ação — braços já ok não contam como pendência
  const actionable = payload.recommendations.filter((r) => r.status !== "ok").length;
  total = actionable + payload.line_signals.length;

  el.innerHTML = `
    <div class="sbhead">
      <p class="ttl">${t("sidebar.title")}</p>
      <div class="cnt"><b id="sbN">0</b><span>${t("sidebar.count")(total)}</span></div>
      <div class="sbbar"><i id="sbBar"></i></div>
      <div class="sbfilter" role="group" aria-label="${t("sidebar.filterAria")}">
        <button type="button" data-f="all">${t("sidebar.filter.all")}</button>
        <button type="button" data-f="missing" class="f-missing">${t("sidebar.filter.missing")} <em>${payload.stats.missing}</em></button>
        <button type="button" data-f="retype" class="f-retype">${t("sidebar.filter.retype")} <em>${payload.stats.retype}</em></button>
        <button type="button" data-f="ok" class="f-ok">${t("sidebar.filter.ok")} <em>${payload.stats.ok}</em></button>
      </div>
    </div>
    <div class="sblist" id="sbList"></div>
  `;

  el.querySelectorAll<HTMLButtonElement>(".sbfilter button").forEach((btn) => {
    btn.addEventListener("click", () => {
      filter = btn.dataset.f as StatusFilter;
      applyFilter();
      cb.onFilter(filter);
    });
  });

  const list = el.querySelector("#sbList")!;
  for (const j of payload.junctions) {
    const group = document.createElement("details");
    group.className = "jgroup";
    group.open = true;
    group.dataset.j = j.label;

    const summary = document.createElement("summary");
    summary.innerHTML =
      `<span>${t("sidebar.junction")(j.label, j.degree >= 4)} · ${j.nearest_station ? t("sidebar.nearStation")(escapeHtml(j.nearest_station)) : t("sidebar.noStation")}</span>` +
      `<button type="button" class="lupa">${t("sidebar.lupa")}</button>` +
      `<span class="gcnt"></span>`;
    summary.querySelector(".lupa")!.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      cb.onOpenLens(j.label);
    });
    group.appendChild(summary);

    for (const id of j.rec_ids) {
      const rec = payload.recommendations[id];
      const key = `r${id}`;
      const row = document.createElement("div");
      row.className = `srow st-${rec.status}${rec.ambiguous ? " amb" : ""}`;
      row.dataset.st = rec.status;
      const facing = rec.role === "entrada" ? t("sidebar.facing.entry") : t("sidebar.facing.exit");
      // modo misto: sufixo neutro nos braços bidirecionais (não é alerta)
      const kindTxt = rec.track_kind === "bi_confirmed" || rec.track_kind === "bi_assumed"
        ? t("sidebar.bidirectionalSuffix") : "";
      const statusTxt = rec.status === "ok" ? t("sidebar.status.ok")
        : rec.status === "retype"
          ? t("sidebar.status.retype")(signalName(rec.current_type ?? "Block"), signalName(rec.type))
          : t("sidebar.status.missing");
      row.innerHTML =
        (rec.status === "ok"
          ? `<span class="sbadge ok" aria-hidden="true">✓</span>`
          : `<input type="checkbox" aria-label="${t("sidebar.checkAria")}">`) +
        `<span class="ptype ${rec.type === "Path" ? "path" : "block"}">${rec.type === "Path" ? t("sidebar.type.path") : t("sidebar.type.block")}</span>` +
        `<span><span class="st">${rec.ambiguous ? "⚠ " : ""}${statusIcon(rec.status)} ${cap(roleLabel(rec.role))} ${escapeHtml(compass(rec.approach_dir))}, ${facing}${kindTxt}</span><br>` +
        `<span class="sw">${escapeHtml(statusTxt)}</span><br>` +
        `<span class="sco">${fmtXY(rec.x, rec.y)} · Z ${Math.round(rec.z / 100)} m</span></span>`;

      bindRow(row, key, () => {
        cb.onLocate(j.label, rec.x, rec.y);
      });
      group.appendChild(row);
    }
    list.appendChild(group);
  }

  // sinais de linha (gap-fill) — sugestões de adição, contam como "faltando"
  if (payload.line_signals.length > 0) {
    const group = document.createElement("details");
    group.className = "jgroup lines";
    group.open = true;
    const summary = document.createElement("summary");
    summary.innerHTML = `<span>${t("sidebar.lineGroup")(payload.line_signals.length)}</span><span class="gcnt"></span>`;
    group.appendChild(summary);
    for (const s of payload.line_signals) {
      const key = `l${s.id}`;
      const row = document.createElement("div");
      row.className = "srow st-missing";
      row.dataset.st = "missing";
      row.innerHTML =
        `<input type="checkbox" aria-label="${t("sidebar.checkAria")}">` +
        `<span class="ptype block">${t("sidebar.type.block")}</span>` +
        `<span><span class="st">➕ ${escapeHtml(t("sidebar.lineRow")(s.run))}</span><br>` +
        `<span class="sw">${escapeHtml(t("sidebar.lineRowDetail")(Math.round(s.block_m), Math.round(s.arc_m)))}</span><br>` +
        `<span class="sco">${fmtXY(s.x, s.y)} · Z ${Math.round(s.z / 100)} m</span></span>` +
        `<button type="button" class="lupa">${t("sidebar.lupa")}</button>`;
      row.querySelector(".lupa")!.addEventListener("click", (e) => {
        e.stopPropagation();
        cb.onOpenLineLens(s.id);
      });
      bindRow(row, key, () => cb.onLocatePoint(s.x, s.y));
      group.appendChild(row);
    }
    list.appendChild(group);
  }

  // dicas de desvio — informativas, sem checkbox
  if (payload.passing_loop_hints.length > 0) {
    const group = document.createElement("details");
    group.className = "jgroup hints";
    group.open = true;
    const summary = document.createElement("summary");
    summary.innerHTML = `<span>${t("sidebar.hintGroup")(payload.passing_loop_hints.length)}</span>`;
    group.appendChild(summary);
    for (const h of payload.passing_loop_hints) {
      const row = document.createElement("div");
      row.className = "srow hint";
      row.dataset.st = "hint";
      row.innerHTML =
        `<span class="sbadge hint" aria-hidden="true">⇆</span>` +
        `<span><span class="sw">${escapeHtml(t("sidebar.hintRow")(h.length_m))}</span><br>` +
        `<span class="sco">${fmtXY(h.x, h.y)}</span></span>`;
      row.addEventListener("click", () => cb.onLocatePoint(h.x, h.y));
      group.appendChild(row);
    }
    list.appendChild(group);
  }

  applyFilter();
  updateCounters();
}

/** Liga checkbox (persistência) e clique (localizar) de uma linha. */
function bindRow(row: HTMLDivElement, key: string, locate: () => void): void {
  const checkbox = row.querySelector("input");
  if (checkbox) {
    checkbox.checked = done.has(key);
    row.classList.toggle("done", done.has(key));
    checkbox.addEventListener("click", (e) => e.stopPropagation());
    checkbox.addEventListener("change", () => {
      checkbox.checked ? done.add(key) : done.delete(key);
      row.classList.toggle("done", checkbox.checked);
      localStorage.setItem(storeKey, JSON.stringify([...done]));
      updateCounters();
    });
  }
  row.addEventListener("click", (e) => {
    if ((e.target as HTMLElement).tagName === "INPUT") return;
    locate();
    el.querySelectorAll(".srow.hot").forEach((r) => r.classList.remove("hot"));
    row.classList.add("hot");
  });
}

/** Destaca (e rola até) o grupo de uma junção. */
export function highlightGroup(label: string): void {
  const group = el.querySelector<HTMLDetailsElement>(`.jgroup[data-j="${label}"]`);
  if (!group) return;
  group.open = true;
  group.scrollIntoView({ block: "nearest" });
}

function applyFilter(): void {
  el.querySelectorAll<HTMLButtonElement>(".sbfilter button").forEach((btn) => {
    btn.classList.toggle("on", btn.dataset.f === filter);
  });
  el.querySelectorAll<HTMLElement>(".srow").forEach((row) => {
    const st = row.dataset.st;
    // dicas de desvio só aparecem sem filtro ou no filtro "faltando"
    const show = filter === "all" || st === filter || (st === "hint" && filter === "missing");
    row.classList.toggle("hidden", !show);
  });
  el.querySelectorAll<HTMLElement>(".jgroup").forEach((group) => {
    const visible = group.querySelectorAll(".srow:not(.hidden)").length;
    group.classList.toggle("hidden", visible === 0);
  });
}

function updateCounters(): void {
  (el.querySelector("#sbN") as HTMLElement).textContent = String(done.size);
  (el.querySelector("#sbBar") as HTMLElement).style.width = `${total ? (done.size / total) * 100 : 0}%`;
  el.querySelectorAll(".jgroup").forEach((group) => {
    const rows = group.querySelectorAll(".srow input");
    const doneRows = group.querySelectorAll(".srow.done");
    const cnt = group.querySelector(".gcnt") as HTMLElement | null;
    if (cnt) cnt.textContent = rows.length ? `${doneRows.length}/${rows.length}` : "";
    group.classList.toggle("complete", rows.length > 0 && doneRows.length === rows.length);
  });
}

/** Carrega o checklist salvo; migra o formato antigo (ids numéricos das
 * recomendações de junção) para as chaves "r<id>". */
function loadDone(key: string): Set<string> {
  const raw = JSON.parse(localStorage.getItem(key) ?? "[]") as (string | number)[];
  return new Set(raw.map((v) => (typeof v === "number" ? `r${v}` : v)));
}

function statusIcon(status: AuditStatus): string {
  return status === "ok" ? "✓" : status === "retype" ? "⚠" : "➕";
}

function cap(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function escapeHtml(text: string): string {
  return text.replace(/[<>&"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" }[c]!));
}
