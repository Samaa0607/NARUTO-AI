"""Loads the trained gesture model and turns a feature vector into probabilities."""

import joblib
import numpy as np

from shinobi import config
from shinobi.features import FEATURE_VERSION


class ForestOneFrame:
    """RandomForestClassifier.predict_proba for ONE frame: the same numbers, about 100x faster.

    sklearn walks the trees one by one in Python and checks the input on every call (and with
    n_jobs=-1 also starts a thread pool): 40-50 ms per frame for our 300 trees (measured 2026-10-31),
    while the whole frame has 70-100 ms. Here all trees are packed into flat arrays and walked
    together, one tree level per numpy step: ~0.3 ms. GestureClassifier checks the result against
    sklearn when it loads a model, and uses sklearn itself if they ever differ.
    """

    def __init__(self, forest):
        trees = [e.tree_ for e in forest.estimators_]
        counts = [t.node_count for t in trees]
        self.roots = np.concatenate([[0], np.cumsum(counts)[:-1]]).astype(np.intp)   # first node of each tree
        shift = np.repeat(self.roots, counts)                    # a tree's own node ids -> ids in the flat arrays
        left = np.concatenate([t.children_left for t in trees])
        right = np.concatenate([t.children_right for t in trees])
        leaf = left < 0
        here = np.arange(len(left))
        self.left = np.where(leaf, here, left + shift)           # a leaf points to itself, so walking on keeps it
        self.right = np.where(leaf, here, right + shift)
        self.feature = np.where(leaf, 0, np.concatenate([t.feature for t in trees]))
        self.threshold = np.concatenate([t.threshold for t in trees])
        value = np.concatenate([t.value[:, 0, :] for t in trees]).astype(np.float64)
        total = value.sum(axis=1, keepdims=True)
        self.proba = value / np.where(total == 0, 1.0, total)   # = each tree's predict_proba at that leaf
        self.depth = max(t.max_depth for t in trees)

    def __call__(self, features):
        x = np.asarray(features, np.float32).ravel()            # sklearn also compares float32 features
        node = self.roots
        for _ in range(self.depth):
            node = np.where(x[self.feature[node]] <= self.threshold[node], self.left[node], self.right[node])
        return self.proba[node].mean(axis=0)                     # the forest = mean of its trees


def fast_forest(model):
    """ForestOneFrame for a random forest whose result matches sklearn's, else None (use sklearn)."""
    from sklearn.ensemble import RandomForestClassifier
    if not isinstance(model, RandomForestClassifier) or getattr(model, "n_outputs_", 1) != 1:
        return None
    fast = ForestOneFrame(model)
    probe = np.random.default_rng(0).normal(0.0, 1.0, (16, model.n_features_in_)).astype(np.float32)
    probe[0] = 0.0
    if not np.allclose(model.predict_proba(probe), [fast(x) for x in probe], rtol=0.0, atol=1e-9):
        print("landmark model: the fast forest does not match sklearn here, using sklearn (slower)")
        return None
    return fast


class GestureClassifier:
    def __init__(self, path=None):
        bundle = joblib.load(config.GESTURE_MODEL_PATH if path is None else path)
        if bundle["feature_version"] != FEATURE_VERSION:
            raise RuntimeError(
                f"Model was trained with feature version {bundle['feature_version']}, "
                f"code uses {FEATURE_VERSION}. Re-run train.py."
            )
        self.model = bundle["model"]
        self.labels = bundle["labels"]          # label names in the model's output order
        self.name = bundle.get("model_name", "?")
        # One frame at a time: a thread pool per call (n_jobs=-1 from training) only costs time.
        jobs = {k: 1 for k in self.model.get_params() if k == "n_jobs" or k.endswith("__n_jobs")}
        if jobs:
            self.model.set_params(**jobs)
        self.fast = fast_forest(self.model)

    def predict(self, features):
        """Return a probability array aligned with self.labels."""
        if self.fast is not None and np.isfinite(features).all():   # sklearn treats NaN specially: leave it to it
            return self.fast(features).astype(np.float32)
        return self.model.predict_proba(features.reshape(1, -1))[0].astype(np.float32)

    @staticmethod
    def exists(path=None):
        return (config.GESTURE_MODEL_PATH if path is None else path).exists()
