"""Extract the railway network (tracks, connections, stations, signals) from a
Satisfactory .sav file, using the vendored sat_sav_parse library.

This module only reads data - it never writes back to the save file.
"""
import os
import sys
from dataclasses import dataclass, field

VENDOR_DIR = os.path.join(os.path.dirname(__file__), "..", "vendor", "sat_sav_parse")
if VENDOR_DIR not in sys.path:
    sys.path.insert(0, VENDOR_DIR)

import sav_parse  # noqa: E402

TRACK_TYPE_PATHS = {
    "/Game/FactoryGame/Buildable/Factory/Train/Track/Build_RailroadTrack.Build_RailroadTrack_C",
    "/Game/FactoryGame/Buildable/Factory/Train/Track/Build_RailroadTrackIntegrated.Build_RailroadTrackIntegrated_C",
}
CONNECTION_CLASS_PATH = "/Script/FactoryGame.FGRailroadTrackConnectionComponent"
BLOCK_SIGNAL_TYPE_PATH = "/Game/FactoryGame/Buildable/Factory/Train/Signal/Build_RailroadBlockSignal.Build_RailroadBlockSignal_C"
PATH_SIGNAL_TYPE_PATH = "/Game/FactoryGame/Buildable/Factory/Train/Signal/Build_RailroadPathSignal.Build_RailroadPathSignal_C"
SIGNAL_TYPE_PATHS = {BLOCK_SIGNAL_TYPE_PATH, PATH_SIGNAL_TYPE_PATH}
STATION_TYPE_PATHS = {
    "/Game/FactoryGame/Buildable/Factory/Train/Station/Build_TrainStation.Build_TrainStation_C",
    "/Game/FactoryGame/Buildable/Factory/Train/Station/Build_TrainDockingStation.Build_TrainDockingStation_C",
    "/Game/FactoryGame/Buildable/Factory/Train/Station/Build_TrainDockingStationLiquid.Build_TrainDockingStationLiquid_C",
    "/Game/FactoryGame/Buildable/Factory/Train/Station/Build_TrainPlatformEmpty.Build_TrainPlatformEmpty_C",
}
STATION_IDENTIFIER_TYPE_PATH = "/Script/FactoryGame.FGTrainStationIdentifier"


@dataclass
class Track:
    instance_name: str
    track_graph_id: int
    origin: list  # [x, y, z]
    points_local: list  # list of [x, y, z] offsets from origin, in spline order
    leave_tangents_local: list = field(default_factory=list)  # tangent at each point, same order
    arrive_tangents_local: list = field(default_factory=list)  # tangent at each point, same order
    connection_names: list = field(default_factory=list)  # up to 2 connector instance names

    @property
    def points_world(self):
        ox, oy, oz = self.origin
        return [[ox + x, oy + y, oz + z] for x, y, z in self.points_local]

    @property
    def tangents_world(self):
        return [list(t) for t in self.leave_tangents_local]


@dataclass
class Connection:
    instance_name: str
    parent_track: str
    connected_to: list = field(default_factory=list)  # instance names of other connections


@dataclass
class Station:
    instance_name: str
    position: list
    track_ref: str | None
    name: str | None = None


@dataclass
class Signal:
    instance_name: str
    position: list
    is_path_signal: bool


@dataclass
class Building:
    instance_name: str
    position: list


@dataclass
class RailNetwork:
    tracks: dict  # instance_name -> Track
    connections: dict  # instance_name -> Connection
    stations: list  # list[Station]
    signals: list  # list[Signal]
    buildings: list  # list[Building] - other buildables, for background context only


GENERIC_BUILDING_PREFIX = "/Game/FactoryGame/Buildable/"
# these are already represented as tracks/stations/signals - don't double-draw them as generic buildings
GENERIC_BUILDING_EXCLUDE_PREFIXES = (
    "/Game/FactoryGame/Buildable/Factory/Train/",
)


def _get(properties, name, default=None):
    for prop_name, value in properties:
        if prop_name == name:
            return value
    return default


def _header_type_path(header):
    return getattr(header, "typePath", None) or getattr(header, "className", None)


def parse_rail_network(save_path: str) -> RailNetwork:
    parsed = sav_parse.readFullSaveFile(save_path)

    tracks: dict[str, Track] = {}
    connections: dict[str, Connection] = {}
    stations: list[Station] = []
    signals: list[Signal] = []
    buildings: list[Building] = []
    station_names: dict[str, str] = {}  # station instance_name -> readable name

    for level in parsed.levels:
        for header, obj in zip(level.actorAndComponentObjectHeaders, level.objects):
            type_path = _header_type_path(header)
            if type_path is None:
                continue

            if type_path in TRACK_TYPE_PATHS:
                spline_data = _get(obj.properties, "mSplineData", [])
                # each entry is [valueEntries, typeEntries]; we only need valueEntries
                points_local = [_get(entry[0], "Location", [0.0, 0.0, 0.0]) for entry in spline_data]
                leave_tangents_local = [_get(entry[0], "LeaveTangent", [0.0, 0.0, 0.0]) for entry in spline_data]
                arrive_tangents_local = [_get(entry[0], "ArriveTangent", [0.0, 0.0, 0.0]) for entry in spline_data]
                track_graph_id = _get(obj.properties, "mTrackGraphID", -1)
                tracks[header.instanceName] = Track(
                    instance_name=header.instanceName,
                    track_graph_id=track_graph_id,
                    origin=list(header.position),
                    points_local=points_local,
                    leave_tangents_local=leave_tangents_local,
                    arrive_tangents_local=arrive_tangents_local,
                )

            elif type_path == CONNECTION_CLASS_PATH:
                connected = _get(obj.properties, "mConnectedComponents", []) or []
                connections[header.instanceName] = Connection(
                    instance_name=header.instanceName,
                    parent_track=header.parentActorName,
                    connected_to=[ref.pathName for ref in connected],
                )

            elif type_path in SIGNAL_TYPE_PATHS:
                signals.append(Signal(
                    instance_name=header.instanceName,
                    position=list(header.position),
                    is_path_signal=(type_path == PATH_SIGNAL_TYPE_PATH),
                ))

            elif type_path in STATION_TYPE_PATHS:
                track_ref = _get(obj.properties, "mRailroadTrack")
                stations.append(Station(
                    instance_name=header.instanceName,
                    position=list(header.position),
                    track_ref=track_ref.pathName if track_ref else None,
                ))

            elif type_path == STATION_IDENTIFIER_TYPE_PATH:
                station_ref = _get(obj.properties, "mStation")
                name_prop = _get(obj.properties, "mStationName")
                if station_ref and name_prop:
                    # mStationName is an FText property; the human-readable text is
                    # the last string element in its serialized list form.
                    text = next((v for v in reversed(name_prop) if isinstance(v, str)), None)
                    if text:
                        station_names[station_ref.pathName] = text

            elif type_path.startswith(GENERIC_BUILDING_PREFIX) and not type_path.startswith(
                    GENERIC_BUILDING_EXCLUDE_PREFIXES):
                buildings.append(Building(instance_name=header.instanceName, position=list(header.position)))

    # attach connector instance names to their owning track (order = TrackConnection0, TrackConnection1)
    for conn_name, conn in connections.items():
        track = tracks.get(conn.parent_track)
        if track is not None:
            track.connection_names.append(conn_name)

    for track in tracks.values():
        track.connection_names.sort()  # "...TrackConnection0" before "...TrackConnection1"

    for station in stations:
        station.name = station_names.get(station.instance_name)

    return RailNetwork(tracks=tracks, connections=connections, stations=stations, signals=signals,
                       buildings=buildings)


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python3 src/parse_save.py /path/to/save.sav")
        sys.exit(1)
    network = parse_rail_network(sys.argv[1])
    print(f"tracks={len(network.tracks)} connections={len(network.connections)} "
          f"stations={len(network.stations)} signals={len(network.signals)}")
    for station in network.stations[:5]:
        print(" station:", station)
