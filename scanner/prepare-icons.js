import fs from 'fs';
import { glob } from 'glob';
import { createCanvas, loadImage } from 'canvas';
import { toGrayscale, writeImage, encodeImage } from './utils.js';

const iconBaseDir = `/home/sereja/Projects/foxhole/inventory/s6ss/public/`;

const baseDir = '/home/sereja/Projects/foxhole/content/Output/Exports/'; // should contain "War" directory
const crateIcon = await loadImage(baseDir + 'War/Content/Textures/UI/Menus/IconFilterCrates.png');

const itemFiles = glob.sync(baseDir + 'War/Content/Blueprints/ItemPickups/**/*.json');
const vehicleFiles = glob.sync(baseDir + 'War/Content/Blueprints/Vehicles/**/*.json');
const structureFiles = glob.sync(baseDir + 'War/Content/Blueprints/Structures/**/*.json');

const files = [...itemFiles, ...vehicleFiles, ...structureFiles];

let metadata = {};
const modIcons = {
  [baseDir]: {},
  '/home/sereja/Projects/foxhole/content/cleanicons/Output/Exports/': {},
  '/home/sereja/Projects/foxhole/content/newicons/Output/Exports/': {},
};

function readJSON(path) {
  return JSON.parse(fs.readFileSync(path, 'utf-8'));
}

let subTypeIcons = {
  // I don't know how the game decides which icon to use for RPG launchers, so I'll just hardcode them
  ATRPGC: 'War/Content/Textures/UI/ItemIcons/SubtypeAPIcon.0', // venom
  ATRPGHeavyW: 'War/Content/Textures/UI/ItemIcons/SubtypeAPIcon.0', // carnyx
  ATRPGHeavyC: 'War/Content/Textures/UI/ItemIcons/SubtypeAPIcon.0', // bane
  ATRPGLightC: 'War/Content/Textures/UI/ItemIcons/SubtypeAPIcon.0', // ignifist
  ATRPGW: 'War/Content/Textures/UI/ItemIcons/SubtypeAPIcon.0', // bonesaw
  ATRPGTW: 'War/Content/Textures/UI/ItemIcons/SubtypeAPIcon.0', // mountsaw
  ISGTC: 'War/Content/Textures/UI/ItemIcons/SubtypeSEIcon.0', // daucus
  RPGTW: 'War/Content/Textures/UI/ItemIcons/SubtypeSEIcon.0', // foebreaker
  RpgW: 'War/Content/Textures/UI/ItemIcons/SubtypeSEIcon.0', // cutler (don't capitalize)
};

const ammoData = readJSON(baseDir + 'War/Content/Blueprints/Data/BPAmmoDynamicData.json');

for (const [name, row] of Object.entries(ammoData[0].Rows)) {
  if (name != 'UnexplodedOrdnance') {
    const damageType = readJSON(baseDir + row.DamageType.ObjectPath.split('.')[0] + '.json');
    subTypeIcons[name] = damageType[1].Properties.Icon.ResourceObject.ObjectPath;  
  }
}

//console.log(subTypeIcons);

const itemInfo = readJSON(baseDir + 'War/Content/Blueprints/Data/BPItemDynamicData.json')[0].Rows;

// Blueprints/Data/BPItemDynamicData.json
// Blueprints/Data/BPAmmoDynamicData.json
// Blueprints/DamageTypes Properties Icon ResourceObject ObjectPath

// ItemComponentClass ObjectPath to json
// [1] Properties CompatibleAmmoCodeName
// MultiAmmo CompatibleAmmoNames

function findProperties(obj) {
  let properties = {
    Icon: undefined,
    Description: undefined,
    DisplayName: undefined,
    CodeName: undefined,
    FactionVariant: undefined,
    bIsStockpilable: undefined,
    SubTypeIcon: undefined,
  };

  for (const item of obj) {
    if (item.hasOwnProperty('Super')) {
      let parentObj = readJSON(baseDir + item.Super.ObjectPath.split('.')[0] + '.json');
      properties = findProperties(parentObj);
    }
  }

  for (const item of obj) {
    if (item.hasOwnProperty('Properties')) {
      if (item.Properties.hasOwnProperty('Icon') && item.Properties.Icon.hasOwnProperty('ObjectPath')) {
        // the last case might need to be handled
        properties.Icon = item.Properties.Icon.ObjectPath.split('.')[0] + '.png';
      }
      for (const property of ['Description', 'DisplayName', 'CodeName', 'FactionVariant', 'bIsStockpilable', 'SubTypeIcon']) {
        if (item.Properties.hasOwnProperty(property)) {
          properties[property] = item.Properties[property];
        }
      }
    }
  }

  return properties;
}


for (const file of files) {
  const obj = readJSON(file);
  const properties = findProperties(obj);

  if (properties.Icon !== undefined &&
      properties.Description !== undefined &&
      properties.DisplayName !== undefined &&
      properties.CodeName !== undefined &&
      fs.existsSync(baseDir + properties.Icon) &&
      (
        !file.includes('Structure') ||
        file.includes('BPBanner') ||
        file.includes('MaterialPlatform') ||
        properties.bIsStockpilable
      )
      &&
      !file.includes('Lore')
  ) {
    //console.log(file, properties);
    for (const modDir of Object.keys(modIcons)) {
      const codeName = properties.CodeName;
      
      //console.log(file, modDir, Object.keys(modIcons).length);

      const iconImg = await (fs.existsSync(modDir + properties.Icon) ? loadImage(modDir + properties.Icon) : loadImage(baseDir + properties.Icon));

      const canvas = createCanvas(100, 100);
      const ctx = canvas.getContext('2d');
      ctx.drawImage(iconImg, 0, 0, 100, 100);

      let subTypeIconPath = subTypeIcons[codeName];

      if (properties.SubTypeIcon !== undefined && properties.SubTypeIcon.hasOwnProperty('ResourceObject')) {
        subTypeIconPath = properties.SubTypeIcon.ResourceObject.ObjectPath;
      }

      if (subTypeIconPath !== undefined) {
        const path = baseDir + subTypeIconPath.split('.')[0] + '.png'
        const subTypeIcon = await loadImage(path);

        fs.copyFileSync(path, iconBaseDir + `subtypes/${codeName}.png`); // might already exist
        
        ctx.globalAlpha = 0.75;
        ctx.drawImage(subTypeIcon, 0, 0, 44, 44);
        ctx.globalAlpha = 1.0;
      }

      const fullIcon = toGrayscale(ctx.getImageData(0, 0, 100, 100).data);
      
      if (modDir == baseDir) {
        await writeImage(fullIcon, 100, 100, iconBaseDir + `icons/${codeName}.png`);
      }

      // resize to 32x32
      const canvas32 = createCanvas(32, 32);
      const ctx32 = canvas32.getContext('2d');
      ctx32.drawImage(canvas, 0, 0, 100, 100, 0, 0, 32, 32); // todo: various compression algorithms

      const processedIcon = toGrayscale(ctx32.getImageData(0, 0, 32, 32).data);

      //await writeImage(processedIcon, 32, 32, `icons/${codeName}-32.png`);

      // determine if it can be crated?
      ctx32.globalAlpha = 0.75;
      ctx32.drawImage(crateIcon, 32-14, 32-14, 14, 14);        
      ctx32.globalAlpha = 1.0;

      const processedIconCrated = toGrayscale(ctx32.getImageData(0, 0, 32, 32).data);

      let itemType = 'item';

      if (file.includes('Vehicles')) {
        itemType = 'vehicle';
      } else if (file.includes('Structures')) {
        itemType = 'structure';
      }

      if (modDir == baseDir) {
        metadata[codeName] = {
          displayName: properties.DisplayName.SourceString,
          description: properties.Description.SourceString,
          factoryCost: (itemInfo.hasOwnProperty(codeName) ? itemInfo[codeName].CostPerCrate : undefined),
          quantityPerCrate: (itemInfo.hasOwnProperty(codeName) ? itemInfo[codeName].QuantityPerCrate : undefined),
          itemType: itemType,
          warden: properties.FactionVariant === undefined ? undefined : properties.FactionVariant.includes('Wardens')
        }
      }

      modIcons[modDir][codeName] = {
        icon: encodeImage(processedIcon),
        iconCrated: encodeImage(processedIconCrated),
      }
    }
  }
}

fs.writeFileSync('metadata.json', JSON.stringify(metadata, null, 2));
fs.writeFileSync('icons.json', JSON.stringify(modIcons, null, 2));
// todo: split them into mods

console.log(Object.keys(metadata).length, 'items processed');
