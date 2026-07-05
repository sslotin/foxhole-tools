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

Provision about 50 gigs and 30 minutes of time.

Get `War-WindowsNoEditor.pak` from game files (Steam properties). It is a ~22 GB file.

Get FModel: https://fmodel.app/ and open the .pak file with it. For Linux/Mac, you need to use Wine and install some 64-bit libs, and then run:

```
DOTNET_BUNDLE_EXTRACT_BASE_DIR=. WINEPREFIX=~/.wine64 wine FModel.exe
```

You may need to open settings and point it to directory with .pak and specify UE version. The game is running UE 4.26 or at least something that seems compatible.

Switch to "Folders", right click "War" and export all as json, then export only textures from War/Content/Textures/UI.

Run `node prepare-icons.js`, pointing it to correct directories.
