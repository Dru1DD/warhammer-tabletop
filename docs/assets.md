# Asset inventory

Checked 2026-10-18.

## Official Games Workshop assets: not used

No explicit licence was found that would allow embedding official product images, artwork or 3D models in this app.

- GW's website terms (warhammer-community.com/en-gb/terms-of-use, warhammer.com legal) forbid copying, reproducing or redistributing site materials, images included.
- GW's Intellectual Property Guidelines, as summarised in secondary coverage, ask fan projects not to use images from GW websites or official artwork.
- No official GLB/GLTF/STL/FBX downloads with a redistribution licence exist for these miniatures.

**Decision:** the app ships no GW images, logos, artwork or models.

## Assets in this repository

| Asset | Source | Licence |
|---|---|---|
| Token portraits: Space Marine busts in blue armour with gold trim (Lieutenant with crest, laurel and sword; Sergeant with helmet stripe; grenade launcher variant) and Ork heads (Nob with horned helmet and big choppa; Boyz with big shoota / rokkit variants) | Hand-written SVG in `src/assets/tokenArt.ts` | Original, part of this project. Generic colour scheme; no GW logos, icons or traced artwork. |
| Fallback tokens: Cyrillic abbreviations Лт / Сж / И / Гр / Нб / Б / БШ / Р | Drawn in code (Konva) | Original |
| Terrain polygons, objective markers, board mat and grid | Drawn in code | Original |
| `public/favicon.svg` | Vite project template | MIT (Vite) |

## Using photos of your own miniatures (in the app)

In the unit card, open «📷 Фото моделей» and choose «своё фото» for any model type. The image is centre-cropped, scaled to 256×256 and stored **only in this browser** (`localStorage` key `wh40k-training-tokens`). It is never added to the repository or sent anywhere. Photograph your own models from the Introductory Set, top-down or from the front.

This is how to get the real Ultramarines and Orks from the box onto the board without redistributing Games Workshop's product photos.

## Replacing tokens in code

`src/assets/manifest.ts` resolves token art in this order: player photo → `image` in the manifest → built-in SVG portrait. To ship a default image with the app:

1. Put the file in `public/tokens/`, for example a top-down photo of **your own painted miniature**.
2. Set `image: '/tokens/lieutenant.png'` on that profile's `TokenStyle`.

The board draws the image clipped to the base circle and keeps the label on top. Record the source and licence of every file you add in the table above.
