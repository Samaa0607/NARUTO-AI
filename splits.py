"""Train / validation / test sets by RECORDING, kept in data/splits.json.

Run:  python evaluate.py splits                       assign new recordings, print the table
      python evaluate.py splits --assign ID=test      move one recording by hand

One unit = one recording: a single-sign session (data/landmarks/<sign>/<id>.npz) or a guided
sequence take (data/sequences/<jutsu>/<id>.npz). The frames of one recording always stay
together: neighbouring frames are near-copies, so splitting them would leak test into training.

Rules for NEW recordings (assigned ones never move by themselves, hand edits are kept):
  * per sign (takes: per jutsu + kind) fill train first, then test, then validation, up to the
    quotas; after that keep the same proportions;
  * a test recording must come from a day + lighting that no train recording of the same sign
    uses (a take: no train take of its group and no train session of its jutsu's signs), and a
    recording from a test day + lighting never goes to train;
  * old labels are translated with config.LEGACY_LABELS like train.py does; labels that are no
    longer signs are listed as ignored and never used.
The key in the file is the recording id (file name without .npz), so a moved file keeps its set.
Nothing here ever writes, moves or deletes a recording: only data/splits.json is written.
"""

import json
import os
import re
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path

import numpy as np

from shinobi import config

SETS = ("train", "validation", "test")
FILL_ORDER = ("train", "test", "validation")      # minimum quotas are filled in this order
FORMAT = "shinobi-splits-v1"
DEFAULT_PATH = config.DATA_DIR / "splits.json"
# Single-sign sessions: the plan is 3 train / 1 validation / 1 test per sign. Takes are not used
# for training yet (train.py reads single-sign sessions only), so by default they are split
# between validation and test; change it with --take-quota and only NEW takes follow.
QUOTAS = {"single": {"train": 3, "validation": 1, "test": 1},
          "take": {"train": 0, "validation": 1, "test": 1}}
ABOUT = ("One entry per recording (key = file name without .npz). 'set' is train, validation or "
         "test. Entries never move by themselves: edit 'set' by hand or run "
         "'python evaluate.py splits --assign ID=SET'. Delete an entry to have it assigned again.")
_STAMP = re.compile(r"(\d{8})_(\d{6})$")           # ..._YYYYMMDD_HHMMSS at the end of every id


class SplitsError(ValueError):
    """data/splits.json is broken or the recordings contradict it."""


@dataclass
class Recording:
    id: str              # file name without .npz: the key in splits.json
    kind: str            # "single" (one sign held) or "take" (a guided 4-step sequence)
    group: str           # sign (after LEGACY_LABELS) or "<jutsu>/<kind of take>"
    label: str           # label (single) or jutsu (take) as stored in the file
    path: str            # relative to the data folder, with "/"
    person: str = ""
    lighting: str = ""
    date: str = ""       # YYYY-MM-DD ("" if unknown)
    time: str = ""       # HH:MM:SS
    signs: tuple = ()    # takes: the signs of the jutsu (their train sessions matter for the test rule)

    @property
    def condition(self):
        """(date, lighting): two recordings with the same condition were made the same day in the same light."""
        return (self.date, self.lighting) if self.date and self.lighting else None


# ---------------------------------------------------------------- reading the recordings

def read_meta(path):
    """Only the small JSON 'meta' entry of a recording (the frames are not decompressed)."""
    with np.load(path) as d:
        return json.loads(str(d["meta"]))


def _when(stem, meta):
    m = _STAMP.search(stem)
    if m:
        d, t = m.groups()
        return f"{d[:4]}-{d[4:6]}-{d[6:]}", f"{t[:2]}:{t[2:4]}:{t[4:]}"
    created = str(meta.get("created", ""))         # takes also store an ISO time
    if "T" in created:
        d, t = created.split("T", 1)
        return d, t[:8]
    return "", ""


def _recording(path, data_dir, kind, group, label, meta, signs=()):
    date, time = _when(path.stem, meta)
    return Recording(path.stem, kind, group, label, path.relative_to(data_dir).as_posix(),
                     str(meta.get("person", "")), str(meta.get("lighting", "")).strip().lower(),
                     date, time, tuple(signs))


def scan(data_dir=config.DATA_DIR):
    """Every recording on disk -> (recordings, ignored, notes). Reads only the meta of each file.

    ignored: recordings whose label is no longer a sign (kept on disk, never used).
    notes: things worth a warning (unreadable file, folder name different from the stored label).
    """
    data_dir = Path(data_dir)
    recordings, ignored, notes = [], [], []
    for path in sorted((data_dir / "landmarks").glob("*/*.npz")):
        rel = path.relative_to(data_dir).as_posix()
        try:
            meta = read_meta(path)
        except Exception as e:                      # a broken file must not stop the others
            notes.append(f"cannot read {rel}: {e}")
            continue
        stored = str(meta.get("label", path.parent.name))
        sign = config.LEGACY_LABELS.get(stored, stored)          # old name -> current sign (like train.py)
        if stored != path.parent.name:
            notes.append(f"{rel}: the file says '{stored}' but lies in folder '{path.parent.name}' "
                         f"(the label inside the file is used, like train.py)")
        if sign not in config.GESTURES:
            ignored.append({"id": path.stem, "path": rel, "label": stored,
                            "reason": f"'{stored}' is not a sign any more (not in config.GESTURES "
                                      f"or config.LEGACY_LABELS)"})
            continue
        recordings.append(_recording(path, data_dir, "single", sign, stored, meta))
    for path in sorted((data_dir / "sequences").glob("*/*.npz")):
        rel = path.relative_to(data_dir).as_posix()
        try:
            meta = read_meta(path)
        except Exception as e:
            notes.append(f"cannot read {rel}: {e}")
            continue
        jutsu, kind = str(meta.get("jutsu", path.parent.name)), str(meta.get("kind", "unknown"))
        if jutsu not in config.JUTSU:
            ignored.append({"id": path.stem, "path": rel, "label": jutsu,
                            "reason": f"jutsu '{jutsu}' is not in config.JUTSU any more"})
            continue
        recordings.append(_recording(path, data_dir, "take", f"{jutsu}/{kind}", jutsu, meta,
                                     config.JUTSU[jutsu]["sequence"]))
    seen = {}
    for r in recordings:
        if r.id in seen:
            raise SplitsError(f"two recordings have the same id '{r.id}': {seen[r.id]} and {r.path}. "
                              f"The id is the key in splits.json, so rename one of them first.")
        seen[r.id] = r.path
    return recordings, ignored, notes


# ---------------------------------------------------------------- the file

def _no_duplicate_keys(pairs):
    out = {}
    for key, value in pairs:
        if key in out:
            raise SplitsError(f"'{key}' appears twice in splits.json: a recording can be in one set only")
        out[key] = value
    return out


def check(splits, where="splits.json"):
    """Raise SplitsError if the content cannot be trusted."""
    if not isinstance(splits, dict) or splits.get("format") != FORMAT:
        raise SplitsError(f"{where}: not a splits file (expected \"format\": \"{FORMAT}\")")
    sessions = splits.get("sessions")
    if not isinstance(sessions, dict):
        raise SplitsError(f"{where}: \"sessions\" must be an object {{id: {{\"set\": ...}}}}")
    for rid, entry in sessions.items():
        if not isinstance(entry, dict) or entry.get("set") not in SETS:
            raise SplitsError(f"{where}: '{rid}' has set {entry.get('set') if isinstance(entry, dict) else entry!r}; "
                              f"use one of {', '.join(SETS)}")
    return splits


def load(path=DEFAULT_PATH):
    """The splits dict, or None when the file does not exist. Raises SplitsError when it is broken."""
    path = Path(path)
    if not path.exists():
        return None
    try:
        splits = json.loads(path.read_text(encoding="utf-8"), object_pairs_hook=_no_duplicate_keys)
    except json.JSONDecodeError as e:
        raise SplitsError(f"{path} is not valid JSON ({e}). Fix it by hand; nothing was changed.") from e
    return check(splits, str(path))


def save(splits, path=DEFAULT_PATH):
    """Write the file in one go (a crash never leaves half a file)."""
    path = Path(path)
    check(splits, str(path))
    tmp = path.with_name(path.name + ".tmp")
    tmp.write_text(json.dumps(splits, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    os.replace(tmp, path)


def set_of(splits):
    """{recording id: set}."""
    return {rid: entry["set"] for rid, entry in splits["sessions"].items()} if splits else {}


# ---------------------------------------------------------------- assigning

def _info(rid, entry, by_id):
    """(kind, group, condition) of an assigned recording: from the file on disk, else from the entry."""
    r = by_id.get(rid)
    if r is not None:
        return r.kind, r.group, r.condition
    cond = (entry.get("date"), entry.get("lighting")) if entry.get("date") and entry.get("lighting") else None
    return entry.get("kind", "single"), entry.get("group", "?"), cond


def conditions(sessions, by_id):
    """{(kind, group): {set: [condition of each recording in that set]}}."""
    out = {}
    for rid, entry in sessions.items():
        kind, group, cond = _info(rid, entry, by_id)
        out.setdefault((kind, group), {s: [] for s in SETS})[entry["set"]].append(cond)
    return out


def train_conditions(rec_kind, group, signs, conds):
    """Day + lighting conditions a test recording of this group must avoid."""
    out = set(conds.get((rec_kind, group), {}).get("train", []))
    for sign in signs:                                  # a take: the classifier trained on these signs
        out |= set(conds.get(("single", sign), {}).get("train", []))
    out.discard(None)
    return out


def choose_set(rec, conds, quota):
    """The set for one NEW recording, given the conditions of the recordings already assigned."""
    mine = conds.get((rec.kind, rec.group), {s: [] for s in SETS})
    c = rec.condition
    allowed = {
        "train": c is None or c not in set(mine["test"]),       # never train on a test day + light
        "test": c is not None and c not in train_conditions(rec.kind, rec.group, rec.signs, conds),
        "validation": True,
    }
    n = {s: len(mine[s]) for s in SETS}
    for s in FILL_ORDER:                                        # minimum quotas: train, test, validation
        if allowed[s] and n[s] < quota[s]:
            return s
    options = [s for s in FILL_ORDER if allowed[s] and quota[s] > 0]
    if not options:
        return "validation"
    return min(options, key=lambda s: n[s] / quota[s])          # keep the proportions (ties: fill order)


def _sort_key(item, by_id):
    rid, entry = item
    kind, group, _ = _info(rid, entry, by_id)
    sign = group.split("/")[0]
    order = config.GESTURES.index(sign) if sign in config.GESTURES else len(config.GESTURES)
    return (kind != "single", order, group, entry.get("date", ""), entry.get("time", ""), rid)


def entry_for(rec, set_name, how, now):
    return {"set": set_name, "kind": rec.kind, "group": rec.group, "label": rec.label, "path": rec.path,
            "person": rec.person, "lighting": rec.lighting, "date": rec.date, "time": rec.time,
            "assigned_by": how, "assigned_on": now}


def update(existing, recordings, ignored=(), quotas=None, now=None):
    """Assign every recording that is not in `existing` yet -> (new splits dict, ids assigned now).

    Existing entries are copied unchanged, whatever they say (sticky; hand edits win).
    """
    now = now or datetime.now().isoformat(timespec="seconds")
    quotas = quotas or (existing or {}).get("quotas") or QUOTAS
    sessions = {rid: dict(entry) for rid, entry in (existing or {}).get("sessions", {}).items()}
    by_id = {r.id: r for r in recordings}
    new = sorted((r for r in recordings if r.id not in sessions), key=lambda r: (r.date, r.time, r.id))
    for rec in new:                                             # oldest first, one at a time
        target = choose_set(rec, conditions(sessions, by_id), quotas.get(rec.kind, QUOTAS[rec.kind]))
        sessions[rec.id] = entry_for(rec, target, "auto", now)
    splits = {
        "format": FORMAT, "about": ABOUT, "quotas": quotas, "updated": now,
        "sessions": dict(sorted(sessions.items(), key=lambda item: _sort_key(item, by_id))),
        "ignored": {i["id"]: {k: v for k, v in i.items() if k != "id"} for i in ignored},
    }
    return check(splits), [r.id for r in new]


def assign(splits, recordings, rid, set_name, now=None):
    """Put one recording in a set by hand (marked 'manual'). Returns the previous set or None."""
    if set_name not in SETS:
        raise SplitsError(f"unknown set '{set_name}': use one of {', '.join(SETS)}")
    by_id = {r.id: r for r in recordings}
    if rid not in by_id and rid not in splits["sessions"]:
        raise SplitsError(f"no recording with id '{rid}' (ids are file names without .npz)")
    now = now or datetime.now().isoformat(timespec="seconds")
    old = splits["sessions"].get(rid)
    entry = dict(old) if old else entry_for(by_id[rid], set_name, "manual", now)
    entry.update({"set": set_name, "assigned_by": "manual", "assigned_on": now})
    splits["sessions"][rid] = entry
    return old["set"] if old else None


# ---------------------------------------------------------------- checks and the printed table

def _fmt_cond(cond):
    return f"{cond[1]} {cond[0]}" if cond else "unknown day/light"


def review(splits, recordings, notes=()):
    """Per group: counts, conditions and warnings -> (rows, warnings). Nothing is changed."""
    by_id = {r.id: r for r in recordings}
    conds = conditions(splits["sessions"], by_id)
    quotas = splits.get("quotas", QUOTAS)
    rows, warnings = [], list(notes)

    for rid, entry in splits["sessions"].items():
        if rid not in by_id:
            warnings.append(f"{rid} ({entry.get('path', '?')}) is in splits.json but its file is gone. "
                            f"It stays in the file; delete the entry by hand if that was on purpose.")
    groups = [("single", g) for g in config.GESTURES]
    groups += sorted(k for k in conds if k not in groups)        # takes, and signs no longer in GESTURES
    for kind, group in groups:
        sets = conds.get((kind, group), {s: [] for s in SETS})
        quota = quotas.get(kind, QUOTAS["single"])
        counts = {s: len(sets[s]) for s in SETS}
        missing = {s: max(0, quota[s] - counts[s]) for s in SETS}
        signs = config.JUTSU.get(group.split("/")[0], {}).get("sequence", ()) if kind == "take" else ()
        avoid = train_conditions(kind, group, signs, conds)
        clash = [c for c in sets["test"] if c is not None and c in avoid]
        unknown = sum(1 for s in SETS for c in sets[s] if c is None)
        rows.append({"kind": kind, "group": group, "counts": counts, "missing": missing,
                     "conditions": {s: sorted({_fmt_cond(c) for c in sets[s]}) for s in SETS},
                     "test_clash": bool(clash)})
        name = group if kind == "single" else f"take {group}"
        if sum(counts.values()) == 0:
            if kind == "single":
                warnings.append(f"{name}: no recordings at all. Record {quota['train']} train, "
                                f"{quota['validation']} validation and {quota['test']} test session(s).")
            continue
        if any(missing.values()):
            have = ", ".join(f"{counts[s]} {s}" for s in SETS)
            plan = "/".join(str(quota[s]) for s in SETS)
            todo = [f"{missing[s]} {s}" for s in ("train", "validation") if missing[s]]
            if missing["test"]:
                light = ", ".join(_fmt_cond(c) for c in sorted(avoid)) or "its train recordings"
                todo.append(f"{missing['test']} test recorded on a day or in lighting different from {light}")
            warnings.append(f"{name}: has {have} (plan {plan}). Still to record: {'; then '.join(todo)}. "
                            f"Until then it has no complete honest evaluation.")
        if clash:
            warnings.append(f"{name}: a test recording shares day + lighting ({', '.join(map(_fmt_cond, clash))}) "
                            f"with training data, so its test numbers will look better than reality.")
        if unknown:
            warnings.append(f"{name}: {unknown} recording(s) have no day or lighting in their name/meta, "
                            f"so they can never be chosen as test automatically.")
    return rows, warnings


def table(splits, recordings, ignored=(), new_ids=(), notes=(), path=DEFAULT_PATH, listing=False):
    """The text printed by `python evaluate.py splits`."""
    rows, warnings = review(splits, recordings, notes)
    quotas = splits.get("quotas", QUOTAS)
    q = quotas["single"]
    out = [f"SPLITS  {path}", f"unit = one recording, never split. Quotas per sign: train {q['train']} / "
           f"validation {q['validation']} / test {q['test']} (test from another day or lighting).", ""]
    header = f"{'sign':<16}{'train':<24}{'validation':<24}{'test':<24}status"
    out += ["SINGLE-SIGN SESSIONS  (data/landmarks)", header, "-" * len(header)]

    def cell(row, s):
        n = row["counts"][s]
        return f"{n}  {', '.join(row['conditions'][s])}" if n else "0"

    def status(row):
        gaps = [f"{m} {s}" for s, m in row["missing"].items() if m]
        text = "ok" if not gaps else "needs " + ", ".join(gaps)
        return text + ("  (test shares day+light with train!)" if row["test_clash"] else "")

    for row in rows:
        if row["kind"] == "single":
            out.append(f"{row['group']:<16}{cell(row, 'train'):<24}{cell(row, 'validation'):<24}"
                       f"{cell(row, 'test'):<24}{status(row)}")
    takes = [row for row in rows if row["kind"] == "take"]
    qt = quotas["take"]
    out += ["", f"SEQUENCE TAKES  (data/sequences; quotas per jutsu + kind: train {qt['train']} / "
                f"validation {qt['validation']} / test {qt['test']})"]
    if not takes:
        out.append("  none recorded yet (record them with record_sequences.py)")
    else:
        header = f"{'jutsu/kind':<26}{'train':<22}{'validation':<22}{'test':<22}status"
        out += [header, "-" * len(header)]
        for row in takes:
            out.append(f"{row['group']:<26}{cell(row, 'train'):<22}{cell(row, 'validation'):<22}"
                       f"{cell(row, 'test'):<22}{status(row)}")
    if ignored:
        out += ["", "IGNORED  (kept on disk, never used for training or evaluation)"]
        out += [f"  {i['path']:<48} {i['reason']}" for i in ignored]
    by_id = {r.id: r for r in recordings}
    if new_ids:
        out += ["", f"NEW: {len(new_ids)} recording(s) assigned now"]
        out += [f"  {rid:<44} {by_id[rid].group:<22} -> {splits['sessions'][rid]['set']}" for rid in new_ids]
    else:
        out += ["", "NEW: nothing (every recording already had a set)"]
    if listing:
        out += ["", "ALL RECORDINGS"]
        for rid, entry in splits["sessions"].items():
            r = by_id.get(rid)
            where = f"{r.group:<22} {_fmt_cond(r.condition):<24}" if r else f"{'(file missing)':<47}"
            out.append(f"  {entry['set']:<11} {rid:<44} {where} {entry.get('assigned_by', '')}")
    out += ["", "WARNINGS" if warnings else "WARNINGS: none"]
    out += [f"  ! {w}" for w in warnings]
    return "\n".join(out), warnings
