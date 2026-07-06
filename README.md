# Foxhole Tools

Mostly-vibecoded logistics-oriented tools for video game Foxhole. Some of the documentation is "maintained" by a coding agent so don't rely on it.

Looking for another maintainer.

## Project Setup

```sh
npm install
```

### Development

```sh
npm run dev
```

### Production Build

```sh
npm run build
```

### Regression check (after game updates)

```sh
npm run check-diff -- parser/examples/u64_stockpile.csv   # Compare CSV items vs metadata.json
npm run generate-positions                                    # Rebuild position tables from reference CSVs
```

See `parser/scripts/README.md` for the full game-update workflow.

### Game data extraction

Provision ~10 gigs of space and ~20 minutes of time.

Find `War-WindowsNoEditor.pak` in game files (Steam right click -> browse local files). It is a ~25 GB file. To save space, I usually symlink to it.

Get FModel: https://fmodel.app/ and open the .pak file with it. For Linux/Mac, you need to use Wine and install some 64-bit libs, and then run:

```
DOTNET_BUNDLE_EXTRACT_BASE_DIR=. WINEPREFIX=~/.wine64 wine FModel.exe
```

You may need to open settings and point it to directory with .pak and specify UE version. The game is running UE 4.26 or at least something that seems compatible.

Switch to "Folders", right click "War" and export all as json, then export only textures from War/Content/Textures/UI.

Run `process-game-data.js`, pointing it to correct directories. It will generate metadata, recipes and icons.

Then get an English-language csv output of any base and any stockpile and feed it into `generate-positions.js`. It will generate a lookup table that works for any language (to avoid actually parsing CSVs at runtime, maybe some forwards-compatible fallback will be added in the future).

I usually delegate running the scripts and checking diffs to an agent.
