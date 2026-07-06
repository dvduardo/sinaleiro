"""Heuristic v1 rules for recommending where to place signals.

Scope of this first version (deliberately limited, see plan doc):
  - At every junction/merge (a node where 3+ track pieces meet), recommend a
    Path Signal on each track entering that junction. The signal position is
    set back ~20m from the junction point *along the track's own curve*, which
    is where you'd physically place it in-game (and keeps the game's rule of
    signals being at least 12m away from a segment end when placed mid-track).
  - Simple loops that contain no junction at all are only flagged as
    informational: whether you need Block Signals on them depends on how
    many trains you plan to run there, which we can't infer from the save,
    so we don't auto-recommend spacing.
  - We skip recommending a signal if one of the same type already exists
    within 3m of the same spot (position tolerance to account for
    snapping/float noise). The facing of existing signals is not stored in
    what we parse, so a same-type signal pointing the wrong way still counts
    as a match — known limitation.
  - One-way mode: when a directions dict (see directions.py) is passed, each
    junction approach is classified by the inferred flow as an entry (Path
    Signal only) or an exit (Block Signal only). Tracks whose direction could
    not be inferred fall back to the bidirectional pair and are flagged as
    ambiguous.
"""
import math
from dataclasses import dataclass

from graph import RailGraph, Node
from parse_save import Track


SIGNAL_MATCH_TOLERANCE_CM = 300.0  # 3m, in Satisfactory's cm-based world units
SIGNAL_SETBACK_CM = 2000.0  # place recommendations 20m into each approach track

COMPASS_PT = ["norte", "nordeste", "leste", "sudeste", "sul", "sudoeste", "oeste", "noroeste"]


@dataclass
class SignalRecommendation:
    track_name: str
    node_id: str
    position: list  # world [x, y, z]
    signal_type: str  # "Path" or "Block"
    reason: str
    nearest_station_name: str | None
    nearest_station_distance_m: float | None
    junction_label: str = ""
    approach_dir: str = ""  # compass direction of this approach, seen from the junction
    role: str = "entrada"  # "entrada" (facing the junction) or "saída" (facing away)
    ambiguous: bool = False  # one-way mode only: direction unknown, treated as bidirectional

    @property
    def name_pt(self) -> str:
        # in-game pt-BR names: Path Signal = Sinal de Trajeto, Block Signal = Sinal de Trecho
        return "Sinal de Trajeto" if self.signal_type == "Path" else "Sinal de Trecho"


def _distance(a, b):
    return math.sqrt(sum((a[i] - b[i]) ** 2 for i in range(3)))


def _sample_track(track: Track, steps_per_segment: int = 8) -> list:
    """Densely sample the track's spline (same cubic-bezier conversion the map
    rendering uses) so distances measured along the polyline follow the curve."""
    points = track.points_world
    leave = track.leave_tangents_local
    arrive = track.arrive_tangents_local
    if len(points) < 2:
        return points
    samples = [points[0]]
    for i in range(len(points) - 1):
        p0, p1 = points[i], points[i + 1]
        t_leave = leave[i] if i < len(leave) else [0, 0, 0]
        t_arrive = arrive[i + 1] if i + 1 < len(arrive) else [0, 0, 0]
        c1 = [p0[k] + t_leave[k] / 3.0 for k in range(3)]
        c2 = [p1[k] - t_arrive[k] / 3.0 for k in range(3)]
        for s in range(1, steps_per_segment + 1):
            t = s / steps_per_segment
            u = 1.0 - t
            samples.append([
                u**3 * p0[k] + 3 * u**2 * t * c1[k] + 3 * u * t**2 * c2[k] + t**3 * p1[k]
                for k in range(3)
            ])
    return samples


def _point_along_track(track: Track, from_connector: int, distance_cm: float) -> list:
    """Walk `distance_cm` along the track curve starting from the given end
    (0 = TrackConnection0 end, 1 = TrackConnection1 end). If the track is
    shorter than twice the distance, settle for the middle of the track."""
    samples = _sample_track(track)
    if from_connector == 1:
        samples = list(reversed(samples))

    total = sum(_distance(samples[i], samples[i + 1]) for i in range(len(samples) - 1))
    target = min(distance_cm, total / 2.0)

    walked = 0.0
    for i in range(len(samples) - 1):
        seg = _distance(samples[i], samples[i + 1])
        if seg <= 0:
            continue
        if walked + seg >= target:
            t = (target - walked) / seg
            return [samples[i][k] + t * (samples[i + 1][k] - samples[i][k]) for k in range(3)]
        walked += seg
    return samples[-1]


def _compass_dir(from_pos, to_pos) -> str:
    """Compass direction of to_pos seen from from_pos. In Satisfactory world
    coordinates +X = east and +Y = south."""
    dx = to_pos[0] - from_pos[0]
    dy = to_pos[1] - from_pos[1]
    angle = math.degrees(math.atan2(dx, -dy)) % 360.0  # 0 = north, clockwise
    return COMPASS_PT[int((angle + 22.5) // 45) % 8]


def _nearest_station(position, stations):
    best_name, best_dist = None, None
    for station in stations:
        if not station.name:
            continue
        dist = _distance(position, station.position) / 100.0  # cm -> m
        if best_dist is None or dist < best_dist:
            best_name, best_dist = station.name, dist
    return best_name, best_dist


def _has_nearby_signal(position, signals, signal_type):
    for signal in signals:
        if signal.is_path_signal != (signal_type == "Path"):
            continue
        if _distance(position, signal.position) <= SIGNAL_MATCH_TOLERANCE_CM:
            return True
    return False


def junctions_with_labels(graph: RailGraph) -> list:
    """Junction nodes (3+ tracks meeting) as (label, node, world_pos) tuples,
    with stable numbering so labels don't shuffle between runs."""
    junctions = [node for node in graph.nodes.values() if node.degree >= 3]

    def junction_pos(node: Node):
        track_name = next(iter(node.edge_track_names))
        track = graph.tracks[track_name]
        node_a, _ = graph.track_endpoints[track_name]
        points = track.points_world
        return points[0] if node_a == node.node_id else points[-1]

    junctions.sort(key=lambda n: (junction_pos(n)[0], junction_pos(n)[1]))
    return [(f"J{i}", node, junction_pos(node)) for i, node in enumerate(junctions, 1)]


def recommend_signals(graph: RailGraph, directions: dict | None = None) -> list:
    """directions=None (bidirectional mode) keeps the historic behavior of one
    entry + one exit signal per junction approach. With a directions dict
    (track_name -> +1/-1/None, see directions.py) each approach gets only the
    signal its inferred flow calls for."""
    recommendations: list[SignalRecommendation] = []
    stations = graph.network.stations
    signals = graph.network.signals

    for label, node, j_pos in junctions_with_labels(graph):
        for track_name in sorted(node.edge_track_names):
            track = graph.tracks[track_name]
            node_a, node_b = graph.track_endpoints[track_name]
            connector_index = 0 if node_a == node.node_id else 1
            position = _point_along_track(track, connector_index, SIGNAL_SETBACK_CM)

            # One-way mode: +1 flows connector0 -> connector1, so the flow
            # enters this junction iff it exits the track at our end. Loop
            # tracks (both ends on the same node) have no defined role.
            direction = directions.get(track_name) if directions is not None else None
            ambiguous = directions is not None and (direction is None or node_a == node_b)
            if directions is None or ambiguous:
                roles = ("entrada", "saída")
            elif (direction == 1) == (connector_index == 1):
                roles = ("entrada",)
            else:
                roles = ("saída",)

            approach_dir = _compass_dir(j_pos, position)
            station_name, station_dist = _nearest_station(position, stations)
            common = dict(
                track_name=track_name,
                node_id=node.node_id,
                position=position,
                nearest_station_name=station_name,
                nearest_station_distance_m=station_dist,
                junction_label=label,
                approach_dir=approach_dir,
                ambiguous=ambiguous,
            )
            ambiguous_note = (
                " ATENÇÃO: direção deste trilho não pôde ser inferida — tratado "
                "como bidirecional; confira o traçado."
            ) if ambiguous else ""
            # Entry signal: protects trains arriving through this branch.
            if "entrada" in roles and not _has_nearby_signal(position, signals, "Path"):
                recommendations.append(SignalRecommendation(
                    signal_type="Path",
                    role="entrada",
                    reason=(f"Entrada {approach_dir} da junção {label} ({node.degree} trilhos se encontram). "
                            f"Coloque virado PARA a junção.{ambiguous_note}"),
                    **common,
                ))
            # Exit signal at the same joint, facing the other way: closes the
            # junction block so it is released as soon as the train clears it.
            if "saída" in roles and not _has_nearby_signal(position, signals, "Block"):
                recommendations.append(SignalRecommendation(
                    signal_type="Block",
                    role="saída",
                    reason=(f"Saída {approach_dir} da junção {label} — fecha o bloco da junção e o libera "
                            f"assim que o trem sai. Coloque no mesmo ponto, virado PARA FORA da junção."
                            f"{ambiguous_note}"),
                    **common,
                ))

    return recommendations


if __name__ == "__main__":
    import sys
    from parse_save import parse_rail_network
    from graph import build_graph

    network = parse_rail_network(sys.argv[1])
    graph = build_graph(network)
    directions = None
    if "--mao-unica" in sys.argv:
        from directions import infer_directions
        directions = infer_directions(graph)
    recs = recommend_signals(graph, directions)
    print(f"{len(recs)} recomendacoes de sinal")
    for rec in recs:
        loc = f"{rec.nearest_station_distance_m:.0f}m de '{rec.nearest_station_name}'" if rec.nearest_station_name else "sem estacao proxima"
        print(f"  [{rec.junction_label} {rec.approach_dir:>8}] pos={[round(v) for v in rec.position]} ({loc})")
