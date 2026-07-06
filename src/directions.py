"""Infer the travel direction of each track for one-way (mão única) networks.

The save file does not record traffic direction, so we infer it geometrically
from the layout convention the user builds with: double-track lines where the
train always runs on the right-hand track (Brazilian road style), i.e. the
opposite-direction partner track sits on the train's LEFT.

Output: dict track_name -> +1 (flow from the TrackConnection0 end toward the
TrackConnection1 end), -1 (the opposite), or None (unknown - no parallel
partner found and no neighbor to propagate from).
"""
import math

from graph import RailGraph
from geometry import midpoint_and_tangent

LATERAL_MIN_CM = 300.0     # partner must be at least 3m to the side...
LATERAL_MAX_CM = 2500.0    # ...and at most 25m
LONGITUDINAL_MAX_CM = 3000.0  # midpoints roughly abreast of each other
PARALLEL_DOT_MIN = 0.8     # tangents parallel or antiparallel


def _left_of(direction):
    """Unit vector pointing to the LEFT of travel. World axes: +X = east,
    +Y = south, so for eastbound travel (1,0) the left side is north (0,-1)."""
    dx, dy = direction
    return (dy, -dx)


def _find_pairs(graph: RailGraph):
    """Mutual best-match parallel partner for each track, or None."""
    geo = {}
    for name, track in graph.tracks.items():
        mid, tangent = midpoint_and_tangent(track)
        geo[name] = (mid, tangent)

    names = list(geo)
    best: dict[str, tuple] = {}
    for a in names:
        mid_a, tan_a = geo[a]
        best_score, best_name, best_lat = None, None, None
        for b in names:
            if b == a:
                continue
            mid_b, tan_b = geo[b]
            dot = tan_a[0] * tan_b[0] + tan_a[1] * tan_b[1]
            if abs(dot) < PARALLEL_DOT_MIN:
                continue
            ox, oy = mid_b[0] - mid_a[0], mid_b[1] - mid_a[1]
            longitudinal = ox * tan_a[0] + oy * tan_a[1]
            lx, ly = _left_of(tan_a)
            lateral = ox * lx + oy * ly
            if abs(longitudinal) > LONGITUDINAL_MAX_CM:
                continue
            if not (LATERAL_MIN_CM <= abs(lateral) <= LATERAL_MAX_CM):
                continue
            score = abs(lateral) + 0.5 * abs(longitudinal)
            if best_score is None or score < best_score:
                best_score, best_name, best_lat = score, b, lateral
        if best_name is not None:
            best[a] = (best_name, best_lat)

    pairs = {}
    for a, (b, lateral) in best.items():
        if best.get(b, (None,))[0] == a:  # mutual
            pairs[a] = (b, lateral)
    return pairs


def infer_directions(graph: RailGraph) -> dict:
    directions: dict[str, int | None] = {name: None for name in graph.tracks}

    # 1. seed directions from parallel pairs + right-hand rule:
    #    travel direction is the one that puts the partner on the LEFT.
    #    `lateral` is the partner's offset along the left vector of the
    #    conn0->conn1 tangent: positive = partner already on the left of +1.
    pairs = _find_pairs(graph)
    for name, (_, lateral) in pairs.items():
        directions[name] = 1 if lateral > 0 else -1

    # 2. propagate through degree-2 nodes by flow continuity: a train leaving
    #    track A through a simple joint must continue into track B in the
    #    same direction of travel.
    node_tracks: dict[str, list] = {}
    for track_name, (node_a, node_b) in graph.track_endpoints.items():
        node_tracks.setdefault(node_a, []).append(track_name)
        node_tracks.setdefault(node_b, []).append(track_name)

    conflicts = set()  # contradictory evidence: forced to None (ambiguous) at the end
    banned = set()  # once contradictory, never re-inferred
    queue = [name for name, d in directions.items() if d is not None]

    def propagate():
        while queue:
            current = queue.pop()
            d = directions[current]
            if d is None:
                continue
            if current not in graph.track_endpoints:
                continue  # malformed track (≠2 connectors) skipped by build_graph
            node_a, node_b = graph.track_endpoints[current]
            # +1 flows from node_a into node_b; -1 the opposite
            exit_node = node_b if d == 1 else node_a
            entry_node = node_a if d == 1 else node_b
            for node, flows_out_of_node in ((exit_node, True), (entry_node, False)):
                tracks_here = node_tracks.get(node, [])
                if len(tracks_here) != 2:
                    continue  # only propagate through simple pass-through joints
                other = tracks_here[0] if tracks_here[1] == current else tracks_here[1]
                o_a, o_b = graph.track_endpoints[other]
                # if current flows OUT through this node, other must flow IN from it
                if flows_out_of_node:
                    implied = 1 if o_a == node else -1
                else:
                    implied = 1 if o_b == node else -1
                if directions[other] is None:
                    if other not in banned:
                        directions[other] = implied
                        queue.append(other)
                elif directions[other] != implied:
                    conflicts.add(other)
                    conflicts.add(current)

    def junction_pass():
        """3. a one-way junction must move traffic through: it needs at least
        one entry and one exit. When a junction has exactly one unknown track
        and every known one plays the same role, the unknown must play the
        other role. Anything less determined is left as unknown."""
        changed = False
        for node, tracks_here in node_tracks.items():
            if len(tracks_here) < 3:
                continue
            unknown = [t for t in tracks_here if directions[t] is None]
            if len(unknown) != 1:
                continue
            entries = exits = 0
            for t in tracks_here:
                d = directions[t]
                if d is None:
                    continue
                t_a, t_b = graph.track_endpoints[t]
                if t_a == t_b:  # loop track: enters and exits the same node
                    entries += 1
                    exits += 1
                elif (t_b if d == 1 else t_a) == node:
                    entries += 1
                else:
                    exits += 1
            t = unknown[0]
            if t in banned or t not in graph.track_endpoints:
                continue
            t_a, t_b = graph.track_endpoints[t]
            if t_a == t_b:
                continue  # a loop can't be given a single role
            if exits == 0 and entries > 0:
                implied = 1 if t_a == node else -1  # must flow out of the node
            elif entries == 0 and exits > 0:
                implied = 1 if t_b == node else -1  # must flow into the node
            else:
                continue
            directions[t] = implied
            queue.append(t)
            changed = True
        return changed

    propagate()
    while junction_pass():
        propagate()

    # settle contradictions (they become ambiguous/None); with them out of
    # the way, junction consistency may determine a few more approaches.
    # Terminates: each round permanently bans at least one track.
    while conflicts:
        for name in conflicts:
            directions[name] = None
        banned.update(conflicts)
        conflicts.clear()
        while junction_pass():
            propagate()

    return directions


if __name__ == "__main__":
    import sys
    from parse_save import parse_rail_network
    from graph import build_graph

    network = parse_rail_network(sys.argv[1])
    graph = build_graph(network)
    directions = infer_directions(graph)
    known = sum(1 for d in directions.values() if d is not None)
    print(f"tracks={len(directions)} com direção inferida={known} sem direção={len(directions) - known}")
