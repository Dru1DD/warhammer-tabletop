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
| Blueprint tokens: top-down technical drawings of each model on its base (rim with ticks, facing arrow, silhouette, weapon). Marines: backpack, pauldrons, bolt rifle / grenade launcher / officer's cape, sword and pistol. Orks: armour plates, tusks, slugga and choppa / big shoota / rokkit / Nob's horns and big choppa. Assault Intercessors (chainsword, pistol), Redemptor Dreadnought (hull, fist, macro plasma, launchers), Deff Dread (riveted body, klaw, big shoota, skorcha, exhausts) | Hand-written SVG in `src/assets/tokenArt.ts` | Original, part of this project. No GW logos, icons or traced artwork. |
| Blueprint tokens for the Tyranids, Necrons and Aeldari (22 model profiles, checked 2026-11-09): Hive Tyrant (wings, crest, bonesword and talons), Termagants (four gun variants), Hormagaunt (scything talons), Tyranid Prime and three Warrior loadouts; Overlord, Necron Warrior (rib lines, gauss flayer), Skorpekh Destroyer (hyperphase blades), Scarab Swarm (cluster of scarabs); Farseer, Guardian Defender, Heavy Weapon Platform, Dire Avenger and Exarch, three Windrider loadouts. Each faction has its own line colour (coral / silver / violet) | Hand-written SVG in `src/assets/tokenArt.ts` | Original, part of this project. No GW logos, icons or traced artwork. |
| Blueprint tokens for the **Adeptus Mechanicus** (21 model profiles, checked 2026-11-09) and a faction emblem: Tech-Priest Dominus and Manipulus (cog halo, servo-arms, Omnissian axe / magnarail lance), Skitarii Rangers (long rifles, Alpha crest, omnispex, arc rifle, plasma caliver) and Vanguard (short carbines, radiation ring, pistol Alpha), Kataphron Breachers (arc rifle with arc claw / hydraulic claw / torsion cannon) and Destroyers (grav-cannons / culverin with flamer), Sicarian Princeps and troopers (carbine and blade / taser goad), Kastelan Robots (cog chest plate, combustor / twin phosphor blasters); the emblem is a brass cog around a mechanical skull. Brass line colour `#f0b24a` on deep-red fills (`#8a1f1f`), chosen so it cannot be mistaken for the coral Tyranids | Hand-written SVG in `src/assets/tokenArt.ts` (`mechanicusEmblem()` is exported through `FACTION_EMBLEM` in `manifest.ts` and shown on the army selection card) | Original, part of this project. No GW logos, icons, Cog Mechanicus or Skitarii symbols traced from official art, miniature photos or artwork. |
| Fallback tokens: Short abbreviations in the language of the interface (Lt / IcS / Ic / GL / Nob / B / BS / R in English, and one per new profile, `TOKENS` in `manifest.ts`) | Drawn in code (Konva) | Original |
| Blueprint board: grid with inch rulers, ruins as hatched floor plans with walls and pillars, craters as contour lines, objectives as crosshairs | Drawn in code (Konva, `src/ui/Board.tsx`) | Original |
| `public/favicon.svg` | Vite project template | MIT (Vite) |

All built-in art faces east (+x). The board flips the built-in portraits of the army that stands on the east side so both armies face each other; your own photos are never flipped.

## Using photos of your own miniatures (in the app)

In the unit card, open “📷 Model photos” and choose “own photo” for any model type. The image is centre-cropped, scaled to 256×256 and stored **only in this browser** (`localStorage` key `wh40k-training-tokens`). It is never added to the repository or sent anywhere. Photograph your own models from the Introductory Set, top-down or from the front.

This is how to get the real Ultramarines and Orks from the box onto the board without redistributing Games Workshop's product photos.

## Pictures of the units (your own folder)

A big army is hard to tell apart on the board, so the unit card and the board tooltip can show a picture of each model type. The pictures come from **your own folder**, `public/unit-art/`. It is in `.gitignore`: the pictures are never committed, and the app ships none (`src/assets/unitArt.ts`).

- Put the images (`.png`, `.jpg`, `.webp`, `.gif`, `.avif`) in `public/unit-art/`.
- List them in `public/unit-art/index.json`. The key is a model profile id or a datasheet id from `src/game/data/`:
  ```json
  { "rangers": "rangers.jpg", "techDominus": "dominus.jpg", "onagerNeutron": "onager-neutron.jpg", "onager": "onager.jpg" }
  ```
- A model takes its profile's picture first, then its datasheet's. Each vehicle loadout is a profile of its own (`onager`, `onagerMissiles`, `onagerNeutron`, `onagerPhosphor`), so each loadout can have its own picture.
- The unit card shows each different picture of the unit once, with the model's name (an attached unit shows its character too). The board tooltip shows the picture of the model under the pointer.
- Without `index.json` nothing is shown.

These are for your own screen. Do not commit pictures you do not own.

## Replacing tokens in code

`src/assets/manifest.ts` resolves token art in this order: player photo → `image` in the manifest → built-in SVG portrait. To ship a default image with the app:

1. Put the file in `public/tokens/`, for example a top-down photo of **your own painted miniature**.
2. Set `image: '/tokens/lieutenant.png'` on that profile's `TokenStyle`.

The board draws the image clipped to the base circle and keeps the label on top. Record the source and licence of every file you add in the table above.
