"""E6 · Named places → data/sites.json, and the boxes that get a fine horizon grid (E9).

Run:  cd engine && python3 sites.py
Sites are labels and pins, NOT a limit on where users can click.

Honesty rules for this list:
- NASA (Oct 2024) named 9 Artemis III candidate REGIONS but published no coordinates.
  Where a peer-reviewed / conference source gives a landing POINT inside a region we use it
  and say so ("representative point, not an official region centre").
- Named craters / mountains use the IAU Gazetteer of Planetary Nomenclature centre.
- Regions with no sourced coordinates are listed in UNPLACED_REGIONS and NOT pinned.
"""
import json
from pathlib import Path

NASA_2024 = "https://www.nasa.gov/news-release/nasa-provides-update-on-artemis-iii-moon-landing-regions/"
PAPER = "https://arxiv.org/html/2406.19863v2"   # Table 3: top-ranked landing points per region
LPSC = "https://www.hou.usra.edu/meetings/lpsc2024/pdf/1695.pdf"
GAZ = "https://planetarynames.wr.usgs.gov/Feature/"


def dms(d, m, s, sign=1):
    return round(sign * (d + m / 60 + s / 3600), 5)


# id, name, lat, lon, type, source, note, fine-grid box size in km (None = no fine grid)
SITES = [
    # Artemis candidate regions: representative landing points from published studies
    ("nobile_rim_2", "Nobile Rim 2", dms(84, 12, 5.61, -1), dms(60, 41, 59.61), "artemis_candidate_region",
     PAPER, "Representative point (paper's top-ranked site 358), not an official region centre", 20),
    ("peak_near_shackleton", "Peak near Shackleton", dms(89, 0, 18.22, -1), dms(125, 18, 33.49),
     "artemis_candidate_region_2022", PAPER, "Representative point (site 1223); 2022 region list", 20),
    ("de_gerlache_rim_2", "de Gerlache Rim 2", dms(88, 30, 56.38, -1), dms(61, 10, 2.35, -1),
     "artemis_candidate_region", PAPER, "Representative point (site 726); 'O' read as west (matches de Gerlache crater)", 20),
    ("amundsen_rim", "Amundsen Rim", dms(84, 11, 30.63, -1), dms(67, 13, 44.55), "artemis_candidate_region_2022",
     PAPER, "Representative point (site 1121); 2022 region list", 20),
    ("faustini_rim_a", "Faustini Rim A", dms(88, 5, 13.01, -1), dms(98, 21, 19.76), "artemis_candidate_region_2022",
     PAPER, "Representative point (site 744); 2022 region list", 20),
    ("connecting_ridge", "Connecting Ridge", -89.53432, -150.05233, "artemis_candidate_region_2022",
     LPSC, "Representative point from LPSC 2024 abstract 1695 (lon 209.94767°E)", 30),
    ("mons_mouton", "Mons Mouton", -84.60, 31.00, "artemis_candidate_region",
     GAZ + "16070", "IAU centre of the massif; NASA regions 'Mons Mouton' and 'Mons Mouton Plateau' lie on it", 30),
    # Named features (IAU Gazetteer centres)
    ("shackleton", "Shackleton crater", -89.67, 129.78, "crater", GAZ + "5450", "Permanently shadowed floor", None),
    ("shackleton_ridge_test", "Shackleton ridge (test point)", -89.45, -137.3, "reference_point",
     "engine/test_spice.py", "Team reference point used to test SPICE and the horizon code", None),
    ("malapert", "Malapert crater", -85.00, 11.40, "crater", GAZ + "3603",
     "NASA region 'Malapert Massif' is the ridge near this crater (no official coordinates)", None),
    ("nobile", "Nobile crater", -85.28, 53.27, "crater", GAZ + "4321", "", None),
    ("amundsen", "Amundsen crater", -84.44, 83.07, "crater", GAZ + "247", "", None),
    ("faustini", "Faustini crater", -87.18, 84.31, "crater", GAZ + "1919", "", None),
    ("de_gerlache", "de Gerlache crater", -88.48, -88.34, "crater", GAZ + "1439", "", None),
    ("slater", "Slater crater", -88.08, 111.29, "crater", GAZ + "15325",
     "NASA region 'Slater Plain' is near this crater (no official coordinates)", None),
    ("cabeus", "Cabeus crater", -85.33, -42.13, "crater", GAZ + "953", "", None),
    ("cabeus_b", "Cabeus B crater", -82.26, -54.58, "crater", GAZ + "8058",
     "Outside 84°S. NASA region 'Peak near Cabeus B' is nearby (no official coordinates)", None),
]

# NASA Oct 2024 regions we could not place from a citable source (shown as text only)
UNPLACED_REGIONS = ["Peak near Cabeus B", "Haworth", "Malapert Massif", "Nobile Rim 1", "Slater Plain"]

OUT = Path(__file__).resolve().parent.parent / "data" / "sites.json"


def fine_boxes():
    """[(site_id, lat, lon, box_km)] for sites that get a fine horizon grid."""
    return [(s[0], s[2], s[3], s[7]) for s in SITES if s[7]]


def main():
    sites = [{"id": i, "name": n, "lat": la, "lon": lo, "type": t, "source": src, "note": note}
             for i, n, la, lo, t, src, note, _ in SITES]
    OUT.write_text(json.dumps(sites, indent=1, ensure_ascii=False) + "\n")
    meta = OUT.with_name("sites_meta.json")
    meta.write_text(json.dumps({
        "artemis_iii_regions_2024": {"source": NASA_2024, "names": [
            "Peak near Cabeus B", "Haworth", "Malapert Massif", "Mons Mouton Plateau", "Mons Mouton",
            "Nobile Rim 1", "Nobile Rim 2", "de Gerlache Rim 2", "Slater Plain"]},
        "unplaced_regions": UNPLACED_REGIONS,
        "note": "NASA published region names, not coordinates. Pins are representative points or IAU feature centres.",
    }, indent=1) + "\n")
    print(f"{len(sites)} sites → {OUT}")


if __name__ == "__main__":
    main()
