<script setup>
import { ref, provide, inject, reactive, computed } from 'vue'
import Crate from './Crate.vue'
import Filter from './Filter.vue'
import Shippable from './Shippable.vue'
import metadata from '../../parser/data/metadata.json'
import { relevantItems, relevantCrates, getTarget } from './items.js'

const settings = inject('settings');
const submissions = inject('submissions');
const targetStockpiles = inject('targetStockpiles');
const sourceStockpiles = inject('sourceStockpiles');

function mergeStockpiles(indices) {
  let result = {};

  for (const name of Object.keys(metadata)) {
    if (metadata[name].itemType == 'item') {
      let countPublic = 0;
      let countTotal = 0;

      for (const idx of indices) {
        const report = submissions.value[idx].report;
        
        if (report.items.hasOwnProperty(name + '-crated')) {
          const count = report.items[name + '-crated'].count;
          countTotal += count;
          if (report.stockpileName == 'Public') {
            countPublic += count;
          }
        }
      }
      
      if (countTotal > 0) {
        result[name] = { countPublic, countTotal };
      }
    } else {
      let countSingular = 0;
      let countCrated = 0;

      for (const idx of indices) {
        const report = submissions.value[idx].report;
        
        if (report.items.hasOwnProperty(name)) {
          countSingular += report.items[name].count;
        }
        
        if (report.items.hasOwnProperty(name + '-crated')) {
          countCrated += report.items[name + '-crated'].count;
        }
      }
      if (countSingular + countCrated > 0) {
        result[name] = { countSingular, countCrated };
      }
    }
  }

  return result;
}

function countCrates(stockpile) {
  let s = 0;
  for (const [name, data] of Object.entries(stockpile)) {
    if (!settings.hiddenCrates.includes(name) && relevantCrates.includes(name) && (settings.configure || (!metadata[name].hasOwnProperty('warden') || metadata[name].warden == settings.warden))) {
      s += data.countTotal || 0;
    }
  }
  return s;
}

const targetStockpile = mergeStockpiles(targetStockpiles.value);
const sourceStockpile = mergeStockpiles(sourceStockpiles.value);
const shoppingList = reactive({});

const targets = computed(() => {
  const obj = {};
  for (const name of relevantCrates) {
    obj[name] = Math.ceil(
      (relevantItems.hasOwnProperty(name) ? getTarget(name, settings) : 0)
      / metadata[name].quantityPerCrate
      / settings.targetShirts
      * settings.targetShirtCrates
      * 10
      - 0.001
    );
  }
  return obj;
});

provide('targets', targets);
provide('targetStockpile', targetStockpile);
provide('sourceStockpile', sourceStockpile);
provide('shoppingList', shoppingList);

const needed = computed(() => {
  return Array.from(Object.entries(shoppingList)).reduce((sum, [, value]) => sum + value, 0);
});

const filteredCrates = computed(() => {
  return relevantCrates.filter((name) => {
    return !settings.hiddenCrates.includes(name) && (!metadata[name].hasOwnProperty('warden') || metadata[name].warden == settings.warden);
  });
});

// todo: find a way to join these two
const missingCount = computed(() => {
  let s = 0;
  for (const name of filteredCrates.value) {
    s += Math.max(targets.value[name] - (targetStockpile[name]?.countTotal || 0), 0);
  }
  return s;
});

const availableCount = computed(() => {
  let s = 0;
  for (const name of filteredCrates.value) {
    const missing = Math.max(targets.value[name] - (targetStockpile[name]?.countTotal || 0), 0);
    s += Math.min(missing, sourceStockpile[name]?.countTotal || 0);
  }
  return s;
});

let autofillCount = ref(310);

function autofill() {
  const targetedCrates = filteredCrates.value.filter(name => targets.value[name] > 0);

  let limit = 0;
  for (const name of filteredCrates.value) {
    if (targets.value[name] > 0) {
      limit += sourceStockpile[name]?.countTotal || 0;
      //console.log(name, limit);
    }
  }

  if (sourceStockpiles.value.length == 0) {
    limit = 9999;
  }

  autofillCount.value = Math.max(0, Math.min(autofillCount.value, limit));

  for (const name of Object.keys(shoppingList)) {
    shoppingList[name] = 0;
  }
  for (let i = 0; i < autofillCount.value; i++) {
    let bestItem = undefined;
    let bestRatio = Infinity; // targetStockpile + shoppingList / targets

    for (const name of targetedCrates) {
      if (sourceStockpiles.value.length == 0 || shoppingList[name] < (sourceStockpile[name]?.countTotal || 0)){
        const ratio = ((targetStockpile[name]?.countTotal || 0) + shoppingList[name]) / targets.value[name];
        if (ratio < bestRatio || (ratio == bestRatio && name < bestItem)) {
          bestRatio = ratio;
          bestItem = name;
        }
        //console.log(name, ratio, targets.value[name]);
      }
    }

    if (bestItem === undefined) {
      // no crates available
      break;
    }

    shoppingList[bestItem]++;
  }
}

const resources = ['MaintenanceSupplies', 'Wood', 'Explosive', 'HeavyExplosive', 'GroundMaterials'];
const matfac = ['SandbagMaterials', 'BarbedWireMaterials', 'MetalBeamMaterials'];
const mines = ['InfantryMine', 'TankMine'];
const arty = ['LightArtilleryAmmo', 'HeavyArtilleryAmmo', 'MortarTankAmmo', 'AAAmmo'];
const tripods = [
  'Tripod', 'MGTC', 'MGTW', 'ISGTC', 'RPGTW',
  'ATRPGTW', 'ATRifleTC', 'GrenadeLauncherTC', 'WindsockT', 'BannerTW', 'BannerTC'
];
const uniforms = [
  'AmmoUniformW', 'GrenadeUniformC', 'ArmourUniformC', 'ArmourUniformW', 'EngineerUniformW', 'EngineerUniformC',
  'MedicUniformW', 'MedicUniformC', 'OfficerUniformW', 'OfficerUniformC', 'RainUniformC',
  'ScoutUniformW', 'ScoutUniformC', 'SnowUniformW', 'SnowUniformC', 'TankUniformW', 'TankUniformC',
  'NavalUniformW', 'NavalUniformC', 'PilotUniformW', 'PilotUniformC'
];
const SAW = [
  'ATGrenadeW', 'ATRPGLightC', 'MortarAmmoFL', 'MortarAmmoSH', 'MortarAmmo',
  'StickyBomb', 'ATRifleAmmo', 'SmokeGrenade'
];
const HMF = [
  'ATRPGAmmo', 'ATRPGIndirectAmmo', 'RpgAmmo', 'MiniTankAmmo', 'LightTankAmmo',
  'ATAmmo', 'HELaunchedGrenade', 'ATLaunchedGrenadeW'
];
const SIFA = ['ATRifleAssaultW', 'ATRifleAutomaticW', 'ATRifleLightC', 'ATRifleSniperC', 'MortarAmmoFlame', 'SniperRifleW', 'SniperRifleC'];
const larp = ['OfficerUniformW', 'OfficerUniformC', 'NavalUniformW', 'NavalUniformC', 'BannerTW', 'BannerTC', 'MaceW', 'SwordC', 'WindsockT'];
const facility = [...mines, ...arty, ...tripods, ...uniforms, ...SAW, ...HMF, ...SIFA, ...matfac];

let vehicles = [];
let structures = [];

for (const [name, data] of Object.entries(metadata)) {
  if (sourceStockpile.hasOwnProperty(name) || targetStockpile.hasOwnProperty(name)) {
    if (data.itemType == 'vehicle') {
      vehicles.push(name);
    } else if (data.itemType == 'structure') {
      structures.push(name);
    }
  }
}

const copied = ref(false);

function exportText() {
  const entries = Object.entries(shoppingList)
    .filter(([, count]) => count > 0)
    .sort((a, b) => b[1] - a[1]);

  const text = entries.map(([key, count]) => `${count} ${metadata[key].displayName}`).join('\n') + `\n\n${needed.value} total\n`;

  navigator.clipboard.writeText(text);
  copied.value = true;
  setTimeout(() => copied.value = false, 1000);
}

function exportJson() {
  const obj = {
    'sources': sourceStockpiles.value.map(idx => submissions.value[idx].report),
    'targets': targetStockpiles.value.map(idx => submissions.value[idx].report),
    'manifest': Object.fromEntries(Object.entries(shoppingList).filter(([, count]) => count > 0))
  }

  const json = JSON.stringify(obj, null, 2);
  
  // make a file and "click" on an ephemeral link to download it
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'manifest.json';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
</script>

<template>
  <div class='stockpile-report'>
    <div class='wrapper2'>
      <div class='totals'>
        <span class='source-count'>{{ countCrates(sourceStockpile) }}<br><i>source</i></span>
        <span class='needed'>{{ needed }}<br>
          <i v-if="needed > 60">
            {{ Math.floor(needed / 60) }}×60
            <template v-if="needed % 60 != 0"> + {{ needed % 60 }}</template>
          </i>
          <i v-else>→</i>
        </span>
        <span class='target-count'>{{  countCrates(targetStockpile) }}<br><i>target</i></span>
      </div>
      <div class='crate-list'>
        <div class="section">
          <Crate name="SoldierSupplies" />
          <Crate name="Cloth" />
        </div>

        <div class="section">
          <Crate name="Bandages" type="meds" />
          <Crate name="BloodPlasma" type="meds" />
          <Crate name="FirstAidKit" type="meds" />
          <Crate name="TraumaKit" type="meds" />
          <Crate name="MedicUniformW" />
          <Crate name="MedicUniformC" />
        </div>

        <div class="section">
          <Crate name="AssaultRifleAmmo" type="small" />
          <Crate name="AssaultRifleHeavyC" type="small" />
          <Crate name="AssaultRifleHeavyW" type="small" />
          <Crate name="AssaultRifleW" type="small" />
        </div>

        <div class="section">
          <Crate name="MGAmmo" type="small" />
          <Crate name="AssaultRifleC" type="small" />
          <Crate name="MGC" type="small" />
          <Crate name="MGW" type="small" />
        </div>

        <div class="section">
          <Crate name="RevolverAmmo" type="small" />
          <Crate name="RifleHeavyW" type="small" />
          <Crate name="Revolver" type="small" />
          <Crate name="PistolLightW" type="small" />
        </div>

        <div class="section">
          <Crate name="RifleAmmo" type="small" />
          <Crate name="RifleAutomaticC" type="small" />
          <Crate name="RifleAutomaticW" type="small" />
          <Crate name="RifleC" type="small" />
          <Crate name="RifleHeavyC" type="small" />
          <Crate name="RifleLightC" type="small" />
          <Crate name="RifleLightW" type="small" />
          <Crate name="RifleLongC" type="small" />
          <Crate name="RifleLongW" type="small" />
          <Crate name="RifleShortW" type="small" />
          <Crate name="RifleW" type="small" />
          <Crate name="SniperRifleC" type="small" />
          <Crate name="SniperRifleW" type="small" />
        </div>

        <div class="section">
          <Crate name="ShotgunAmmo" type="small" />
          <Crate name="ShotgunC" type="small" />
          <Crate name="ShotgunW" type="small" />
        </div>

        <div class="section">
          <Crate name="SMGAmmo" type="small" />
          <Crate name="SMGC" type="small" />
          <Crate name="SMGHeavyC" type="small" />
          <Crate name="SMGHeavyW" type="small" />
          <Crate name="SMGW" type="small" />
        </div>

        <div class="section">
          <Crate name="GrenadeC" type="small" />
          <Crate name="GrenadeW" type="small" />
          <Crate name="GreenAsh" type="small" />
          <Crate name="HEGrenade" type="heavy"  />
          <Crate name="SmokeGrenade" />
          <Crate name="ATGrenadeW" />
          <Crate name="ATLaunchedGrenadeW" />
          <Crate name="ATRPGLightC" />
          <Crate name="StickyBomb" />
        </div>

        <div class="section">
          <Crate name="ATRifleAmmo" />
          <Crate name="ATRifleW" type="heavy" />
          <Crate name="ATRifleAssaultW" />
          <Crate name="ATRifleAutomaticW" />
          <Crate name="ATRifleLightC" />
          <Crate name="ATRifleSniperC" />
        </div>

        <div class="section">
          <Crate name="ATRPGAmmo" />
          <Crate name="ATRPGC" type="heavy" />
          <Crate name="ATRPGHeavyC" type="heavy" />
          <Crate name="ATRPGHeavyW" type="heavy" />
          <Crate name="ATRPGIndirectAmmo" />
          <Crate name="ATRPGW" type="heavy" />
          <Crate name="RpgAmmo" />
          <Crate name="RpgW" type="heavy" />
          <Crate name="HELaunchedGrenade" />
          <Crate name="GrenadeLauncherC" type="heavy" />
          <Crate name="AmmoUniformW" />
          <Crate name="GrenadeUniformC" />
        </div>

        <div class="section">
          <Crate name="Mortar" type="heavy" />
          <Crate name="MortarAmmoFlame" />
          <Crate name="MortarAmmoFL" />
          <Crate name="MortarAmmoSH" />
          <Crate name="MortarAmmo" />
        </div>

        <div class="section">
          <Crate name="MiniTankAmmo" />
          <Crate name="LightTankAmmo" />
          <Crate name="ATAmmo" />
          <Crate name="LightArtilleryAmmo" type="arty" />
          <Crate name="HeavyArtilleryAmmo" type="arty" />
          <Crate name="MortarTankAmmo" type="arty" />
          <Crate name="MortarTankAmmoBR" />
          <Crate name="DemolitionRocketAmmo" />
        </div>

        <div class="section">
          <Crate name="SandbagMaterials" />
          <Crate name="BarbedWireMaterials" />
          <Crate name="MetalBeamMaterials" />
          <Crate name="InfantryMine" />
          <Crate name="TankMine" />
        </div>

        <div class="section">
          <Crate name="Bayonet" type="tools" />
          <Crate name="Binoculars" type="tools" />
          <Crate name="ExplosiveLightC" type="tools" />
          <Crate name="ExplosiveTripod" type="tools" />
          <Crate name="SatchelChargeT" type="tools" />
          <Crate name="ListeningKit" type="tools" />
          <Crate name="RadioBackpack" type="tools" />
          <Crate name="SatchelChargeW" type="tools" />
          <Crate name="Shovel" type="tools" />
          <Crate name="WorkWrench" type="tools" />
          <Crate name="WaterBucket" type="tools" />
          <Crate name="GasMask" type="tools" />
          <Crate name="GasMaskFilter" type="tools" />
          <Crate name="GrenadeAdapter" type="tools" />
          <Crate name="Radio" type="tools" />
        </div>

        <div class="section">
          <Crate name="Tripod" />
          <Crate name="MGTC" />
          <Crate name="MGTW" />
          <Crate name="ISGTC" />
          <Crate name="RPGTW" />
          <Crate name="ATRPGTW" />
          <Crate name="ATRifleTC" />
          <Crate name="GrenadeLauncherTC" />
          <Crate name="WindsockT" />
          <Crate name="BannerTW" />
          <Crate name="BannerTC" />
        </div>

        <div class="section">
          <Crate name="FlameTorchW" type="heavy" />
          <Crate name="FlameBackpackW" type="tools" />
          <Crate name="FlameTorchC" type="heavy" />
          <Crate name="FlameBackpackC" type="tools" />
          <Crate name="MaceW" type="tools" />
          <Crate name="SwordC" type="tools" />
        </div>

        <div class="section">
          <Crate name="AircraftAmmo" />
          <Crate name="LightAAAmmo" />
          <Crate name="AAAmmo" type="arty" />
          <Crate name="AirSirenT" />
        </div>

        <div class="section">
          <Crate name="MiniTorpedoAmmo" />
          <Crate name="AircraftTorpedoAmmo" />
          <Crate name="PilotMask" />
          <Crate name="ParatrooperBackpack" />
          <Crate name="PilotUniformW" />
          <Crate name="PilotUniformC" />
          <Crate name="ParatrooperUniformW" />
          <Crate name="ParatrooperUniformC" />
        </div>

        <div class="section">
          <Crate name="SurfaceWaterMine" />
          <Crate name="WaterWallMaterials" />
          <Crate name="NavalUniformW" />
          <Crate name="NavalUniformC" />
        </div>

        <div class="section">
          <Crate name="ArmourUniformC" />
          <Crate name="ArmourUniformW" />
          <Crate name="EngineerUniformW" />
          <Crate name="EngineerUniformC" />
          <Crate name="TankUniformW" />
          <Crate name="TankUniformC" />
          <Crate name="ScoutUniformW" />
          <Crate name="ScoutUniformC" />
          <Crate name="RainUniformC" />
          <Crate name="SnowUniformW" />
          <Crate name="SnowUniformC" />
          <Crate name="OfficerUniformW" />
          <Crate name="OfficerUniformC" />
        </div>

        <div class="section">
          <Crate name="MaintenanceSupplies" />
          <Crate name="Wood" />
          <Crate name="Explosive" />
          <Crate name="HeavyExplosive" />
          <Crate name="GroundMaterials" />
        </div>

        <h2>Vehicles</h2>

        <Shippable v-for="name in vehicles" :name="name" />

        <h2>Structures</h2>

        <Shippable v-for="name in structures" :name="name" />
      </div>
    </div>
    <div class='wrapper'>
      <div class='filters' :key="settings">
        <Filter text="everything" :items="relevantCrates" />
        <Filter text="resources" :items="resources" />
        <Filter text="facility" :items="facility" />
        
        <Filter text="matfac" :items="matfac" />
        <Filter text="mines" :items="mines" />
        <Filter text="arty shells" :items="arty" />
        <Filter text="tripods" :items="tripods" />
        <Filter text="uniforms" :items="uniforms" />
        <Filter text="SAW" :items="SAW" />
        <Filter text="HMF" :items="HMF" />
        <Filter text="SIFA" :items="SIFA" />

        <Filter text="larp" :items="larp" />

        <div class="autofill">
          <input type="range" min="0" max="1000" step="10" v-model="settings.targetShirtCrates">
          <div><b>{{ settings.targetShirtCrates }}</b> shirts target</div>
          <div><b>{{ availableCount }}</b>/<b>{{ missingCount }}</b> available</div>

          <div class="autofill-button">autofill <input type="number" min="0" max="9999" v-model="autofillCount" @input="autofill()" @click="autofill()"> crates</div>
        </div>

        <div class="export-buttons">
          export
          <span class="button" @click="exportText()">text</span>
          /
          <span class="button" @click="exportJson()">json</span>
          <div v-if="copied" style="text-align: center">(copied)</div>
        </div>

        <!--
       fill <input type="number" min="0" max="9999"
      v-model="shoppingList[name]"
      @input="shoppingList[name] = Math.max(Math.min(shoppingList[name], 999), 0);"
      :class='{ full: shoppingList[name] >= sourceTotal }'> crates-->
        <!--<div>hide filtered items</div>
        <div>hide if source is empty</div>
        <div>hide if target is empty</div>
        <div>hide if both are empty</div>-->
      </div>
    </div>
  </div>
</template>

<style scoped lang="sass">
h2
  font-size: 22px

.section
  margin-bottom: 20px

.stockpile-report
  width: 870px
  margin: auto
  margin-top: 6px

  display: flex

  .totals
    position: sticky
    z-index: 100
    opacity: 0.9
    top: 0
  
    padding-bottom: 0
    padding-top: 4px

    background: #222
    border-bottom: 1px solid #555

    text-align: right

    span
      display: inline-block
      text-align: center

    .source-count
      width: 75px
      //background: green
      i
        color: orange

    .target-count
      width: 80px
      //background: red
      i
        color: #090

    .needed
      width: 90px
      //background: blue
      i
        color: #999

    i
      font-size: 12px
      position: relative
      top: -6px
  
    target-count:
      width: 100px

  .filters
    position: sticky
    top: 50px
    margin-top: 50px
    margin-left: 16px

    user-select: none

    //background: #000
    padding: 2px 8px

  .autofill
    margin-top: 10px
    font-size: 16px
    text-align: left

    input[type="range"]
      width: 100%
    
    div
      margin-left: 8px
      opacity: 0.75
    
    .autofill-button
      margin-top: 8px
      padding: 8px 0
      border-top: 1px solid #444
      border-bottom: 1px solid #444

      input
        background: #444
        font-size: 14px
        border-radius: 4px
        padding: 2px 2px
        color: #ddd
        border: none
        text-align: center
        width: 35px
        font-weight: bold
        position: relative
        top: -1px
        -moz-appearance: textfield
        
        &::-webkit-outer-spin-button,
        &::-webkit-inner-spin-button
          -webkit-appearance: none
        
        &:hover
          background: #555

        &:focus
          outline: none
          background: #555

  .crate-list
    width: 680px
  
  .export-buttons
    font-size: 16px
    opacity: 0.75
    margin-left: 8px
    margin-top: 10px

    .button
      background: #444
      border-radius: 4px
      padding: 0px 4px

      &:hover
        background: #555
</style>
