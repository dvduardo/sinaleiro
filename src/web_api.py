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
from signal_rules import recommend_signals, junctions_with_labels, SIGNAL_SETBACK_CM
from geometry import (
    sample_track, distance, point_at_arc_length, tangent_at_arc_length,
    bearing_deg, bezier_segments,
)
from report import render_text_report, count_inconsistent_junctions, _flow_arrows

PAYLOAD_VERSION = 1


class InvalidSaveError(ValueError):
    """The file could not be parsed as a Satisfactory save."""


class NoRailsError(ValueError):
    """The save parsed fine but contains no railway tracks."""


_network = None
_graph = None


def _progress(callback, stage: str) -> None:
    if callback is not None:
        callback(stage)


def load_save(save_bytes, progress=None) -> None:
    """Parse the raw .sav bytes and build the rail graph (module globals)."""
    global _network, _graph
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


def analyze(mode: str, progress=None) -> str:
    """Run the signal recommendation for the already-loaded save and return
    the payload as a JSON string. mode: "bidirectional" | "oneway"."""
    if _graph is None:
        raise RuntimeError("chame load_save() antes de analyze()")
    directions = None
    if mode == "oneway":
        _progress(progress, "directions")
        directions = infer_directions(_graph)
    _progress(progress, "signals")
    recommendations = recommend_signals(_graph, directions)
    _progress(progress, "serialize")
    payload = _build_payload(_network, _graph, recommendations, directions, mode)
    return json.dumps(payload, ensure_ascii=False, separators=(",", ":"))


def analyze_bytes(save_bytes, mode: str, progress=None) -> str:
    load_save(save_bytes, progress=progress)
    return analyze(mode, progress=progress)


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


def _build_payload(network, graph, recommendations, directions, mode):
    junctions_meta = junctions_with_labels(graph)

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
            "reason": rec.reason,
            "nearest_station": rec.nearest_station_name,
            "nearest_station_m": round(rec.nearest_station_distance_m, 1)
            if rec.nearest_station_distance_m is not None else None,
        })

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

    tracks_json = []
    for name, track in network.tracks.items():
        flat = bezier_segments(track)
        if flat is None:
            continue
        entry = {"name": name, "bez": [round(v) for v in flat]}
        if directions is not None:
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
        "recommendations": len(recommendations),
        "path": sum(1 for r in recommendations if r.signal_type == "Path"),
        "block": sum(1 for r in recommendations if r.signal_type == "Block"),
        "ambiguous": sum(1 for r in recommendations if r.ambiguous),
    }
    flow_json = []
    if directions is not None:
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
        "text_report": render_text_report(recommendations, directions=directions, graph=graph),
    }


if __name__ == "__main__":
    import sys
    flags = [a for a in sys.argv[1:] if a.startswith("--")]
    positional = [a for a in sys.argv[1:] if not a.startswith("--")]
    if not positional:
        print("Usage: python3 src/web_api.py /path/to/save.sav [--mao-unica]", file=sys.stderr)
        sys.exit(1)
    with open(positional[0], "rb") as fh:
        data = fh.read()
    cli_mode = "oneway" if "--mao-unica" in flags else "bidirectional"
    print(analyze_bytes(data, cli_mode, progress=lambda s: print(f"[{s}]", file=sys.stderr)))
