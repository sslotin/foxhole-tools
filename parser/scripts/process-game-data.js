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

const itemProfiles = loadProfileMap('BPItemProfileTable.json', 'ItemProfileTable');
const vehicleProfiles = loadProfileMap('BPVehicleProfileList.json', 'VehicleProfileMap');
const vehicleMovementProfiles = loadProfileMap('BPVehicleMovementProfileList.json', 'VehicleMovementProfileMap');
const structureProfiles = loadProfileMap('BPStructureProfileList.json', 'StructureProfileMap');

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
};

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

    let data;
    try { data = readJSON(absPath); } catch { continue; }

    if (!findByType(data, 'BlueprintGeneratedClass')) continue;
    const def = findDefaultEntry(data);
    if (!def) continue;

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
    if (raw.ArmourType) item.armourType = ENUM_CLEAN(raw.ArmourType);
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
        const compDef = findDefaultEntry(compData);
        if (compDef?.Properties) {
          const comp = {};
          const cp = compDef.Properties;
          if (cp.FiringMode) comp.firingMode = cp.FiringMode;
          if (cp.FiringRate !== undefined) comp.firingRate = cp.FiringRate;
          if (cp.MaxAmmo !== undefined) comp.maxAmmo = cp.MaxAmmo;
          if (cp.ReloadTime !== undefined) comp.reloadTime = cp.ReloadTime;
          if (cp.CompatibleAmmoCodeName) comp.compatibleAmmoCodeName = cp.CompatibleAmmoCodeName;
          if (cp.EquippedGripType) comp.equippedGripType = ENUM_CLEAN(cp.EquippedGripType);
          if (cp.DeployCodeName) comp.deployCodeName = cp.DeployCodeName;
          if (cp.bIsSingleUse !== undefined) comp.isSingleUse = cp.bIsSingleUse;
          if (cp.bCanFireFromVehicle !== undefined) comp.canFireFromVehicle = cp.bCanFireFromVehicle;
          if (cp.SafeItem) comp.safeItemRef = cp.SafeItem;
          if (cp.MultiAmmo) {
            const ammos = (cp.MultiAmmo.CompatibleAmmoNames || cp.MultiAmmo)
              .filter(a => a && a !== 'None');
            if (Array.isArray(ammos)) comp.compatibleAmmoCodeNames = ammos;
          }
          if (cp.ProjectileClasses && Array.isArray(cp.ProjectileClasses)) {
            comp.projectileClass = cp.ProjectileClasses.map(pc => {
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
          if (Object.keys(comp).length > 0) item.itemComponent = comp;
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

    // ── Mount data (vehicle weapons) ───────────────────────
    if (mountData[codeName]) {
      const m = mountData[codeName];
      item.mountData = {};
      if (m.SuppressionMultiplier !== undefined) item.mountData.suppressionMultiplier = m.SuppressionMultiplier;
      if (m.MaxHorizontalDeviation !== undefined) item.mountData.maxHorizontalDeviation = m.MaxHorizontalDeviation;
      if (m.MaxVerticalDeviation !== undefined) item.mountData.maxVerticalDeviation = m.MaxVerticalDeviation;
      if (m.CoverProvided !== undefined) item.mountData.coverProvided = m.CoverProvided;
      if (m.MaxAmmo !== undefined) item.mountData.maxAmmo = m.MaxAmmo;
      if (m.ReloadTime !== undefined) item.mountData.reloadTime = m.ReloadTime;
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
];

function parseConversion(entry) {
  return {
    inputs: [
      ...(entry.ItemInput || []).map(i => ({ codeName: i.CodeName, quantity: i.Quantity, limit: i.Limit || 0 })),
      ...(entry.CrateInput || []).map(c => ({ codeName: c.CodeName, quantity: c.Quantity, limit: c.Limit || 0 })),
      ...(entry.LiquidInput || []).map(l => ({ codeName: l.CodeName, quantity: l.Quantity, limit: l.Limit || 0 })),
    ],
    outputs: [
      ...(entry.ItemOutput || []).map(o => ({ codeName: o.CodeName, quantity: o.Quantity, limit: o.Limit || 0 })),
      ...(entry.CrateOutput || []).map(c => ({ codeName: c.CodeName, quantity: c.Quantity, limit: c.Limit || 0 })),
      ...(entry.LiquidOutput || []).map(l => ({ codeName: l.CodeName, quantity: l.Quantity, limit: l.Limit || 0 })),
    ],
    duration: entry.Duration,
    powerDelta: entry.PowerDelta,
    consumeResourceNodes: entry.bConsumeResourceNodes,
  };
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
    baseRecipes: baseConversions.map(parseConversion),
    modifications: {},
  };
  for (const mod of modifications) {
    const modKey = mod.Key ? mod.Key.replace('EFortModificationType::', '') : '?';
    const modValue = mod.Value || {};
    facility.modifications[modKey] = {
      displayName: modNames[modKey] || modValue.DisplayName?.SourceString || null,
      recipes: (modValue.ConversionEntries || []).map(parseConversion),
    };
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