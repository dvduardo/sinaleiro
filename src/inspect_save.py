#!/usr/bin/env python3
"""Ad-hoc inspection script: dump railroad-related actors/components from a
Satisfactory .sav file so we can learn the real data shapes before writing
graph.py / signal_rules.py.

Usage: python3 src/inspect_save.py /path/to/save.sav [output.txt]
"""
import os
import sys

VENDOR_DIR = os.path.join(os.path.dirname(__file__), "..", "vendor", "sat_sav_parse")
sys.path.insert(0, VENDOR_DIR)

import sav_parse  # noqa: E402


def matches(type_path: str) -> bool:
    needle = type_path.lower()
    return "railroad" in needle or "signal" in needle or "train" in needle


def main():
    if len(sys.argv) < 2:
        print("Usage: python3 src/inspect_save.py /path/to/save.sav [output.txt]")
        sys.exit(1)

    save_path = sys.argv[1]
    out_path = sys.argv[2] if len(sys.argv) > 2 else None
    out = open(out_path, "w") if out_path else sys.stdout

    parsed = sav_parse.readFullSaveFile(save_path)

    seen_type_paths = {}
    for level in parsed.levels:
        headers = level.actorAndComponentObjectHeaders
        objects = level.objects
        for header, obj in zip(headers, objects):
            type_path = getattr(header, "typePath", None) or getattr(header, "className", None)
            if not type_path or not matches(type_path):
                continue
            seen_type_paths[type_path] = seen_type_paths.get(type_path, 0) + 1

    out.write("=== Distinct railroad/signal/train-related type paths and counts ===\n")
    for type_path, count in sorted(seen_type_paths.items(), key=lambda kv: -kv[1]):
        out.write(f"{count:5d}  {type_path}\n")

    out.write("\n=== First instance of each type path (full detail) ===\n")
    printed = set()
    for level in parsed.levels:
        headers = level.actorAndComponentObjectHeaders
        objects = level.objects
        for header, obj in zip(headers, objects):
            type_path = getattr(header, "typePath", None) or getattr(header, "className", None)
            if not type_path or not matches(type_path) or type_path in printed:
                continue
            printed.add(type_path)
            out.write(f"\n--- {type_path} ---\n")
            out.write(f"header: {header}\n")
            props = getattr(obj, "properties", None)
            if props:
                for name, value in props:
                    out.write(f"  {name} = {value!r}\n")
            actor_specific = getattr(obj, "actorSpecificInfo", None)
            if actor_specific is not None:
                out.write(f"  actorSpecificInfo = {actor_specific!r}\n")

    if out_path:
        out.close()
        print(f"Wrote inspection dump to {out_path}")


if __name__ == "__main__":
    main()
