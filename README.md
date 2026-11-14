# SkyShift: a SPHEREx time-lapse explorer

**SkyShift makes a billion-object NASA dataset accessible with one link.**
Type a sky position (RA/Dec), or pick one of the five challenge targets, and see real NASA SPHEREx images of that spot as a short time-lapse over more than a year.

Built for the **NASA Space Apps Challenge 2026, Hanoi**, challenge 12 *Planet X and SPHEREx*, by Team AEC.
Not affiliated with or endorsed by NASA.

- Live app: https://skyshift-seven.vercel.app
- Pitch slides: submitted with the NASA Space Apps entry (Team AEC, NS12003)

## What you can do

| Feature | How |
|---|---|
| See a position as a time-lapse | Enter RA/Dec, field of view and band, press **Go**. One frame per observing epoch (flipbook with play/pause/speed) |
| Spot movers | **Difference** view: each epoch minus the first (grey = no change, white = brighter, black = fainter) |
| Follow a fast mover | Give a proper motion; the field follows the star and a yellow ring shows where it should be on each date |
| Check the prediction | The **measurements** panel gives signal-to-noise, flux and the offset of the measured position from the prediction, per epoch |
| Ask "is it moving?" | The **Is it moving?** card fits a straight line to the measured positions over time (all frames share one sky-fixed grid) and reports the proper motion in arcsec/yr with a rough uncertainty, next to the catalogue value. Verdicts: Moving, Probably moving, No motion detected, Not enough positions. The catalogue motion only places the measurement window; it is not used in the fit |
| Cross-check with other surveys | Overlays: **Gaia DR3** stars (moved to the date of each frame), **AllWISE** sources at their 2010 position (not moved, so a mover sits far from its diamond), **SIMBAD** object type (via CDS Sesame). A white path joins the positions measured so far |
| Share or embed | Every view is a URL: `?ra=269.452&dec=4.693&pmra=-801.55&pmdec=10362.4&fov=0.1` or `?target=barnard` |
| Embed in another page | `<iframe src="https://YOUR-APP/?target=barnard&embed=1" width="640" height="720"></iframe>` shows only the viewer |
| See a spectrum | For targets that are not saturated (Epsilon Indi B) the page also plots one aperture measurement per SPHEREx image against the wavelength at the target (459 usable points from 468 images, 0.75-5 micron), pre-computed with `scripts/spectrum.py` |
| Take the numbers away | CSV downloads for the epoch table and the measurements; every image links back to its FITS file at NASA/IPAC IRSA |
| Stay current | New SPHEREx releases are picked up by adding the collection name to `core/sia.py` (`COLLECTIONS`) |

## The five challenge targets

| Target | What it tests | Band used |
|---|---|---|
| Barnard's Star | Large proper motion (10.4 arcsec/yr). Bright: the core saturates, position is good, brightness is not | SWIR |
| Epsilon Indi B | Brown dwarf pair, ~7 arcmin from the bright Epsilon Indi A | SWIR |
| WISE 0855-0714 | Coldest known brown dwarf (~250 K): only visible beyond 4 micron, so detector 6 (MWIR) | MWIR D6 |
| RW Aurigae | Irregular variable: brightness changes | SWIR |
| R Draconis | Mira variable (~245 day period): brightness changes | SWIR |

They are pre-computed into `public/precomputed/*.json`, so the demo opens instantly and never waits for the archive.
Any other position is computed live (about 15-60 s, because the cutouts come from IRSA, plus Gaia and AllWISE queries).

### Results on the five targets (measured from the SPHEREx images alone)

| Target | SPHEREx | Catalogue | Card says |
|---|---|---|---|
| Epsilon Indi B | 4.47 ± 0.30 arcsec/yr (5 positions, 515 days) | 4.68 | Moving |
| Barnard's Star | 10.9 ± 2.3 (4 positions) | 10.39 | Probably moving |
| R Draconis | 0.8, rules out motion above ~4.8 | 0.02 | No motion detected |
| WISE 0855-0714 | only 2 measurable positions | 8.15 | Not enough positions |
| RW Aurigae | only 1 measurable position | 0.02 | Not enough positions |

AllWISE cross-check: every target has an AllWISE source within 1.2 arcsec of its predicted 2010 position; from 2010 to the last SPHEREx epoch Barnard's Star moved 168.8 arcsec, WISE 0855 127.9 arcsec and Epsilon Indi B 75.4 arcsec, as its known proper motion predicts over about 16 years.

**Known limit:** with no catalogue motion given, the measurement window stays at the field centre and does not follow the target. A blind test on Barnard's Star coordinates without its motion gave only an inconclusive 6 ± 6 arcsec/yr (true 10.4). SkyShift checks known motions; it does not discover new objects.

## How it works

```
position --> IRSA SIA2 search (spherex_dr1 + spherex_qr3) --> group images into epochs (gap > 30 d, max 45 d span)
         --> pick the detector seen in most epochs, the tightest few images per epoch
         --> IRSA cutout service (parallel, cached) --> mask bad pixels (FLAGS), remove local background
         --> align on a common sky grid with the image WCS (TAN + SIP, astropy), bilinear
         --> median-stack each epoch --> shared asinh stretch --> PNG frames + measurements --> browser
```

- **Data:** NASA/IPAC Infrared Science Archive, SPHEREx Level 2 images, Data Release 1 (2025 to mid 2026) and Quick Release 3 (mid 2026 on). Both are needed: DR1 alone or QR3 alone gives too short a time baseline.
- **Why a backend:** IRSA does not send CORS headers, so a browser cannot call it directly. `api/index.py` is a small stateless Flask function (it keeps nothing between requests, so it runs on Vercel).
- **Bad pixels:** FLAGS bits TRANSIENT, SUR_ERROR, PHANTOM, REFERENCE, NONFUNC, MISSING_DATA, HOT, COLD, PERSIST, OUTLIER, BLOOM, SNOWBALL, HALO are masked. OVERFLOW and NONLINEAR (saturation) are counted and reported near the target.
- **Epoch-to-epoch alignment:** background stars of the Barnard's Star field agree between epochs to about 0.9 arcsec (0.15 SPHEREx pixel), measured by cross-correlation.
- **Positions:** J2000 position and proper motion from CDS SIMBAD/Sesame (Gaia DR3; WISE 0855 from Kirkpatrick et al. 2021), propagated to the date of each epoch.

## Compared with doing it by hand

The simple alternative is to blink two images yourself: find the observations in the IRSA web form, download full-frame FITS files, open them in a viewer, align them and flip between them.

| | By hand | SkyShift |
|---|---|---|
| Data to download for Barnard's Star (16 images) | 16 full frames x about 62 MB (the `access_estsize` IRSA reports) = about 1 GB | one JSON of about 100 KB (the five targets) |
| Software | FITS viewer or Python with Astropy | any web browser |
| Alignment between epochs | by hand | automatic, from each image's WCS (agrees to about 0.9 arcsec) |
| Bad pixels, background, saturation | by hand | masked, removed and counted automatically |
| Time to see Barnard's Star move | tens of minutes | a few seconds |

(The "tens of minutes" is an estimate for a person who knows the tools, not a measurement.)

## Run it on your computer

```bash
pip install -r requirements.txt
python dev_server.py          # http://127.0.0.1:5000
```

Pre-compute the five targets again (needs Internet, a few minutes):

```bash
python scripts/precompute.py            # all five
python scripts/precompute.py barnard    # one
python scripts/try_target.py barnard    # save frames as PNG files in out/barnard
```

### Deploy on Vercel

```bash
npm i -g vercel
vercel login
vercel --prod
```

`public/` is served as static files; `api/index.py` is the Python function (`vercel.json` sets a 60 s limit; live requests for new positions can take longer than that on slow archive days, the five pre-computed targets never do).

## API

`GET /api/frames?ra=&dec=&fov=&band=SWIR|MWIR|AUTO&detector=&per_epoch=&max_epochs=&pmra=&pmdec=&pos_epoch=`
or `GET /api/frames?target=barnard|epsindib|wise0855|rwaur|rdra`. Returns JSON: epochs with PNG frames (base64), the observation IDs and IRSA links used, measurements, limitations and timings. `GET /api/targets` lists the presets.

## Limitations (honest list)

- SPHEREx has only about one year of public data so far, so slow objects move less than 2 pixels (6.2 arcsec each). Parallax is far too small to see.
- Bright stars saturate. Their position is usable; their brightness is not (shown as hollow points).
- SPHEREx wavelength changes across each detector, so the images of different epochs are at slightly different wavelengths. Brightness between epochs is approximate, and the difference view rescales each epoch to the first.
- Measurements use a simple aperture and the noise of the surrounding ring; positions are reported only when the signal-to-noise is at least 5. A 'moving dot' is a candidate to check, not a discovery. SkyShift does not claim to find Planet X.
- Live requests (your own coordinates) depend on the NASA IRSA archive being online. The five challenge targets are pre-computed (images, measurements and the Gaia, AllWISE and SIMBAD overlays) and open even when IRSA, Gaia or WISE are down. For live positions Gaia (ESA TAP), AllWISE (IRSA Gator) and SIMBAD (CDS) are called with short timeouts; if one does not answer, that overlay is left out and the images still show.
- The uncertainty on the measured motion comes from the scatter of only 3-5 positions, with a floor of 0.3 arcsec per position, so it is rough. Pixels are 6.2 arcsec and the public data span about a year: only motions of a few arcsec/yr or more can be confirmed.

## Languages

The page opens in English. The **EN / VI** switch in the header shows the whole interface, the measurement texts and a short glossary in Vietnamese; the choice is remembered in the browser and added to shared links as `?lang=vi`. Strings live in `public/i18n.js` (English text stays in `index.html`).

## AI use

The code, documentation and tests were written with the help of Claude (Anthropic) through Claude Code. The team directed the work and checked the results against real SPHEREx data (see the targets above). No simulated data is used anywhere in the app.

## Credits and references

- NASA/IPAC Infrared Science Archive (IRSA), SPHEREx data: https://irsa.ipac.caltech.edu/Missions/spherex.html
- SPHEREx tutorial notebooks: https://caltech-ipac.github.io/irsa-tutorials/spherex/
- WiseView (the inspiration): http://byw.tools/wiseview
- CDS SIMBAD / Sesame: https://simbad.cds.unistra.fr/
- ESA Gaia DR3: https://gea.esac.esa.int/archive/ ; AllWISE (NASA/IPAC IRSA Gator): https://irsa.ipac.caltech.edu/
- Python libraries: Flask, NumPy, Astropy, Pillow

License: Apache-2.0 (see `LICENSE`).
