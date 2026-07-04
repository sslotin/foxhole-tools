import fs from 'fs';
import { glob } from 'glob';
import { createCanvas, loadImage } from 'canvas';

const iconBaseDir = '/home/sereja/Projects/foxhole/public/';

if (!fs.existsSync(iconBaseDir + 'icons')) {
  fs.mkdirSync(iconBaseDir + 'icons');
}

const baseDir = '/home/sereja/Projects/foxhole/game_data/content/Output/Exports/';

const itemFiles = glob.sync(baseDir + 'War/Content/Blueprints/ItemPickups/**/*.json');
const vehicleFiles = glob.sync(baseDir + 'War/Content/Blueprints/Vehicles/**/*.json');
const structureFiles = glob.sync(baseDir + 'War/Content/Blueprints/Structures/**/*.json');
const files = [...itemFiles, ...vehicleFiles, ...structureFiles];

let metadata = {};
let skippedItems = [];

// Track all icon files we try to access, for re-extraction
const neededIconFiles = new Set();
function trackIcon(iconRef) {
  if (iconRef) {
    neededIconFiles.add(baseDir + iconRef.split('.')[0] + '.png');
  }
}

function readJSON(path) {
  return JSON.parse(fs.readFileSync(path, 'utf-8'));
}

let subTypeIcons = {
  ATRPGC: 'War/Content/Textures/UI/ItemIcons/SubtypeAPIcon.0',
  ATRPGHeavyW: 'War/Content/Textures/UI/ItemIcons/SubtypeAPIcon.0',
  ATRPGHeavyC: 'War/Content/Textures/UI/ItemIcons/SubtypeAPIcon.0',
  ATRPGLightC: 'War/Content/Textures/UI/ItemIcons/SubtypeAPIcon.0',
  ATRPGW: 'War/Content/Textures/UI/ItemIcons/SubtypeAPIcon.0',
  ATRPGTW: 'War/Content/Textures/UI/ItemIcons/SubtypeAPIcon.0',
  ISGTC: 'War/Content/Textures/UI/ItemIcons/SubtypeSEIcon.0',
  RPGTW: 'War/Content/Textures/UI/ItemIcons/SubtypeSEIcon.0',
  RpgW: 'War/Content/Textures/UI/ItemIcons/SubtypeSEIcon.0',
};

const ammoData = readJSON(baseDir + 'War/Content/Blueprints/Data/BPAmmoDynamicData.json');
for (const [name, row] of Object.entries(ammoData[0].Rows)) {
  if (name != 'UnexplodedOrdnance') {
    const damageType = readJSON(baseDir + row.DamageType.ObjectPath.split('.')[0] + '.json');
    subTypeIcons[name] = damageType[1].Properties.Icon.ResourceObject.ObjectPath;  
  }
}

const itemInfo = readJSON(baseDir + 'War/Content/Blueprints/Data/BPItemDynamicData.json')[0].Rows;

function findProperties(obj) {
  let properties = {
    Icon: undefined, Description: undefined, DisplayName: undefined,
    CodeName: undefined, FactionVariant: undefined,
    bIsStockpilable: undefined, SubTypeIcon: undefined,
  };

  // Track whether each property was found in a CodeName-bearing entry
  const hasCodeName = {};

  // First pass: recurse into Super chain, merging parent properties in
  for (const item of obj) {
    if (item.hasOwnProperty('Super')) {
      const parentProps = findProperties(readJSON(baseDir + item.Super.ObjectPath.split('.')[0] + '.json'));
      for (const key of Object.keys(properties)) {
        if (parentProps[key] !== undefined && !hasCodeName[key]) {
          properties[key] = parentProps[key];
        }
      }
    }
  }

  // Second pass: own properties.
  // Accept DisplayName/Description from:
  //   - Entries with CodeName (main item definitions)
  //   - Entries named Default__* (parent/chain entries, may lack CodeName but have DisplayName)
  // This filters out aircraft part slots (WingSlot0, EngineSlot0, etc.) with bogus DisplayNames
  // while allowing proper inherited DisplayNames from base classes.
  for (const item of obj) {
    if (item.hasOwnProperty('Properties')) {
      const p = item.Properties;
      if (p.hasOwnProperty('Icon') && p.Icon.hasOwnProperty('ObjectPath')) {
        properties.Icon = p.Icon.ObjectPath.split('.')[0] + '.png';
      }
      const hasCN = p.hasOwnProperty('CodeName');
      const isDefaultItem = item.Name && item.Name.startsWith('Default__');
      if (hasCN || isDefaultItem) {
        if (p.hasOwnProperty('DisplayName')) {
          properties.DisplayName = p.DisplayName;
          if (hasCN) hasCodeName.DisplayName = true;
        }
        if (p.hasOwnProperty('Description')) {
          properties.Description = p.Description;
          if (hasCN) hasCodeName.Description = true;
        }
      }
      for (const property of ['CodeName', 'FactionVariant', 'bIsStockpilable', 'SubTypeIcon']) {
        if (p.hasOwnProperty(property)) {
          properties[property] = p[property];
        }
      }
    }
  }
  return properties;
}

function writePNG(imageData, w, h, path) {
  const canvas = createCanvas(w, h);
  const ctx = canvas.getContext('2d');
  ctx.putImageData(imageData, 0, 0);

  return new Promise((resolve, reject) => {
    const out = fs.createWriteStream(path);
    const stream = canvas.createPNGStream();
    stream.pipe(out);
    out.on('finish', () => resolve());
    out.on('error', reject);
  });
}

for (const file of files) {
  const obj = readJSON(file);
  const properties = findProperties(obj);

  if (properties.Icon &&
      properties.Description &&
      properties.DisplayName &&
      properties.CodeName &&
      (!file.includes('Structure') || file.includes('BPBanner') || file.includes('MaterialPlatform') || properties.bIsStockpilable) &&
      !file.includes('Lore')
  ) {
    trackIcon(properties.Icon);
    const codeName = properties.CodeName;
    let itemType = 'item';
    if (file.includes('Vehicles')) itemType = 'vehicle';
    else if (file.includes('Structures')) itemType = 'structure';

    // Record metadata regardless of whether icon PNG exists
    metadata[codeName] = {
      displayName: properties.DisplayName.SourceString,
      description: properties.Description.SourceString,
      factoryCost: itemInfo[codeName]?.CostPerCrate,
      quantityPerCrate: itemInfo[codeName]?.QuantityPerCrate,
      itemType: itemType,
      warden: properties.FactionVariant === undefined ? undefined : properties.FactionVariant.includes('Wardens'),
      iconMissing: true
    };

    // Extract icon only if the PNG exists on disk
    const iconPath = baseDir + properties.Icon;
    if (fs.existsSync(iconPath)) {
      try {
        const iconImg = await loadImage(iconPath);

        const canvas = createCanvas(100, 100);
        const ctx = canvas.getContext('2d');
        ctx.drawImage(iconImg, 0, 0, 100, 100);

        let subTypeIconPath = subTypeIcons[codeName];
        if (properties.SubTypeIcon?.ResourceObject?.ObjectPath) {
          subTypeIconPath = properties.SubTypeIcon.ResourceObject.ObjectPath;
        }

        if (subTypeIconPath) {
          const subPath = baseDir + subTypeIconPath.split('.')[0] + '.png';
          try {
            const subTypeIcon = await loadImage(subPath);
            fs.copyFileSync(subPath, iconBaseDir + `subtypes/${codeName}.png`);
            ctx.globalAlpha = 0.75;
            ctx.drawImage(subTypeIcon, 0, 0, 44, 44);
            ctx.globalAlpha = 1.0;
          } catch (e) {
            skippedItems.push({ codeName, icon: properties.Icon, reason: 'subtype icon missing: ' + subPath });
          }
        }

        await writePNG(ctx.getImageData(0, 0, 100, 100), 100, 100, iconBaseDir + `icons/${codeName}.png`);
        metadata[codeName].iconMissing = false;
      } catch (e) {
        skippedItems.push({ codeName, icon: properties.Icon, reason: 'icon file unreadable: ' + iconPath });
      }
    } else {
      skippedItems.push({ codeName, icon: properties.Icon, reason: 'icon file not found: ' + iconPath });
    }
  }
}

// Also track items that had all the required fields but failed the additional filters
for (const file of files) {
  const obj = readJSON(file);
  const properties = findProperties(obj);
  const codeName = properties.CodeName;

  if (!codeName) continue;
  if (metadata[codeName]) continue;
  if (!properties.Icon || !properties.Description || !properties.DisplayName) continue;

  trackIcon(properties.Icon);

  const reasons = [];
  if (!fs.existsSync(baseDir + properties.Icon)) {
    reasons.push('icon file not found: ' + properties.Icon);
  }
  if (file.includes('Structure') && !file.includes('BPBanner') && !file.includes('MaterialPlatform') && !properties.bIsStockpilable) {
    reasons.push('non-stockpilable structure');
  }
  if (file.includes('Lore')) {
    reasons.push('lore item');
  }
  if (reasons.length > 0) {
    skippedItems.push({ codeName, icon: properties.Icon, reason: reasons.join('; ') });
  }
}

fs.writeFileSync('parser/data/metadata.json', JSON.stringify(metadata, null, 2));
console.log(Object.keys(metadata).length, 'items processed');

if (skippedItems.length > 0) {
  console.log(`\n${skippedItems.length} items could not get an icon:\n`);
  for (const item of skippedItems) {
    console.log(`  ${item.codeName} — ${item.reason}`);
  }
  fs.writeFileSync('parser/data/skipped-icons.json', JSON.stringify(skippedItems, null, 2));
  console.log(`\nFull list written to parser/data/skipped-icons.json`);}

// Write list of needed icon files (those that don't exist yet)
const missingIcons = [...neededIconFiles].filter(f => !fs.existsSync(f)).sort();
if (missingIcons.length > 0) {
  fs.writeFileSync('parser/data/needed-icons.txt', missingIcons.join('\n'));
  console.log(`\n${missingIcons.length} icon files needed (missing on disk) → parser/data/needed-icons.txt`);
}
