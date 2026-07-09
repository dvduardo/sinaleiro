"""Line (block) signals as gap-fill along one-way runs.

A "run" is a maximal chain of one-way tracks strung between junctions through
degree-2 joints. For several trains to share a run they need it divided into
blocks: a run with N block sections can hold N trains back to back. Junction
signals (recommended separately, see signal_rules.py) already bound the run at
both ends, so the sections are defined by the signals ALONG the run.

Unlike the old idea of spraying evenly spaced signals, this respects what the
player already built: existing signals on the run (attributed to tracks by
coverage.py) count as section boundaries, and new signals are only suggested
inside the largest remaining gaps, evenly, until the run holds `trains_target`
trains — never creating a section shorter than MIN_BLOCK_CM.

Long bidirectional stretches are NOT subdivided (a mid-block signal on a
two-way single track causes head-on deadlocks); they get an informational
hint suggesting a passing loop instead.
"""
from dataclasses import dataclass

from graph import RailGraph
from geometry import (
    sample_track, distance, point_at_arc_length, tangent_at_arc_length,
    bearing_deg,
)

# Smallest useful block section: must fit a whole consist with margin, or the
# extra signal adds no capacity (~80 m covers a large 1 loco + 6 wagon train).
MIN_BLOCK_CM = 8000.0
# Bidirectional runs at least this long get the passing-loop hint (300 m —
# below that a train just waits the few seconds the stretch takes to clear).
BI_HINT_MIN_CM = 30000.0


@dataclass
class LineSignal:
    position: list  # world [x, y, z]
    facing_deg: float  # travel direction of the flow at the signal
    run_id: int
    arc_m: float  # distance along the run, from its upstream junction
    block_m: float  # resulting section length around this signal
    reason: str


@dataclass
class PassingLoopHint:
    position: list  # world [x, y, z] at the middle of the stretch
    length_m: float


@dataclass
class LineRun:
    """Metadata of a one-way run that received suggested signals — enough for
    the UI to draw the whole run as a straight line with its block marks."""
    run_id: int
    length_m: float
    existing: list  # [(arc_m, is_path)] existing signals along the run


def _node_tracks(graph: RailGraph) -> dict:
    node_tracks: dict[str, list] = {}
    for track_name, (node_a, node_b) in graph.track_endpoints.items():
        node_tracks.setdefault(node_a, []).append(track_name)
        node_tracks.setdefault(node_b, []).append(track_name)
    return node_tracks


def _chains(graph: RailGraph, node_tracks: dict, member: set) -> list:
    """Maximal chains of member tracks joined through degree-2 nodes, each as
    an ordered track list. Iteration is sorted so runs (and therefore run_ids
    and signal placement) are deterministic across CPython/Pyodide."""
    seen: set = set()
    chains = []
    for start in sorted(member):
        if start in seen:
            continue
        seen.add(start)
        sides: list[list] = [[], []]
        for side in (0, 1):
            edge = start
            current = graph.track_endpoints[start][side]
            while True:
                tracks_here = node_tracks.get(current, [])
                if len(tracks_here) != 2:
                    break  # junction or dead end: the run stops here
                other = tracks_here[0] if tracks_here[1] == edge else tracks_here[1]
                if other not in member or other in seen:
                    break
                seen.add(other)
                sides[side].append(other)
                node_a, node_b = graph.track_endpoints[other]
                current = node_b if node_a == current else node_a
                edge = other
        chains.append(list(reversed(sides[0])) + [start] + sides[1])
    return chains


def _orient(graph: RailGraph, chain: list, kinds: dict) -> list:
    """The chain as [(track_name, forward)] walked end to end, oriented along
    the one-way flow (forward = walk goes from the TrackConnection0 end to the
    TrackConnection1 end; flow direction +1 means exactly that)."""
    endpoints = graph.track_endpoints
    if len(chain) == 1:
        ordered = [(chain[0], True)]
    else:
        first_a, first_b = endpoints[chain[0]]
        second = set(endpoints[chain[1]])
        start = first_a if first_b in second else first_b
        current = start
        ordered = []
        for name in chain:
            node_a, node_b = endpoints[name]
            forward = (node_a == current)
            ordered.append((name, forward))
            current = node_b if forward else node_a
    direction = kinds.get(ordered[0][0], (None, None))[1]
    if direction is not None and (direction == 1) != ordered[0][1]:
        ordered = [(name, not forward) for name, forward in reversed(ordered)]
    return ordered


def _polyline(graph: RailGraph, ordered: list) -> list:
    points: list = []
    for name, forward in ordered:
        samples = sample_track(graph.tracks[name])
        if not forward:
            samples = list(reversed(samples))
        if points and samples and distance(points[-1], samples[0]) < 1.0:
            samples = samples[1:]
        points.extend(samples)
    return points


def _existing_arcs(graph: RailGraph, ordered: list, coverage) -> list:
    """(arc, is_path) from the run's upstream end for the existing signals
    attributed to the run's tracks. Both types count: a Path signal divides
    block sections just like a Block signal does."""
    arcs = []
    base = 0.0
    for name, forward in ordered:
        samples = sample_track(graph.tracks[name])
        length = sum(distance(samples[i], samples[i + 1])
                     for i in range(len(samples) - 1)) if len(samples) > 1 else 0.0
        for arc, is_path in coverage.signals_on_track(name):
            arcs.append((base + (arc if forward else length - arc), is_path))
        base += length
    return sorted(arcs)


def _fill_gaps(length: float, existing: list, trains_target: int) -> list:
    """(arc, block_m) for each suggested signal. Existing signals split the
    run into gaps; we repeatedly plan one more signal in whichever gap yields
    the largest resulting sub-section, until the run has `trains_target`
    sections or no gap can be split without going under MIN_BLOCK_CM."""
    bounds = [0.0] + [a for a in existing if 0.0 < a < length] + [length]
    gaps = [(bounds[i], bounds[i + 1] - bounds[i]) for i in range(len(bounds) - 1)]
    planned = [0] * len(gaps)  # new signals per gap
    sections = len(gaps)
    while sections < trains_target:
        best, best_size = None, MIN_BLOCK_CM
        for i, (_start, gap_len) in enumerate(gaps):
            size = gap_len / (planned[i] + 2)  # sub-section after one more
            if size >= best_size:
                best, best_size = i, size
        if best is None:
            break
        planned[best] += 1
        sections += 1
    out = []
    for i, (start, gap_len) in enumerate(gaps):
        count = planned[i]
        for k in range(1, count + 1):
            out.append((start + gap_len * k / (count + 1), gap_len / (count + 1)))
    return out


def plan_line_signals(graph: RailGraph, kinds: dict, coverage,
                      trains_target: int) -> tuple:
    """(line_signals, passing_loop_hints, line_runs) for the whole network.

    kinds: track_name -> (kind, direction) as produced by classify_tracks
    (in one-way mode build it from the directions dict). coverage: see
    coverage.py. trains_target: how many trains each one-way run should hold.
    line_runs only lists the runs that received at least one signal.
    """
    node_tracks = _node_tracks(graph)
    oneway = {name for name, (kind, _d) in kinds.items()
              if kind == "oneway" and name in graph.track_endpoints}
    signals: list[LineSignal] = []
    runs: list[LineRun] = []
    for run_id, chain in enumerate(_chains(graph, node_tracks, oneway)):
        ordered = _orient(graph, chain, kinds)
        points = _polyline(graph, ordered)
        if len(points) < 2:
            continue
        length = sum(distance(points[i], points[i + 1]) for i in range(len(points) - 1))
        existing = _existing_arcs(graph, ordered, coverage)
        before = len(signals)
        for arc, block in _fill_gaps(length, [a for a, _p in existing], trains_target):
            position = point_at_arc_length(points, arc)
            dx, dy = tangent_at_arc_length(points, arc)
            signals.append(LineSignal(
                position=position,
                facing_deg=round(bearing_deg(dx, dy), 1),
                run_id=run_id,
                arc_m=round(arc / 100.0, 1),
                block_m=round(block / 100.0, 1),
                reason=(f"Divide a corrida de mão única de {length / 100.0:.0f} m em blocos "
                        f"de ~{block / 100.0:.0f} m para comportar {trains_target} trens. "
                        f"Coloque à direita de quem viaja no sentido do fluxo."),
            ))
        if len(signals) > before:
            runs.append(LineRun(
                run_id=run_id,
                length_m=round(length / 100.0, 1),
                existing=[(round(arc / 100.0, 1), is_path)
                          for arc, is_path in existing if 0.0 < arc < length],
            ))

    hints: list[PassingLoopHint] = []
    bidirectional = {name for name, (kind, _d) in kinds.items()
                     if kind in ("bi_confirmed", "bi_assumed")
                     and name in graph.track_endpoints}
    for chain in _chains(graph, node_tracks, bidirectional):
        ordered = _orient(graph, chain, kinds)
        points = _polyline(graph, ordered)
        if len(points) < 2:
            continue
        length = sum(distance(points[i], points[i + 1]) for i in range(len(points) - 1))
        if length < BI_HINT_MIN_CM:
            continue
        hints.append(PassingLoopHint(
            position=point_at_arc_length(points, length / 2.0),
            length_m=round(length / 100.0),
        ))
    return signals, hints, runs


if __name__ == "__main__":
    import sys
    from parse_save import parse_rail_network
    from graph import build_graph
    from classify import classify_tracks
    from coverage import build_coverage

    network = parse_rail_network(sys.argv[1])
    graph = build_graph(network)
    kinds = classify_tracks(graph, network)
    coverage = build_coverage(graph, network)
    for target in (1, 2, 3, 5):
        line, hints, runs = plan_line_signals(graph, kinds, coverage, target)
        print(f"trens={target}: {len(line)} sinais de linha em {len(runs)} corridas, "
              f"{len(hints)} dicas de desvio")
