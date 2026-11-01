"""shinobi/catalog.py: the one copy of the card / web texts.

Run:  python -m pytest -q tests/test_catalog.py
The reference cards are rendered into a temporary folder (never into gesture_references/) and must
be byte-identical to the committed ones: the texts moved, the cards did not change.
"""

import filecmp
import importlib.util
import shutil

import pytest

from shinobi import catalog, config

TOOL = config.ROOT / "tools" / "build_gesture_references.py"


def test_every_sign_and_jutsu_has_its_texts():
    used = {s for spec in config.JUTSU.values() for s in spec["sequence"]}
    assert used == set(catalog.SIGNS)
    assert list(catalog.JUTSU) == list(config.JUTSU)
    for jid, card in catalog.JUTSU.items():
        for key in ("title", "tag", "status", "name", "kanji", "description", "color"):
            assert card[key], (jid, key)


def test_kanji_is_the_one_in_the_instructions():
    for jid, card in catalog.JUTSU.items():
        first = (config.REFERENCES_DIR / jid / "instructions.md").read_text(encoding="utf-8").splitlines()[0]
        assert card["kanji"] in first, (jid, first)


def test_credits_items_have_exactly_the_four_keys():
    titles = [section["title"] for section in catalog.CREDITS]
    assert titles == ["Hand-seal illustrations", "Sound effects",
                      "Music during the hand-sign sequences (not the original Naruto soundtrack)",
                      "Hand-seal detector model", "Disclaimer"]
    for section in catalog.CREDITS:
        for item in section["items"]:
            assert set(item) == {"text", "url", "license", "license_url"} and item["text"]
    licenses = [i["license"] for s in catalog.CREDITS for i in s["items"]]
    # CC BY 3.0: Fire Loop, Poof Noises, and two of the sequence music loops (Blackmoor Ninjas, Taiko drums)
    assert "CC BY-SA 4.0" in licenses and licenses.count("CC BY 3.0") == 4 and "CC BY 4.0" in licenses


def test_cards_rendered_from_the_catalog_are_byte_identical(tmp_path):
    pytest.importorskip("PIL")
    spec = importlib.util.spec_from_file_location("build_gesture_references", TOOL)
    tool = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(tool)
    signs = tmp_path / "_sources" / "signs"
    shutil.copytree(config.REFERENCES_DIR / "_sources" / "signs", signs)
    tool.REF, tool.SIGNS_DIR = tmp_path, signs                       # write only into tmp_path
    tool.main()
    expected = sorted(config.REFERENCES_DIR.glob("*/step_*.png")) + sorted(
        config.REFERENCES_DIR.glob("*/sequence_reference.png"))
    assert len(expected) == 5 * len(config.JUTSU)
    for path in expected + [config.REFERENCES_DIR / "_sources" / "signs" / "rasengan_palm.png"]:
        rel = path.relative_to(config.REFERENCES_DIR)
        assert filecmp.cmp(path, tmp_path / rel, shallow=False), rel
