# Atoms to Cities

A music-driven particle universe. Particles start as atoms, then form shapes, galaxies, a universe of filaments, civilizations on a planet, and finally cities. The music sets the pace: louder, sustained sound moves the story forward faster.

## Listen

Open the GitHub Pages site, pick a built-in track, or drop your own MP3 anywhere on the page. Audio analysis runs in your browser, and your files are never uploaded.

## How it works

- **Energy:** the loudness of the playing audio fills a meter. Quiet passages slow the progression, and a small base rate keeps it moving.
- **Stages:** Atoms, Shapes, Galaxies, The Universe, Civilizations, Cities. Each stage is a target layout that the same particles morph into.
- **Beats:** bass hits push the particles outward, and high frequencies make them shimmer.

## Run locally

Any static server works. For example:

```sh
python3 -m http.server 8000
```

Then open http://localhost:8000. Add `#stage=3` to the address to jump straight to a stage.

## Music credits

- **Beethoven, Moonlight Sonata.** Public domain. Internet Archive item `MoonlightSonata_845`.
- **Mozart, Requiem K. 626, "Dies irae".** CC0. Internet Archive item `MozartK626Requiem3.DiesIrae`.
- **Bach, Brandenburg Concerto No. 2 in F major, BWV 1047.** Public domain. Internet Archive item `Bach__J.S._-_Brandenburg_Concerto_No_2_in_F_Major__BWV_1047_mvmt_`.

The source metadata does not name the performers. The files were re-encoded to 128 kbps MP3.

## Publish with GitHub Pages

In the repository settings, open Pages, choose "Deploy from a branch", and select the branch that contains `index.html` at its root.
