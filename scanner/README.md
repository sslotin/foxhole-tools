# Foxhole stockpile scanner

A module that takes screenshots of stockpiles and outputs their contents.

Current with update 60.

## Usage

Install the module (will be named `foxhole-stockpile-scanner` in your project):

```bash
npm i "https://gitpkg.now.sh/sslotin/foxhole-tools/scanner?main"
```

Then you can import an asynchronous "parse" function which takes a screenshot file and returns its transcribed contents.

```js
import fs from 'fs';
import { parse, metadata } from 'foxhole-stockpile-scanner';

const imagePath = '../test-screenshots/bunker.png';
const imageData = fs.readFileSync(imagePath);
const result = await parse(imageData);
```

The result will have three fields:

- `stockpileName`: (latin alphanumerics only, `Public` for public stockpiles and empty for bases)
- `stockpileType`: `Bunker Base`, `Seaport`, etc.
- `items`: indexed by item codenames (with `-crated` suffix for crated items), contains counts and some debug info you're probably not interested in:

```
BloodPlasma: {
  count: 37,
  countConfidence: 96,
  iconScore: 204.7607421875,
  x: 611,
  y: 883
},
```

Use codename-indexed `metadata` to match and process them:

```js
"SniperRifleW": {
  "displayName": "Clancy-Raca M4",
  "description": "A heavy-duty, long-range marksman rifle. The Clancy-Raca has one hell of a kick but is fitted with a powerful scope, allowing infantry to survey the battlefield and provide support from a safe location.",
  "factoryCost": [
    {
      "ItemCodeName": "Cloth",
      "Quantity": 250
    },
    {
      "ItemCodeName": "Wood",
      "Quantity": 25
    }
  ],
  "quantityPerCrate": 3,
  "itemType": "item", // item, vehicle or structure
  "warden": true // absent for neutral items, true for warden-only, false for collie-only
},
```

The API is subject to change (I want to add parallelism and progress bar capabilities), but it will become stable soon.

See [s6ss](https://github.com/sslotin/foxhole-tools/blob/main/s6ss/src/App.vue) for an example of how to use it in browser environments.

## Metadata extraction

Get `War-WindowsNoEditor.pak` from game files (Steam properties). It is a ~18 GB file.

Get FModel: https://fmodel.app/ and open the .pak file with it. For Linux/Mac, you need to use Wine and install some 64-bit libs, and then run:

```
DOTNET_BUNDLE_EXTRACT_BASE_DIR=. WINEPREFIX=~/.wine64 wine FModel.exe
```

Games is running UE 4.26 (?).

Go to War/Content and extract everything as json, plus textures from the Textures/UI folder.

Run `node prepare-icons.js`, pointing it to correct directories.
