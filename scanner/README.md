# Foxhole stockpile scanner

A module that takes screenshots of stockpiles and outputs their contents.

## Metadata extraction

Get `War-WindowsNoEditor.pak` from game files (Steam properties). It is a ~18 GB file.

Get FModel: https://fmodel.app/ and open the .pak file with it. For Linux/Mac, you need to use Wine and install some 64-bit libs, and then run:

```
DOTNET_BUNDLE_EXTRACT_BASE_DIR=. WINEPREFIX=~/.wine64 wine FModel.exe
```

Games is running UE 4.26 (?).

Go to War/Content and extract everything as json, plus textures from the Textures/UI folder.

Run `node prepare-icons.js`, pointing it to correct directories.
