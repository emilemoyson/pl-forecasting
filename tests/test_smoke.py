"""Smoke test: every src package imports cleanly."""

import importlib


def test_imports():
    for pkg in ["src", "src.collect", "src.clean", "src.features", "src.models", "src.evaluate"]:
        importlib.import_module(pkg)
