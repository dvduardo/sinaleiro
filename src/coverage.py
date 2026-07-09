"""Audit the signals that already exist in the save so we never recommend a
signal where the player has effectively already placed one.

The recommendation engine used to skip an existing signal only when it sat
within 3 m of the exact computed spot (signal_rules.SIGNAL_MATCH_TOLERANCE_CM).
On an already-signalled network that misses almost everything — players place
their signals a few metres off the tool's ideal point — so the tool told them
to re-place hundreds of signals they already had. This module replaces that
with topological coverage: for each junction approach we ask "is there already
a signal on this arm, of the right type, within reach of the junction?".

Signals are physical buildings sitting on a track, so we attribute each one to
the nearest track by sampling the spline, then walk the arm out of the junction
through degree-2 joints, measuring each existing signal's distance along the
arm from the junction. World units are centimetres (see geometry.py).
"""
from graph import RailGraph
from parse_save import RailNetwork
from geometry import sample_track, distance

# A signal must sit within this of a track's centreline to be counted as
# "on" that track (5 m covers snapping/placement noise; signals hug the rail).
SIGNAL_ATTACH_MAX_CM = 500.0
# How far along the approach arm, measured from the junction, an existing
# signal still counts as protecting that junction. The tool's own setback is
# ~13-20 m; players place theirs in the same zone, so 60 m is comfortable
# without reaching a signal that really belongs to the *next* junction.
COVERAGE_RANGE_CM = 6000.0
# Grid cell for the nearest-track spatial hash (50 m).
_CELL_CM = 5000.0


def _node_tracks(graph: RailGraph) -> dict:
    node_tracks: dict[str, list] = {}
    for track_name, (node_a, node_b) in graph.track_endpoints.items():
        node_tracks.setdefault(node_a, []).append(track_name)
        node_tracks.setdefault(node_b, []).append(track_name)
    return node_tracks


class SignalCoverage:
    """Attribution of existing signals to tracks, plus per-approach queries."""

    def __init__(self, graph: RailGraph, network: RailNetwork):
        self.graph = graph
        self._node_tracks = _node_tracks(graph)
        # sample every track once; reused for attribution and arc math
        self._samples: dict[str, list] = {
            name: sample_track(track) for name, track in graph.tracks.items()
        }
        self._length: dict[str, float] = {
            name: self._polyline_length(s) for name, s in self._samples.items()
        }
        # track_name -> list of (arc_from_conn0_cm, is_path)
        self._on_track: dict[str, list] = {}
        self._attach(network)

    @staticmethod
    def _polyline_length(samples: list) -> float:
        return sum(distance(samples[i], samples[i + 1]) for i in range(len(samples) - 1)) \
            if len(samples) > 1 else 0.0

    def _attach(self, network: RailNetwork) -> None:
        # spatial hash of which tracks pass through each grid cell
        grid: dict[tuple, set] = {}
        for name, samples in self._samples.items():
            for p in samples:
                grid.setdefault((int(p[0] // _CELL_CM), int(p[1] // _CELL_CM)), set()).add(name)

        for signal in network.signals:
            sx, sy = signal.position[0], signal.position[1]
            cx, cy = int(sx // _CELL_CM), int(sy // _CELL_CM)
            candidates: set = set()
            for dx in (-1, 0, 1):
                for dy in (-1, 0, 1):
                    candidates |= grid.get((cx + dx, cy + dy), set())

            best_name, best_dist, best_arc = None, SIGNAL_ATTACH_MAX_CM, 0.0
            # sorted() so near-equidistant candidates break ties deterministically
            # — set iteration order is hash-seeded and would make the audit vary
            # run to run, breaking the CPython/Pyodide parity smoke test.
            for name in sorted(candidates):
                samples = self._samples[name]
                arc = 0.0
                for i in range(len(samples)):
                    d = distance(signal.position, samples[i])
                    if d < best_dist:
                        best_dist, best_name, best_arc = d, name, arc
                    if i < len(samples) - 1:
                        arc += distance(samples[i], samples[i + 1])
            if best_name is not None:
                self._on_track.setdefault(best_name, []).append((best_arc, signal.is_path_signal))

    def approach_types(self, node_id: str, edge_track: str,
                       range_cm: float = COVERAGE_RANGE_CM) -> set:
        """Signal types ("Path"/"Block") already present on the arm leaving
        `node_id` through `edge_track`, within `range_cm` of the junction
        measured along the track curve. Walks through degree-2 joints so a
        signal on a continuation segment still counts."""
        types: set = set()
        current, edge = node_id, edge_track
        base = 0.0
        visited: set = set()
        while True:
            node_a, node_b = self.graph.track_endpoints[edge]
            from_conn0 = (node_a == current)
            length = self._length.get(edge, 0.0)
            for arc, is_path in self._on_track.get(edge, []):
                # distance from the junction, following the arm's direction
                d = base + (arc if from_conn0 else (length - arc))
                if d <= range_cm:
                    types.add("Path" if is_path else "Block")
            base += length
            if base >= range_cm or node_a == node_b:
                break
            nxt = node_b if from_conn0 else node_a
            tracks_here = self._node_tracks.get(nxt, [])
            if len(tracks_here) != 2:
                break  # reached a junction or a dead end: arm ends here
            other = tracks_here[0] if tracks_here[1] == edge else tracks_here[1]
            if other in visited:
                break
            visited.add(other)
            current, edge = nxt, other
        return types

    def signals_on_track(self, track_name: str) -> list:
        """(arc_from_conn0_cm, is_path) for every existing signal attributed to
        this track. Used by the line-signal gap-fill (Part B)."""
        return self._on_track.get(track_name, [])


def build_coverage(graph: RailGraph, network: RailNetwork) -> SignalCoverage:
    return SignalCoverage(graph, network)


if __name__ == "__main__":
    import sys
    from parse_save import parse_rail_network
    from graph import build_graph

    net = parse_rail_network(sys.argv[1])
    g = build_graph(net)
    cov = build_coverage(g, net)
    attached = sum(len(v) for v in cov._on_track.values())
    print(f"sinais existentes: {len(net.signals)}  atribuídos a um trilho: {attached}")
