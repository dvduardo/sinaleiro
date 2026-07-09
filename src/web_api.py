"""JSON API used by the Sinaleiro website (and its parity smoke test).

Importing this module never touches stdin/argv: it is loaded inside Pyodide
in a Web Worker. The parsed network is kept in module globals so switching
the analysis mode re-runs only the cheap stages (no re-parse of the save).

`progress` callbacks receive a stage id ("parse", "graph", "directions",
"signals", "serialize") at the start of each stage; the worker forwards them
to the loading screen log.
"""
import json
import os
import tempfile

from parse_save import parse_rail_network
from graph import build_graph
from directions import infer_directions
from classify import classify_tracks
from coverage import build_coverage
from line_signals import plan_line_signals
from signal_rules import recommend_signals, junctions_with_labels, SIGNAL_SETBACK_CM
from geometry import (
    sample_track, distance, point_at_arc_length, tangent_at_arc_length,
    bearing_deg, bezier_segments,
)
from report import render_text_report, count_inconsistent_junctions, _flow_arrows

PAYLOAD_VERSION = 3


class InvalidSaveError(ValueError):
    """The file could not be parsed as a Satisfactory save."""


class NoRailsError(ValueError):
    """The save parsed fine but contains no railway tracks."""


_network = None
_graph = None
_coverage = None  # audit of existing signals; mode-independent, built once per save


def _progress(callback, stage: str) -> None:
    if callback is not None:
        callback(stage)


def load_save(save_bytes, progress=None) -> None:
    """Parse the raw .sav bytes and build the rail graph (module globals)."""
    global _network, _graph, _coverage
    _coverage = None
    _progress(progress, "parse")
    # the vendored parser only accepts a filename; under Pyodide this lands
    # in the in-memory Emscripten FS, so there is no real disk I/O. The name
    # must be unique per process: concurrent CPython runs (e.g. smoke test
    # alongside the CLI) would otherwise unlink each other's file.
    with tempfile.NamedTemporaryFile(suffix=".sav", delete=False) as f:
        f.write(bytes(save_bytes))
        path = f.name
    try:
        network = parse_rail_network(path)
    except (NoRailsError, InvalidSaveError):
        raise
    except Exception as exc:
        raise InvalidSaveError(f"o arquivo não pôde ser lido como um save do Satisfactory: {exc}") from exc
    finally:
        os.unlink(path)
    if not network.tracks:
        raise NoRailsError("o save foi lido, mas não tem trilhos de trem")
    _progress(progress, "graph")
    _graph = build_graph(network)
    _network = network


DEFAULT_TRAINS_TARGET = 2


def analyze(mode: str, trains_target: int = DEFAULT_TRAINS_TARGET, progress=None) -> str:
    """Run the signal recommendation for the already-loaded save and return
    the payload as a JSON string. mode: "mixed" | "bidirectional" | "oneway".
    trains_target: how many trains each one-way run should hold — drives the
    line-signal gap-fill (only meaningful in the modes that know the flow)."""
    if _graph is None:
        raise RuntimeError("chame load_save() antes de analyze()")
    trains_target = max(1, int(trains_target))
    directions = None
    classes = None
    if mode == "oneway":
        _progress(progress, "directions")
        directions = infer_directions(_graph)
    elif mode == "mixed":
        _progress(progress, "directions")  # same loading-screen stage id
        classes = classify_tracks(_graph, _network)
    global _coverage
    if _coverage is None:
        _coverage = build_coverage(_graph, _network)
    _progress(progress, "signals")
    recommendations = recommend_signals(_graph, directions, classes, _coverage)
    # line signals need per-track flow: mixed has it in classes, oneway in
    # directions; plain bidirectional mode has none, so no gap-fill there.
    line_signals, loop_hints, line_runs = [], [], []
    kinds = classes
    if kinds is None and directions is not None:
        kinds = {name: (("oneway", d) if d is not None else ("bi_assumed", None))
                 for name, d in directions.items()}
    if kinds is not None:
        line_signals, loop_hints, line_runs = plan_line_signals(
            _graph, kinds, _coverage, trains_target)
    _progress(progress, "serialize")
    payload = _build_payload(_network, _graph, recommendations, directions, classes, mode,
                             line_signals, loop_hints, trains_target, line_runs)
    return json.dumps(payload, ensure_ascii=False, separators=(",", ":"))


def analyze_bytes(save_bytes, mode: str, trains_target: int = DEFAULT_TRAINS_TARGET,
                  progress=None) -> str:
    load_save(save_bytes, progress=progress)
    return analyze(mode, trains_target, progress=progress)


def _signal_angles(graph, rec):
    """(approach_deg, facing_deg, setback_m) for one recommendation.

    approach_deg: compass bearing junction -> signal (0 = north, clockwise).
    facing_deg: travel direction of the train governed by this signal at the
    signal's position — entry signals govern trains heading INTO the junction,
    exit signals govern trains heading OUT. The in-game rule is that a signal
    applies to the direction for which it sits on the right-hand side of the
    track, so the frontend derives the side as perpendicular-right of facing.
    """
    track = graph.tracks[rec.track_name]
    node_a, _node_b = graph.track_endpoints[rec.track_name]
    connector = 0 if node_a == rec.node_id else 1
    samples = sample_track(track)
    if connector == 1:
        samples = list(reversed(samples))
    total = sum(distance(samples[i], samples[i + 1]) for i in range(len(samples) - 1))
    target = min(SIGNAL_SETBACK_CM, total / 2.0)
    # tangent oriented away from the junction (increasing arc length)
    dx, dy = tangent_at_arc_length(samples, target)
    outward = bearing_deg(dx, dy)
    facing = (outward + 180.0) % 360.0 if rec.role == "entrada" else outward
    junction_end = samples[0]
    approach = bearing_deg(rec.position[0] - junction_end[0], rec.position[1] - junction_end[1])
    return round(approach, 1), round(facing, 1), round(target / 100.0, 1)


def _build_payload(network, graph, recommendations, directions, classes, mode,
                   line_signals=(), loop_hints=(), trains_target=DEFAULT_TRAINS_TARGET,
                   line_runs=()):
    junctions_meta = junctions_with_labels(graph)
    # flow arrows and junction audits only look at the one-way stretches
    flow_directions = directions
    if classes is not None:
        flow_directions = {name: (d if kind == "oneway" else None)
                           for name, (kind, d) in classes.items()}

    recs_json = []
    rec_ids_by_label = {}
    for i, rec in enumerate(recommendations):
        approach_deg, facing_deg, setback_m = _signal_angles(graph, rec)
        rec_ids_by_label.setdefault(rec.junction_label, []).append(i)
        recs_json.append({
            "id": i,
            "junction": rec.junction_label,
            "track": rec.track_name,
            "type": rec.signal_type,
            "name_pt": rec.name_pt,
            "role": rec.role,
            "x": round(rec.position[0]), "y": round(rec.position[1]), "z": round(rec.position[2]),
            "approach_dir": rec.approach_dir,
            "approach_deg": approach_deg,
            "facing_deg": facing_deg,
            "setback_m": setback_m,
            "ambiguous": rec.ambiguous,
            "status": rec.status,
            "current_type": rec.current_type,
            "reason": rec.reason,
            "nearest_station": rec.nearest_station_name,
            "nearest_station_m": round(rec.nearest_station_distance_m, 1)
            if rec.nearest_station_distance_m is not None else None,
        })
        if classes is not None:
            recs_json[-1]["track_kind"] = rec.track_kind

    junctions_json = []
    for label, node, pos in junctions_meta:
        nearest = None
        for rid in rec_ids_by_label.get(label, []):
            nearest = recs_json[rid]["nearest_station"]
            if nearest:
                break
        junctions_json.append({
            "label": label,
            "node_id": node.node_id,
            "x": round(pos[0]), "y": round(pos[1]),
            "degree": node.degree,
            "nearest_station": nearest,
            "rec_ids": rec_ids_by_label.get(label, []),
        })
        if classes is not None:
            junctions_json[-1]["stub_arms"] = sum(
                1 for t in node.edge_track_names
                if classes.get(t, ("", None))[0] == "stub")

    tracks_json = []
    for name, track in network.tracks.items():
        flat = bezier_segments(track)
        if flat is None:
            continue
        entry = {"name": name, "bez": [round(v) for v in flat]}
        if classes is not None:
            kind, class_direction = classes.get(name, ("bi_assumed", None))
            entry["kind"] = kind
            if kind == "oneway":
                entry["direction"] = class_direction
        elif directions is not None:
            entry["direction"] = directions.get(name)
        tracks_json.append(entry)

    stations_json = [
        {"name": s.name, "x": round(s.position[0]), "y": round(s.position[1])}
        for s in network.stations if s.name
    ]
    existing_json = [
        {"x": round(s.position[0]), "y": round(s.position[1]),
         "type": "Path" if s.is_path_signal else "Block"}
        for s in network.signals
    ]

    stats = {
        "tracks": len(network.tracks),
        "junctions": len(junctions_meta),
        "stations": len(stations_json),
        "existing_signals": len(network.signals),
        "existing_path": sum(1 for s in network.signals if s.is_path_signal),
        "existing_block": sum(1 for s in network.signals if not s.is_path_signal),
        "recommendations": len(recommendations),
        "path": sum(1 for r in recommendations if r.signal_type == "Path"),
        "block": sum(1 for r in recommendations if r.signal_type == "Block"),
        "ambiguous": sum(1 for r in recommendations if r.ambiguous),
        # audit against existing signals (see coverage.py)
        "missing": sum(1 for r in recommendations if r.status == "missing"),
        "retype": sum(1 for r in recommendations if r.status == "retype"),
        "ok": sum(1 for r in recommendations if r.status == "ok"),
        # line-signal gap-fill (see line_signals.py)
        "trains": network.trains,
        "trains_target": trains_target,
        "line_signals": len(line_signals),
        "passing_loop_hints": len(loop_hints),
    }
    flow_json = []
    if classes is not None:
        kind_counts: dict[str, int] = {}
        for kind, _ in classes.values():
            kind_counts[kind] = kind_counts.get(kind, 0) + 1
        stats["oneway_tracks"] = kind_counts.get("oneway", 0)
        stats["bi_confirmed_tracks"] = kind_counts.get("bi_confirmed", 0)
        stats["bi_assumed_tracks"] = kind_counts.get("bi_assumed", 0)
        stats["stub_tracks"] = kind_counts.get("stub", 0)
        stats["inconsistent_junctions"] = count_inconsistent_junctions(graph, flow_directions)
        flow_json = [
            [round(x), round(y), round(deg, 1)]
            for x, y, deg in _flow_arrows(network, flow_directions)
        ]
    elif directions is not None:
        stats["directions_total"] = len(directions)
        stats["directions_known"] = sum(1 for d in directions.values() if d is not None)
        stats["inconsistent_junctions"] = count_inconsistent_junctions(graph, directions)
        flow_json = [
            [round(x), round(y), round(deg, 1)]
            for x, y, deg in _flow_arrows(network, directions)
        ]

    return {
        "version": PAYLOAD_VERSION,
        "mode": mode,
        "stats": stats,
        "tracks": tracks_json,
        "flow_arrows": flow_json,
        "stations": stations_json,
        "existing_signals": existing_json,
        "junctions": junctions_json,
        "recommendations": recs_json,
        "line_signals": [
            {"id": i, "run": s.run_id,
             "x": round(s.position[0]), "y": round(s.position[1]), "z": round(s.position[2]),
             "facing_deg": s.facing_deg, "arc_m": s.arc_m, "block_m": s.block_m,
             "reason": s.reason}
            for i, s in enumerate(line_signals)
        ],
        "passing_loop_hints": [
            {"x": round(h.position[0]), "y": round(h.position[1]), "length_m": h.length_m}
            for h in loop_hints
        ],
        "line_runs": [
            {"run": r.run_id, "length_m": r.length_m,
             "existing": [{"arc_m": arc, "type": "Path" if is_path else "Block"}
                          for arc, is_path in r.existing]}
            for r in line_runs
        ],
        "text_report": render_text_report(recommendations, directions=directions, graph=graph,
                                          classes=classes, line_signals=line_signals,
                                          loop_hints=loop_hints, trains_target=trains_target),
    }


if __name__ == "__main__":
    import sys
    flags = [a for a in sys.argv[1:] if a.startswith("--")]
    positional = [a for a in sys.argv[1:] if not a.startswith("--")]
    if not positional:
        print("Usage: python3 src/web_api.py /path/to/save.sav [--misto|--mao-unica] [--trens=N]",
              file=sys.stderr)
        sys.exit(1)
    with open(positional[0], "rb") as fh:
        data = fh.read()
    if "--misto" in flags:
        cli_mode = "mixed"
    elif "--mao-unica" in flags:
        cli_mode = "oneway"
    else:
        cli_mode = "bidirectional"
    cli_target = DEFAULT_TRAINS_TARGET
    for flag in flags:
        if flag.startswith("--trens="):
            cli_target = int(flag.split("=", 1)[1])
    print(analyze_bytes(data, cli_mode, cli_target,
                        progress=lambda s: print(f"[{s}]", file=sys.stderr)))
