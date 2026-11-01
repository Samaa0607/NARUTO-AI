"""Train the gesture classifier from recorded sessions.

Run:  python train.py                    (cross-validation by session + final model)
      python train.py --test-person ali  (also report on a person never seen in training)

Splits are made by *session*, never by frame: frames of one recording are almost
identical, so mixing them between train and test would fake a high accuracy.

With data/splits.json (made by `python evaluate.py splits`): the model learns from the TRAIN
sessions only, the VALIDATION sessions choose between the models and are reported, and the
TEST sessions are never opened (they belong to evaluate.py). Without that file: as before.
"""

import argparse
import json
from datetime import datetime
from pathlib import Path

import joblib
import matplotlib
import numpy as np
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import classification_report, confusion_matrix, f1_score
from sklearn.model_selection import StratifiedGroupKFold
from sklearn.neural_network import MLPClassifier
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler

import splits as splits_file
from shinobi import config
from shinobi.features import FEATURE_SIZE, FEATURE_VERSION, extract, mirror

matplotlib.use("Agg")                     # save plots to file, no window
import matplotlib.pyplot as plt  # noqa: E402


def load_sessions(data_dir, step, only=None):
    """only: optional set of session ids (file names without .npz); other files are not even opened."""
    sessions = []
    for path in sorted(Path(data_dir).glob("*/*.npz")):
        if only is not None and path.stem not in only:
            continue
        d = np.load(path)
        meta = json.loads(str(d["meta"]))
        meta["label"] = config.LEGACY_LABELS.get(meta["label"], meta["label"])   # old name -> current sign
        if meta["label"] not in config.GESTURES:
            print(f"skip {path.name}: unknown label {meta['label']}")
            continue
        keep = d["present"].any(axis=1)                 # frames where at least one hand was found
        idx = np.flatnonzero(keep)[::step]              # every `step`-th frame: neighbours are near-duplicates
        sessions.append({**meta, "id": path.stem, "image_lm": d["image_lm"][idx], "world_lm": d["world_lm"][idx],
                         "present": d["present"][idx]})
    return sessions


def build(sessions, rng):
    """Features for original, mirrored and jittered copies of every frame."""
    X, X_mirror, X_jitter, y, groups, persons = [], [], [], [], [], []
    for s in sessions:
        label = config.GESTURES.index(s["label"])
        for img, wld, pres in zip(s["image_lm"], s["world_lm"], s["present"]):
            X.append(extract(img, wld, pres, s["aspect"]))
            X_mirror.append(extract(*mirror(img, wld, pres), s["aspect"]))
            noise_img = rng.normal(0, 0.004, img.shape) * pres[:, None, None]
            noise_wld = rng.normal(0, 0.002, wld.shape) * pres[:, None, None]
            X_jitter.append(extract(img + noise_img, wld + noise_wld, pres, s["aspect"]))
            y.append(label)
            groups.append(s["session"])
            persons.append(s["person"])
    return (np.array(X), np.array(X_mirror), np.array(X_jitter), np.array(y),
            np.array(groups), np.array(persons))


MODEL_TYPE = None   # --model-type: train only this one (None: compare both and pick, as before)


def make_models():
    models = {
        "random_forest": RandomForestClassifier(n_estimators=300, min_samples_leaf=2,
                                                class_weight="balanced", n_jobs=-1, random_state=0),
        "mlp": make_pipeline(StandardScaler(),
                             MLPClassifier(hidden_layer_sizes=(128, 64), alpha=1e-3, max_iter=400,
                                           early_stopping=True, random_state=0)),
    }
    return {k: v for k, v in models.items() if MODEL_TYPE in (None, k)}


def augmented(idx, X, X_mirror, X_jitter, y):
    """Training set = originals + mirrored + jittered copies of the same frames."""
    return np.vstack([X[idx], X_mirror[idx], X_jitter[idx]]), np.concatenate([y[idx]] * 3)


def save_confusion(cm, names, title, path, col_names=None):
    """names: true signs (rows); col_names: predicted signs (columns) if different from the rows."""
    cols = names if col_names is None else col_names
    fig, ax = plt.subplots(figsize=(6, 5) if col_names is None else (2.5 + 0.55 * len(cols), 2.0 + 0.45 * len(names)))
    ax.imshow(cm, cmap="Blues")
    ax.set_xticks(range(len(cols)), cols, rotation=45, ha="right")
    ax.set_yticks(range(len(names)), names)
    for i in range(len(names)):
        for j in range(len(cols)):
            ax.text(j, i, cm[i, j], ha="center", va="center",
                    color="white" if cm[i, j] > cm.max() / 2 else "black")
    ax.set_xlabel("predicted")
    ax.set_ylabel("true")
    ax.set_title(title)
    fig.tight_layout()
    fig.savefig(path, dpi=120)
    plt.close(fig)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--data", default=str(config.LANDMARKS_DIR))
    parser.add_argument("--out", default=str(config.GESTURE_MODEL_PATH))
    parser.add_argument("--step", type=int, default=2, help="use every n-th frame")
    parser.add_argument("--test-person", default=None, help="hold this person out as the final test")
    parser.add_argument("--splits", default=None,
                        help="train/validation/test file (default: splits.json next to the --data folder, "
                             "i.e. data/splits.json). If it does not exist, all sessions are used as before.")
    parser.add_argument("--model-type", choices=["random_forest", "mlp"], default=None,
                        help="train only this model (default: compare both and keep the better one)")
    args = parser.parse_args()
    global MODEL_TYPE
    MODEL_TYPE = args.model_type
    rng = np.random.default_rng(0)
    out_path = Path(args.out)
    out_path.parent.mkdir(parents=True, exist_ok=True)

    splits_path = Path(args.splits) if args.splits else Path(args.data).parent / "splits.json"
    if splits_path.exists():
        return train_with_splits(args, splits_path, rng, out_path)

    sessions = load_sessions(args.data, args.step)
    if not sessions:
        raise SystemExit(f"No sessions found in {args.data}. Record data with collect_data.py first.")
    X, X_mirror, X_jitter, y, groups, persons = build(sessions, rng)
    present_labels = sorted(set(y))
    names = [config.GESTURES[i] for i in present_labels]
    if config.GESTURES.index("idle") not in present_labels:
        raise SystemExit("You must record the 'idle' gesture: it teaches the model what NOT to react to.")

    print(f"{len(sessions)} sessions, {len(y)} frames, {X.shape[1]} features")
    for i in present_labels:
        n_sess = len(set(groups[y == i]))
        print(f"  {config.GESTURES[i]:12s} {np.sum(y == i):6d} frames  {n_sess} sessions")

    # Optional: completely unseen person = the most honest test.
    test_mask = persons == args.test_person if args.test_person else np.zeros(len(y), bool)
    if args.test_person and not test_mask.any():
        print(f"WARNING: no sessions from person '{args.test_person}' - held-out test skipped. "
              f"Known people: {sorted(set(persons))}")
    dev = np.flatnonzero(~test_mask)

    min_sessions = min(len(set(groups[dev][y[dev] == i])) for i in present_labels)
    if min_sessions < 2:
        raise SystemExit("Need at least 2 sessions per gesture for a fair (session-split) evaluation.")
    cv = StratifiedGroupKFold(n_splits=min(5, min_sessions), shuffle=True, random_state=0)

    report_lines, results = [], {}
    for name, model in make_models().items():
        oof = np.zeros(len(dev), dtype=int)               # out-of-fold predictions
        for tr, te in cv.split(X[dev], y[dev], groups[dev]):
            Xa, ya = augmented(dev[tr], X, X_mirror, X_jitter, y)
            model.fit(Xa, ya)
            oof[te] = model.predict(X[dev[te]])
        f1 = f1_score(y[dev], oof, labels=present_labels, average="macro", zero_division=0)
        results[name] = f1
        report = classification_report(y[dev], oof, labels=present_labels, target_names=names, digits=3,
                                       zero_division=0)
        cm = confusion_matrix(y[dev], oof, labels=present_labels)
        save_confusion(cm, names, f"{name} (session CV, macro-F1 {f1:.3f})",
                       out_path.parent / f"confusion_{name}.png")
        block = f"=== {name}: macro-F1 {f1:.3f} (cross-validation by session)\n{report}\n{cm}\n"
        print(block)
        report_lines.append(block)

    best = max(results, key=results.get)
    print(f"best model: {best}")
    model = make_models()[best]
    Xa, ya = augmented(dev, X, X_mirror, X_jitter, y)
    model.fit(Xa, ya)

    if test_mask.any():
        pred = model.predict(X[test_mask])
        f1 = f1_score(y[test_mask], pred, labels=present_labels, average="macro", zero_division=0)
        block = (f"=== held-out person '{args.test_person}': macro-F1 {f1:.3f}\n"
                 + classification_report(y[test_mask], pred, labels=present_labels,
                                         target_names=names, digits=3, zero_division=0))
        print(block)
        report_lines.append(block)

    labels = [config.GESTURES[c] for c in model.classes_]
    joblib.dump({"model": model, "model_name": best, "labels": labels,
                 "feature_version": FEATURE_VERSION, "cv_macro_f1": results,
                 "created": datetime.now().isoformat(timespec="seconds")}, out_path)
    (out_path.parent / "training_report.txt").write_text("\n".join(report_lines), encoding="utf-8")
    print(f"saved {out_path}")


# ---------------------------------------------------------------- training with data/splits.json

def features_only(sessions):
    """Original (not augmented) features and labels: what the model sees at run time."""
    X = [extract(img, wld, pres, s["aspect"]) for s in sessions
         for img, wld, pres in zip(s["image_lm"], s["world_lm"], s["present"])]
    y = [config.GESTURES.index(s["label"]) for s in sessions for _ in range(len(s["present"]))]
    return np.array(X, np.float32).reshape(len(y), FEATURE_SIZE), np.array(y, dtype=int)


def sessions_by_set(data_dir, splits):
    """Session files of data_dir per set, decided from their file names only (nothing is opened)."""
    sets, ignored = splits_file.set_of(splits), set(splits.get("ignored", {}))
    out = {"train": [], "validation": [], "test": [], "ignored": [], "unassigned": []}
    for path in sorted(Path(data_dir).glob("*/*.npz")):
        out[sets.get(path.stem) or ("ignored" if path.stem in ignored else "unassigned")].append(path)
    return out


def validation_block(title, y_true, pred, model_labels, out_png):
    """Classification report + confusion matrix on validation frames (only the signs it contains)."""
    labels = sorted(set(y_true))
    names = [config.GESTURES[i] for i in labels]
    f1 = f1_score(y_true, pred, labels=labels, average="macro", zero_division=0)
    cols = sorted(set(labels) | set(model_labels))
    cm = confusion_matrix(y_true, pred, labels=cols)[[cols.index(i) for i in labels]]
    if out_png is not None:
        save_confusion(cm, names, f"validation (macro-F1 {f1:.3f})", out_png,
                       col_names=[config.GESTURES[i] for i in cols])
    report = classification_report(y_true, pred, labels=labels, target_names=names, digits=3, zero_division=0)
    header = "rows = true sign, columns = predicted: " + " ".join(config.GESTURES[i] for i in cols)
    return f1, f"=== {title}: macro-F1 {f1:.3f}\n{report}\n{header}\n{cm}\n"


def train_with_splits(args, splits_path, rng, out_path):
    try:
        splits = splits_file.load(splits_path)
    except splits_file.SplitsError as e:
        raise SystemExit(f"{e}\nNothing was trained.")
    files = sessions_by_set(args.data, splits)
    lines = [f"splits: {splits_path}  (train = learn, validation = choose the model, test = never opened here)"]
    for set_name in ("train", "validation"):
        lines.append(f"  {set_name:<11}{len(files[set_name]):3d} sessions")
        lines += [f"      {p.parent.name:<14} {p.stem}" for p in files[set_name]]
    lines.append(f"  {'test':<11}{len(files['test']):3d} sessions held out for evaluate.py - not loaded")
    if files["ignored"]:
        lines.append(f"  {'ignored':<11}{len(files['ignored']):3d} sessions (labels that are not signs any more)")
    if files["unassigned"]:
        lines.append(f"  WARNING: {len(files['unassigned'])} session(s) are not in {splits_path.name} yet and are NOT "
                     f"used: {', '.join(p.stem for p in files['unassigned'])}")
        lines.append("           run `python evaluate.py splits` to give them a set, then train again.")
    print("\n".join(lines))
    report_lines = ["\n".join(lines)]

    train = load_sessions(args.data, args.step, only={p.stem for p in files["train"]})
    val = load_sessions(args.data, args.step, only={p.stem for p in files["validation"]})
    held_person = []
    if args.test_person:                                   # optional: also keep one person out of everything
        held_person = [s for s in train + val if s["person"] == args.test_person]
        train = [s for s in train if s["person"] != args.test_person]
        val = [s for s in val if s["person"] != args.test_person]
        if not held_person:
            print(f"WARNING: no train/validation sessions from person '{args.test_person}' - held-out test skipped.")
    if not train:
        raise SystemExit("No train sessions. Record data with collect_data.py and run `python evaluate.py splits`.")

    X, X_mirror, X_jitter, y, groups, _ = build(train, rng)
    present_labels = sorted(set(y))
    if config.GESTURES.index("idle") not in present_labels:
        raise SystemExit("You must record the 'idle' gesture (and have it in train): it teaches the model "
                         "what NOT to react to.")
    Xv, yv = features_only(val)
    print(f"train: {len(train)} sessions, {len(y)} frames, {X.shape[1]} features | "
          f"validation: {len(val)} sessions, {len(yv)} frames")
    for i in sorted(set(present_labels) | set(yv)):
        print(f"  {config.GESTURES[i]:14s} train {np.sum(y == i):5d} frames {len(set(groups[y == i])):2d} sessions"
              f"   validation {np.sum(yv == i):5d} frames")

    # 1) choose the model: on validation if it has every trained sign, else session-CV on train only
    results, fitted, selection = {}, {}, "default"
    every = np.arange(len(y))
    min_sessions = min(len(set(groups[y == i])) for i in present_labels)
    if len(yv) and set(present_labels) <= set(yv):
        selection = "validation"
        for name, model in make_models().items():
            model.fit(*augmented(every, X, X_mirror, X_jitter, y))
            fitted[name] = model
            results[name], _ = validation_block(name, yv, model.predict(Xv), present_labels, None)
            line = f"=== {name}: macro-F1 {results[name]:.3f} on validation sessions"
            print(line)
            report_lines.append(line)
    elif min_sessions >= 2:
        selection = "cv"
        missing = [config.GESTURES[i] for i in present_labels if i not in set(yv)]
        print(f"validation lacks {missing}: choosing the model by session cross-validation on TRAIN only")
        cv = StratifiedGroupKFold(n_splits=min(5, min_sessions), shuffle=True, random_state=0)
        for name, model in make_models().items():
            oof = np.zeros(len(y), dtype=int)
            for tr, te in cv.split(X, y, groups):
                model.fit(*augmented(tr, X, X_mirror, X_jitter, y))
                oof[te] = model.predict(X[te])
            results[name] = f1_score(y, oof, labels=present_labels, average="macro", zero_division=0)
            block = f"=== {name}: macro-F1 {results[name]:.3f} (cross-validation by session, train sessions only)\n"
            print(block)
            report_lines.append(block)
    else:
        msg = ("WARNING: the models cannot be compared fairly yet (validation does not have every sign and some "
               "signs have only 1 train session). Using the default model; record more sessions.")
        print(msg)
        report_lines.append(msg)
    best = max(results, key=results.get) if results else next(iter(make_models()))
    print(f"model: {best} (chosen by: {selection})")

    # 2) final model: TRAIN sessions only, so validation stays an honest check (and can tune fusion)
    model = fitted.get(best)
    if model is None:
        model = make_models()[best]
        model.fit(*augmented(every, X, X_mirror, X_jitter, y))
    val_f1 = None
    if len(yv):
        val_f1, block = validation_block(f"final {best} on VALIDATION sessions (not used for training)", yv,
                                         model.predict(Xv), present_labels, out_path.parent / "confusion_validation.png")
        print(block)
        report_lines.append(block)
    if held_person:
        Xp, yp = features_only(held_person)
        _, block = validation_block(f"held-out person '{args.test_person}'", yp, model.predict(Xp), present_labels, None)
        print(block)
        report_lines.append(block)

    labels = [config.GESTURES[c] for c in model.classes_]
    joblib.dump({"model": model, "model_name": best, "labels": labels,
                 "feature_version": FEATURE_VERSION, "cv_macro_f1": results if selection == "cv" else {},
                 "selection": selection, "selection_macro_f1": results, "validation_macro_f1": val_f1,
                 "splits_file": str(splits_path),
                 "train_sessions": sorted(s["id"] for s in train),
                 "validation_sessions": sorted(s["id"] for s in val),
                 "held_out_person": args.test_person,
                 "created": datetime.now().isoformat(timespec="seconds")}, out_path)
    (out_path.parent / "training_report.txt").write_text("\n".join(report_lines), encoding="utf-8")
    print(f"saved {out_path}  (trained on {len(train)} train sessions; their names are stored in the model "
          f"so evaluate.py can refuse to test on them)")


if __name__ == "__main__":
    main()
