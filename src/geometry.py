"""Shared geometry helpers for working with track splines.

Satisfactory stores each track as an Unreal Hermite spline (Location /
ArriveTangent / LeaveTangent per key). Everything here works on densely
sampled polylines derived from that spline so distances follow the curve.
World units are centimetres; +X = east, +Y = south.
"""
import math

from parse_save import Track

COMPASS_PT = ["norte", "nordeste", "leste", "sudeste", "sul", "sudoeste", "oeste", "noroeste"]


def distance(a, b):
    return math.sqrt(sum((a[i] - b[i]) ** 2 for i in range(3)))


def sample_track(track: Track, steps_per_segment: int = 8) -> list:
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


def track_length(track: Track) -> float:
    samples = sample_track(track)
    return sum(distance(samples[i], samples[i + 1]) for i in range(len(samples) - 1))


def point_along_track(track: Track, from_connector: int, distance_cm: float) -> list:
    """Walk `distance_cm` along the track curve starting from the given end
    (0 = TrackConnection0 end, 1 = TrackConnection1 end). If the track is
    shorter than twice the distance, settle for the middle of the track."""
    samples = sample_track(track)
    if from_connector == 1:
        samples = list(reversed(samples))

    total = sum(distance(samples[i], samples[i + 1]) for i in range(len(samples) - 1))
    target = min(distance_cm, total / 2.0)
    return point_at_arc_length(samples, target)


def point_at_arc_length(samples: list, target_cm: float) -> list:
    """Linear interpolation along a sampled polyline at a given arc length."""
    walked = 0.0
    for i in range(len(samples) - 1):
        seg = distance(samples[i], samples[i + 1])
        if seg <= 0:
            continue
        if walked + seg >= target_cm:
            t = (target_cm - walked) / seg
            return [samples[i][k] + t * (samples[i + 1][k] - samples[i][k]) for k in range(3)]
        walked += seg
    return samples[-1]


def midpoint_and_tangent(track: Track):
    """Midpoint of the track curve and the unit tangent (XY only) at that
    point, oriented from the connector-0 end toward the connector-1 end."""
    samples = sample_track(track)
    if len(samples) < 2:
        return samples[0], (1.0, 0.0)
    total = sum(distance(samples[i], samples[i + 1]) for i in range(len(samples) - 1))
    mid = point_at_arc_length(samples, total / 2.0)
    a = point_at_arc_length(samples, max(0.0, total / 2.0 - 200.0))
    b = point_at_arc_length(samples, min(total, total / 2.0 + 200.0))
    dx, dy = b[0] - a[0], b[1] - a[1]
    norm = math.hypot(dx, dy) or 1.0
    return mid, (dx / norm, dy / norm)


def bearing_deg(dx, dy) -> float:
    """Compass bearing of an XY vector (0 = north, clockwise). World axes:
    +X = east, +Y = south."""
    return math.degrees(math.atan2(dx, -dy)) % 360.0


def tangent_at_arc_length(samples: list, target_cm: float, window_cm: float = 100.0):
    """Unit XY tangent of a sampled polyline at a given arc length, oriented
    in the direction of increasing arc length."""
    total = sum(distance(samples[i], samples[i + 1]) for i in range(len(samples) - 1))
    a = point_at_arc_length(samples, max(0.0, target_cm - window_cm))
    b = point_at_arc_length(samples, min(total, target_cm + window_cm))
    dx, dy = b[0] - a[0], b[1] - a[1]
    norm = math.hypot(dx, dy) or 1.0
    return dx / norm, dy / norm


def bezier_segments(track: Track):
    """The track spline as cubic-bezier control points in world XY, using the
    Hermite tangent/3 rule: [x0, y0] followed by [c1x, c1y, c2x, c2y, x, y]
    per segment. Returns None for degenerate tracks."""
    points = track.points_world
    leave = track.leave_tangents_local
    arrive = track.arrive_tangents_local
    if len(points) < 2:
        return None
    flat = [points[0][0], points[0][1]]
    for i in range(len(points) - 1):
        p0, p1 = points[i], points[i + 1]
        t_leave = leave[i] if i < len(leave) else [0, 0, 0]
        t_arrive = arrive[i + 1] if i + 1 < len(arrive) else [0, 0, 0]
        flat.extend([
            p0[0] + t_leave[0] / 3.0, p0[1] + t_leave[1] / 3.0,
            p1[0] - t_arrive[0] / 3.0, p1[1] - t_arrive[1] / 3.0,
            p1[0], p1[1],
        ])
    return flat


def compass_dir(from_pos, to_pos) -> str:
    """Compass direction of to_pos seen from from_pos (pt-BR names)."""
    angle = bearing_deg(to_pos[0] - from_pos[0], to_pos[1] - from_pos[1])
    return COMPASS_PT[int((angle + 22.5) // 45) % 8]
