# Third-party notices

Tabletop Trainer 40K is an independent, unofficial fan project. It is **not affiliated with, endorsed by or sponsored by Games Workshop Limited**. Warhammer, Warhammer 40,000, the names of its factions, units, weapons and rules terms, and related marks are trademarks or registered trademarks of Games Workshop Limited. They are used here only to identify the game this tool helps people learn. The project's license does not grant any rights to them. See [docs/LICENSING.md](docs/LICENSING.md).

The project's own source code is licensed under the [Apache License 2.0](LICENSE). This file lists what is not covered by that license.

## Software dependencies

Installed from npm and pinned in `package-lock.json`. All **production** dependencies (the code that ships in the built app, 18 packages in total including transitive ones, checked with `npm ls --omit=dev --all`) use permissive licenses:

| Package | License | Copyright holder (from the package) |
|---|---|---|
| [react](https://github.com/facebook/react), react-dom | MIT | Meta Platforms, Inc. and affiliates |
| [konva](https://github.com/konvajs/konva) | MIT | Eric Rowell (KineticJS) and Konva contributors |
| [react-konva](https://github.com/konvajs/react-konva) | MIT | Anton Lavrenov |
| [zustand](https://github.com/pmndrs/zustand) | MIT | Paul Henschel |
| [peerjs](https://github.com/peers/peerjs) | MIT | Michelle Bu and Eric Zhang |
| Transitive: eventemitter3, peerjs-js-binarypack, sdp, scheduler, its-fine and type packages | MIT | their authors |
| Transitive: @msgpack/msgpack | ISC | its authors |
| Transitive: webrtc-adapter | BSD-3-Clause | its authors |

Each package carries its own license text and copyright notice in its npm package; keep them if you redistribute the built app. To list them again:

```bash
npm ls --omit=dev --all
```

Development tools (Vite, Vitest, TypeScript, oxlint, Tailwind CSS, Testing Library, jsdom, Babel and the React Compiler plugin) are used to build and test the project and are not shipped in the app. They are also under permissive licenses, but this was not audited package by package.

## Assets

| File | Origin | License |
|---|---|---|
| `public/favicon.svg` | Vite project template | MIT, Copyright (c) VoidZero Inc. and Vite contributors |
| Token art, board art and the Adeptus Mechanicus emblem (`src/assets/tokenArt.ts`, `src/ui/Board.tsx`) | Hand-written SVG and canvas code | Original to this project, under the project license. Not traced from Games Workshop artwork or photos (see [docs/assets.md](docs/assets.md)) |

No Games Workshop images, logos, artwork, 3D models, fonts or rulebook text are included in the repository.

## Game data and sources

The rules engine and the army data model the 11th edition of Warhammer 40,000. They were written from public sources recorded in [docs/research.md](docs/research.md) and the army documents, including:

- the core rules transcription and datasheet pages on [Wahapedia](https://wahapedia.ru) (a fan-run site);
- Munitorum Field Manual points values as listed on [Dakkapedia](https://dakkapedia.com) and Games Workshop's downloads page.

These sources are cited for transparency and **no part of them is bundled or licensed here**. Statistics, points and unit names are factual game data; descriptions of rules and abilities are written in the project's own words. Whether this data may be republished remains open (see [docs/LICENSING.md](docs/LICENSING.md)). If a rights holder asks for something to be changed or removed, open an issue.
