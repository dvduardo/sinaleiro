"""Per-track classification for the mixed-mode analysis: decide, track by
track, whether traffic is one-way (and which way) or bidirectional.

Evidence, strongest first:
  - stub: a loose end (degree-1 node) whose chain up to the first junction
    carries no station is an unfinished line under construction — it gets no
    signal recommendations at all.
  - bridge: a track whose removal disconnects the network cannot be one-way
    (a train that crosses it could never come back), so it is confirmed
    bidirectional. Terminal station branches are the typical case.
  - station facing: the station actor's rotation gives the travel direction
    of a docked train (game mechanics — trains only dock forward), seeding
    one-way inference on the station's own track.
  - parallel pairs + propagation (directions.py): the existing right-hand-rule
    inference, kept away from bridges/stubs via `blocked`.
  - switch geometry: an unresolved chain hanging between two junctions with
    known flow takes the direction the junction tangents allow — a train
    cannot take a hairpin through a switch, so a branch leaving along the
    flow is an exit and one arriving along the flow is an entry.
  - fallback: no evidence at all means bidirectional "assumed" — the full
    signal pair is the safe recommendation.

Output of classify_tracks: dict track_name -> (kind, direction) where kind is
"oneway" (direction ±1, flow from the TrackConnection0 end toward the
TrackConnection1 end), "bi_confirmed", "bi_assumed" or "stub" (direction None).
"""
from graph import RailGraph
from directions import infer_directions
from geometry import distance, sample_track, tangent_at_arc_length
from parse_save import RailNetwork

# a station must sit essentially parallel to its track for the facing seed
# to be trusted (empirically the dot is exactly ±1.0 on integrated tracks)
STATION_ALIGN_DOT_MIN = 0.7
# how far a station may sit from a loose-end chain and still make it a real
# branch instead of an unfinished stub (covers stations missing track_ref)
STUB_STATION_NEAR_CM = 3000.0
# switch geometry: how aligned a branch tangent must be with the junction's
# known flow to count as an exit (or, mirrored, an entry). In-game switches
# are shallow, so real branches score well above this.
SWITCH_DOT_MIN = 0.5
# tangents are taken this far into the track from the junction end
SWITCH_TANGENT_PROBE_CM = 200.0


def _node_tracks(graph: RailGraph) -> dict:
    node_tracks: dict[str, list] = {}
    for track_name, (node_a, node_b) in graph.track_endpoints.items():
        node_tracks.setdefault(node_a, []).append(track_name)
        node_tracks.setdefault(node_b, []).append(track_name)
    return node_tracks


def find_bridges(graph: RailGraph) -> set:
    """Tracks that are bridges of the undirected multigraph (removing one
    disconnects its component). Iterative Tarjan — a recursive DFS would blow
    Pyodide's default recursion limit on large networks and silently break
    CPython/browser parity. The incoming edge is skipped BY TRACK NAME, never
    by parent node, so the second track of a parallel double-track pair is a
    legitimate back edge and dual lines are not misread as bridges."""
    adjacency: dict[str, list] = {}
    for name in sorted(graph.track_endpoints):
        node_a, node_b = graph.track_endpoints[name]
        if node_a == node_b:
            continue  # self-loops are never bridges
        adjacency.setdefault(node_a, []).append((name, node_b))
        adjacency.setdefault(node_b, []).append((name, node_a))

    disc: dict[str, int] = {}
    low: dict[str, int] = {}
    bridges: set[str] = set()
    counter = 0

    for root in sorted(adjacency):
        if root in disc:
            continue
        disc[root] = low[root] = counter
        counter += 1
        stack = [(root, None, iter(adjacency[root]))]
        while stack:
            node, in_edge, neighbors = stack[-1]
            descended = False
            for edge_name, other in neighbors:
                if edge_name == in_edge:
                    continue
                if other in disc:
                    low[node] = min(low[node], disc[other])
                    continue
                disc[other] = low[other] = counter
                counter += 1
                stack.append((other, edge_name, iter(adjacency[other])))
                descended = True
                break
            if descended:
                continue
            stack.pop()
            if stack:
                parent = stack[-1][0]
                low[parent] = min(low[parent], low[node])
                if low[node] > disc[parent]:
                    bridges.add(in_edge)
    return bridges


def find_stubs(graph: RailGraph, network: RailNetwork) -> set:
    """Chains hanging from a loose end (degree-1 node) up to the first
    junction, with no station anywhere along them: unfinished construction.
    A chain that reaches a station is a legitimate terminal branch instead.
    Isolated segments (loose ends on both sides) are covered by the same walk."""
    node_tracks = _node_tracks(graph)
    station_tracks = {s.track_ref for s in network.stations if s.track_ref}
    station_positions = [s.position for s in network.stations]

    def chain_has_station(chain: list) -> bool:
        for track_name in chain:
            if track_name in station_tracks:
                return True
        # fallback for stations whose track_ref did not resolve: any station
        # sitting close to the chain still makes it a real branch, not a stub
        for track_name in chain:
            for point in graph.tracks[track_name].points_world:
                for pos in station_positions:
                    if distance(point, pos) <= STUB_STATION_NEAR_CM:
                        return True
        return False

    stubs: set[str] = set()
    for node in graph.nodes.values():
        if node.degree != 1:
            continue
        chain: list[str] = []
        current, in_edge = node.node_id, None
        while True:
            tracks_here = node_tracks.get(current, [])
            if in_edge is not None and len(tracks_here) != 2:
                break  # reached a junction (3+) or the far loose end (1)
            next_tracks = [t for t in tracks_here if t != in_edge]
            if not next_tracks:
                break
            edge = next_tracks[0]
            chain.append(edge)
            node_a, node_b = graph.track_endpoints[edge]
            if node_a == node_b:
                break  # defensive: self-loop cannot continue a chain
            current = node_b if node_a == current else node_a
            in_edge = edge
        if chain and not chain_has_station(chain):
            stubs.update(chain)
    return stubs


def _tangent_out_of_node(graph: RailGraph, track_name: str, node_id: str):
    """Unit XY tangent of the track at the given end, pointing away from it."""
    track = graph.tracks[track_name]
    node_a, _node_b = graph.track_endpoints[track_name]
    samples = sample_track(track)
    if node_a != node_id:
        samples = list(reversed(samples))
    return tangent_at_arc_length(samples, SWITCH_TANGENT_PROBE_CM)


def station_seeds(graph: RailGraph, network: RailNetwork, blocked=frozenset()) -> dict:
    """track_name -> ±1 from station facing. The station actor's forward is
    the travel direction of a docked train (validated empirically: on
    integrated station tracks the dot against the conn0->conn1 tangent is
    exactly ±1.0), which beats the geometric right-hand heuristic. Blocked
    tracks (bridges/stubs) take no seed: on a terminal branch the train
    passes the station in both directions."""
    seeds: dict[str, int] = {}
    conflicted: set[str] = set()
    for station in network.stations:
        name = station.track_ref
        if not name or station.forward is None:
            continue
        if name in blocked or name not in graph.track_endpoints:
            continue
        track = graph.tracks.get(name)
        if track is None:
            continue
        samples = sample_track(track)
        if len(samples) < 2:
            continue
        best_i, best_d = 0, None
        for i, point in enumerate(samples):
            d = distance(point, station.position)
            if best_d is None or d < best_d:
                best_i, best_d = i, d
        hi = min(best_i + 1, len(samples) - 1)
        lo = max(0, hi - 1)
        dx, dy = samples[hi][0] - samples[lo][0], samples[hi][1] - samples[lo][1]
        norm = (dx * dx + dy * dy) ** 0.5
        if norm <= 0:
            continue
        dot = (dx * station.forward[0] + dy * station.forward[1]) / norm
        if abs(dot) < STATION_ALIGN_DOT_MIN:
            continue  # station not aligned with this track: don't trust it
        direction = 1 if dot > 0 else -1
        if seeds.get(name, direction) != direction:
            conflicted.add(name)
        seeds[name] = direction
    for name in conflicted:
        seeds.pop(name, None)
    return seeds


def make_superedge_resolver(graph: RailGraph, blocked=frozenset()):
    """Resolver for infer_directions: assigns a direction to chains of
    unknown tracks strung between two junctions whose flow is known, using
    switch geometry (see module docstring). Returns a callable
    (directions) -> dict of new track_name -> ±1 assignments."""
    node_tracks = _node_tracks(graph)

    def flow_tangent_at(node_id, directions):
        """Average travel-direction tangent of the known tracks at a node,
        or None when unknown/contradictory."""
        vx = vy = 0.0
        found = False
        for track_name in node_tracks.get(node_id, []):
            direction = directions.get(track_name)
            if direction is None:
                continue
            node_a, node_b = graph.track_endpoints[track_name]
            if node_a == node_b:
                continue
            out_x, out_y = _tangent_out_of_node(graph, track_name, node_id)
            # +1 flows conn0->conn1: the flow LEAVES this node into the track
            # iff this node is the entry end for that direction of travel.
            leaves_node = (direction == 1) == (node_a == node_id)
            tx, ty = (out_x, out_y) if leaves_node else (-out_x, -out_y)
            if found and (tx * vx + ty * vy) < 0:
                return None  # known flows disagree here: not a through node
            vx, vy = vx + tx, vy + ty
            found = True
        if not found:
            return None
        norm = (vx * vx + vy * vy) ** 0.5
        if norm <= 0:
            return None
        return vx / norm, vy / norm

    def endpoint_verdict(node_id, edge_name, directions):
        """'exit' if the chain leaves this junction along the known flow,
        'entry' if it arrives along it, None when undecidable."""
        flow = flow_tangent_at(node_id, directions)
        if flow is None:
            return None
        out_x, out_y = _tangent_out_of_node(graph, edge_name, node_id)
        dot = out_x * flow[0] + out_y * flow[1]
        if dot >= SWITCH_DOT_MIN:
            return "exit"
        if dot <= -SWITCH_DOT_MIN:
            return "entry"
        return None

    def resolve(directions) -> dict:
        unknown = {
            name for name, direction in directions.items()
            if direction is None and name not in blocked
            and name in graph.track_endpoints
            and graph.track_endpoints[name][0] != graph.track_endpoints[name][1]
        }
        assignments: dict[str, int] = {}
        seen: set[str] = set()
        for start in sorted(unknown):
            if start in seen:
                continue
            # grow the chain of unknown tracks through degree-2 nodes
            chain = [start]
            ends = []  # (node_id, terminal_edge) per side
            for side in (0, 1):
                edge = start
                current = graph.track_endpoints[start][side]
                while True:
                    tracks_here = node_tracks.get(current, [])
                    if len(tracks_here) != 2:
                        break
                    other = tracks_here[0] if tracks_here[1] == edge else tracks_here[1]
                    if other not in unknown or other in chain:
                        break
                    chain.append(other) if side == 1 else chain.insert(0, other)
                    node_a, node_b = graph.track_endpoints[other]
                    current = node_b if node_a == current else node_a
                    edge = other
                ends.append((current, edge))
            seen.update(chain)
            (node_head, edge_head), (node_tail, edge_tail) = ends
            if node_head == node_tail:
                continue  # chain loops back to the same junction: no single flow
            head = endpoint_verdict(node_head, edge_head, directions)
            tail = endpoint_verdict(node_tail, edge_tail, directions)
            # flow head->tail needs an exit at the head and an entry at the
            # tail; both endpoints must agree or nothing is assigned.
            if head == "exit" and tail == "entry":
                flow_from = node_head
            elif head == "entry" and tail == "exit":
                flow_from = node_tail
            else:
                continue
            current = flow_from
            ordered = chain if flow_from == node_head else list(reversed(chain))
            for track_name in ordered:
                node_a, node_b = graph.track_endpoints[track_name]
                assignments[track_name] = 1 if node_a == current else -1
                current = node_b if node_a == current else node_a
        return assignments

    return resolve


def classify_tracks(graph: RailGraph, network: RailNetwork) -> dict:
    """track_name -> (kind, direction) covering every track in graph.tracks."""
    stubs = find_stubs(graph, network)
    bridges = find_bridges(graph)
    blocked = frozenset(stubs | bridges)
    seeds = station_seeds(graph, network, blocked=blocked)
    directions = infer_directions(
        graph,
        blocked=blocked,
        extra_seeds=seeds,
        junction_pass_mode="strict",
        superedge_resolver=make_superedge_resolver(graph, blocked),
    )

    classes: dict[str, tuple] = {}
    for name in graph.tracks:
        if name in stubs:
            classes[name] = ("stub", None)
        elif name in bridges:
            classes[name] = ("bi_confirmed", None)
        elif directions.get(name) is not None:
            classes[name] = ("oneway", directions[name])
        else:
            classes[name] = ("bi_assumed", None)
    return classes


if __name__ == "__main__":
    import sys
    from parse_save import parse_rail_network
    from graph import build_graph

    network = parse_rail_network(sys.argv[1])
    graph = build_graph(network)

    stubs = find_stubs(graph, network)
    bridges = find_bridges(graph)
    seeds = station_seeds(graph, network, blocked=frozenset(stubs | bridges))
    classes = classify_tracks(graph, network)

    counts: dict[str, int] = {}
    for kind, _ in classes.values():
        counts[kind] = counts.get(kind, 0) + 1
    print(f"tracks={len(classes)} " + " ".join(f"{k}={v}" for k, v in sorted(counts.items())))
    print(f"evidencias: pontes={len(bridges)} stubs={len(stubs)} sementes_estacao={len(seeds)}")
    sanity = [n for n in bridges if classes.get(n, ("", None))[0] == "oneway"]
    if sanity:
        print(f"ERRO: {len(sanity)} pontes classificadas como oneway!")
