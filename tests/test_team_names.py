"""Every team name in every raw file maps to exactly one canonical name."""

import pandas as pd
import pytest

from src.clean.team_names import RAW_NAME_READERS, SOURCES, load_mapping, to_canonical


def test_mapping_table_is_well_formed():
    mapping = load_mapping()
    assert list(mapping.columns) == ["canonical"] + SOURCES
    assert mapping["canonical"].notna().all()
    assert not mapping["canonical"].duplicated().any(), "duplicate canonical names"
    # Canonical names are the Understat names, and every club has a football-data name.
    assert (mapping["canonical"] == mapping["understat"]).all()
    assert mapping["football_data"].notna().all()
    for source in SOURCES:
        names = mapping[source].dropna()
        assert not names.duplicated().any(), f"{source}: a name maps to more than one club"


@pytest.mark.parametrize("source", SOURCES)
def test_every_raw_name_maps_to_one_canonical(source):
    raw_names = RAW_NAME_READERS[source]()
    if not raw_names:
        pytest.skip(f"no raw {source} files found; run the collect scripts first")
    mapped = load_mapping()[source].dropna()
    unmapped = sorted(raw_names - set(mapped))
    assert not unmapped, f"Unmapped {source} team names: {unmapped}"
    for name in raw_names:
        assert (mapped == name).sum() == 1, f"{source} name {name!r} maps to {(mapped == name).sum()} clubs"


def test_to_canonical_raises_on_unknown_name():
    with pytest.raises(ValueError, match="Unmapped"):
        to_canonical(pd.Series(["Arsenal", "Real Madrid"]), "football_data")


def test_to_canonical_examples():
    out = to_canonical(pd.Series(["Man United", "Wolves", "Nott'm Forest"]), "football_data")
    assert list(out) == ["Manchester United", "Wolverhampton Wanderers", "Nottingham Forest"]
    out = to_canonical(pd.Series(["Spurs", "Man Utd", "Hull City"]), "fpl")
    assert list(out) == ["Tottenham", "Manchester United", "Hull"]
