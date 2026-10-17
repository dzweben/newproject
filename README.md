# Atoms to Cities

A music-driven journey. It starts with particles, builds atoms, shapes, galaxies and a universe, then grows life, creatures and a planet. The camera drops to the ground, through an ocean, a volcano and a forest, and ends on a downtown street, looking up at the towers.

The song sets the pace. The whole journey spans the length of the track, and loud, sustained passages move the story faster than quiet ones.

## Listen

Open the GitHub Pages site, pick a built-in track, or drop your own MP3 anywhere on the page. Audio analysis runs in your browser. Your files are never uploaded.

Controls: Space plays and pauses, the left and right arrow keys skip 5 seconds, and clicking the progress bar seeks.

## The journey

| # | Scene | What happens |
|---|-------|--------------|
| 1 | Atoms | Electron shells orbit nuclei |
| 2 | Shapes | Particles resolve into nested polyhedra |
| 3 | Galaxies | Spiral arms turn, with bass driving the spin |
| 4 | Universe | Galaxies gather along filaments |
| 5 | Life | Cells, membranes and nuclei |
| 6 | Creatures | Jellyfish pulse and drift |
| 7 | Earth | A planet with continents, oceans and clouds |
| 8 | Ocean | A coastline, waves and glinting water |
| 9 | Volcano | Lava rivers, a crater and an ash plume |
| 10 | Forest | Trees along a footpath, with drifting pollen |
| 11 | Downtown | A street canyon of lit towers, with traffic |

The ground scenes combine real geometry with a particle layer: waves and glints on the water, embers and ash from the volcano, pollen and fireflies in the forest, and traffic and stars in the city.

## How it works

- **Pacing:** loudness is measured as RMS in decibels. Its ratio to the track's running average sets the speed, so the story always reaches its end.
- **Particles:** each particle springs toward its target position in each scene, with per-kind motion in the vertex shader.
- **Geometry:** terrain, water, trees and buildings are triangle meshes. City windows are lit by a procedural shader.
- **Camera:** each scene has its own path, which the story moves along, and the camera eases between them.

## Run locally

Any static server works. For example:

```sh
python3 -m http.server 8000
```

Then open http://localhost:8000. To jump to a scene, add a hash such as `#scene=9&u=0.5`, where `u` is the position within the scene. Add `?n=60000` to lower the particle count on slower machines.

## Music credits

- **Beethoven, Moonlight Sonata.** Public domain. Internet Archive item `MoonlightSonata_845`.
- **Mozart, Requiem K. 626, "Dies irae".** CC0. Internet Archive item `MozartK626Requiem3.DiesIrae`.
- **Bach, Brandenburg Concerto No. 2 in F major, BWV 1047.** Public domain. Internet Archive item `Bach__J.S._-_Brandenburg_Concerto_No_2_in_F_Major__BWV_1047_mvmt_`.

The source metadata does not name the performers. The files were re-encoded to 128 kbps MP3.

## Publish with GitHub Pages

In the repository settings, open Pages, choose "Deploy from a branch", and select the branch that contains `index.html` at its root.
