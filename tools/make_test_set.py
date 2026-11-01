"""Build and evaluate an INDEPENDENT test set from new recordings.

1. Record new sessions with the webcam (not used for training, ever):

       python collect_data.py --person <name> --lighting <day|night>

   Keys 1-9 choose a sign, SPACE records one session, Q quits. Record every sign at least twice.
   For "idle" (key 0) record several sessions of what must NOT count as a sign: hands down, an OK
   sign, an open hand, a claw, random movements.

2. Put that session's recordings in the TEST set and evaluate them:

       python tools/make_test_set.py --since "2026-11-01 12:00"

   Every recording made at or after that time goes to the test set BY HAND ("manual" in
   data/splits.json), so the automatic quotas can never send it to training, and train.py never
   learns from it. A recording the installed landmark model was trained on is refused. Then
   evaluate.py runs on those recordings only: per-sign precision, recall, F1, support and the
   confusion matrix (YOLOX, landmark model and the fused decision) go to reports/<time>/.

Options: --dry-run (show what would happen), --no-eval (only assign), --min-per-sign N (coverage
warning threshold, default 2), --exclude ID[,ID] and --exclude-from LOG (leave out recordings, e.g. the
ones tools/record_test_session.py marked "rejected" in its session log: they stay unassigned, so
train.py ignores them too).
"""

import argparse
import json
import subprocess
import sys
from collections import Counter
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))                       # run as a plain script from tools/
import splits as S  # noqa: E402
from shinobi import config  # noqa: E402
import numpy as np  # noqa: E402


def trained_on():
    """Recordings the installed landmark model learned from (they can never be test data)."""
    path = config.MODEL_PATH if hasattr(config, "MODEL_PATH") else ROOT / "models" / "gesture_model.joblib"
    if not Path(path).exists():
        return set()
    import joblib
    bundle = joblib.load(path)
    return set(bundle.get("train_sessions", [])) | set(bundle.get("validation_sessions", []))


def hands_share(rec):
    """Share of the recording's frames in which MediaPipe saw a hand."""
    with np.load(config.DATA_DIR / rec.path) as d:
        present = d["present"]
    return float(present.reshape(len(present), -1).any(axis=1).mean()) if len(present) else 0.0


def when(rec):
    try:
        return datetime.fromisoformat(f"{rec.date}T{rec.time}")
    except ValueError:
        return None


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--since", required=True, help='"YYYY-MM-DD HH:MM": recordings made at or after this time')
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--no-eval", action="store_true")
    parser.add_argument("--min-per-sign", type=int, default=2)
    parser.add_argument("--exclude", default="", help="recording ids to leave out (comma list)")
    parser.add_argument("--exclude-from", action="append", default=[],
                        help="a session log of tools/record_test_session.py: its 'rejected' ids are left out")
    args = parser.parse_args()
    excluded = {x.strip() for x in args.exclude.split(",") if x.strip()}
    for log in args.exclude_from:
        excluded |= {r["id"] for r in json.loads(Path(log).read_text(encoding="utf-8")).get("rejected", [])}
    since = datetime.fromisoformat(args.since.replace(" ", "T"))

    recordings, _, notes = S.scan(config.DATA_DIR)
    for note in notes:
        print("note:", note)
    chosen = [r for r in recordings if (w := when(r)) is not None and w >= since]
    if not chosen:
        print(f"No recording made at or after {since:%Y-%m-%d %H:%M}. Record with collect_data.py first.")
        return 1
    used = trained_on()
    refused = [r for r in chosen if r.id in used]
    chosen = [r for r in chosen if r.id not in used]
    for r in refused:
        print(f"REFUSED {r.id}: the installed model was trained / selected on it")
    for r in [r for r in chosen if r.id in excluded]:
        print(f"EXCLUDED {r.id} ({r.group}): asked to leave it out (stays unassigned, never trained on)")
    chosen = [r for r in chosen if r.id not in excluded]

    splits = S.load()
    moved = []
    for r in chosen:
        before = splits["sessions"].get(r.id, {}).get("set")
        if before != "test":
            moved.append((r.id, before))
        if not args.dry_run:
            S.assign(splits, recordings, r.id, "test")
    if not args.dry_run:
        S.save(S.check(splits))

    print(f"\nIndependent test set: {len(chosen)} recording(s) made since {since:%Y-%m-%d %H:%M}"
          + (" (dry run, nothing written)" if args.dry_run else ""))
    hands = {r.id: hands_share(r) for r in chosen if r.kind == "single"}
    for r in sorted(chosen, key=lambda r: (r.date, r.time)):
        before = splits["sessions"].get(r.id, {}).get("set") if args.dry_run else dict(moved).get(r.id)
        share = f"hands in {hands[r.id]:4.0%} of frames" if r.id in hands else ""
        print(f"  {r.id}  {r.group:14s} {share}  ({before or 'new'} -> test)")
    per_label = Counter(r.group for r in chosen if r.kind == "single")
    print("\nCoverage (single-sign sessions):")
    missing = []
    for label in config.GESTURES:
        n = per_label.get(label, 0)
        mark = "" if n >= args.min_per_sign else "   <- record more"
        if n < args.min_per_sign:
            missing.append(label)
        print(f"  {label:14s} {n}{mark}")
    if missing:
        print(f"\nFewer than {args.min_per_sign} sessions for: {', '.join(missing)}. Their numbers will be weak.")

    if args.dry_run or args.no_eval:
        return 0
    cmd = [sys.executable, str(ROOT / "evaluate.py"), "run", "--sets", "test",
           "--sessions", ",".join(r.id for r in chosen),
           "--title", f"Independent test set: {len(chosen)} new recordings made since {since:%Y-%m-%d %H:%M}"]
    print("\nRunning:", " ".join(cmd))
    return subprocess.call(cmd, cwd=ROOT)


if __name__ == "__main__":
    sys.exit(main())
