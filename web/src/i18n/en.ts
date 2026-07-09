import type { Messages } from "./pt";

export const en: Messages = {
  "app.title": "Sinaleiro — railway signals for Satisfactory",
  "loading.screenAria": "Analyzing save",

  // landing.ts
  "landing.brand": "Sinaleiro",
  "landing.brandTag": "railway signal planner · unofficial",
  "landing.h1": "Your save goes in. A signal plan comes out.",
  "landing.lead": "We read your world's rail network, find every junction, and tell you exactly where to place Path and Block Signals — with coordinates and a reason.",
  "landing.dropAria": "Attach save file",
  "landing.dropTitle": "Drop your .sav file here",
  "landing.dropHint": "or click to browse · usually in %LocalAppData%/FactoryGame",
  "landing.dropHintFile": (mb: string) => `${mb} MB · click to change file`,
  "landing.modeAria": "Track mode",
  "landing.mode.mixed": "⇆ Mixed (automatic)",
  "landing.mode.bidirectional": "⇄ Bidirectional",
  "landing.mode.oneway": "→ One-way",
  "landing.modeNote.mixed": "// detected track by track: one-way gets one signal per post, bidirectional stretches the full pair",
  "landing.modeNote.bidirectional": "// each junction approach gets the Path + Block pair",
  "landing.modeNote.oneway": "// entries get a Path Signal, exits only Block — direction is inferred from your layout",
  "landing.cta": "Analyze network ▸",
  "landing.demoLink": "no save handy? see a demo network ▸",
  "landing.privacyLabel": "Privacy:",
  "landing.privacyText": "the analysis runs entirely in your browser — your save never leaves your machine.",
  "landing.footer": 'Fan project, not affiliated with Coffee Stain Studios. Map © Satisfactory.<br>Open to contributions — <a href="https://github.com/dvduardo/sinaleiro" target="_blank" rel="noopener">github.com/dvduardo/sinaleiro</a>.',
  "landing.invalidFile": (name: string) => `"${name}" is not a .sav file.`,
  "landing.error.invalid-save.title": "We couldn't read that file.",
  "landing.error.invalid-save.hint": "Check that it's a Satisfactory save (.sav) — usually in %LocalAppData%/FactoryGame/Saved/SaveGames.",
  "landing.error.no-rails.title": "The save was read, but it has no train tracks.",
  "landing.error.no-rails.hint": "Build a railway in your world and save again — then we'll have something to signal.",
  "landing.error.pyodide-load.title": "Failed to load the analysis engine.",
  "landing.error.pyodide-load.hint": "Check your connection and reload the page — the download only happens once.",
  "landing.error.internal.title": "Something went wrong during analysis.",
  "landing.error.internal.hint": "Try again; if it persists, the save may be too large for this device — try on desktop.",

  // loading.ts
  "loading.banner": "FICSIT OS v2.7 — railway module",
  "loading.received": (name: string, mb: string) => `save received: <b>${name}</b> (${mb} MB)`,
  "loading.progress": "Progress",
  "loading.stage.pyodide": "loading FICSIT railway module…",
  "loading.stage.bundle": "assembling the analysis pipeline…",
  "loading.stage.read": "reading the save file…",
  "loading.stage.parse": "unpacking and rebuilding the rail network…",
  "loading.stage.graph": "building the track and junction graph…",
  "loading.stage.directions": "inferring track direction from the layout…",
  "loading.stage.signals": "placing signals at each junction…",
  "loading.stage.serialize": "preparing the interactive map…",

  // results.ts
  "results.demoName": "demo network",
  "results.modeAria": "Track mode",
  "results.mode.mixed": "⇆ Mixed",
  "results.mode.bidirectional": "⇄ Bidirectional",
  "results.mode.oneway": "→ One-way",
  "results.export": "⭳ Checklist .txt",
  "results.new": "New save",
  "results.legend.junction": "Junction — click the pin to open the lens",
  "results.legend.path": "Existing signal (Path)",
  "results.legend.block": "Existing signal (Block)",
  "results.legend.station": "Station",
  "results.legend.bidirectional": "Bidirectional track (dashed = assumed)",
  "results.legend.stub": "Unfinished line",
  "results.reanalyzing": "recalculating signals…",
  "results.sidebarAria": "Installation plan",
  "results.stat.signals": "signals",
  "results.stat.junctions": "junctions",
  "results.stat.stations": "stations",
  "results.stat.oneway": "one-way",
  "results.stat.bidirectional": "bidirectional",
  "results.stat.assumed": "assumed",
  "results.stat.stubs": "unfinished",
  "results.stat.suspectJunctions": "suspect junctions",
  "results.stat.inferredHand": "direction inferred",
  "results.stat.ambiguous": "ambiguous",
  "results.stat.missing": "missing",
  "results.stat.retype": "review type",
  "results.stat.okDone": "already ok",
  "results.stat.lineSignals": "line signals",
  "results.trains.label": "Trains per line",
  "results.trains.aria": "How many trains each one-way run should hold",
  "results.trains.inSave": (n: number) => n === 1 ? "1 train in the save" : `${n} trains in the save`,
  "results.legend.lineSignal": "Suggested line signal (Block)",
  "results.legend.passingHint": "Passing-loop hint (long bidirectional)",

  // sidebar.ts
  "sidebar.title": "Installation plan",
  "sidebar.count": (n: number) => `of ${n} signals installed`,
  "sidebar.junction": (label: string, warn: boolean) => `Junction ${label}${warn ? " ⚠" : ""}`,
  "sidebar.nearStation": (name: string) => `near "${name}"`,
  "sidebar.noStation": "no station nearby",
  "sidebar.lupa": "Lens",
  "sidebar.checkAria": "Mark as placed",
  "sidebar.type.path": "Path",
  "sidebar.type.block": "Block",
  "sidebar.facing.entry": "facing the junction",
  "sidebar.facing.exit": "facing outward",
  "sidebar.bidirectionalSuffix": " (bidirectional stretch)",
  "sidebar.filterAria": "Filter recommendations by state",
  "sidebar.filter.all": "All",
  "sidebar.filter.missing": "➕ Missing",
  "sidebar.filter.retype": "⚠ Review",
  "sidebar.filter.ok": "✓ Ok",
  "sidebar.status.missing": "this arm has no signal",
  "sidebar.status.retype": (current: string, suggested: string) =>
    `you have a ${current} here; consider a ${suggested} — may be intentional`,
  "sidebar.status.ok": "you already have this signal — nothing to do",
  "sidebar.lineGroup": (n: number) => `Line signals (${n})`,
  "sidebar.lineRow": (run: number) => `Block Signal · run ${run}`,
  "sidebar.lineRowDetail": (block: number, arc: number) =>
    `resulting block ~${block} m · ${arc} m from the start of the run`,
  "sidebar.hintGroup": (n: number) => `Passing-loop hints (${n})`,
  "sidebar.hintRow": (m: number) =>
    `Bidirectional stretch of ${m} m — to cross trains, consider a passing loop; do not split it into blocks`,

  // lens.ts
  "lens.aria": "Junction lens",
  "lens.flag.oneway": "one-way",
  "lens.flag.stub": "unfinished arm",
  "lens.flag.crossing": "⚠ crossing",
  "lens.title": (label: string, n: number, flags: string) =>
    `Junction ${label} · ${n} ${n === 1 ? "signal" : "signals"}${flags ? " · " + flags : ""}`,
  "lens.near": (m: number, name: string) => `${m} m from "${name}"`,
  "lens.noStation": "no station nearby",
  "lens.copy": "copy X Y",
  "lens.copied": "copied ✓",
  "lens.closeAria": "Close panel",
  "lens.approachLabel": (dir: string) => dir,
  "lens.dim": (m: string) => `≈ ${m} m`,
  "lens.legend.path": "Path (green) — the arrow is the direction of the train that will read the signal: it points TOWARD the junction",
  "lens.legend.block.oneway": "Block (amber) on exits, pointing outward",
  "lens.legend.block.mixed": "Block (amber) — on one-way exits and on the bidirectional arm pair, pointing OUTWARD",
  "lens.legend.block.bidirectional": "Block (amber) — same post, opposite side of the track, pointing OUTWARD",
  "lens.step.where": (near: string) => `<b>Where:</b> go to the coordinate above${near}.`,
  "lens.step.whereNear": (m: number, name: string) => ` — ${m} m from the station "${name}"`,
  "lens.step.distance": (setback: string) => `<b>Distance:</b> on each arriving track, stop ≈${setback} m before the meeting point.`,
  "lens.step.onlyPath": "<b>Path only:</b> the whole crossing is a single block — no signal inside it; each entry gets a Path Signal facing the X.",
  "lens.step.oneway": "<b>One signal per post:</b> follow the arrows — the entry gets only the Path Signal (facing the junction) and each exit only the Block Signal (facing outward).",
  "lens.step.mixed": "<b>Per arm:</b> a one-way arm gets a single signal (follow the arrow); a bidirectional arm gets the Path + Block pair on the same post, one for each side.",
  "lens.step.bidirectional": "<b>Side and direction:</b> facing the junction, the <b>Path Signal</b> sits on your right, facing it. The <b>Block Signal</b> goes on the same post, on the other side of the track, facing outward.",
  "lens.note.crossing": "⚠ Junctions with 4+ approaches are the main deadlock risk — check that no train can stop on top of the crossing.",
  "lens.note.ambiguous": "The direction of one of the tracks couldn't be inferred — it falls back to the full Path + Block pair and the track shows dashed on the map. Check the layout.",
  "lens.note.assumed": "One of the arms has no direction evidence and was treated as bidirectional (dashed in the schematic and on the map) — the full pair is safe either way.",
  "lens.note.stub": (n: number) => n === 1
    ? "One arm of this junction is an unfinished line (gray on the map) and got no recommendation — connect the line and re-analyze."
    : `${n} arms of this junction are unfinished lines (gray on the map) and got no recommendation — connect the line and re-analyze.`,
  "lens.note.rightHand": "A rule the site already handles for you: in-game, a signal only applies to the train passing it on its right — that's why each side of the track has its own.",
  "lens.note.audit": (ok: number, retype: number) => {
    const parts: string[] = [];
    if (ok > 0) parts.push(`✓ ${ok} ${ok === 1 ? "signal is" : "signals are"} already in place (dimmed in the schematic)`);
    if (retype > 0) parts.push(`⚠ ${retype} ${retype === 1 ? "is" : "are"} of a different type — review (may be intentional)`);
    return parts.join(" · ") + ".";
  },

  // lens.ts — stretch lens (line signals)
  "lens.line.aria": "Stretch lens",
  "lens.line.title": (length: number) => `Line signal · ${length} m run`,
  "lens.line.dim": (m: string) => `block ≈ ${m} m`,
  "lens.line.scaleEnd": (m: number) => `${m} m`,
  "lens.line.legend.new": "Amber diamond — Block signal suggested on this run (the selected one gets the ring)",
  "lens.line.legend.existing": "Dimmed post — signal you already have on the run; it already bounds a block and was respected",
  "lens.line.step.where": (arc: number) => `<b>Where:</b> go to the coordinate above — ≈${arc} m past the start of the run, counting along the flow.`,
  "lens.line.step.type": "<b>Type:</b> use a <b>Block signal</b> — never place a Path signal on open track.",
  "lens.line.step.side": "<b>Side:</b> standing on the track facing the flow (animated dashes), the signal goes on your <b>right</b>.",
  "lens.line.note.block": (block: number, target: number) => `This signal closes a ≈${block} m block — that's what lets the run hold ${target} trains in a row without collision.`,
  "lens.line.note.ends": "The run's endpoints are junctions: their signals live in the junction list and are not shown here.",

  // mapView.ts
  "map.stationTitle": (name: string) => name,
  "map.existingSignal.path": "Existing signal (Path)",
  "map.existingSignal.block": "Existing signal (Block)",
  "map.lineSignal": (block: number) => `Suggested line signal (Block) — block ~${block} m`,
  "map.passingHint": (m: number) => `Bidirectional stretch of ${m} m — consider a passing loop`,

  // compass
  "compass": {
    norte: "north", nordeste: "northeast", leste: "east", sudeste: "southeast",
    sul: "south", sudoeste: "southwest", oeste: "west", noroeste: "northwest",
  },

  // export.ts
  "export.filename.mixed": "recommended_signals_mixed.txt",
  "export.filename.oneway": "recommended_signals_oneway.txt",
  "export.filename.bidirectional": "recommended_signals.txt",

  // report.ts (checklist .txt)
  "report.mode.mixed": "mixed (one-way and bidirectional detected per track)",
  "report.mode.oneway": "one-way (right-hand)",
  "report.mode.bidirectional": "bidirectional",
  "report.header.modeLine": (modeTxt: string) => `Mode: ${modeTxt}`,
  "report.header.counts": (total: number, path: number, block: number) =>
    `${total} recommended signals — ${path} Path Signal, ${block} Block Signal`,
  "report.header.tracksMixed": (oneway: number, biConfirmed: number, biAssumed: number, stub: number) =>
    `Tracks: ${oneway} one-way · ${biConfirmed} confirmed bidirectional · ${biAssumed} assumed bidirectional · ${stub} unfinished`,
  "report.header.directions": (known: number, total: number) =>
    `Directions: ${known}/${total} tracks inferred; ${total - known} ambiguous`,
  "report.station": (m: number, name: string) => `${m}m from '${name}'`,
  "report.noStation": "no station registered nearby",
  "report.line": (i: number, namePt: string, type: string, junction: string, role: string, x: number, y: number, z: number, station: string) =>
    `${String(i).padStart(3, " ")}. [${namePt} (${type}) · ${junction} · ${role}] X=${x} Y=${y} Z=${z}  (${station})`,
  "report.reason": (m: string) => `     reason: ${m}`,
  "report.reason.entry": (dir: string, label: string, degree: number) =>
    `${dir} entry of junction ${label} (${degree} tracks meet). Place it facing TOWARD the junction.`,
  "report.reason.exit": (dir: string, label: string) =>
    `${dir} exit of junction ${label} — closes the junction block and releases it as soon as the train clears it. Place at the same point, facing OUTWARD from the junction.`,
  "report.header.audit": (missing: number, retype: number, ok: number) =>
    `Audit of the signals you already have: ${missing} actually missing · ${retype} review type · ${ok} already done`,
  "report.status.ok": (name: string) => ` ALREADY DONE: you already have a ${name} here.`,
  "report.status.retype": (current: string, suggested: string, why: string) =>
    ` REVIEW: you already have a ${current} here; consider swapping to a ${suggested} — ${why}. May be intentional.`,
  "report.status.whyPath": "a Path Signal at the junction entry prevents deadlocks",
  "report.status.whyBlock": "a Block Signal at the exit is enough and releases the block sooner",
  "report.lineHeader": (target: number) =>
    `LINE SIGNALS — gap fill (target: ${target} trains per run):`,
  "report.lineNone": "  None needed: the existing blocks already hold the target.",
  "report.lineRow": (i: number, run: number, x: number, y: number, z: number, arc: number, block: number) =>
    `  ${String(i).padStart(3, " ")}. [Block Signal · run ${run}] X=${x} Y=${y} Z=${z} (${arc}m from the start; resulting block ~${block}m)`,
  "report.hintLine": (m: number, x: number, y: number) =>
    `  HINT: bidirectional stretch of ${m}m at X=${x} Y=${y} — to cross trains running opposite ways, consider a passing loop or double track; do not split it into blocks.`,
  "report.reason.ambiguousSuffix": " NOTE: this track's direction could not be inferred — treated as bidirectional; check the layout.",
  "report.reason.biConfirmedSuffix": " Bidirectional stretch (single track is mandatory): gets the full signal pair.",
  "report.reason.biAssumedSuffix": " Track with no direction evidence — treated as bidirectional; the full pair is the safe choice.",
  "report.assumedHeader": "ASSUMED BIDIRECTIONAL STRETCHES (no direction evidence — full pair applied):",
  "report.assumedLine": (track: string, where: string) => `  - track ${track} (${where})`,
  "report.ambiguousHeader": "AMBIGUOUS STRETCHES (direction not inferred — treated as bidirectional):",
  "report.ambiguousJunctionLine": (label: string, dir: string, track: string) =>
    `  - ${label}, ${dir} approach (track ${track}): 2 signals issued; check the layout`,
  "report.ambiguousOtherLine": (track: string, where: string) => `  - track ${track} (away from junctions, ${where})`,
  "report.approxStation": (m: number, name: string) => `~${m}m from '${name}'`,

  "role.entry": "entry",
  "role.exit": "exit",
  "signal.path": "Path Signal",
  "signal.block": "Block Signal",
};
