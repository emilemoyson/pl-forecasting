"""Time helpers. Everything is stored in UTC.

football-data.co.uk gives Date (dd/mm/yyyy) and Time (HH:MM) in UK local
time, which is UTC+1 in summer (BST) and UTC in winter (GMT).
"""

from __future__ import annotations

from zoneinfo import ZoneInfo

import pandas as pd

UK = ZoneInfo("Europe/London")


def uk_local_to_utc(date: pd.Series, time: pd.Series) -> pd.Series:
    """football-data Date + Time (UK local) -> tz-aware UTC timestamps."""
    local = pd.to_datetime(date.astype(str) + " " + time.astype(str), format="%d/%m/%Y %H:%M")
    return local.dt.tz_localize(UK, ambiguous="raise", nonexistent="raise").dt.tz_convert("UTC")
