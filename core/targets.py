"""The five challenge test targets.

Positions are ICRS at epoch J2000.0 and proper motions are in mas/yr (pmra already includes cos(dec)),
both from CDS Sesame / SIMBAD (Gaia DR3 where available; WISE 0855 from Kirkpatrick et al. 2021).
The app propagates them to the SPHEREx observing epoch so fast movers stay inside the field of view.
"""

TARGETS = {
    "barnard": dict(
        name="Barnard's Star", ra=269.4520769586187, dec=4.69336496657667,
        pmra=-801.551, pmdec=10362.394, pos_epoch=2000.0, band="SWIR", detector=None, kind="motion",
        why="Largest proper motion of any star: ~10.4 arcsec/yr, easy to see."),
    "epsindib": dict(
        name="Epsilon Indi B", ra=331.04414658852124, dec=-56.78284419511611,
        pmra=3981.977, pmdec=-2466.832, pos_epoch=2000.0, band="SWIR", detector=None, kind="motion",
        why="Brown dwarf pair ~7 arcmin from the bright star Epsilon Indi A (not in this field)."),
    "wise0855": dict(
        name="WISE 0855-0714", ra=133.81890825, dec=-7.247048,
        pmra=-8123.7, pmdec=673.2, pos_epoch=2000.0, band="MWIR", detector=6, kind="motion", per_epoch=8,
        why="Coldest known brown dwarf (~250 K): only visible beyond 4 micron, so we use detector 6."),
    "rwaur": dict(
        name="RW Aurigae", ra=76.95652603458, dec=30.40143817389,
        pmra=7.23, pmdec=-20.33, pos_epoch=2000.0, band="SWIR", detector=1, kind="variable",
        why="Young star with irregular dimming events. Detector 1 (0.75-1.1 micron) is the one that does not saturate."),
    "rdra": dict(
        name="R Draconis", ra=248.16761083295, dec=66.75497941722,
        pmra=-20.643, pmdec=6.149, pos_epoch=2000.0, band="MWIR", detector=6, kind="variable",
        why="Mira variable (~245 day period). Too bright: it saturates every SPHEREx detector (least on detector 6), so brightness is only a trend proxy."),
}


def public_list():
    return [dict(id=k, **v) for k, v in TARGETS.items()]
