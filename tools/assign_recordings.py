"""Put the recordings KEPT in a training session into the train / validation set, by id.

Run:  python tools/assign_recordings.py --log reports/training_sessions/session1_<start>.json           (dry run)
      python tools/assign_recordings.py --log reports/training_sessions/session1_<start>.json --apply   (write)

Every recording goes to the set its session planned (sessions 1-2: train, session 3: validation),
BY HAND ("manual" in data/splits.json), so whole recordings are split, never frames. Nothing is
written if any recording is refused:
  * it already has a set, whatever set (existing entries never move; the test set is never touched);
  * it is listed in data/evaluation_exclusions.json;
  * its landmark or video file is missing, or the label on disk differs from the log;
  * the planned set is not train or validation.
After writing, every entry that existed before is checked to be exactly unchanged.
Never use `python evaluate.py splits` for this: it assigns recordings automatically.
"""

import argparse
import json
import sys
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
import splits as S  # noqa: E402
from shinobi import config  # noqa: E402

ALLOWED = ("train", "validation")


def excluded_ids(path):
    if not path.exists():
        return set()
    return set(json.loads(path.read_text(encoding="utf-8")).get("recordings", {}))


def check_plan(logs, splits, recordings, data_dir, excluded):
    """(plan [(id, label, set, log name)], problems [str]) for the 'saved' entries of the session logs."""
    by_id = {r.id: r for r in recordings}
    plan, problems, seen = [], [], set()
    for path, log in logs:
        for e in log.get("saved", []):
            rid, label, target = e["id"], e["label"], e.get("set") or log.get("set")
            where = f"{rid} ({label}, {path.name})"
            if rid in seen:
                problems.append(f"{where}: listed twice")
            elif target not in ALLOWED:
                problems.append(f"{where}: planned set '{target}' is not train or validation")
            elif rid in splits["sessions"]:
                problems.append(f"{where}: already in the {splits['sessions'][rid]['set']} set (never moved)")
            elif rid in excluded:
                problems.append(f"{where}: listed in evaluation_exclusions.json")
            elif rid not in by_id:
                problems.append(f"{where}: no landmark file on disk")
            elif by_id[rid].group != label:
                problems.append(f"{where}: the file on disk says '{by_id[rid].group}'")
            elif not (data_dir / "videos" / Path(by_id[rid].path).parent.name / f"{rid}.mp4").exists():
                problems.append(f"{where}: no video file on disk")
            else:
                plan.append((rid, label, target, path.name))
            seen.add(rid)
    return plan, problems


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--log", action="append", required=True, help="a session log of record_training_session.py")
    parser.add_argument("--apply", action="store_true", help="write data/splits.json (default: dry run)")
    parser.add_argument("--data", default=str(config.DATA_DIR))
    args = parser.parse_args(argv)
    data_dir = Path(args.data)
    splits_path = data_dir / "splits.json"

    recordings, _, notes = S.scan(data_dir)
    for note in notes:
        print("note:", note)
    splits = S.load(splits_path)
    if splits is None:
        print(f"{splits_path} does not exist: nothing to add to.")
        return 1
    before = json.loads(json.dumps(splits["sessions"]))
    logs = [(Path(p), json.loads(Path(p).read_text(encoding="utf-8"))) for p in args.log]
    plan, problems = check_plan(logs, splits, recordings, data_dir,
                                excluded_ids(data_dir / "evaluation_exclusions.json"))

    print(f"{len(plan)} recording(s) to assign" + ("" if args.apply else " (dry run, nothing written)"))
    for rid, label, target, log_name in plan:
        print(f"  {rid}  {label:14s} -> {target:10s} ({log_name})")
    if problems:
        print(f"\nREFUSED ({len(problems)}), so nothing is written:")
        for p in problems:
            print("  ", p)
        return 1

    counts = Counter((e.get("group"), e["set"]) for e in before.values() if e.get("kind", "single") == "single")
    counts.update((label, target) for _, label, target, _ in plan)
    print("\nRecordings per gesture after this (train / validation / test):")
    for g in config.GESTURES:
        print(f"  {g:14s} {counts[(g, 'train')]:3d} / {counts[(g, 'validation')]:3d} / {counts[(g, 'test')]:3d}")
    if not args.apply:
        print("\nDry run: nothing written. Add --apply to write data/splits.json.")
        return 0

    for rid, _, target, _ in plan:
        S.assign(splits, recordings, rid, target)
    S.save(S.check(splits), splits_path)
    after = S.load(splits_path)["sessions"]
    changed = [rid for rid, entry in before.items() if after.get(rid) != entry]
    wrong = [rid for rid, _, target, _ in plan if after.get(rid, {}).get("set") != target]
    if changed or wrong:
        raise SystemExit(f"CHECK FAILED: entries changed {changed}, not assigned {wrong}. "
                         f"Restore data/splits.json from the backup.")
    print(f"\nWritten: {len(plan)} added; all {len(before)} earlier entries unchanged.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
