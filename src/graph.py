"""Build a graph of the rail network: nodes are junction points (places where
connectors of different track pieces meet), edges are the track pieces
themselves.

A node's "degree" (how many track edges touch it) tells us what kind of
point it is:
  - degree 1: dead end
  - degree 2: simple pass-through (one track continues into the next)
  - degree 3+: a junction or merge - trains coming from different tracks
    can meet here, so this is where signals matter.
"""
from dataclasses import dataclass, field

from parse_save import RailNetwork, Track


class UnionFind:
    def __init__(self):
        self.parent = {}

    def find(self, x):
        self.parent.setdefault(x, x)
        while self.parent[x] != x:
            self.parent[x] = self.parent[self.parent[x]]
            x = self.parent[x]
        return x

    def union(self, a, b):
        ra, rb = self.find(a), self.find(b)
        if ra != rb:
            self.parent[ra] = rb


@dataclass
class Node:
    node_id: str  # representative connector instance name
    connector_names: set = field(default_factory=set)
    edge_track_names: set = field(default_factory=set)
    station_names: list = field(default_factory=list)  # readable station names attached here

    @property
    def degree(self):
        return len(self.edge_track_names)


@dataclass
class RailGraph:
    nodes: dict  # node_id -> Node
    tracks: dict  # instance_name -> Track (unchanged, for geometry)
    track_endpoints: dict  # track instance_name -> (node_id_a, node_id_b)
    network: RailNetwork


def build_graph(network: RailNetwork) -> RailGraph:
    uf = UnionFind()
    for conn_name, conn in network.connections.items():
        for other in conn.connected_to:
            uf.union(conn_name, other)

    nodes: dict[str, Node] = {}

    def get_node(connector_name: str) -> Node:
        node_id = uf.find(connector_name)
        node = nodes.get(node_id)
        if node is None:
            node = Node(node_id=node_id)
            nodes[node_id] = node
        node.connector_names.add(connector_name)
        return node

    track_endpoints: dict[str, tuple] = {}
    for track_name, track in network.tracks.items():
        if len(track.connection_names) != 2:
            continue  # malformed/partial data, skip defensively
        node_a = get_node(track.connection_names[0])
        node_b = get_node(track.connection_names[1])
        node_a.edge_track_names.add(track_name)
        node_b.edge_track_names.add(track_name)
        track_endpoints[track_name] = (node_a.node_id, node_b.node_id)

    for station in network.stations:
        if station.track_ref is None or station.name is None:
            continue
        track = network.tracks.get(station.track_ref)
        if track is None:
            continue
        for conn_name in track.connection_names:
            node_id = uf.find(conn_name)
            node = nodes.get(node_id)
            if node is not None:
                node.station_names.append(station.name)

    return RailGraph(nodes=nodes, tracks=network.tracks, track_endpoints=track_endpoints, network=network)


if __name__ == "__main__":
    import sys
    from parse_save import parse_rail_network

    network = parse_rail_network(sys.argv[1])
    graph = build_graph(network)
    by_degree = {}
    for node in graph.nodes.values():
        by_degree.setdefault(node.degree, 0)
        by_degree[node.degree] += 1
    print(f"nodes={len(graph.nodes)} tracks={len(graph.tracks)}")
    print("degree distribution:", dict(sorted(by_degree.items())))
    junctions = [n for n in graph.nodes.values() if n.degree >= 3]
    print(f"junctions/merges (degree>=3): {len(junctions)}")
    for j in junctions[:10]:
        print(" junction:", j.node_id, "degree=", j.degree, "stations=", j.station_names)
