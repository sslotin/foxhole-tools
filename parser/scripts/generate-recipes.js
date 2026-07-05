import fs from 'fs';

const baseDir = '/home/sereja/Projects/foxhole/game_data/content/Output/Exports/';

function readJSON(path) {
  return JSON.parse(fs.readFileSync(path, 'utf-8'));
}

/** Find the Default__ entry in a blueprint JSON array */
function findDefaultEntry(data) {
  return data.find(e => e.Name && e.Name.startsWith('Default__'));
}

/** Extract a display name from any entry's Properties */
function getDisplayName(data) {
  for (const e of data) {
    const dn = e.Properties?.DisplayName?.SourceString;
    if (dn) return dn;
  }
  return '?';
}

/** Extract CodeName from any entry */
function getCodeName(data) {
  for (const e of data) {
    const cn = e.Properties?.CodeName;
    if (cn) return cn;
  }
  return '?';
}

// ============================================================
// 1. FACTORY / MPF — BPItemDynamicData.json (DataTable)
// ============================================================
const itemData = readJSON(baseDir + 'War/Content/Blueprints/Data/BPItemDynamicData.json');
const crateRecipes = {};

for (const [codeName, row] of Object.entries(itemData[0].Rows)) {
  if (!row.CostPerCrate || row.CostPerCrate.length === 0) continue;
  // Skip items with null/None inputs (free items, tech parts, etc.)
  const hasRealInput = row.CostPerCrate.some(
    inp => inp.ItemCodeName && inp.ItemCodeName !== 'None' && inp.Quantity > 0
  );
  if (!hasRealInput) continue;

  crateRecipes[codeName] = {
    inputs: row.CostPerCrate
      .filter(inp => inp.ItemCodeName && inp.ItemCodeName !== 'None')
      .map(inp => ({ codeName: inp.ItemCodeName, quantity: inp.Quantity })),
    outputs: [{ codeName, quantity: row.QuantityPerCrate }],
    duration: row.CrateProductionTime,
    retrieveSingle: row.SingleRetrieveTime,
    retrieveCrate: row.CrateRetrieveTime,
    researchLevel: row.ResearchLevel
  };
}

// ============================================================
// 2. FACILITY RECIPES — ConversionEntries
// ============================================================
const facilityFiles = [
  { path: 'Structures/Facilities/BPFacilityFactoryAmmo.json',     key: 'FacilityFactoryAmmo' },
  { path: 'Structures/Facilities/BPFacilityFactorySmallArms.json',key: 'FacilityFactorySmallArms' },
  { path: 'Structures/Facilities/BPFacilityFactoryAircraft.json', key: 'FacilityFactoryAircraft' },
  { path: 'Structures/Facilities/BPFacilityRefinery1.json',      key: 'FacilityRefinery1' },
  { path: 'Structures/Facilities/BPFacilityRefinery2.json',      key: 'FacilityRefinery2' },
  { path: 'Structures/Facilities/BPFacilityRefineryCoal.json',   key: 'FacilityRefineryCoal' },
  { path: 'Structures/Facilities/BPFacilityRefineryOil.json',    key: 'FacilityRefineryOil' },
  { path: 'Structures/Facilities/BPConcreteMixer.json',          key: 'ConcreteMixer' },
  { path: 'Structures/Facilities/BPFacilityPowerDiesel.json',    key: 'FacilityPowerDiesel' },
  { path: 'Structures/Facilities/BPFacilityPowerOil.json',       key: 'FacilityPowerOil' },
  { path: 'Structures/Facilities/BPFacilityMineResource1.json',  key: 'FacilityMineResource1' },
  { path: 'Structures/Facilities/BPFacilityMineResource2.json',  key: 'FacilityMineResource2' },
  { path: 'Structures/Facilities/BPFacilityMineResource3.json',  key: 'FacilityMineResource3' },
  { path: 'Structures/Facilities/BPFacilityMineResource4.json',  key: 'FacilityMineResource4' },
  { path: 'Structures/Facilities/BPFacilityMineOil.json',        key: 'FacilityMineOil' },
  { path: 'Structures/Facilities/BPFacilityMineOilRig.json',     key: 'FacilityMineOilRig' },
  { path: 'Structures/Facilities/BPFacilityMineWater.json',      key: 'FacilityMineWater' },
  { path: 'Structures/Forts/BPEngineRoomT2.json',                key: 'EngineRoomT2' },
  { path: 'Structures/Forts/BPEngineRoomT3.json',                key: 'EngineRoomT3' },
];

function parseConversion(entry) {
  return {
    inputs: (entry.ItemInput || []).map(i => ({ codeName: i.CodeName, quantity: i.Quantity, limit: i.Limit || 0 })),
    outputs: (entry.ItemOutput || []).map(o => ({ codeName: o.CodeName, quantity: o.Quantity, limit: o.Limit || 0 })),
    duration: entry.Duration,
    powerDelta: entry.PowerDelta,
    consumeResourceNodes: entry.bConsumeResourceNodes,
  };
}

const facilities = {};

for (const { path, key } of facilityFiles) {
  const absPath = baseDir + 'War/Content/Blueprints/' + path;
  if (!fs.existsSync(absPath)) {
    console.warn(`Skipping ${path}: file not found`);
    continue;
  }

  const data = readJSON(absPath);
  const entry = findDefaultEntry(data);
  if (!entry) {
    console.warn(`Skipping ${path}: no Default__ entry`);
    continue;
  }

  const props = entry.Properties || {};
  const baseConversions = props.ConversionEntries || [];
  const modifications = props.Modifications || [];

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
      recipes: (modValue.ConversionEntries || []).map(parseConversion),
    };
  }

  facilities[key] = facility;
}

// ============================================================
// 3. COMBINE INTO OUTPUT
// ============================================================
const output = {
  _generated: new Date().toISOString(),
  _sources: [
    'War/Content/Blueprints/Data/BPItemDynamicData.json — Factory/MPF crate recipes',
    'War/Content/Blueprints/Structures/Facilities/ — facility conversion recipes',
    'War/Content/Blueprints/Structures/Forts/ — engine room recipes',
  ],
  _recipeCounts: {
    factoryMpfCrateRecipes: Object.keys(crateRecipes).length,
    facilityFiles: facilityFiles.length,
  },
  // Factory and MPF use the same crate recipes from BPItemDynamicData
  factory: {
    displayName: 'Factory / Mass Production Factory',
    codeName: 'Factory / MassProduction',
    description: 'Town-based Factories and Mass Production Factories use these crate recipes.',
    crateRecipes,
  },
  // Player-built facility recipes
  facilities,
};

fs.writeFileSync('parser/data/recipes.json', JSON.stringify(output, null, 2));
console.log(`Generated parser/data/recipes.json`);
console.log(`  ${Object.keys(crateRecipes).length} crate recipes (Factory/MPF)`);
console.log(`  ${facilityFiles.length} facility files with conversion recipes`);