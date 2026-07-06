// Sidebar: plano de instalação agrupado por junção, com checkboxes que
// persistem no navegador (por save + modo).
import { fmtXY } from "../map/calibration";
import type { AnalysisPayload } from "../types";

export interface SidebarCallbacks {
  onLocate: (junctionLabel: string, x: number, y: number) => void;
  onOpenLens: (junctionLabel: string) => void;
}

let el: HTMLElement;
let storeKey = "";
let done = new Set<number>();
let total = 0;

export function mountSidebar(root: HTMLElement): void {
  el = root;
}

export function renderSidebar(payload: AnalysisPayload, saveKey: string, cb: SidebarCallbacks): void {
  storeKey = `sinaleiro-done-${saveKey}-${payload.mode}`;
  done = new Set(JSON.parse(localStorage.getItem(storeKey) ?? "[]") as number[]);
  total = payload.recommendations.length;

  el.innerHTML = `
    <div class="sbhead">
      <p class="ttl">Plano de instalação</p>
      <div class="cnt"><b id="sbN">0</b><span>de ${total} sinais instalados</span></div>
      <div class="sbbar"><i id="sbBar"></i></div>
    </div>
    <div class="sblist" id="sbList"></div>
  `;

  const list = el.querySelector("#sbList")!;
  for (const j of payload.junctions) {
    const group = document.createElement("details");
    group.className = "jgroup";
    group.open = true;
    group.dataset.j = j.label;

    const summary = document.createElement("summary");
    const warn = j.degree >= 4 ? " ⚠" : "";
    summary.innerHTML =
      `<span>Junção ${j.label}${warn} · ${j.nearest_station ? `perto de "${escapeHtml(j.nearest_station)}"` : "sem estação próxima"}</span>` +
      `<button type="button" class="lupa">Lupa</button>` +
      `<span class="gcnt"></span>`;
    summary.querySelector(".lupa")!.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      cb.onOpenLens(j.label);
    });
    group.appendChild(summary);

    for (const id of j.rec_ids) {
      const rec = payload.recommendations[id];
      const row = document.createElement("div");
      row.className = `srow${rec.ambiguous ? " amb" : ""}`;
      row.dataset.i = String(id);
      const facing = rec.role === "entrada" ? "virado para a junção" : "virado para fora";
      row.innerHTML =
        `<input type="checkbox" aria-label="Marcar como colocado">` +
        `<span class="ptype ${rec.type === "Path" ? "path" : "block"}">${rec.type === "Path" ? "Trajeto" : "Trecho"}</span>` +
        `<span><span class="st">${rec.ambiguous ? "⚠ " : ""}${cap(rec.role)} ${escapeHtml(rec.approach_dir)}, ${facing}</span><br>` +
        `<span class="sco">${fmtXY(rec.x, rec.y)} · Z ${Math.round(rec.z / 100)} m</span></span>`;

      const checkbox = row.querySelector("input")!;
      checkbox.checked = done.has(id);
      row.classList.toggle("done", done.has(id));
      checkbox.addEventListener("click", (e) => e.stopPropagation());
      checkbox.addEventListener("change", () => {
        checkbox.checked ? done.add(id) : done.delete(id);
        row.classList.toggle("done", checkbox.checked);
        localStorage.setItem(storeKey, JSON.stringify([...done]));
        updateCounters();
      });
      row.addEventListener("click", (e) => {
        if ((e.target as HTMLElement).tagName === "INPUT") return;
        cb.onLocate(j.label, rec.x, rec.y);
        el.querySelectorAll(".srow.hot").forEach((r) => r.classList.remove("hot"));
        row.classList.add("hot");
      });
      group.appendChild(row);
    }
    list.appendChild(group);
  }
  updateCounters();
}

/** Destaca (e rola até) o grupo de uma junção. */
export function highlightGroup(label: string): void {
  const group = el.querySelector<HTMLDetailsElement>(`.jgroup[data-j="${label}"]`);
  if (!group) return;
  group.open = true;
  group.scrollIntoView({ block: "nearest" });
}

function updateCounters(): void {
  (el.querySelector("#sbN") as HTMLElement).textContent = String(done.size);
  (el.querySelector("#sbBar") as HTMLElement).style.width = `${total ? (done.size / total) * 100 : 0}%`;
  el.querySelectorAll(".jgroup").forEach((group) => {
    const rows = group.querySelectorAll(".srow");
    const doneRows = group.querySelectorAll(".srow.done");
    (group.querySelector(".gcnt") as HTMLElement).textContent = `${doneRows.length}/${rows.length}`;
    group.classList.toggle("complete", rows.length > 0 && doneRows.length === rows.length);
  });
}

function cap(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function escapeHtml(text: string): string {
  return text.replace(/[<>&"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" }[c]!));
}
