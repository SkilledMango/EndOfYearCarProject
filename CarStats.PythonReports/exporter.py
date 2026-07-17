"""
exporter.py — saves report output to files (the "manage saved data"
requirement: we both READ data — from the API — and WRITE it to disk).

Every export run creates ./exports/ with:
  * one CSV per table   (openable in Excel)
  * one PNG per chart   (usable directly in a presentation)
"""

import os

import pandas as pd

EXPORT_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "exports")


def ensure_export_dir() -> str:
    """Creates ./exports next to the scripts if it doesn't exist yet."""
    os.makedirs(EXPORT_DIR, exist_ok=True)
    return EXPORT_DIR


def save_table(df: pd.DataFrame, name: str) -> str:
    """Writes a DataFrame to exports/<name>.csv (UTF-8 so ₪ and Hebrew survive)."""
    ensure_export_dir()
    path = os.path.join(EXPORT_DIR, f"{name}.csv")
    df.to_csv(path, index=False, encoding="utf-8-sig")
    return path


def save_chart(figure, name: str) -> str:
    """Writes a matplotlib figure to exports/<name>.png at print quality."""
    ensure_export_dir()
    path = os.path.join(EXPORT_DIR, f"{name}.png")
    figure.savefig(path, dpi=150, bbox_inches="tight")
    return path
