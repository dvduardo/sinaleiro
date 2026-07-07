"""Generate the two output artifacts described in the plan:
  1. An interactive HTML map (SVG, pan/zoom) showing the rail network,
     existing signals, and recommended signals over the real in-game map.
  2. A plain text checklist with the same recommendations.
"""
import base64
import html
import io
import math
import os
import sys
from collections import Counter

from parse_save import parse_rail_network
from graph import build_graph
from signal_rules import recommend_signals, _nearest_station
from directions import infer_directions
from geometry import (
    sample_track, point_at_arc_length, distance, midpoint_and_tangent,
    bezier_segments,
)

# The in-game map covers exactly this world extent (in cm, the save's native
# unit). These are the community-established calibration values used by the
# satisfactory-calculator.com interactive map.
MAP_X_MIN = -324698.832031
MAP_Y_MIN = -375000.0
MAP_SIZE = 750000.0

MAP_IMAGE_PATH = os.path.join(os.path.dirname(__file__), "..", "assets", "map_1.0.jpg")


def _bounds(points):
    xs = [p[0] for p in points]
    ys = [p[1] for p in points]
    return min(xs), max(xs), min(ys), max(ys)


BI_TRACK_COLOR = "#3fbf8f"    # confirmed/assumed bidirectional stretches (brand green)
STUB_TRACK_COLOR = "#8a8f98"  # unfinished loose ends (neutral grey, not an alert)


def generate_html(network, graph, recommendations, out_path, directions=None, classes=None):
    all_points = []
    for track in network.tracks.values():
        all_points.extend(track.points_world)
    if not all_points:
        all_points = [[0, 0, 0]]

    # World coordinates map directly to screen: +X = east (right) and
    # +Y = south (down), matching both SVG screen space and the in-game map.
    # The viewBox covers the whole in-game map; sx/sy just translate so the
    # map's NW corner is at 0,0.
    def sx(x):
        return x - MAP_X_MIN

    def sy(y):
        return y - MAP_Y_MIN

    # initial view focuses on the rail network
    min_x, max_x, min_y, max_y = _bounds(all_points)
    pad = 20000.0
    focus = (sx(min_x - pad), sy(min_y - pad), (max_x - min_x) + 2 * pad, (max_y - min_y) + 2 * pad)

    with open(MAP_IMAGE_PATH, "rb") as f:
        map_data_uri = "data:image/jpeg;base64," + base64.b64encode(f.read()).decode()

    svg_parts = []
    svg_parts.append(
        f'<svg id="map" viewBox="0 0 {MAP_SIZE:.0f} {MAP_SIZE:.0f}" '
        f'data-focus="{focus[0]:.0f},{focus[1]:.0f},{focus[2]:.0f},{focus[3]:.0f}" '
        f'xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" '
        f'style="background:#0b1220">'
    )

    # in-game map as calibrated background
    svg_parts.append(
        f'<image x="0" y="0" width="{MAP_SIZE:.0f}" height="{MAP_SIZE:.0f}" '
        f'xlink:href="{map_data_uri}" />'
    )

    # Background buildings, for spatial context only (dim, no tooltips - there
    # can be thousands). The circle radius is controlled at runtime via the
    # --bldr CSS variable so the dots keep a constant on-screen size.
    svg_parts.append('<g id="bld" fill="#2f3a46" opacity="0.6">')
    for building in network.buildings:
        x, y = sx(building.position[0]), sy(building.position[1])
        if 0 <= x <= MAP_SIZE and 0 <= y <= MAP_SIZE:
            svg_parts.append(f'<circle cx="{x:.0f}" cy="{y:.0f}" r="120" />')
    svg_parts.append('</g>')

    # Track lines, rendered as smooth curves using the game's own spline
    # tangents. Stroke width is constant on screen via the --tw CSS variable.
    svg_parts.append('<g id="tracks" stroke="#e0447a" fill="none" opacity="0.9" stroke-linecap="round">')
    for name, track in network.tracks.items():
        d = _bezier_path(track, sx, sy)
        if not d:
            continue
        if classes is not None:
            # mixed mode: color per classification; dasharray is in world
            # units, so it needs no counter-scaling, and the attributes
            # override the group stroke
            kind = classes.get(name, ("bi_assumed", None))[0]
            if kind == "bi_confirmed":
                svg_parts.append(f'<path d="{d}" stroke="{BI_TRACK_COLOR}" />')
            elif kind == "bi_assumed":
                svg_parts.append(f'<path d="{d}" stroke="{BI_TRACK_COLOR}" stroke-dasharray="900 500" />')
            elif kind == "stub":
                svg_parts.append(f'<path d="{d}" stroke="{STUB_TRACK_COLOR}" stroke-dasharray="400 400" />')
            else:
                svg_parts.append(f'<path d="{d}" />')
        elif directions is not None and directions.get(name) is None:
            # ambiguous track: dasharray is in world units, so it needs no
            # counter-scaling; the attribute overrides the group stroke
            svg_parts.append(f'<path d="{d}" stroke="#ff9f1c" stroke-dasharray="900 500" />')
        else:
            svg_parts.append(f'<path d="{d}" />')
    svg_parts.append('</g>')

    # Markers are authored in *pixel* units around their own origin and pinned
    # to the map with a translate; JS counter-scales the inner .mks group each
    # zoom change so they keep a constant on-screen size (like SCIM does).
    def marker(x, y, inner):
        return (f'<g class="mk" transform="translate({x:.1f} {y:.1f})">'
                f'<g class="mks">{inner}</g></g>')

    # one-way mode: flow arrows along every track with a known direction,
    # roughly every 100m, rendered with the same constant-screen-size marker
    # pattern (the zoom JS counter-scales every .mks, arrows included)
    if directions is not None:
        svg_parts.append('<g id="flow">')
        for x, y, deg in _flow_arrows(network, directions):
            svg_parts.append(marker(sx(x), sy(y), (
                f'<polygon points="7,0 -5,-5 -5,5" fill="#ffffff" stroke="#e0447a" '
                f'stroke-width="1.5" transform="rotate({deg:.0f})" />'
            )))
        svg_parts.append('</g>')

    # stations
    for station in network.stations:
        if not station.name:
            continue
        x, y = sx(station.position[0]), sy(station.position[1])
        label = html.escape(station.name)
        inner = (
            f'<rect x="-9" y="-9" width="18" height="18" rx="4" '
            f'fill="#f2a007" stroke="#5c3d00" stroke-width="2" />'
            f'<text x="14" y="5" fill="#1d2733" font-size="13" font-weight="600" '
            f'font-family="system-ui, sans-serif" paint-order="stroke" '
            f'stroke="#ffffff" stroke-width="3">{label}</text>'
            f'<title>Estação: {label}</title>'
        )
        svg_parts.append(marker(x, y, inner))

    # existing signals
    for signal in network.signals:
        x, y = sx(signal.position[0]), sy(signal.position[1])
        kind = "Path" if signal.is_path_signal else "Block"
        color = "#1a7f37" if signal.is_path_signal else "#0969da"
        inner = (
            f'<circle r="7" fill="{color}" stroke="#ffffff" stroke-width="2" />'
            f'<title>Sinal existente ({kind})</title>'
        )
        svg_parts.append(marker(x, y, inner))

    # recommended signals (also collected as interactive sidebar items,
    # grouped by junction). Entry and exit signals share the same physical
    # spot; the exit marker (triangle) is drawn just below the entry star in
    # *screen pixels* so the pair stays readable at any zoom.
    sidebar_items = []
    current_junction = None
    for i, rec in enumerate(recommendations):
        x, y = sx(rec.position[0]), sy(rec.position[1])
        station_txt = (
            f"{rec.nearest_station_distance_m:.0f}m de '{rec.nearest_station_name}'"
            if rec.nearest_station_name else "sem estação próxima"
        )
        tooltip = html.escape(
            f"{rec.name_pt} ({rec.signal_type} Signal) — {rec.role} {rec.approach_dir}\n"
            f"Posição: X={rec.position[0]:.0f} Y={rec.position[1]:.0f} Z={rec.position[2]:.0f}\n"
            f"{station_txt}\n{rec.reason}"
        )
        if rec.role == "entrada":
            shape = (f'<polygon points="{_star_points(0, 0, 15, 6.5)}" '
                     f'fill="#ffd23f" stroke="#7a3b00" stroke-width="2" />')
            ring = '<circle class="ring" r="24" fill="none" stroke="#ff3b30" stroke-width="3" />'
        else:
            shape = ('<polygon points="0,20 -11,38 11,38" '
                     'fill="#6fd3ff" stroke="#0b4a66" stroke-width="2" />')
            ring = '<circle class="ring" cy="29" r="20" fill="none" stroke="#ff3b30" stroke-width="3" />'
        inner = f'{ring}{shape}<title>{tooltip}</title>'
        svg_parts.append(
            f'<g class="mk rec" id="mk-{i}" data-i="{i}" transform="translate({x:.1f} {y:.1f})">'
            f'<g class="mks">{inner}</g></g>'
        )

        if rec.junction_label != current_junction:
            if current_junction is not None:
                sidebar_items.append('</details>')
            current_junction = rec.junction_label
            sidebar_items.append(
                f'<details class="jgroup"><summary>Junção {rec.junction_label} — perto de '
                f'{html.escape(rec.nearest_station_name or "?")} <span class="cnt"></span></summary>'
            )
        icon = "★" if rec.role == "entrada" else "▼"
        amb_cls = " amb" if rec.ambiguous else ""
        amb_warn = "⚠ " if rec.ambiguous else ""
        sidebar_items.append(
            f'<div class="item{amb_cls}" data-i="{i}" data-x="{x:.1f}" data-y="{y:.1f}">'
            f'<input type="checkbox" title="Marcar como colocado">'
            f'<div class="itxt"><b>{amb_warn}{icon} #{i + 1} · {rec.name_pt} <small>({rec.signal_type})</small></b>'
            f'<span>{rec.role} {rec.approach_dir} — {html.escape(station_txt)}</span>'
            f'<span class="coords">X={rec.position[0]:.0f} Y={rec.position[1]:.0f} Z={rec.position[2]:.0f}</span>'
            f'</div></div>'
        )
    if current_junction is not None:
        sidebar_items.append('</details>')
    sidebar_html = "\n".join(sidebar_items)

    svg_parts.append("</svg>")
    svg = "\n".join(svg_parts)

    if classes is not None:
        mode_label = " — modo misto (detecção automática)"
        mode_legend = (
            '<span style="color:#ffffff">➤ Direção do fluxo (mão única)</span>'
            f'<span><span class="swatch" style="background:{BI_TRACK_COLOR}"></span>'
            'Trilho bidirecional (tracejado = presumido)</span>'
            f'<span><span class="swatch" style="background:{STUB_TRACK_COLOR}"></span>'
            'Linha inacabada (sem recomendações)</span>'
        )
        save_key = "railway-signals-done-mixed"
    elif directions is not None:
        mode_label = " — modo mão única"
        mode_legend = (
            '<span style="color:#ffffff">➤ Direção do fluxo</span>'
            '<span><span class="swatch" style="background:#ff9f1c"></span>'
            'Trilho ambíguo (direção não inferida)</span>'
        )
        save_key = "railway-signals-done-oneway"
    else:
        mode_label = ""
        mode_legend = ""
        save_key = "railway-signals-done-bidir"

    html_doc = f"""<!doctype html>
<html lang="pt-br">
<head>
<meta charset="utf-8">
<title>Mapa de sinais - malha de trem{mode_label}</title>
<style>
  body {{ margin:0; font-family: system-ui, sans-serif; background:#0b1220; color:#e6edf3; }}
  #toolbar {{ padding: 10px 16px; background:#161b22; border-bottom:1px solid #30363d; }}
  #legend span {{ margin-right: 18px; }}
  #main {{ display:flex; height: calc(100vh - 54px); }}
  #viewport {{ flex:1; overflow:hidden; cursor:grab; }}
  #sidebar {{ width:320px; overflow-y:auto; background:#161b22; border-left:1px solid #30363d; }}
  #sidebar h2 {{ font-size:.95em; padding:12px 14px 6px; margin:0; position:sticky; top:0; background:#161b22; }}
  .jgroup summary {{ font-size:.8em; padding:10px 14px; cursor:pointer; text-transform:uppercase;
    letter-spacing:.04em; opacity:.85; background:#1b212b; border-bottom:1px solid #21262d;
    user-select:none; list-style-position: inside; }}
  .jgroup summary:hover {{ background:#222a36; }}
  .jgroup summary .cnt {{ opacity:.6; text-transform:none; }}
  .jgroup.complete summary {{ color:#4caf50; }}
  .itxt small {{ opacity:.6; font-weight:400; }}
  .item {{ display:flex; gap:10px; padding:10px 14px; border-bottom:1px solid #21262d; cursor:pointer; align-items:flex-start; }}
  .item:hover {{ background:#1f2630; }}
  .item.sel {{ background:#253046; box-shadow: inset 3px 0 0 #ffd23f; }}
  .item.done {{ opacity:.45; }}
  .item.amb {{ border-left:3px solid #ff9f1c; }}
  .item.done .itxt {{ text-decoration: line-through; }}
  .item input {{ margin-top:3px; }}
  .itxt {{ display:flex; flex-direction:column; gap:2px; font-size:.85em; }}
  .itxt .coords {{ opacity:.6; font-size:.9em; }}
  svg {{ display:block; }}
  #tracks path {{ stroke-width: var(--tw, 300px); }}
  #bld circle {{ r: var(--bldr, 120px); }}
  .mk .ring {{ display:none; }}
  .mk.sel .ring {{ display:block; animation: pulse 1.2s ease-in-out infinite; }}
  .mk.done polygon {{ fill:#9aa5b1; stroke:#5b6570; }}
  @keyframes pulse {{ 0%,100% {{ stroke-opacity:1; }} 50% {{ stroke-opacity:.25; }} }}
  .swatch {{ display:inline-block; width:12px; height:12px; margin-right:4px; vertical-align:middle; }}
</style>
</head>
<body>
<div id="toolbar">
  <div id="legend">
    <span><span class="swatch" style="background:#2f3a46;border-radius:50%"></span>Outras construções</span>
    <span><span class="swatch" style="background:#e0447a"></span>Trilho</span>
    <span><span class="swatch" style="background:#f2a007"></span>Estação</span>
    <span><span class="swatch" style="background:#1a7f37;border-radius:50%"></span>Sinal existente (Trajeto/Path)</span>
    <span><span class="swatch" style="background:#0969da;border-radius:50%"></span>Sinal existente (Trecho/Block)</span>
    <span style="color:#ffd23f">★ Entrada recomendada (Sinal de Trajeto)</span>
    <span style="color:#6fd3ff">▼ Saída recomendada (Sinal de Trecho)</span>
    {mode_legend}
  </div>
  <div style="margin-top:6px; opacity:.7; font-size:.85em">Scroll para zoom, arraste para navegar (pan).{mode_label}</div>
</div>
<div id="main">
<div id="viewport">
{svg}
</div>
<div id="sidebar">
<h2>Sinais recomendados ({len(recommendations)}) — clique para localizar</h2>
{sidebar_html}
</div>
</div>
<script>
(function() {{
  const viewport = document.getElementById('viewport');
  const svg = document.getElementById('map');
  const markers = Array.from(svg.querySelectorAll('.mks'));
  const vbWidth = svg.viewBox.baseVal.width;
  const vbHeight = svg.viewBox.baseVal.height;
  // Max zoom-in: 0.2 px per world cm (1 m = 20 px) - enough to inspect a
  // junction; beyond that the background image has no detail left anyway
  // (and extreme CSS scales can blank the rendering entirely).
  const MAX_SCALE = 0.2;
  let minScale = 0.001;
  let scale = 1, originX = 0, originY = 0, dragging = false, lastX = 0, lastY = 0;

  function clampView() {{
    scale = Math.min(Math.max(scale, minScale), MAX_SCALE);
    const rect = viewport.getBoundingClientRect();
    const mapW = vbWidth * scale, mapH = vbHeight * scale;
    // keep the map covering the viewport (or centered when smaller than it)
    if (mapW <= rect.width) {{
      originX = (rect.width - mapW) / 2;
    }} else {{
      originX = Math.min(0, Math.max(rect.width - mapW, originX));
    }}
    if (mapH <= rect.height) {{
      originY = (rect.height - mapH) / 2;
    }} else {{
      originY = Math.min(0, Math.max(rect.height - mapH, originY));
    }}
  }}

  function apply() {{
    clampView();
    svg.style.transform = `translate(${{originX}}px, ${{originY}}px) scale(${{scale}})`;
    svg.style.transformOrigin = '0 0';
    // constant on-screen sizes regardless of zoom level
    const inv = 1 / scale;
    for (const m of markers) m.setAttribute('transform', `scale(${{inv}})`);
    svg.style.setProperty('--tw', (3.5 * inv) + 'px');
    svg.style.setProperty('--bldr', (2.2 * inv) + 'px');
  }}

  // fit initial view on the rail network (data-focus = "x,y,w,h" in viewBox units)
  const focus = (svg.dataset.focus || `0,0,${{vbWidth}},${{vbHeight}}`).split(',').map(Number);
  function fit() {{
    const rect = viewport.getBoundingClientRect();
    minScale = Math.min(rect.width / vbWidth, rect.height / vbHeight);
    const [fx, fy, fw, fh] = focus;
    scale = Math.min(rect.width / fw, rect.height / fh) * 0.95;
    originX = (rect.width - fw * scale) / 2 - fx * scale;
    originY = (rect.height - fh * scale) / 2 - fy * scale;
    svg.setAttribute('width', vbWidth);
    svg.setAttribute('height', vbHeight);
    apply();
  }}
  fit();
  window.addEventListener('resize', fit);

  viewport.addEventListener('wheel', (e) => {{
    e.preventDefault();
    const rect = viewport.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    const factor = e.deltaY < 0 ? 1.15 : 1/1.15;
    const newScale = Math.min(Math.max(scale * factor, minScale), MAX_SCALE);
    const worldX = (mouseX - originX) / scale;
    const worldY = (mouseY - originY) / scale;
    scale = newScale;
    originX = mouseX - worldX * scale;
    originY = mouseY - worldY * scale;
    apply();
  }}, {{ passive: false }});

  viewport.addEventListener('mousedown', (e) => {{
    dragging = true; lastX = e.clientX; lastY = e.clientY; viewport.style.cursor = 'grabbing';
  }});
  window.addEventListener('mouseup', () => {{ dragging = false; viewport.style.cursor = 'grab'; }});
  window.addEventListener('mousemove', (e) => {{
    if (!dragging) return;
    originX += e.clientX - lastX;
    originY += e.clientY - lastY;
    lastX = e.clientX; lastY = e.clientY;
    apply();
  }});

  // --- interactive recommendation list ---
  const items = Array.from(document.querySelectorAll('#sidebar .item'));
  const saveKey = '{save_key}';
  const doneSet = new Set(JSON.parse(localStorage.getItem(saveKey) || '[]'));

  function centerOn(x, y) {{
    const rect = viewport.getBoundingClientRect();
    scale = Math.min(Math.max(0.05, minScale), MAX_SCALE); // ~junction-level zoom
    originX = rect.width / 2 - x * scale;
    originY = rect.height / 2 - y * scale;
    apply();
  }}

  function updateCounters() {{
    document.querySelectorAll('.jgroup').forEach(group => {{
      const all = group.querySelectorAll('.item');
      const done = group.querySelectorAll('.item.done');
      const cnt = group.querySelector('.cnt');
      if (cnt) cnt.textContent = `(${{done.length}}/${{all.length}})`;
      group.classList.toggle('complete', all.length > 0 && done.length === all.length);
    }});
  }}

  function select(i, pan) {{
    document.querySelectorAll('.sel').forEach(el => el.classList.remove('sel'));
    const item = items[i];
    const mk = document.getElementById('mk-' + i);
    if (!item || !mk) return;
    item.classList.add('sel');
    mk.classList.add('sel');
    const group = item.closest('.jgroup');
    if (group) group.open = true;
    item.scrollIntoView({{ block: 'nearest' }});
    if (pan) centerOn(parseFloat(item.dataset.x), parseFloat(item.dataset.y));
  }}

  function setDone(i, done) {{
    const item = items[i];
    const mk = document.getElementById('mk-' + i);
    item.classList.toggle('done', done);
    if (mk) mk.classList.toggle('done', done);
    done ? doneSet.add(i) : doneSet.delete(i);
    localStorage.setItem(saveKey, JSON.stringify([...doneSet]));
    updateCounters();
  }}

  items.forEach((item, idx) => {{
    const i = parseInt(item.dataset.i);
    const checkbox = item.querySelector('input');
    if (doneSet.has(i)) {{ checkbox.checked = true; setDone(i, true); }}
    checkbox.addEventListener('click', (e) => {{ e.stopPropagation(); setDone(i, checkbox.checked); }});
    item.addEventListener('click', () => select(i, true));
  }});

  // clicking a star on the map selects its list entry too
  document.querySelectorAll('.mk.rec').forEach(mk => {{
    mk.addEventListener('click', (e) => {{
      e.stopPropagation();
      select(parseInt(mk.dataset.i), false);
    }});
  }});

  updateCounters();
}})();
</script>
</body>
</html>
"""
    with open(out_path, "w") as f:
        f.write(html_doc)


ARROW_SPACING_CM = 10000.0  # one flow arrow every ~100m of track
MAX_ARROWS = 1500  # keep the zoom counter-scaling loop cheap


def _flow_arrows(network, directions):
    """(world_x, world_y, angle_deg) for direction arrows along known tracks.
    World axes match screen axes (+X right, +Y down), so the tangent angle
    can be used directly as an SVG rotation."""
    arrows = []
    for name, track in network.tracks.items():
        direction = directions.get(name)
        if direction is None:
            continue
        samples = sample_track(track)
        if len(samples) < 2:
            continue
        total = sum(distance(samples[i], samples[i + 1]) for i in range(len(samples) - 1))
        if total <= 0:
            continue
        count = max(1, int(total // ARROW_SPACING_CM))
        for j in range(count):
            target = total * (j + 1) / (count + 1)
            p = point_at_arc_length(samples, target)
            q = point_at_arc_length(samples, min(total, target + 100.0))
            dx, dy = q[0] - p[0], q[1] - p[1]
            if dx == 0 and dy == 0:
                continue
            deg = math.degrees(math.atan2(dy, dx))
            if direction == -1:
                deg += 180.0
            arrows.append((p[0], p[1], deg))
    if len(arrows) > MAX_ARROWS:
        step = math.ceil(len(arrows) / MAX_ARROWS)
        arrows = arrows[::step]
    return arrows


def _bezier_path(track, sx, sy):
    """Render the track's spline as a cubic bezier SVG path (control points
    from geometry.bezier_segments)."""
    flat = bezier_segments(track)
    if flat is None:
        return None
    d = [f"M {sx(flat[0]):.1f},{sy(flat[1]):.1f}"]
    for i in range(2, len(flat), 6):
        c1x, c1y, c2x, c2y, x1, y1 = flat[i:i + 6]
        d.append(f"C {sx(c1x):.1f},{sy(c1y):.1f} {sx(c2x):.1f},{sy(c2y):.1f} {sx(x1):.1f},{sy(y1):.1f}")
    return " ".join(d)


def _star_points(cx, cy, r_outer, r_inner, points=5):
    import math
    coords = []
    for i in range(points * 2):
        r = r_outer if i % 2 == 0 else r_inner
        angle = math.pi / points * i - math.pi / 2
        coords.append(f"{cx + r * math.cos(angle):.1f},{cy + r * math.sin(angle):.1f}")
    return " ".join(coords)


def render_text_report(recommendations, directions=None, graph=None, classes=None) -> str:
    counts = Counter(rec.signal_type for rec in recommendations)
    f = io.StringIO()
    if classes is not None:
        mode_txt = "misto (mão única e bidirecional detectados por trilho)"
    elif directions is not None:
        mode_txt = "mão única (mão direita)"
    else:
        mode_txt = "bidirecional"
    f.write(f"Modo: {mode_txt}\n")
    f.write(
        f"{len(recommendations)} sinais recomendados — "
        f"{counts.get('Path', 0)} Sinal de Trajeto (Path), "
        f"{counts.get('Block', 0)} Sinal de Trecho (Block)\n"
    )
    if classes is not None:
        kind_counts = Counter(kind for kind, _ in classes.values())
        f.write(
            f"Trilhos: {kind_counts.get('oneway', 0)} mão única · "
            f"{kind_counts.get('bi_confirmed', 0)} bidirecionais confirmados · "
            f"{kind_counts.get('bi_assumed', 0)} bidirecionais presumidos · "
            f"{kind_counts.get('stub', 0)} inacabados\n"
        )
    elif directions is not None:
        known = sum(1 for d in directions.values() if d is not None)
        f.write(f"Direções: {known}/{len(directions)} trilhos inferidos; "
                f"{len(directions) - known} ambíguos\n")
    f.write("=" * 60 + "\n\n")
    for i, rec in enumerate(recommendations, 1):
        station_txt = (
            f"{rec.nearest_station_distance_m:.0f}m de '{rec.nearest_station_name}'"
            if rec.nearest_station_name else "sem estação próxima cadastrada"
        )
        f.write(
            f"{i:3d}. [{rec.name_pt} ({rec.signal_type}) · {rec.junction_label} · {rec.role}] "
            f"X={rec.position[0]:.0f} Y={rec.position[1]:.0f} Z={rec.position[2]:.0f}  "
            f"({station_txt})\n"
            f"     motivo: {rec.reason}\n"
        )
    if classes is not None:
        _write_assumed_section(f, classes, graph)
    elif directions is not None:
        _write_ambiguous_section(f, recommendations, directions, graph)
    return f.getvalue()


def generate_text_report(recommendations, out_path, directions=None, graph=None, classes=None):
    with open(out_path, "w") as f:
        f.write(render_text_report(recommendations, directions=directions, graph=graph,
                                    classes=classes))


def _write_assumed_section(f, classes, graph):
    """Mixed mode appendix: stretches with no directional evidence at all.
    They got the full signal pair (always safe), listed here as a neutral
    heads-up — bidirectional is a normal result in this mode, not an error."""
    lines = []
    for name in sorted(classes):
        kind, _ = classes[name]
        if kind != "bi_assumed":
            continue
        track = graph.tracks.get(name)
        if track is None:
            continue
        mid, _tan = midpoint_and_tangent(track)
        station_name, station_dist = _nearest_station(mid, graph.network.stations)
        where = (f"~{station_dist:.0f}m de '{station_name}'"
                 if station_name else "sem estação próxima")
        lines.append(f"  - track {name} ({where})\n")
    if not lines:
        return
    f.write("\n" + "-" * 60 + "\n")
    f.write("TRECHOS BIDIRECIONAIS PRESUMIDOS (sem evidência de mão — par completo aplicado):\n")
    f.writelines(lines)


def _write_ambiguous_section(f, recommendations, directions, graph):
    """One-way mode appendix: which stretches got the bidirectional fallback,
    plus unknown-direction tracks away from junctions, so the user can fix
    the layout (or accept the ambiguity)."""
    junction_lines = []
    seen = set()
    for rec in recommendations:
        if not rec.ambiguous:
            continue
        key = (rec.junction_label, rec.track_name)
        if key in seen:
            continue
        seen.add(key)
        junction_lines.append(
            f"  - {rec.junction_label}, aproximação {rec.approach_dir} "
            f"(track {rec.track_name}): 2 sinais emitidos; confira o traçado\n"
        )

    junction_track_names = {rec.track_name for rec in recommendations}
    other_lines = []
    for name in sorted(directions):
        if directions[name] is not None or name in junction_track_names:
            continue
        mid, _ = midpoint_and_tangent(graph.tracks[name])
        station_name, station_dist = _nearest_station(mid, graph.network.stations)
        where = (f"~{station_dist:.0f}m de '{station_name}'"
                 if station_name else "sem estação próxima")
        other_lines.append(f"  - track {name} (fora de junção, {where})\n")

    if not junction_lines and not other_lines:
        return
    f.write("\n" + "-" * 60 + "\n")
    f.write("TRECHOS AMBÍGUOS (direção não inferida — tratados como bidirecionais):\n")
    f.writelines(junction_lines)
    f.writelines(other_lines)


def _ask_mode() -> str:
    """Ask interactively which analysis mode to run. Returns "mixed",
    "bidirectional" or "oneway"."""
    if not sys.stdin.isatty():
        print("Entrada não interativa — assumindo o modo misto (detecção automática); "
              "use --misto, --mao-unica ou --bidirecional para escolher sem prompt.")
        return "mixed"
    while True:
        answer = input(
            "Seus trilhos são [1] mistos (detectar automaticamente — recomendado), "
            "[2] bidirecionais ou [3] mão única (mão direita)? [1/2/3] "
        ).strip()
        if answer in ("", "1"):
            return "mixed"
        if answer == "2":
            return "bidirectional"
        if answer == "3":
            return "oneway"
        print("Responda 1, 2 ou 3.")


def count_inconsistent_junctions(graph, directions) -> int:
    """A one-way junction whose approaches are all known must have at least
    one entry and one exit; a violation means the inference got a direction
    wrong (not merely incomplete)."""
    bad = 0
    for node in graph.nodes.values():
        if node.degree < 3:
            continue
        entries = exits = 0
        for track_name in node.edge_track_names:
            d = directions.get(track_name)
            if d is None or track_name not in graph.track_endpoints:
                break
            node_a, node_b = graph.track_endpoints[track_name]
            flows_in = (d == 1) == (node_b == node.node_id)
            if node_a == node_b:
                entries += 1
                exits += 1
            elif flows_in:
                entries += 1
            else:
                exits += 1
        else:
            if entries == 0 or exits == 0:
                bad += 1
    return bad


def _warn_inconsistent_junctions(graph, directions):
    bad = count_inconsistent_junctions(graph, directions)
    if bad:
        print(f"AVISO: {bad} junção(ões) com direções inferidas sem entrada ou sem "
              f"saída — a inferência pode estar errada nesses pontos; confira as setas no mapa.")


def main():
    flags = [a for a in sys.argv[1:] if a.startswith("--")]
    positional = [a for a in sys.argv[1:] if not a.startswith("--")]
    if not positional:
        print("Usage: python3 src/report.py /path/to/save.sav [out_dir] [--misto|--mao-unica|--bidirecional]")
        sys.exit(1)
    save_path = positional[0]
    out_dir = positional[1] if len(positional) > 1 else "."
    if "--misto" in flags:
        mode = "mixed"
    elif "--mao-unica" in flags:
        mode = "oneway"
    elif "--bidirecional" in flags:
        mode = "bidirectional"
    else:
        mode = _ask_mode()

    network = parse_rail_network(save_path)
    graph = build_graph(network)
    directions = None
    classes = None
    if mode == "mixed":
        from classify import classify_tracks
        classes = classify_tracks(graph, network)
        # flow arrows and junction audits only care about the one-way stretches
        directions = {name: (d if kind == "oneway" else None)
                      for name, (kind, d) in classes.items()}
        kind_counts = Counter(kind for kind, _ in classes.values())
        print(f"Modo misto: {kind_counts.get('oneway', 0)} trilhos mão única, "
              f"{kind_counts.get('bi_confirmed', 0)} bidirecionais confirmados, "
              f"{kind_counts.get('bi_assumed', 0)} bidirecionais presumidos, "
              f"{kind_counts.get('stub', 0)} inacabados.")
        _warn_inconsistent_junctions(graph, directions)
    elif mode == "oneway":
        directions = infer_directions(graph)
        known = sum(1 for d in directions.values() if d is not None)
        print(f"Modo mão única: {known}/{len(directions)} trilhos com direção inferida; "
              f"{len(directions) - known} ambíguos (tratados como bidirecionais).")
        _warn_inconsistent_junctions(graph, directions)
    recommendations = recommend_signals(graph, directions if classes is None else None, classes)

    html_path = f"{out_dir}/mapa_sinais.html"
    txt_path = f"{out_dir}/sinais_recomendados.txt"
    generate_html(network, graph, recommendations, html_path, directions=directions, classes=classes)
    generate_text_report(recommendations, txt_path, directions=directions, graph=graph,
                         classes=classes)
    print(f"{len(recommendations)} recomendações geradas.")
    print(f"Mapa: {html_path}")
    print(f"Lista: {txt_path}")


if __name__ == "__main__":
    main()
