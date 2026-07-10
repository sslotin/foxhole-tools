/**
 * process-game-data.js — Consolidated game data extraction
 *
 * Walks game export blueprint files, extracts full metadata (stats, profiles),
 * extracts icons as PNGs, and generates factory/facility recipes.
 *
 * Outputs:
 *   parser/data/metadata.json     — per-item catalog with all stats
 *   parser/data/recipes.json      — factory & facility recipes
 *   parser/data/missing.txt       — missing game icon files & other inconsistencies
 *   public/icons/*.png            — extracted item icons (subtype overlay composited in)
 *
 * Replaces: generate-catalog.mjs, enrich-metadata.mjs, generate-recipes.js
 *
 * Usage: node parser/scripts/process-game-data.js
 */

import fs from 'fs';
import { glob } from 'glob';
import { createCanvas, loadImage } from 'canvas';

// ── Paths ──────────────────────────────────────────────────────────

const GAME_DATA = '/home/sereja/Projects/foxhole/game_data/content/Output/Exports/War/Content/Blueprints';
const EXPORTS_ROOT = '/home/sereja/Projects/foxhole/game_data/content/Output/Exports/';
const DATA_DIR = GAME_DATA + '/Data/';
const ICON_BASE_DIR = '/home/sereja/Projects/foxhole/public/';
const OUTPUT_METADATA = 'parser/data/metadata.json';
const OUTPUT_RECIPES = 'parser/data/recipes.json';

// Clean and recreate icons directory, remove old subtypes dir
fs.rmSync(ICON_BASE_DIR + 'icons', { recursive: true, force: true });
fs.rmSync(ICON_BASE_DIR + 'subtypes', { recursive: true, force: true });
fs.mkdirSync(ICON_BASE_DIR + 'icons', { recursive: true });

// ── Resolve icon path from its ObjectPath (format: "War/Content/Textures/UI/...") ──
function resolveIconPath(objectPath) {
  if (!objectPath) return null;
  return EXPORTS_ROOT + objectPath.split('.')[0] + '.png';
}

function readJSON(path) {
  return JSON.parse(fs.readFileSync(path, 'utf-8'));
}

function findDefaultEntry(data) {
  return data.find(e => e.Name && e.Name.startsWith('Default__'));
}

function findByType(data, type) {
  return data.find(e => e.Type === type);
}

function getDisplayName(data) {
  for (const e of data) {
    const dn = e.Properties?.DisplayName?.SourceString;
    if (dn) return dn;
  }
  return null;
}

function getCodeName(data) {
  for (const e of data) {
    const cn = e.Properties?.CodeName;
    if (cn) return cn;
  }
  return null;
}

function resolveRef(objectPath) {
  if (!objectPath) return null;
  const relPath = objectPath.split('.')[0] + '.json';
  const absPath = DATA_DIR.replace('/Data/', '/') + relPath.replace('War/Content/Blueprints/', '');
  if (!fs.existsSync(absPath)) return null;
  try { return readJSON(absPath); } catch { return null; }
}

/** Walk BlueprintGeneratedClass SuperStruct chain collecting properties */
function collectProperties(data, keys) {
  const result = {};
  const visited = new Set();

  function walk(entry, dataArray) {
    if (!entry || visited.has(entry.Name)) return;
    visited.add(entry.Name);

    const props = entry.Properties || {};
    for (const key of keys) {
      if (props[key] !== undefined && result[key] === undefined) {
        result[key] = props[key];
      }
    }

    // Walk SuperStruct chain
    let superPath = entry.SuperStruct?.ObjectPath;
    if (!superPath && dataArray && entry.Type) {
      const matchingBP = findByType(dataArray, 'BlueprintGeneratedClass');
      if (matchingBP && matchingBP.Name === entry.Name) {
        superPath = matchingBP.SuperStruct?.ObjectPath;
      } else if (matchingBP) {
        const altBP = dataArray.find(e => e.Type === 'BlueprintGeneratedClass' && e.Name === entry.Type);
        if (altBP) superPath = altBP.SuperStruct?.ObjectPath;
      }
    }

    if (superPath) {
      const parentData = resolveRef(superPath);
      if (parentData) {
        const parentDefault = findDefaultEntry(parentData);
        if (parentDefault) walk(parentDefault, parentData);
      }
    }
  }

  const def = findDefaultEntry(data);
  if (def) walk(def, data);
  return result;
}

const ENUM_CLEAN = str => str
  ? str.replace(/^E(FactionId|ItemCategory|ItemProfileType|EquipmentSlot|TechID|VehicleBuildType|ArmourType|BuildLocationType|StructureProfileType|VehicleProfileType|VehicleMovementProfileType|FactoryQueueType|DamageType|TankArmourEffectType|EquippedWeaponGripType|MapIconType|ShippableType|PartType|SlotType|ModificationType)/, '').replace(/::/, '')
  : null;

// ── Data tables ────────────────────────────────────────────────────

function loadDataTable(relPath) {
  const data = readJSON(DATA_DIR + relPath);
  return data[0].Rows || {};
}

function loadProfileMap(relPath, mapKey) {
  const data = readJSON(DATA_DIR + relPath);
  const list = data[2]?.Properties?.[mapKey];
  if (!list) return {};
  const map = {};
  for (const entry of list) {
    map[entry.Key] = entry.Value;
  }
  return map;
}

const ammoData = loadDataTable('BPAmmoDynamicData.json');
const weaponData = loadDataTable('BPWeaponDynamicData.json');
const grenadeData = loadDataTable('BPGrenadeDynamicData.json');
const meleeData = loadDataTable('BPMeleeDynamicData.json');
const vehicleData = loadDataTable('BPVehicleDynamicData.json');
const airData = loadDataTable('BPAirDynamicData.json');
const shipData = loadDataTable('BPShipDynamicData.json');
const structureData = loadDataTable('BPStructureDynamicData.json');
const mountData = loadDataTable('BPMountDynamicData.json');
const aircraftPartData = loadDataTable('BPAircraftPartDynamicData.json');
const itemData = loadDataTable('BPItemDynamicData.json');
const armourData = loadDataTable('BPArmourProfiles.json');
const damageProfiles = loadDataTable('DTDamageProfiles.json');
// Every armour-type column key present in the resistance matrix (used to test
// whether an item's armourType is a real, mappable profile).
const ARMOR_TYPES = new Set();
for (const prof of Object.values(damageProfiles)) {
  for (const k of Object.keys(prof)) {
    if (k !== 'ObjectName' && k !== 'ObjectPath') ARMOR_TYPES.add(k);
  }
}

const itemProfiles = loadProfileMap('BPItemProfileTable.json', 'ItemProfileTable');
const vehicleProfiles = loadProfileMap('BPVehicleProfileList.json', 'VehicleProfileMap');
const vehicleMovementProfiles = loadProfileMap('BPVehicleMovementProfileList.json', 'VehicleMovementProfileMap');
const structureProfiles = loadProfileMap('BPStructureProfileList.json', 'StructureProfileMap');

// ── Ammo / explosive reference (for destruction tables) ─────────
// Base damage per ammo/explosive type lives in BPAmmoDynamicData (covers ammo,
// shells, grenades, RPGs, mines — all with Damage + DamageType). BPGrenadeDynamicData
// has no Damage field, so it is not used here. The DamageType.ObjectPath maps to a
// resistance key via getDamageType().type (e.g. EDamageType::AntiTankExplosive).
// Built lazily (getDamageType / damageTypeCache are defined later in this file).
let _ammoRefs = null;
// True when an icon PNG exists for an ammo code (deprecated ammo have none).
const _iconHas = {};
function ammoHasIcon(code) {
  if (!(code in _iconHas)) _iconHas[code] = fs.existsSync(ICON_BASE_DIR + 'icons/' + code + '.png');
  return _iconHas[code];
}

function getAmmoRefs() {
  if (_ammoRefs) return _ammoRefs;
  const refs = [];
  const seen = new Set();
  for (const [code, row] of Object.entries(ammoData)) {
    const dmg = row.Damage;
    if (!dmg || dmg <= 0) continue; // zero/no damage (flares, smoke, gas) -> excluded
    const dt = row.DamageType?.ObjectPath ? getDamageType(row.DamageType.ObjectPath) : null;
    if (!dt || !dt.type) continue;
    const key = ENUM_CLEAN(dt.type); // -> AntiTankExplosive, LightKinetic, ...
    if (!damageProfiles[key]) continue; // not a resistance-keyed damage type
    if (seen.has(code)) continue;
    seen.add(code);
    refs.push({ code, damage: dmg, damageTypeKey: key });
  }
  _ammoRefs = refs;
  return refs;
}

// Tier families: an item whose armourType ends with one of these gets T1/T2/T3 columns.
const TIER_FAMILIES = {
  GarrisonHouse: ['Tier1GarrisonHouse', 'Tier2GarrisonHouse', 'Tier3GarrisonHouse'],
  Structure: ['Tier1Structure', 'Tier2Structure', 'Tier3Structure'],
  Tank: ['Tier1Tank', 'Tier2Tank'],
};
function tierInfo(armourType) {
  for (const [fam, arr] of Object.entries(TIER_FAMILIES)) {
    if (armourType.endsWith(fam)) {
      const digit = parseInt((armourType.match(/Tier(\d)/) || [])[1] || '1', 10);
      const idx = arr.findIndex(t => t === `Tier${digit}${fam}`);
      return { labels: arr.map((_, i) => 'T' + (i + 1)), armourTypes: arr, currentIndex: idx < 0 ? 0 : idx };
    }
  }
  return null;
}

// Kinetic weapons randomize damage per shot (≈75%–175% of base); the wiki's
// kill counts use the average, i.e. 1.25× the listed base damage.
const RANDOM_DAMAGE_TYPES = new Set(['LightKinetic', 'HeavyKinetic', 'AntiTankKinetic']);
// Round up to one decimal place (ceil at 0.1 precision).
function ceil1(x) { return Math.ceil(x * 10) / 10; }

// Compute the resistances + destruction table for a structure/vehicle.
function computeDestruction(item, labelOf) {
  const armourType = item.armourType;
  // Health lives at item.maxHealth (structures) or item.vehicleData.maxHealth (vehicles).
  const health = item.maxHealth ?? item.vehicleData?.maxHealth ?? item.health;
  if (!armourType || !health || health <= 0) return null;
  const isVehicle = item.itemType === 'vehicle';
  const disablePercent = isVehicle ? (item.vehicleData?.minorDamagePercent ?? 0) : 0;
  const tier = tierInfo(armourType);
  const rows = [];
  for (const a of getAmmoRefs()) {
    const prof = damageProfiles[a.damageTypeKey];
    const mult = prof ? prof[armourType] : undefined;
    // `mult` is the RESISTANCE FRACTION (0 = no resistance / full damage taken,
    // 1 = immune). Effective damage = raw × (1 − resistance).
    if (mult === undefined) continue; // no profile entry for this armour/damage combo
    const dmgMult = 1 - mult;
    if (dmgMult <= 0) continue;       // immune (resistance ≥ 100%)
    // Kinetic weapons randomize damage per shot (≈75%–175% of base); the wiki's
    // kill counts use the average, i.e. 1.25× the listed base damage.
    const avgMult = RANDOM_DAMAGE_TYPES.has(a.damageTypeKey) ? 1.25 : 1;
    const effective = a.damage * avgMult * dmgMult;
    const toKill = ceil1(health / effective);
    const toDisable = disablePercent > 0 ? ceil1((health * disablePercent) / effective) : null;
    const tierCells = tier
      ? tier.armourTypes.map(at => {
          const mRaw = damageProfiles[a.damageTypeKey]?.[at]; // resistance fraction
          const dmg = mRaw === undefined ? 1 : 1 - mRaw;      // damage taken (default: full)
          const eff = a.damage * avgMult * dmg;
          return {
            mult: mRaw ?? null,
            toKill: eff > 0 ? ceil1(health / eff) : null,
            toDisable: disablePercent > 0 && eff > 0 ? ceil1((health * disablePercent) / eff) : null,
          };
        })
      : null;
    rows.push({
      code: a.code,
      label: labelOf(a.code),
      damageType: a.damageTypeKey,
      baseDamage: a.damage,
      mult,
      hasIcon: ammoHasIcon(a.code),
      toKill,
      toDisable,
      tierCells,
    });
  }
  if (!rows.length) return null;
  // Resistance % per damage type for this armourType (for the Resistances block).
  const resistance = {};
  for (const [dt, prof] of Object.entries(damageProfiles)) {
    if (prof[armourType] !== undefined) resistance[dt] = prof[armourType];
  }
  return {
    armourType,
    health,
    disablePercent,
    isVehicle,
    resistance,
    tiers: tier ? { labels: tier.labels, currentIndex: tier.currentIndex } : null,
    ammo: rows,
  };
}

// ── Damage type cache ──────────────────────────────────────────────

const damageTypeCache = {};
function getDamageType(objectPath) {
  if (!objectPath) return null;
  if (damageTypeCache[objectPath] !== undefined) return damageTypeCache[objectPath];
  const data = resolveRef(objectPath);
  if (!data) { damageTypeCache[objectPath] = null; return null; }
  for (const entry of data) {
    const props = entry.Properties;
    if (props?.DisplayName?.SourceString) {
      const dt = {
        displayName: props.DisplayName.SourceString,
        type: props.Type,
        iconPath: props.Icon?.ResourceObject?.ObjectPath ? props.Icon.ResourceObject.ObjectPath.split('.')[0] + '.png' : null,
        tankArmourEffectType: props.TankArmourEffectType,
        tankArmourPenetrationFactor: props.TankArmourPenetrationFactor,
        bApplyTankArmourMechanics: props.bApplyTankArmourMechanics,
        bCanRuinStructures: props.bCanRuinStructures,
        bApplyDamageFalloff: props.bApplyDamageFalloff,
        bCanWoundCharacter: props.bCanWoundCharacter,
        bAlwaysAppliesBleeding: props.bAlwaysAppliesBleeding,
        bExposeInUI: props.bExposeInUI,
        vehicleSubsystemDisableMultipliers: props.VehicleSubsystemDisableMultipliers,
      };
      if (props.DescriptionDetails) {
        dt.descriptionDetails = Array.isArray(props.DescriptionDetails)
          ? props.DescriptionDetails.map(d => d.SourceString).filter(Boolean).join('\n')
          : props.DescriptionDetails;
      }
      damageTypeCache[objectPath] = dt;
      return dt;
    }
  }
  damageTypeCache[objectPath] = null;
  return null;
}

// ── Production categories ──────────────────────────────────────────

function loadProductionCategories() {
  const result = { factory: {}, massProduction: {} };
  const files = [
    { path: 'Structures/BPFactory.json', key: 'factory' },
    { path: 'Structures/BPMassProduction.json', key: 'massProduction' },
  ];
  for (const { path, key } of files) {
    const absPath = GAME_DATA + '/' + path;
    if (!fs.existsSync(absPath)) continue;
    const data = readJSON(absPath);
    for (const entry of data) {
      const props = entry.Properties;
      if (props?.ProductionCategories) {
        const cats = props.ProductionCategories;
        if (Array.isArray(cats)) {
          for (const cat of cats) {
            const queueType = cat.Type;
            const items = (cat.CategoryItems || []).map(i => i.CodeName).filter(Boolean);
            for (const item of items) {
              result[key][item] = queueType;
            }
          }
        }
      }
    }
  }
  return result;
}

const productionCategories = loadProductionCategories();

// ── Vehicle upgrade sources ───────────────────────────────────
// Vehicles produced only by upgrading another vehicle (not built at a Garage
// or MPF-able) list a RequiredCodeName in the Vehicle Factory facility recipes.
// Returns map: upgradeOnlyVehicleCode -> sourceVehicleCode.
function loadVehicleUpgradeSources() {
  const map = {};
  for (const f of ['Structures/Facilities/BPFacilityVehicleFactory1.json', 'Structures/Facilities/BPFacilityVehicleFactory2.json', 'Structures/Facilities/BPFacilityVehicleFactory3.json']) {
    const absPath = GAME_DATA + '/' + f;
    if (!fs.existsSync(absPath)) continue;
    const data = readJSON(absPath);
    (function walk(obj) {
      if (Array.isArray(obj)) { for (const e of obj) walk(e); return; }
      if (obj && typeof obj === 'object') {
        if (obj.CodeName && obj.RequiredCodeName && obj.RequiredCodeName !== 'None') map[obj.CodeName] = obj.RequiredCodeName;
        for (const v of Object.values(obj)) walk(v);
      }
    })(data);
  }
  return map;
}

const vehicleUpgradeSources = loadVehicleUpgradeSources();

// ── Subtype icons (ammo damage types) ──────────────────────────────

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

const ammoRows = loadDataTable('BPAmmoDynamicData.json');
for (const [name, row] of Object.entries(ammoRows)) {
  if (name !== 'UnexplodedOrdnance' && row.DamageType?.ObjectPath) {
    const dtData = resolveRef(row.DamageType.ObjectPath);
    if (dtData) {
      for (const entry of dtData) {
        if (entry.Properties?.Icon?.ResourceObject?.ObjectPath) {
          subTypeIcons[name] = entry.Properties.Icon.ResourceObject.ObjectPath;
        }
      }
    }
  }
}

// ── Material name map (for recipe display) ─────────────────────────

const MATERIAL_NAMES = {
  Cloth: 'Basic Materials',
  Wood: 'Refined Materials',
  Components: 'Components',
  Sulfur: 'Sulfur',
  Explosive: 'Explosive Powder',
  HeavyExplosive: 'Heavy Explosive Powder',
  Metal: 'Metal',
  FacilityMaterials1: 'Construction Materials',
  FacilityMaterials2: 'Processed Construction Materials',
  FacilityMaterials3: 'Assembly Materials',
  RareMetal: 'Rare Metal',
  Concrete: 'Concrete',
  UpgradePart: 'Upgrade Part',
  GroundMaterials: 'Gravel',
  Petrol: 'Petrol',
  HeavyOil: 'Heavy Oil',
  Diesel: 'Diesel',
  Coal: 'Coal',
  RFuel: 'Refined Diesel',
  EnrichedU: 'Enriched Uranium',
  RelicMaterials: 'Relic Materials',
  Excavation: 'Excavation Materials',
  MetalBeamMaterials: 'Metal Beam Materials',
  SandbagMaterials: 'Sandbag Materials',
  BarbedWireMaterials: 'Barbed Wire Materials',
  PipeMaterials: 'Pipe Materials',
  WaterWallMaterials: 'Water Wall Materials',
  concrete: 'Concrete',
  FacilityMaterials9: 'Facility Materials Mk.II',
};

// Convert a DataTable ResourceAmounts block → build-cost array.
// Shape: { Resource: {CodeName, Quantity}, OtherResources: [{CodeName, Quantity}] }
function buildCostFromResourceAmounts(ra) {
  if (!ra) return null;
  const res = [ra.Resource, ...(ra.OtherResources || [])]
    .filter(r => r && r.CodeName && r.CodeName !== 'None' && r.Quantity > 0);
  if (!res.length) return null;
  return res.map(r => ({
    codeName: r.CodeName,
    quantity: r.Quantity,
    displayName: MATERIAL_NAMES[r.CodeName] || r.CodeName,
  }));
}

// ── Blueprint search config ────────────────────────────────────────

const SEARCH_DIRS = ['ItemPickups/', 'Vehicles/', 'Structures/'];
const EXCLUDE_DIRS = new Set([
  'Data/', 'Items/', 'DamageTypes/', 'MapImages/', 'Materials/',
  'MorphTargets/', 'SkeletalMeshes/', 'SoundCues/', 'StaticMeshes/',
  'Textures/', 'Animations/', 'FX/',
]);
const SKIP_FILES = new Set(['BPRareMaterialsPickup.json']);

const CORE_KEYS = [
  'CodeName', 'DisplayName', 'Description', 'Icon',
  'FactionVariant', 'TechID', 'Encumbrance', 'EquipmentSlot',
  'ItemCategory', 'ItemProfileType', 'ItemFlagsMask',
  'SubTypeIcon',
  'VehicleProfileType', 'VehicleMovementProfileType',
  'ArmourType', 'ProfileType', 'BuildLocationType',
  'ChassisName', 'ShippableInfo',
  'FuelTank', 'MaxHealth',
  'DepthCuttoffForSwimDamage',
  'VehicleBuildType', 'MapIconType',
  'bIsLarge', 'bCanUseStructures',
  'bRequiresCoverOrLowStanceToInvoke',
  'bRequiresVehicleToBuild', 'bSupportsVehicleMounts',
  'BoostSpeedModifier', 'BoostGasUsageModifier',
  'VehiclesPerCrateBonusQuantity',
  'ItemComponentClass',
];

// Component properties to collect, walked through the component's SuperStruct
// chain so inherited fields (e.g. CompatibleAmmoCodeName on a shared base
// component) are captured even when a variant's own JSON omits them.
const COMPONENT_KEYS = [
  'FiringMode', 'FiringRate', 'ReloadTime', 'MaxAmmo', 'ReloadTime',
  'CompatibleAmmoCodeName', 'EquippedGripType', 'DeployCodeName',
  'bIsSingleUse', 'bCanFireFromVehicle', 'SafeItem', 'MultiAmmo',
  'ProjectileClasses',
];

// ═══════════════════════════════════════════════════════════════════
// PART 1: METADATA EXTRACTION + ICON EXTRACTION
// ═══════════════════════════════════════════════════════════════════

const metadata = {};
const missingIssues = [];

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

for (const dir of SEARCH_DIRS) {
  const pattern = GAME_DATA + '/' + dir + '**/*.json';
  let files;
  try { files = glob.sync(pattern, { nodir: true }); } catch { continue; }

  for (const absPath of files) {
    const relPath = absPath.replace(GAME_DATA + '/', '');
    const parentDir = relPath.split('/').slice(0, -1).join('/');
    if (EXCLUDE_DIRS.has(parentDir)) continue;

    const fileName = relPath.split('/').pop();
    if (SKIP_FILES.has(fileName)) continue;
    if (fileName.includes('VehicleProxy')) continue;

    let data;
    try { data = readJSON(absPath); } catch { continue; }

    if (!findByType(data, 'BlueprintGeneratedClass')) continue;
    const def = findDefaultEntry(data);
    if (!def) continue;

    // World-structure armour mapping. A few build-site world structures have no
    // ArmourType in their blueprint but use a known resistance profile (official
    // wiki Structure Health Table):
    //   Safe House (Garrison Station) tiers -> Tier1/2/3 Garrison House
    //   Relic Base (small model)    -> Tier3Structure
    // (The Town Base blueprints are re-expressed as three named Town-Hall types —
    // Post Office / School / Town Center — each a 3-tier Garrison House structure;
    // see the synthesis step just before the family-merge pass.)
    const WORLD_STRUCTURE_ARMOUR = (() => {
      const m = {};
      // Safe House: base GarrisonStation = tier 0 -> Tier1; GarrisonStation1 =
      // tier 1 -> Tier2. A Tier 3 member is absent from the game export.
      m.GarrisonStation = 'Tier1GarrisonHouse';
      m.GarrisonStation1 = 'Tier2GarrisonHouse';
      // Relic Base has no three-tier system; all models use Tier3Structure.
      m.RelicBase1 = 'Tier3Structure';
      return m;
    })();
    function resolveArmourType(cn, rawArmourType) {
      if (rawArmourType && ARMOR_TYPES.has(rawArmourType)) return rawArmourType;
      const mapped = WORLD_STRUCTURE_ARMOUR[cn];
      return mapped && ARMOR_TYPES.has(mapped) ? mapped : null;
    }

    const raw = collectProperties(data, CORE_KEYS);
    const codeName = raw.CodeName;
    if (!codeName || !raw.DisplayName?.SourceString || !raw.Description?.SourceString || !raw.Icon?.ObjectPath) continue;

    let itemType = 'item';
    if (relPath.startsWith('Vehicles/')) itemType = 'vehicle';
    else if (relPath.startsWith('Structures/')) itemType = 'structure';

    const item = {
      displayName: raw.DisplayName.SourceString,
      description: raw.Description.SourceString,
      itemType,
    };

    // Faction
    if (raw.FactionVariant) {
      if (raw.FactionVariant.includes('Wardens')) item.warden = true;
      else if (raw.FactionVariant.includes('Colonials')) item.warden = false;
    }

    // Tech unlock
    if (raw.TechID && raw.TechID !== 'ETechID::None' && raw.TechID !== 'ETechID::ETechID_MAX') {
      item.requiresTech = true;
    }

    // Scalar properties
    if (raw.Encumbrance !== undefined) item.encumbrance = raw.Encumbrance;
    item.equipmentSlot = ENUM_CLEAN(raw.EquipmentSlot);
    if (raw.ItemCategory) item.itemCategory = ENUM_CLEAN(raw.ItemCategory);
    if (raw.ItemProfileType) item.itemProfileType = ENUM_CLEAN(raw.ItemProfileType);
    if (raw.MaxHealth !== undefined) item.maxHealth = raw.MaxHealth;
    if (raw.bIsLarge !== undefined) item.isLarge = raw.bIsLarge;
    if (raw.FuelTank !== undefined) item.fuelTank = raw.FuelTank;
    if (raw.ChassisName?.SourceString) item.chassisName = raw.ChassisName.SourceString;
    if (raw.VehicleBuildType) item.vehicleBuildType = ENUM_CLEAN(raw.VehicleBuildType);
    if (raw.VehicleProfileType) item.vehicleProfileType = ENUM_CLEAN(raw.VehicleProfileType);
    if (raw.VehicleMovementProfileType) item.vehicleMovementProfileType = ENUM_CLEAN(raw.VehicleMovementProfileType);
    item.armourType = resolveArmourType(codeName, raw.ArmourType ? ENUM_CLEAN(raw.ArmourType) : null);
    if (raw.ProfileType) item.profileType = ENUM_CLEAN(raw.ProfileType);
    if (raw.BuildLocationType) item.buildLocationType = ENUM_CLEAN(raw.BuildLocationType);
    if (raw.MapIconType) item.mapIconType = ENUM_CLEAN(raw.MapIconType);
    if (raw.BoostSpeedModifier !== undefined) item.boostSpeedModifier = raw.BoostSpeedModifier;
    if (raw.BoostGasUsageModifier !== undefined) item.boostGasUsageModifier = raw.BoostGasUsageModifier;
    if (raw.VehiclesPerCrateBonusQuantity !== undefined) item.vehiclesPerCrateBonus = raw.VehiclesPerCrateBonusQuantity;
    if (raw.DepthCuttoffForSwimDamage !== undefined) item.depthCutoffForSwimDamage = raw.DepthCuttoffForSwimDamage;

    // Flags
    if (raw.bCanUseStructures !== undefined) item.canUseStructures = raw.bCanUseStructures;
    if (raw.bRequiresCoverOrLowStanceToInvoke !== undefined) item.requiresCoverOrLowStance = raw.bRequiresCoverOrLowStanceToInvoke;
    if (raw.bRequiresVehicleToBuild !== undefined) item.requiresVehicleToBuild = raw.bRequiresVehicleToBuild;
    if (raw.bSupportsVehicleMounts !== undefined) item.supportsVehicleMounts = raw.bSupportsVehicleMounts;

    // Shippable info
    if (raw.ShippableInfo) {
      item.shippableType = ENUM_CLEAN(raw.ShippableInfo.Type);
      item.canBeCrated = raw.ShippableInfo.bAllowPackagingToCrate;
    }

    // SubTypeIcon
    if (raw.SubTypeIcon?.ResourceObject?.ObjectPath) {
      item.subTypeIconPath = raw.SubTypeIcon.ResourceObject.ObjectPath.split('.')[0] + '.png';
    }

    // ── ItemComponentClass (weapon component) ──────────────
    if (raw.ItemComponentClass?.ObjectPath) {
      const compData = resolveRef(raw.ItemComponentClass.ObjectPath);
      if (compData) {
        // Collect through the component's SuperStruct chain so inherited
        // fields (e.g. CompatibleAmmoCodeName on a shared base component) are
        // captured even when the variant's own JSON omits them.
        const cp = collectProperties(compData, COMPONENT_KEYS);
        if (Object.keys(cp).length > 0) {
          if (cp.FiringMode) cp.firingMode = cp.FiringMode;
          if (cp.FiringRate !== undefined) cp.firingRate = cp.FiringRate;
          if (cp.MaxAmmo !== undefined) cp.maxAmmo = cp.MaxAmmo;
          if (cp.ReloadTime !== undefined) cp.reloadTime = cp.ReloadTime;
          if (cp.CompatibleAmmoCodeName) cp.compatibleAmmoCodeName = cp.CompatibleAmmoCodeName;
          if (cp.EquippedGripType) cp.equippedGripType = ENUM_CLEAN(cp.EquippedGripType);
          if (cp.DeployCodeName) cp.deployCodeName = cp.DeployCodeName;
          if (cp.bIsSingleUse !== undefined) cp.isSingleUse = cp.bIsSingleUse;
          if (cp.bCanFireFromVehicle !== undefined) cp.canFireFromVehicle = cp.bCanFireFromVehicle;
          if (cp.SafeItem) cp.safeItemRef = cp.SafeItem;
          if (cp.MultiAmmo) {
            const ammos = (cp.MultiAmmo.CompatibleAmmoNames || cp.MultiAmmo)
              .filter(a => a && a !== 'None');
            if (Array.isArray(ammos)) cp.compatibleAmmoCodeNames = ammos;
          }
          if (cp.ProjectileClasses && Array.isArray(cp.ProjectileClasses)) {
            cp.projectileClass = cp.ProjectileClasses.map(pc => {
              const projData = resolveRef(pc.ObjectPath);
              if (!projData) return { objectPath: pc.ObjectPath?.split('.')[0] };
              const projDef = findDefaultEntry(projData);
              const pp = projDef?.Properties || {};
              return {
                objectPath: pc.ObjectPath?.split('.')[0],
                explosiveCodeName: pp.ExplosiveCodeName,
                autoDetonateTime: pp.AutoDetonateTime,
                penetrationBonusMaxRange: pp.PenetrationBonusMaxRange,
                projectileDeathDelay: pp.ProjectileDeathDelay,
              };
            });
          }
          item.itemComponent = cp;
        }
      }
    }

    // ── Ammo code name ─────────────────────────────────────
    let ammoCodeName = codeName;
    if (item.itemComponent?.compatibleAmmoCodeName) {
      ammoCodeName = item.itemComponent.compatibleAmmoCodeName;
    } else if (item.itemComponent?.compatibleAmmoCodeNames?.length === 1) {
      ammoCodeName = item.itemComponent.compatibleAmmoCodeNames[0];
    }

    // ── Ammo data ──────────────────────────────────────────
    if (ammoData[codeName] || (ammoCodeName && ammoData[ammoCodeName])) {
      const a = ammoData[ammoCodeName] || ammoData[codeName];
      if (a) {
        item.ammoData = {};
        if (a.Damage !== undefined) item.ammoData.damage = a.Damage;
        if (a.Suppression !== undefined) item.ammoData.suppression = a.Suppression;
        if (a.ExplosionRadius !== undefined) item.ammoData.explosionRadius = a.ExplosionRadius;
        if (a.DamageInnerRadius !== undefined) item.ammoData.damageInnerRadius = a.DamageInnerRadius;
        if (a.DamageFalloff !== undefined) item.ammoData.damageFalloff = a.DamageFalloff;
        if (a.AccuracyRadius !== undefined) item.ammoData.accuracyRadius = a.AccuracyRadius;
        if (a.EnvironmentImpactAmount !== undefined) item.ammoData.environmentImpactAmount = a.EnvironmentImpactAmount;
        if (a.AddedBurning !== undefined) item.ammoData.addedBurning = a.AddedBurning;
        if (a.AddedHeat !== undefined) item.ammoData.addedHeat = a.AddedHeat;
        if (a.BreachingModifier !== undefined) item.ammoData.breachingModifier = a.BreachingModifier;
        if (a.DamageType?.ObjectPath) {
          item.ammoData.damageType = getDamageType(a.DamageType.ObjectPath);
        }
      }
    }

    // ── Weapon data ────────────────────────────────────────
    if (weaponData[codeName]) {
      const w = weaponData[codeName];
      item.weaponData = {};
      if (w.SuppressionMultiplier !== undefined) item.weaponData.suppressionMultiplier = w.SuppressionMultiplier;
      if (w.MaxAmmo !== undefined) item.weaponData.maxAmmo = w.MaxAmmo;
      if (w.MaxApexHalfAngle !== undefined) item.weaponData.maxApexHalfAngle = w.MaxApexHalfAngle;
      if (w.BaselineApexHalfAngle !== undefined) item.weaponData.baselineApexHalfAngle = w.BaselineApexHalfAngle;
      if (w.StabilityCostPerShot !== undefined) item.weaponData.stabilityCostPerShot = w.StabilityCostPerShot;
      if (w.Agility !== undefined) item.weaponData.agility = w.Agility;
      if (w.ShoulderingDuration !== undefined) item.weaponData.shoulderingDuration = w.ShoulderingDuration;
      if (w.StabilityGainRate !== undefined) item.weaponData.stabilityGainRate = w.StabilityGainRate;
      if (w.CoverProvided !== undefined) item.weaponData.coverProvided = w.CoverProvided;
      if (w.MaximumRange !== undefined) item.weaponData.maximumRange = w.MaximumRange;
      if (w.MaximumReachability !== undefined) item.weaponData.maximumReachability = w.MaximumReachability;
      if (w.DamageMultiplier !== undefined) item.weaponData.damageMultiplier = w.DamageMultiplier;
      if (w.ArtilleryAccuracyMinDist !== undefined) item.weaponData.artilleryAccuracyMinDist = w.ArtilleryAccuracyMinDist;
      if (w.ArtilleryAccuracyMaxDist !== undefined) item.weaponData.artilleryAccuracyMaxDist = w.ArtilleryAccuracyMaxDist;
      if (w.MaxVehicleDeviationAngle !== undefined) item.weaponData.maxVehicleDeviationAngle = w.MaxVehicleDeviationAngle;
    }

    // ── Grenade data ───────────────────────────────────────
    if (grenadeData[codeName]) {
      const g = grenadeData[codeName];
      item.grenadeData = {};
      if (g.MinTossSpeed !== undefined) item.grenadeData.minTossSpeed = g.MinTossSpeed;
      if (g.MaxTossSpeed !== undefined) item.grenadeData.maxTossSpeed = g.MaxTossSpeed;
      if (g.GrenadeFuseTimer !== undefined) item.grenadeData.grenadeFuseTimer = g.GrenadeFuseTimer;
      if (g.GrenadeRangeLimit !== undefined) item.grenadeData.grenadeRangeLimit = g.GrenadeRangeLimit;
      if (g.ArmourDamageModifier !== undefined) item.grenadeData.armourDamageModifier = g.ArmourDamageModifier;
    }

    // ── Melee data ─────────────────────────────────────────
    if (meleeData[codeName]) {
      const m = meleeData[codeName];
      item.meleeData = {};
      if (m.ChargingMaxSpeedModifier !== undefined) item.meleeData.chargingMaxSpeedModifier = m.ChargingMaxSpeedModifier;
      if (m.BlockingMaxSpeedModifier !== undefined) item.meleeData.blockingMaxSpeedModifier = m.BlockingMaxSpeedModifier;
      if (m.QuickAttack) item.meleeData.quickAttack = {};
      if (m.QuickAttack?.StaminaCostNormalized !== undefined) item.meleeData.quickAttack.staminaCostNormalized = m.QuickAttack.StaminaCostNormalized;
      if (m.QuickAttack?.Damage !== undefined) item.meleeData.quickAttack.damage = m.QuickAttack.Damage;
      if (m.QuickAttack?.Delay !== undefined) item.meleeData.quickAttack.delay = m.QuickAttack.Delay;
      if (m.LongAttack) item.meleeData.longAttack = {};
      if (m.LongAttack?.StaminaCostNormalized !== undefined) item.meleeData.longAttack.staminaCostNormalized = m.LongAttack.StaminaCostNormalized;
      if (m.LongAttack?.Damage !== undefined) item.meleeData.longAttack.damage = m.LongAttack.Damage;
      if (m.LongAttack?.Delay !== undefined) item.meleeData.longAttack.delay = m.LongAttack.Delay;
    }

    // ── Vehicle data ───────────────────────────────────────
    if (vehicleData[codeName]) {
      const v = vehicleData[codeName];
      item.vehicleData = {};
      if (v.MaxHealth !== undefined) item.vehicleData.maxHealth = v.MaxHealth;
      if (v.MinorDamagePercent !== undefined) item.vehicleData.minorDamagePercent = v.MinorDamagePercent;
      if (v.MajorDamagePercent !== undefined) item.vehicleData.majorDamagePercent = v.MajorDamagePercent;
      if (v.RepairCost !== undefined) item.vehicleData.repairCost = v.RepairCost;
      if (v.ResourcesPerBuildCycle !== undefined) item.vehicleData.resourcesPerBuildCycle = v.ResourcesPerBuildCycle;
      if (v.ItemHolderCapacity !== undefined) item.vehicleData.itemHolderCapacity = v.ItemHolderCapacity;
      if (v.FuelCapacity !== undefined) item.vehicleData.fuelCapacity = v.FuelCapacity;
      if (v.FuelConsumptionPerSecond !== undefined) item.vehicleData.fuelConsumptionPerSecond = v.FuelConsumptionPerSecond;
      if (v.SwimmingFuelConsumptionModifier !== undefined) item.vehicleData.swimmingFuelConsumptionModifier = v.SwimmingFuelConsumptionModifier;
      if (v.DefaultSurfaceMovementRate !== undefined) item.vehicleData.defaultSurfaceMovementRate = v.DefaultSurfaceMovementRate;
      if (v.OffroadSnowPenalty !== undefined) item.vehicleData.offroadSnowPenalty = v.OffroadSnowPenalty;
      if (v.ReverseSpeedModifier !== undefined) item.vehicleData.reverseSpeedModifier = v.ReverseSpeedModifier;
      if (v.RotationRate !== undefined) item.vehicleData.rotationRate = v.RotationRate;
      if (v.RotationSpeedCuttoff !== undefined) item.vehicleData.rotationSpeedCutoff = v.RotationSpeedCuttoff;
      if (v.SpeedSqrThreshold !== undefined) item.vehicleData.speedSqrThreshold = v.SpeedSqrThreshold;
      if (v.EngineForce !== undefined) item.vehicleData.engineForce = v.EngineForce;
      if (v.MassOverride !== undefined) item.vehicleData.massOverride = v.MassOverride;
      if (v.TankArmour !== undefined) item.vehicleData.tankArmour = v.TankArmour;
      if (v.MinTankArmourPercent !== undefined) item.vehicleData.minTankArmourPercent = v.MinTankArmourPercent;
      if (v.TankArmourMinPenetrationChance !== undefined) item.vehicleData.tankArmourMinPenetrationChance = v.TankArmourMinPenetrationChance;
      if (v.bHasTierUpgrades !== undefined) item.vehicleData.hasTierUpgrades = v.bHasTierUpgrades;
      if (v.VehicleSubsystemDisableChances !== undefined) item.vehicleData.subsystemDisableChances = v.VehicleSubsystemDisableChances;
      if (v.MaxFlatOutSpeed !== undefined) item.vehicleData.maxFlatOutSpeed = v.MaxFlatOutSpeed;
    }

    // Garage build cost (per vehicle)
    const vBuild = buildCostFromResourceAmounts(vehicleData[codeName]?.ResourceAmounts);
    if (vBuild) item.buildCost = vBuild;

    // Upgrade-only vehicles are produced by upgrading another vehicle at a
    // Vehicle Factory, not built at a Garage or MPF-able. Record the source.
    if (vehicleUpgradeSources[codeName]) item.upgradeFromCodeName = vehicleUpgradeSources[codeName];

    // ── Vehicle profile ────────────────────────────────────
    if (raw.VehicleProfileType && vehicleProfiles[raw.VehicleProfileType]) {
      const vp = vehicleProfiles[raw.VehicleProfileType];
      item.vehicleProfile = {};
      if (vp.bUsesRollTrace !== undefined) item.vehicleProfile.usesRollTrace = vp.bUsesRollTrace;
      if (vp.bCanTriggerMine !== undefined) item.vehicleProfile.canTriggerMine = vp.bCanTriggerMine;
      if (vp.bCanTriggerInfantryMine !== undefined) item.vehicleProfile.canTriggerInfantryMine = vp.bCanTriggerInfantryMine;
      if (vp.bCanTriggerWaterMine !== undefined) item.vehicleProfile.canTriggerWaterMine = vp.bCanTriggerWaterMine;
      if (vp.bUsesGas !== undefined) item.vehicleProfile.usesGas = vp.bUsesGas;
      if (vp.DrivingSpeedThreshold !== undefined) item.vehicleProfile.drivingSpeedThreshold = vp.DrivingSpeedThreshold;
      if (vp.MaxVehicleAngle !== undefined) item.vehicleProfile.maxVehicleAngle = vp.MaxVehicleAngle;
      if (vp.bEnableStealth !== undefined) item.vehicleProfile.enableStealth = vp.bEnableStealth;
      if (vp.DamageDrivingOverStructures !== undefined) item.vehicleProfile.damageDrivingOverStructures = vp.DamageDrivingOverStructures;
      if (vp.DamageDrivingOverIce !== undefined) item.vehicleProfile.damageDrivingOverIce = vp.DamageDrivingOverIce;
      if (vp.bIsAllowedToLoadMultiple !== undefined) item.vehicleProfile.isAllowedToLoadMultiple = vp.bIsAllowedToLoadMultiple;
    }

    // ── Vehicle movement profile ───────────────────────────
    if (raw.VehicleMovementProfileType && vehicleMovementProfiles[raw.VehicleMovementProfileType]) {
      const vmp = vehicleMovementProfiles[raw.VehicleMovementProfileType];
      item.vehicleMovementProfile = {};
      if (vmp.Mass !== undefined) item.vehicleMovementProfile.mass = vmp.Mass;
      if (vmp.MaxEncumbranceMassOverride !== undefined) item.vehicleMovementProfile.maxEncumbranceMassOverride = vmp.MaxEncumbranceMassOverride;
      if (vmp.BrakeForce !== undefined) item.vehicleMovementProfile.brakeForce = vmp.BrakeForce;
      if (vmp.HandbrakeForce !== undefined) item.vehicleMovementProfile.handbrakeForce = vmp.HandbrakeForce;
      if (vmp.AirResistance !== undefined) item.vehicleMovementProfile.airResistance = vmp.AirResistance;
      if (vmp.RollingResistance !== undefined) item.vehicleMovementProfile.rollingResistance = vmp.RollingResistance;
      if (vmp.LowSpeedEngineForceMultiplier !== undefined) item.vehicleMovementProfile.lowSpeedEngineForceMultiplier = vmp.LowSpeedEngineForceMultiplier;
      if (vmp.LowGearCutoff !== undefined) item.vehicleMovementProfile.lowGearCutoff = vmp.LowGearCutoff;
      if (vmp.CenterOfGravityHeight !== undefined) item.vehicleMovementProfile.centerOfGravityHeight = vmp.CenterOfGravityHeight;
      if (vmp.bUsesDifferentialSteering !== undefined) item.vehicleMovementProfile.usesDifferentialSteering = vmp.bUsesDifferentialSteering;
      if (vmp.bCanRotateInPlace !== undefined) item.vehicleMovementProfile.canRotateInPlace = vmp.bCanRotateInPlace;
    }

    // ── Air data ───────────────────────────────────────────
    if (airData[codeName]) {
      const a = airData[codeName];
      item.airData = {};
      for (const key of ['EnginePower', 'MaxSpeed', 'MaxSpeedFromEngine',
        'MaxSpeedFromEngineUnsupportedSurface', 'MaxSpeedFromEngineMissingPartMultiplier',
        'MaxEngineRPM', 'OverspeedEngineRPM', 'MaxReverseThrottlePct',
        'MaxReverseThrottleSpeed', 'SimulationScale', 'SupportedSurfaceTypes',
        'WheelBrakeCoefficient', 'SuspensionStiffness', 'SuspensionDamping',
        'TailSuspensionStiffness', 'TailSuspensionDamping',
        'NormalizedCrashDamagePerSecond', 'CrashDamageAngleThreshold',
        'AssistModeMaxRoll', 'AssistModeMaxPitch',
        'MinSpeedFlaps', 'MinSpeedOffset',
      ]) {
        if (a[key] !== undefined) item.airData[key] = a[key];
      }
    }

    // ── Ship data ──────────────────────────────────────────
    if (shipData[codeName]) {
      const s = shipData[codeName];
      item.shipData = {};
      for (const key of ['SecondsToMaxRPM', 'MaxPropellerRPM', 'MaxRudderAngle',
        'RudderTurnRate', 'Fp', 'Fs', 'DragReferenceSpeed',
        'Cpd1', 'Cpd2', 'Csd1', 'Csd2', 'SlammingPower', 'GammaMax', 'Cad',
        'RudderLength', 'RudderDepth', 'ThrustVectoringPercent',
        'MaxDivePlaneAngle', 'DivePlaneTurnRate', 'VerticalThrustVectoringPercent',
        'BallastFloodRate', 'BallastBlowRate',
        'FullyFloodedEngineForceMultiplier', 'BeachedEngineForceMultiplier',
      ]) {
        if (s[key] !== undefined) item.shipData[key] = s[key];
      }
    }

    // ── Structure data ─────────────────────────────────────
    if (structureData[codeName]) {
      const s = structureData[codeName];
      item.structureData = {};
      if (s.MaxHealth !== undefined) item.structureData.maxHealth = s.MaxHealth;
      if (s.DecayStartHours !== undefined) item.structureData.decayStartHours = s.DecayStartHours;
      if (s.DecayDurationHours !== undefined) item.structureData.decayDurationHours = s.DecayDurationHours;
      if (s.RepairCost !== undefined) item.structureData.repairCost = s.RepairCost;
      if (s.StructuralIntegrity !== undefined) item.structureData.structuralIntegrity = s.StructuralIntegrity;
      if (s.StoredItemCapacity !== undefined) item.structureData.storedItemCapacity = s.StoredItemCapacity;
      if (s.bCanBeHarvested !== undefined) item.structureData.canBeHarvested = s.bCanBeHarvested;
      if (s.IsVaultable !== undefined) item.structureData.isVaultable = s.IsVaultable;
      if (s.bIsDamagedWhileDrivingOver !== undefined) item.structureData.damagedWhileDrivingOver = s.bIsDamagedWhileDrivingOver;
    }

    // Construction Yard build cost (per structure)
    const sBuild = buildCostFromResourceAmounts(structureData[codeName]?.ResourceAmounts);
    if (sBuild) item.buildCost = sBuild;

    // ── Mount data (vehicle/mounted-weapon stats) ─────────
    // BPMountDynamicData is keyed by the weapon/mount COMPONENT CodeName, not
    // the item codename. Resolve the component to find the right key.
    let mountKey = codeName
    if (!mountData[mountKey] && raw.ItemComponentClass?.ObjectPath) {
      const compData = resolveRef(raw.ItemComponentClass.ObjectPath)
      const compCn = compData && getCodeName(compData)
      if (compCn && mountData[compCn]) mountKey = compCn
    }
    if (mountData[mountKey]) {
      const m = mountData[mountKey];
      item.mountData = {};
      if (m.SuppressionMultiplier !== undefined) item.mountData.suppressionMultiplier = m.SuppressionMultiplier;
      if (m.MaxHorizontalDeviation !== undefined) item.mountData.maxHorizontalDeviation = m.MaxHorizontalDeviation;
      if (m.MaxVerticalDeviation !== undefined) item.mountData.maxVerticalDeviation = m.MaxVerticalDeviation;
      if (m.CoverProvided !== undefined) item.mountData.coverProvided = m.CoverProvided;
      if (m.MaxAmmo !== undefined) item.mountData.maxAmmo = m.MaxAmmo;
      if (m.ReloadDuration !== undefined) item.mountData.reloadDuration = m.ReloadDuration;
      if (m.SecondaryAmmoCodeName) item.mountData.secondaryAmmoCodeName = m.SecondaryAmmoCodeName;
      if (m.MovementModifier !== undefined) item.mountData.movementModifier = m.MovementModifier;
      if (m.EquipTime !== undefined) item.mountData.equipTime = m.EquipTime;
      if (m.FiringConeInfo) {
        if (m.FiringConeInfo.MaxApexHalfAngle !== undefined) item.mountData.maxApexHalfAngle = m.FiringConeInfo.MaxApexHalfAngle;
        if (m.FiringConeInfo.BaselineApexHalfAngle !== undefined) item.mountData.baselineApexHalfAngle = m.FiringConeInfo.BaselineApexHalfAngle;
        if (m.FiringConeInfo.StabilityCostPerShot !== undefined) item.mountData.stabilityCostPerShot = m.FiringConeInfo.StabilityCostPerShot;
        if (m.FiringConeInfo.Agility !== undefined) item.mountData.agility = m.FiringConeInfo.Agility;
        if (m.FiringConeInfo.StabilityGainRate !== undefined) item.mountData.stabilityGainRate = m.FiringConeInfo.StabilityGainRate;
      }
    }

    // ── Aircraft part data ─────────────────────────────────
    if (aircraftPartData[codeName]) {
      const a = aircraftPartData[codeName];
      item.aircraftPartData = {};
      if (a.MaxHealth !== undefined) item.aircraftPartData.maxHealth = a.MaxHealth;
      if (a.MaxIntegrity !== undefined) item.aircraftPartData.maxIntegrity = a.MaxIntegrity;
      if (a.CriticalIntegrity !== undefined) item.aircraftPartData.criticalIntegrity = a.CriticalIntegrity;
      if (a.WreckedCodeName) item.aircraftPartData.wreckedCodeName = a.WreckedCodeName;
      if (a.PartType) item.aircraftPartData.partType = ENUM_CLEAN(a.PartType);
      if (a.SlotType) item.aircraftPartData.slotType = ENUM_CLEAN(a.SlotType);
      if (a.EnginePowerModifier !== undefined) item.aircraftPartData.enginePowerModifier = a.EnginePowerModifier;
      if (a.LiftModifier !== undefined) item.aircraftPartData.liftModifier = a.LiftModifier;
      if (a.DragModifier !== undefined) item.aircraftPartData.dragModifier = a.DragModifier;
      if (a.StructureMassModifier !== undefined) item.aircraftPartData.structureMassModifier = a.StructureMassModifier;
    }

    // ── Armour profile ─────────────────────────────────────
    if (raw.ArmourType && armourData[raw.ArmourType]) {
      const ap = armourData[raw.ArmourType];
      item.armourProfile = {};
      if (ap.Health !== undefined) item.armourProfile.health = ap.Health;
      if (ap.PenetrationResistanceChance !== undefined) item.armourProfile.penetrationResistanceChance = ap.PenetrationResistanceChance;
      if (ap.PenetrationResistanceReduction !== undefined) item.armourProfile.penetrationResistanceReduction = ap.PenetrationResistanceReduction;
      if (ap.SubsystemDisableChanceMultiplier !== undefined) item.armourProfile.subsystemDisableChanceMultiplier = ap.SubsystemDisableChanceMultiplier;
      if (ap.RearPenetrationChanceMultiplier !== undefined) item.armourProfile.rearPenetrationChanceMultiplier = ap.RearPenetrationChanceMultiplier;
      if (ap.bCanBePenetrated !== undefined) item.armourProfile.canBePenetrated = ap.bCanBePenetrated;
      if (ap.PenetrationDamageMultiplier !== undefined) item.armourProfile.penetrationDamageMultiplier = ap.PenetrationDamageMultiplier;
    }

    // ── Item profile ───────────────────────────────────────
    if (raw.ItemProfileType && itemProfiles[raw.ItemProfileType]) {
      const ip = itemProfiles[raw.ItemProfileType];
      item.itemProfile = {};
      if (ip.bIsStockpilable !== undefined) item.itemProfile.isStockpilable = ip.bIsStockpilable;
      if (ip.bIsStackable !== undefined) item.itemProfile.isStackable = ip.bIsStackable;
      if (ip.bIsConvertibleToCrate !== undefined) item.itemProfile.isConvertibleToCrate = ip.bIsConvertibleToCrate;
      if (ip.bIsCratable !== undefined) item.itemProfile.isCratable = ip.bIsCratable;
      if (ip.bIsStockpiledWithAmmo !== undefined) item.itemProfile.isStockpiledWithAmmo = ip.bIsStockpiledWithAmmo;
      if (ip.bUsableInVehicle !== undefined) item.itemProfile.usableInVehicle = ip.bUsableInVehicle;
      if (ip.StackTransferLimit !== undefined) item.itemProfile.stackTransferLimit = ip.StackTransferLimit;
      if (ip.RetrieveQuantity !== undefined) item.itemProfile.retrieveQuantity = ip.RetrieveQuantity;
      if (ip.ReserveStockpileMaxQuantity !== undefined) item.itemProfile.reserveStockpileMaxQuantity = ip.ReserveStockpileMaxQuantity;
    }

    // ── Structure profile ──────────────────────────────────
    if (raw.ProfileType && structureProfiles[raw.ProfileType]) {
      const sp = structureProfiles[raw.ProfileType];
      item.structureProfile = {};
      if (sp.bSupportsAdvancedConstruction !== undefined) item.structureProfile.supportsAdvancedConstruction = sp.bSupportsAdvancedConstruction;
      if (sp.bHasDynamicStartingCondition !== undefined) item.structureProfile.hasDynamicStartingCondition = sp.bHasDynamicStartingCondition;
      if (sp.bIsRepairable !== undefined) item.structureProfile.isRepairable = sp.bIsRepairable;
      if (sp.bIsOnlyMountableByFriendly !== undefined) item.structureProfile.isOnlyMountableByFriendly = sp.bIsOnlyMountableByFriendly;
      if (sp.bIsUpgradeRotationAllowed !== undefined) item.structureProfile.isUpgradeRotationAllowed = sp.bIsUpgradeRotationAllowed;
      if (sp.bIsUsableFromVehicle !== undefined) item.structureProfile.isUsableFromVehicle = sp.bIsUsableFromVehicle;
      if (sp.bAllowUpgradeWhenDamaged !== undefined) item.structureProfile.allowUpgradeWhenDamaged = sp.bAllowUpgradeWhenDamaged;
      if (sp.bCanOverlapNonBlockingFoliage !== undefined) item.structureProfile.canOverlapNonBlockingFoliage = sp.bCanOverlapNonBlockingFoliage;
      if (sp.bDisallowAdjacentUpgradesInIsland !== undefined) item.structureProfile.disallowAdjacentUpgradesInIsland = sp.bDisallowAdjacentUpgradesInIsland;
      if (sp.bIncludeInStructureIslands !== undefined) item.structureProfile.includeInStructureIslands = sp.bIncludeInStructureIslands;
      if (sp.bCanDecayBePrevented !== undefined) item.structureProfile.canDecayBePrevented = sp.bCanDecayBePrevented;
      if (sp.VerticalEjectionDistance !== undefined) item.structureProfile.verticalEjectionDistance = sp.VerticalEjectionDistance;
      if (sp.bEnableStealth !== undefined) item.structureProfile.enableStealth = sp.bEnableStealth;
      if (sp.bIsRuinable !== undefined) item.structureProfile.isRuinable = sp.bIsRuinable;
      if (sp.bBypassesRapidDecayForNearbyStructures !== undefined) item.structureProfile.bypassesRapidDecay = sp.bBypassesRapidDecayForNearbyStructures;
    }

    // ── Crate / factory cost ───────────────────────────────
    if (itemData[codeName]) {
      const id = itemData[codeName];
      if (id.CostPerCrate && id.CostPerCrate.length > 0) {
        const hasRealInput = id.CostPerCrate.some(inp => inp.ItemCodeName && inp.ItemCodeName !== 'None' && inp.Quantity > 0);
        if (hasRealInput) {
          item.crateCost = id.CostPerCrate
            .filter(inp => inp.ItemCodeName && inp.ItemCodeName !== 'None')
            .map(inp => ({ codeName: inp.ItemCodeName, quantity: inp.Quantity, displayName: MATERIAL_NAMES[inp.ItemCodeName] || inp.ItemCodeName }));
          if (id.QuantityPerCrate !== undefined) item.quantityPerCrate = id.QuantityPerCrate;
          if (id.CrateProductionTime !== undefined) item.crateProductionTime = id.CrateProductionTime;
          if (id.SingleRetrieveTime !== undefined) item.singleRetrieveTime = id.SingleRetrieveTime;
          if (id.CrateRetrieveTime !== undefined) item.crateRetrieveTime = id.CrateRetrieveTime;
          if (id.ResearchLevel !== undefined) item.researchLevel = id.ResearchLevel;
        }
      }
      if (!item.quantityPerCrate && id.QuantityPerCrate !== undefined) {
        item.quantityPerCrate = id.QuantityPerCrate;
      }
    }

    // ── Production categories ──────────────────────────────
    const cats = {};
    if (productionCategories.factory[codeName]) cats.factoryQueueType = productionCategories.factory[codeName];
    if (productionCategories.massProduction[codeName]) cats.massProductionQueueType = productionCategories.massProduction[codeName];
    if (Object.keys(cats).length > 0) item.productionCategories = cats;

    // ── Record metadata ────────────────────────────────────
    metadata[codeName] = item;

    // ── Icon extraction ────────────────────────────────────
    const iconRef = raw.Icon.ObjectPath;
    const iconPath = resolveIconPath(iconRef);

    if (iconPath && fs.existsSync(iconPath)) {
      try {
        const iconImg = await loadImage(iconPath);
        const canvas = createCanvas(100, 100);
        const ctx = canvas.getContext('2d');
        ctx.drawImage(iconImg, 0, 0, 100, 100);

        let subTypeIconPath = subTypeIcons[codeName];
        if (raw.SubTypeIcon?.ResourceObject?.ObjectPath) {
          subTypeIconPath = raw.SubTypeIcon.ResourceObject.ObjectPath;
        }

        if (subTypeIconPath) {
          const subPath = resolveIconPath(subTypeIconPath);
          if (subPath && fs.existsSync(subPath)) {
            try {
              const subTypeIcon = await loadImage(subPath);
              ctx.globalAlpha = 0.75;
              ctx.drawImage(subTypeIcon, 0, 0, 44, 44);
              ctx.globalAlpha = 1.0;
            } catch (e) {
              missingIssues.push(`subtype icon unreadable for ${codeName}: ${subPath} — ${e.message}`);
            }
          } else {
            missingIssues.push(`subtype icon missing for ${codeName}: ${subPath}`);
          }
        }

        await writePNG(ctx.getImageData(0, 0, 100, 100), 100, 100, ICON_BASE_DIR + `icons/${codeName}.png`);
      } catch (e) {
        missingIssues.push(`icon unreadable for ${codeName}: ${iconPath} — ${e.message}`);
      }
    } else {
      missingIssues.push(`icon file not found for ${codeName}: ${iconPath}`);
    }
  }
}

// ── Destruction / resistance tables (structures + vehicles) ────
// Attach `resistances` (Health + resistance %) to EVERY structure/vehicle that
// has health, so the Resistances block always shows Health — even for world
// structures (e.g. Town Base) whose armourType is `None` (no armour profile to
// derive percentages from). `destruction` (to-kill / disable|kill) needs the
// armour→damage-type multiplier matrix, so it is only attached when the item
// has a real, mappable armourType.
let resistCount = 0;
let destructionCount = 0;
for (const codeName of Object.keys(metadata)) {
  const item = metadata[codeName];
  if (item.itemType !== 'structure' && item.itemType !== 'vehicle') continue;
  const health = item.maxHealth ?? item.vehicleData?.maxHealth ?? item.health;
  if (!health || health <= 0) continue;
  const armourType = item.armourType && ARMOR_TYPES.has(item.armourType) ? item.armourType : null;
  const disablePercent = item.itemType === 'vehicle' ? (item.vehicleData?.minorDamagePercent ?? 0) : 0;
  // Resistance % per damage type — only meaningful for a real armour profile.
  const byDamageType = {};
  if (armourType) {
    for (const [dt, prof] of Object.entries(damageProfiles)) {
      if (prof[armourType] !== undefined) byDamageType[dt] = prof[armourType];
    }
  }
  item.resistances = { armourType: item.armourType ?? null, health, disablePercent, byDamageType };
  resistCount++;
  if (armourType) {
    const d = computeDestruction(item, (code) => metadata[code]?.displayName || code);
    if (d) {
      item.destruction = { armourType: d.armourType, health: d.health, disablePercent: d.disablePercent, isVehicle: d.isVehicle, tiers: d.tiers, ammo: d.ammo };
      destructionCount++;
    }
  }
}
console.log(`  ${resistCount} structures/vehicles with resistances (Health); ${destructionCount} with a destruction table`);

// ── Synthesized world-structure families (wiki-derived names/sizes) ──
// Several buildable world structures either omit ArmourType in their blueprint or
// ship only a subset of their tiers/sizes in the game export. Per the official wiki
// we re-express them as named families/items, using real resistance profiles from
// DTDamageProfiles (Tier1/2/3 Garrison House, Tier3Structure) and the wiki Structure
// Health Table for health. computeDestruction() builds the kill-count tables from the
// real profiles. The upgrade-family pass below then groups each family's tiers.
//   Town Base        -> Post Office / School / Town Center (3 types × 3 GH tiers)
//   Safe House       -> 3 Garrison House tiers (2000 hp)
//   Garrisoned House -> 3 sizes (Small 800 / Medium 1000 / Large 1200) × 3 GH tiers
//   Relic Base       -> 3 sizes (Small 4450 / Medium 5150 / Large 5850), Tier3Structure
const GH_TIERS = ['Tier1GarrisonHouse', 'Tier2GarrisonHouse', 'Tier3GarrisonHouse'];
const synthWorldFamily = (displayName, codenamePrefix, healthByTier, armourByTier, template) => {
  for (let i = 0; i < healthByTier.length; i++) {
    const cn = `${codenamePrefix}${i + 1}`;
    const health = healthByTier[i];
    const armour = armourByTier[i];
    const item = { armourType: armour, maxHealth: health, itemType: 'structure', displayName };
    const d = computeDestruction(item, (code) => metadata[code]?.displayName || code);
    const byDamageType = {};
    for (const [dt, prof] of Object.entries(damageProfiles)) {
      if (prof[armour] !== undefined) byDamageType[dt] = prof[armour];
    }
    metadata[cn] = {
      displayName,
      description: template.description,
      itemType: 'structure',
      equipmentSlot: template.equipmentSlot,
      maxHealth: health,
      armourType: armour,
      mapIconType: template.mapIconType,
      structureData: template.structureData,
      buildCost: template.buildCost,
      resistances: { armourType: armour, health, disablePercent: 0, byDamageType },
      destruction: d ? { armourType: d.armourType, health: d.health, disablePercent: d.disablePercent, isVehicle: d.isVehicle, tiers: d.tiers, ammo: d.ammo } : undefined,
    };
  }
};
const synthWorldItem = (codename, displayName, health, armour, template) => {
  const item = { armourType: armour, maxHealth: health, itemType: 'structure', displayName };
  const d = computeDestruction(item, (code) => metadata[code]?.displayName || code);
  const byDamageType = {};
  for (const [dt, prof] of Object.entries(damageProfiles)) {
    if (prof[armour] !== undefined) byDamageType[dt] = prof[armour];
  }
  metadata[codename] = {
    displayName,
    description: template.description,
    itemType: 'structure',
    equipmentSlot: template.equipmentSlot,
    maxHealth: health,
    armourType: armour,
    mapIconType: template.mapIconType,
    structureData: template.structureData,
    buildCost: template.buildCost,
    resistances: { armourType: armour, health, disablePercent: 0, byDamageType },
    destruction: d ? { armourType: d.armourType, health: d.health, disablePercent: d.disablePercent, isVehicle: d.isVehicle, tiers: d.tiers, ammo: d.ammo } : undefined,
  };
};

const tbTmpl = metadata['TownBase1'] || {};
const shTmpl = metadata['GarrisonStation'] || {};
const relicTmpl = metadata['RelicBase1'] || {};
// Drop the generic / partial export entries; the named families below replace them.
for (const cn of ['TownBase1', 'TownBase2', 'TownBase3', 'TownBase', 'GarrisonStation', 'GarrisonStation1', 'GarrisonStation2']) delete metadata[cn];
// Town Base -> three named types.
synthWorldFamily('Post Office', 'PostOffice', [7000, 7000, 7000], GH_TIERS, tbTmpl);
synthWorldFamily('School', 'School', [5000, 5000, 5000], GH_TIERS, tbTmpl);
synthWorldFamily('Town Center', 'TownCenter', [4000, 4000, 4000], GH_TIERS, tbTmpl);
// Safe House -> three Garrison House tiers.
synthWorldFamily('Safe House', 'SafeHouse', [2000, 2000, 2000], GH_TIERS, shTmpl);
// Garrisoned House -> three sizes × three Garrison House tiers.
synthWorldFamily('Garrisoned House (Small)', 'GarrisonedHouseSmall', [800, 800, 800], GH_TIERS, shTmpl);
synthWorldFamily('Garrisoned House (Medium)', 'GarrisonedHouseMedium', [1000, 1000, 1000], GH_TIERS, shTmpl);
synthWorldFamily('Garrisoned House (Large)', 'GarrisonedHouseLarge', [1200, 1200, 1200], GH_TIERS, shTmpl);
// Relic Base -> three sizes (Small already exists as RelicBase1; rename + add Medium/Large).
if (metadata['RelicBase1']) metadata['RelicBase1'].displayName = 'Relic Base (Small)';
synthWorldItem('RelicBaseMedium', 'Relic Base (Medium)', 5150, 'Tier3Structure', relicTmpl);
synthWorldItem('RelicBaseLarge', 'Relic Base (Large)', 5850, 'Tier3Structure', relicTmpl);
// The synthesized entries were added after the counting loop above; recompute so the
// summary reflects the final catalog exactly.
resistCount = 0; destructionCount = 0;
for (const v of Object.values(metadata)) {
  if (v.resistances) resistCount++;
  if (v.destruction) destructionCount++;
}

// ── Upgrade families: merge T1/T2/T3 codename tiers into one page ────
// Group by codename prefix (trailing digits stripped) and require the same
// displayName (with any "(Tier N)" suffix removed). This catches real upgrade
// chains (Town Base, Bunkers, Trenches, Garrisons…) without wrongly merging
// unrelated numeric-suffix blueprints (e.g. FacilityMaterials1-12 are 12
// distinct materials, not tiers).
const famKey = (cn) => cn.replace(/\d+$/, '')
const famName = (dn) => (dn || '').replace(/\s*\(Tier \d\)\s*$/, '').trim()
const trailingNum = (cn) => {
  let i = cn.length - 1
  while (i >= 0 && cn[i] >= '0' && cn[i] <= '9') i--
  return i < cn.length - 1 ? +cn.slice(i + 1) : -1
}
const famGroups = {}
for (const cn of Object.keys(metadata)) {
  const k = famKey(cn)
  ;(famGroups[k] ||= []).push(cn)
}
let familyCount = 0
for (const [k, members] of Object.entries(famGroups)) {
  if (members.length < 2) continue
  const nk = famName(metadata[members[0]].displayName)
  if (!members.every((c) => famName(metadata[c].displayName) === nk)) continue
  const sorted = [...members].sort((a, b) => {
    const va = trailingNum(a), vb = trailingNum(b)
    return va - vb || a.localeCompare(b)
  })
  sorted.forEach((cn) => {
    const t = trailingNum(cn)
    metadata[cn].upgradeFamily = k
    metadata[cn].upgradeTier = t >= 0 ? t : 0
    if (cn !== k) metadata[cn].inFamily = true // hide non-base members from search
  })
  const rep = metadata[sorted[0]]
  const base = metadata[k]
  if (base && sorted.includes(k)) {
    // Base codename is itself a member (e.g. GarrisonStation) → augment it.
    base.isFamily = true
    base.familyBase = k
    base.familyMembers = sorted
    base.displayName = nk
    base.description = rep.description
  } else {
    metadata[k] = {
      isFamily: true,
      familyBase: k,
      familyMembers: sorted,
      displayName: nk,
      description: rep.description,
      itemType: rep.itemType,
      category: rep.category,
      chassisName: rep.chassisName,
      mapIconType: rep.mapIconType,
      upgradeFamily: k,
    }
  }
  familyCount++
}
console.log(`  ${familyCount} upgrade families merged`)

fs.writeFileSync(OUTPUT_METADATA, JSON.stringify(metadata, null, 2));
console.log(`${Object.keys(metadata).length} items processed → ${OUTPUT_METADATA}`);

if (missingIssues.length > 0) {
  const lines = [
    `# Missing / inconsistent files — generated ${new Date().toISOString()}`,
    `# Total: ${missingIssues.length} issues`,
    '',
    ...missingIssues,
  ];
  fs.writeFileSync('parser/data/missing.txt', lines.join('\n') + '\n');
  console.log(`\n${missingIssues.length} issues logged → parser/data/missing.txt`);
  for (const issue of missingIssues) console.log(`  ${issue}`);
}

// ═══════════════════════════════════════════════════════════════════
// PART 2: RECIPE GENERATION
// ═══════════════════════════════════════════════════════════════════

// ── Factory / MPF crate recipes ────────────────────────────────────

const crateRecipes = {};
for (const [codeName, row] of Object.entries(itemData)) {
  if (!row.CostPerCrate || row.CostPerCrate.length === 0) continue;
  const hasRealInput = row.CostPerCrate.some(inp => inp.ItemCodeName && inp.ItemCodeName !== 'None' && inp.Quantity > 0);
  if (!hasRealInput) continue;

  crateRecipes[codeName] = {
    inputs: row.CostPerCrate
      .filter(inp => inp.ItemCodeName && inp.ItemCodeName !== 'None')
      .map(inp => ({ codeName: inp.ItemCodeName, quantity: inp.Quantity })),
    outputs: [{ codeName, quantity: row.QuantityPerCrate }],
    duration: row.CrateProductionTime,
    retrieveSingle: row.SingleRetrieveTime,
    retrieveCrate: row.CrateRetrieveTime,
    researchLevel: row.ResearchLevel,
  };
}

// ── Facility recipes ───────────────────────────────────────────────

const FACILITY_FILES = [
  { path: 'Structures/Facilities/BPFacilityFactoryAmmo.json',      key: 'FacilityFactoryAmmo' },
  { path: 'Structures/Facilities/BPFacilityFactorySmallArms.json', key: 'FacilityFactorySmallArms' },
  { path: 'Structures/Facilities/BPFacilityFactoryAircraft.json',  key: 'FacilityFactoryAircraft' },
  { path: 'Structures/Facilities/BPFacilityRefinery1.json',        key: 'FacilityRefinery1' },
  { path: 'Structures/Facilities/BPFacilityRefinery2.json',        key: 'FacilityRefinery2' },
  { path: 'Structures/Facilities/BPFacilityRefineryCoal.json',     key: 'FacilityRefineryCoal' },
  { path: 'Structures/Facilities/BPFacilityRefineryOil.json',      key: 'FacilityRefineryOil' },
  { path: 'Structures/Facilities/BPConcreteMixer.json',            key: 'ConcreteMixer' },
  { path: 'Structures/Facilities/BPFacilityPowerDiesel.json',      key: 'FacilityPowerDiesel' },
  { path: 'Structures/Facilities/BPFacilityPowerOil.json',         key: 'FacilityPowerOil' },
  { path: 'Structures/Facilities/BPFacilityMineResource1.json',    key: 'FacilityMineResource1' },
  { path: 'Structures/Facilities/BPFacilityMineResource2.json',    key: 'FacilityMineResource2' },
  { path: 'Structures/Facilities/BPFacilityMineResource3.json',    key: 'FacilityMineResource3' },
  { path: 'Structures/Facilities/BPFacilityMineResource4.json',    key: 'FacilityMineResource4' },
  { path: 'Structures/Facilities/BPFacilityMineOil.json',          key: 'FacilityMineOil' },
  { path: 'Structures/Facilities/BPFacilityMineOilRig.json',       key: 'FacilityMineOilRig' },
  { path: 'Structures/Facilities/BPFacilityMineWater.json',        key: 'FacilityMineWater' },
  { path: 'Structures/Forts/BPEngineRoomT2.json',                  key: 'EngineRoomT2' },
  { path: 'Structures/Forts/BPEngineRoomT3.json',                  key: 'EngineRoomT3' },
  { path: 'Structures/Facilities/BPFacilityVehicleFactory1.json', key: 'FacilityVehicleFactory1' },
  { path: 'Structures/Facilities/BPFacilityVehicleFactory2.json', key: 'FacilityVehicleFactory2' },
  { path: 'Structures/Facilities/BPFacilityVehicleFactory3.json', key: 'FacilityVehicleFactory3' },
];

// Canonicalize code names from game data — some CrateOutput code names have
// inconsistent casing (e.g. "Stickybomb" vs "StickyBomb", "lighttankammo" vs
// "LightTankAmmo") that must match metadata keys for lookups to work.
const CANON = {
  stickybomb: 'StickyBomb',
  lighttankammo: 'LightTankAmmo',
  rpgammo: 'RpgAmmo',
  metal: 'Metal',
  coal: 'Coal',
  heavyartilleryammo: 'HeavyArtilleryAmmo',
  lightartilleryammo: 'LightArtilleryAmmo',
}
const canon = c => CANON[c.toLowerCase()] || c

function parseConversion(entry) {
  return {
    inputs: [
      ...(entry.ItemInput || []).map(i => ({ codeName: canon(i.CodeName), quantity: i.Quantity, limit: i.Limit || 0 })),
      ...(entry.CrateInput || []).map(c => ({ codeName: canon(c.CodeName), quantity: c.Quantity, limit: c.Limit || 0 })),
      ...(entry.LiquidInput || []).map(l => ({ codeName: canon(l.CodeName), quantity: l.Quantity, limit: l.Limit || 0 })),
    ],
    outputs: [
      ...(entry.ItemOutput || []).map(o => ({ codeName: canon(o.CodeName), quantity: o.Quantity, limit: o.Limit || 0 })),
      ...(entry.CrateOutput || []).map(c => ({ codeName: canon(c.CodeName), quantity: c.Quantity, limit: c.Limit || 0 })),
      ...(entry.LiquidOutput || []).map(l => ({ codeName: canon(l.CodeName), quantity: l.Quantity, limit: l.Limit || 0 })),
    ],
    duration: entry.Duration,
    powerDelta: entry.PowerDelta,
    consumeResourceNodes: entry.bConsumeResourceNodes,
  };
}

// Vehicle factory data: Build costs are in BPVehicleDynamicData.json ResourceAmounts
// AssemblyItems style: {CodeName, Duration, CrateCodeName, RequiredCodeName}
function hasRealResources(bundle) {
  if (!bundle) return false;
  const main = bundle.Resource || {};
  if (main.CodeName && main.CodeName !== 'None' && main.Quantity > 0) return true;
  for (const o of (bundle.OtherResources || [])) {
    if (o.CodeName && o.CodeName !== 'None' && o.Quantity > 0) return true;
  }
  return false;
}

function extractResourceInputs(codeName) {
  const row = vehicleData[codeName];
  if (!row) return null;
  const inputs = [];
  const ra = row.ResourceAmounts || {};
  const main = ra.Resource || {};
  if (main.CodeName && main.CodeName !== 'None' && main.Quantity > 0) {
    inputs.push({ codeName: main.CodeName, quantity: main.Quantity });
  }
  for (const o of (ra.OtherResources || [])) {
    if (o.CodeName && o.CodeName !== 'None' && o.Quantity > 0) {
      inputs.push({ codeName: o.CodeName, quantity: o.Quantity });
    }
  }
  return inputs.length > 0 ? inputs : null;
}

function extractAltResourceInputs(codeName) {
  const row = vehicleData[codeName];
  if (!row) return null;
  const inputs = [];
  const alt = row.AltResourceAmounts || {};
  const main = alt.Resource || {};
  if (main.CodeName && main.CodeName !== 'None' && main.Quantity > 0) {
    inputs.push({ codeName: main.CodeName, quantity: main.Quantity });
  }
  for (const o of (alt.OtherResources || [])) {
    if (o.CodeName && o.CodeName !== 'None' && o.Quantity > 0) {
      inputs.push({ codeName: o.CodeName, quantity: o.Quantity });
    }
  }
  return inputs.length > 0 ? inputs : null;
}

function extractUpgradeInputs(codeName) {
  const row = vehicleData[codeName];
  if (!row) return null;
  const inputs = [];
  const ua = row.UpgradeResourceAmounts || {};
  const main = ua.Resource || {};
  if (main.CodeName && main.CodeName !== 'None' && main.Quantity > 0) {
    inputs.push({ codeName: main.CodeName, quantity: main.Quantity });
  }
  for (const o of (ua.OtherResources || [])) {
    if (o.CodeName && o.CodeName !== 'None' && o.Quantity > 0) {
      inputs.push({ codeName: o.CodeName, quantity: o.Quantity });
    }
  }
  return inputs.length > 0 ? inputs : null;
}

function extractStructureResourceInputs(codeName) {
  const row = structureData[codeName];
  if (!row) return null;
  const inputs = [];
  const ra = row.ResourceAmounts || {};
  const main = ra.Resource || {};
  if (main.CodeName && main.CodeName !== 'None' && main.Quantity > 0) {
    inputs.push({ codeName: main.CodeName, quantity: main.Quantity });
  }
  for (const o of (ra.OtherResources || [])) {
    if (o.CodeName && o.CodeName !== 'None' && o.Quantity > 0) {
      inputs.push({ codeName: o.CodeName, quantity: o.Quantity });
    }
  }
  return inputs.length > 0 ? inputs : null;
}

function extractStructureAltResourceInputs(codeName) {
  const row = structureData[codeName];
  if (!row) return null;
  const inputs = [];
  const alt = row.AltResourceAmounts || {};
  const main = alt.Resource || {};
  if (main.CodeName && main.CodeName !== 'None' && main.Quantity > 0) {
    inputs.push({ codeName: main.CodeName, quantity: main.Quantity });
  }
  for (const o of (alt.OtherResources || [])) {
    if (o.CodeName && o.CodeName !== 'None' && o.Quantity > 0) {
      inputs.push({ codeName: o.CodeName, quantity: o.Quantity });
    }
  }
  return inputs.length > 0 ? inputs : null;
}

function buildRecipeWithInputs(item, resourceInputs, upgradeInputs) {
  const recipe = {
    outputs: [{ codeName: item.CodeName, quantity: 1 }],
    duration: item.Duration || 0,
    inputs: [],
    requires: null,
  };
  if (item.CrateCodeName && item.CrateCodeName !== 'None') {
    recipe.inputs.push({ codeName: item.CrateCodeName, quantity: 1 });
  }
  if (item.RequiredCodeName && item.RequiredCodeName !== 'None') {
    recipe.requires = item.RequiredCodeName;
    recipe.inputs.push({ codeName: item.RequiredCodeName, quantity: 1 });
  }
  if (resourceInputs) {
    for (const inp of resourceInputs) {
      const existing = recipe.inputs.find(i => i.codeName === inp.codeName);
      if (existing) existing.quantity += inp.quantity;
      else recipe.inputs.push(inp);
    }
  }
  if (upgradeInputs) {
    for (const inp of upgradeInputs) {
      const existing = recipe.inputs.find(i => i.codeName === inp.codeName);
      if (existing) existing.quantity += inp.quantity;
      else recipe.inputs.push(inp);
    }
  }
  return recipe;
}

function parseAssemblyItem(item) {
  const recipes = [];
  const row = vehicleData[item.CodeName];
  const structRow = !row ? (structureData[item.CodeName] || null) : null;

  // For ALL vehicle pad recipes (scratch builds and upgrades alike),
  // use AltResourceAmounts. ResourceAmounts (RMats/Bmats) are for MPF,
  // and UpgradeResourceAmounts is for garage upgrades, not pads.
  // For structure-type items (ship parts, fort parts), check structureData.
  if (row && hasRealResources(row.AltResourceAmounts)) {
    const altInputs = extractAltResourceInputs(item.CodeName);
    if (altInputs) {
      recipes.push(buildRecipeWithInputs(item, altInputs, null));
    }
  } else if (structRow && hasRealResources(structRow.AltResourceAmounts)) {
    // Structure items use AltResourceAmounts too (ship parts, fort parts)
    const altInputs = extractStructureAltResourceInputs(item.CodeName);
    if (altInputs) {
      recipes.push(buildRecipeWithInputs(item, altInputs, null));
    }
  }
  // Fallback: no alt resources, use base ResourceAmounts
  if (recipes.length === 0) {
    if (row) {
      const baseInputs = extractResourceInputs(item.CodeName);
      if (baseInputs) {
        recipes.push(buildRecipeWithInputs(item, baseInputs, null));
      }
    }
    if (recipes.length === 0 && structRow) {
      const structInputs = extractStructureResourceInputs(item.CodeName);
      if (structInputs) {
        recipes.push(buildRecipeWithInputs(item, structInputs, null));
      }
    }
    if (recipes.length === 0) {
      // No cost data at all (e.g. some ship parts, fort parts)
      recipes.push(buildRecipeWithInputs(item, null, null));
    }
  }

  return recipes;
}

const facilities = {};
for (const { path, key } of FACILITY_FILES) {
  const absPath = GAME_DATA + '/' + path;
  if (!fs.existsSync(absPath)) { console.warn(`Skipping ${path}: file not found`); continue; }
  const data = readJSON(absPath);
  const entry = findDefaultEntry(data);
  if (!entry) { console.warn(`Skipping ${path}: no Default__ entry`); continue; }

  const props = entry.Properties || {};
  const baseConversions = props.ConversionEntries || [];
  const modifications = props.Modifications || [];

  // Modification display names live in a sibling *_UpgradeSlotComponent.json
  // file (the facility file's own DisplayName is null). Load it and build a
  // modKey→name map so we emit the in-game name (e.g. enum "Recycler" →
  // "Assembly Bay", "RocketFactory" → "Rocket Battery Workshop") instead of a
  // prettified enum key.
  const slotPath = `Structures/Facilities/Modifications/Data/BP${key}_UpgradeSlotComponent.json`;
  const modNames = {};
  if (fs.existsSync(GAME_DATA + '/' + slotPath)) {
    const slotData = readJSON(GAME_DATA + '/' + slotPath);
    const slotEntry = findDefaultEntry(slotData);
    for (const m of (slotEntry?.Properties?.Modifications || [])) {
      const mk = m.Key ? m.Key.replace('EFortModificationType::', '') : '?';
      const name = m.Value?.DisplayName?.SourceString;
      if (name && mk !== 'Default') modNames[mk] = name;
    }
  }

  const facility = {
    displayName: getDisplayName(data),
    codeName: getCodeName(data),
    baseRecipes: [],
    modifications: {},
  };

  // Vehicle factories use AssemblyItems instead of ConversionEntries
  const baseAssemblyItems = props.AssemblyItems || [];
  if (baseAssemblyItems.length > 0) {
    facility.baseRecipes = baseAssemblyItems.flatMap(parseAssemblyItem);
  } else {
    facility.baseRecipes = baseConversions.map(parseConversion);
  }

  for (const mod of modifications) {
    const modKey = mod.Key ? mod.Key.replace('EFortModificationType::', '') : '?';
    const modValue = mod.Value || {};
    const modAssemblyItems = modValue.AssemblyItems || [];
    if (modAssemblyItems.length > 0) {
      facility.modifications[modKey] = {
        displayName: modNames[modKey] || modValue.DisplayName?.SourceString || null,
        recipes: modAssemblyItems.flatMap(parseAssemblyItem),
      };
    } else {
      facility.modifications[modKey] = {
        displayName: modNames[modKey] || modValue.DisplayName?.SourceString || null,
        recipes: (modValue.ConversionEntries || []).map(parseConversion),
      };
    }
  }
  facilities[key] = facility;
}

// ── Write recipes JSON ─────────────────────────────────────────────

const recipesOutput = {
  _generated: new Date().toISOString(),
  _sources: [
    'War/Content/Blueprints/Data/BPItemDynamicData.json — Factory/MPF crate recipes',
    'War/Content/Blueprints/Structures/ — facility conversion recipes',
  ],
  _recipeCounts: {
    factoryMpfCrateRecipes: Object.keys(crateRecipes).length,
    facilityFiles: FACILITY_FILES.length,
  },
  factory: {
    displayName: 'Factory / Mass Production Factory',
    codeName: 'Factory / MassProduction',
    crateRecipes,
  },
  facilities,
};

fs.writeFileSync(OUTPUT_RECIPES, JSON.stringify(recipesOutput, null, 2));
console.log(`\nRecipe generation:`);
console.log(`  ${Object.keys(crateRecipes).length} crate recipes (Factory/MPF)`);
console.log(`  ${Object.keys(facilities).length} facilities`);
console.log(`  → ${OUTPUT_RECIPES}`);