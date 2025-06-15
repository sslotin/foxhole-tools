<script setup>
import { provide, inject, reactive, computed } from 'vue'
import Crate from './Crate.vue'
import Filter from './Filter.vue'
import Shippable from './Shippable.vue'
import { metadata } from '../../../scanner'
import { relevantCrates } from './items.js'

const settings = inject('settings');
const screenshots = inject('screenshots');
const targetStockpiles = inject('targetStockpiles');
const sourceStockpiles = inject('sourceStockpiles');

function mergeStockpiles(indices) {
  let result = {};

  for (const name of Object.keys(metadata)) {
    if (metadata[name].itemType == 'item') {
      let countPublic = 0;
      let countTotal = 0;

      for (const idx of indices) {
        const report = screenshots.value[idx].report;
        
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
        const report = screenshots.value[idx].report;
        
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
    if (!settings.hiddenCrates.includes(name) && relevantCrates.includes(name)) {
      s += data.countTotal || 0;
    }
  }
  return s;
}

const targetStockpile = mergeStockpiles(targetStockpiles.value);
const sourceStockpile = mergeStockpiles(sourceStockpiles.value);
const shoppingList = reactive({});

provide('targetStockpile', targetStockpile);
provide('sourceStockpile', sourceStockpile);
provide('shoppingList', shoppingList);

/*
123c, 25130r, 2×3+2v, 2×3+6s

for every relevant item
merge stockpiles, computing how many reservable and total crates we have -> separate for source and target

screenshots should calculate how many crates there are, excluding items in the settings

Fulll Item Name 2|60+5   < [65] >     20|32
grey subtext for resources
toggle resoruce container mode? [] > click adds one crate, ctrl adds 5k, and "minus" on the crates

shift-clicking should adds all
ctrl-clicking adds/removes 10 crates

every relevant item is displayed, some are greyed out (opacity)

no structures or vehicles for now?

bottom-right corner displays number of picked crates (60×5 + 32 = 332 crates & 5 shippables)

maybe list just the present vehicles and structures, no exceptions

Niska 3×5 + 3 + 3    [ ] >     1×3 + 5


other faction's items are ignored

clicking on a line or adding items should re-activate it
*/

const needed = computed(() => {
  return Array.from(Object.entries(shoppingList)).reduce((sum, [, value]) => sum + value, 0);
});

const resources = ['MaintenanceSupplies', 'Wood', 'Explosive', 'HeavyExplosive', 'GroundMaterials'];
const matfac = ['SandbagMaterials', 'BarbedWireMaterials', 'MetalBeamMaterials'];
const mines = ['InfantryMine', 'TankMine'];
const arty = ['LightArtilleryAmmo', 'HeavyArtilleryAmmo'];
const tripods = [
  'Tripod', 'MGTC', 'MGTW', 'ISGTC', 'RPGTW',
  'ATRPGTW', 'ATRifleTC', 'GrenadeLauncherTC', 'WindsockT', 'BannerTW', 'BannerTC'
];
const uniforms = [
  'AmmoUniformW', 'ArmourUniformC', 'ArmourUniformW', 'EngineerUniformW', 'EngineerUniformC',
  'MedicUniformW', 'MedicUniformC', 'OfficerUniformW', 'OfficerUniformC', 'RainUniformC',
  'ScoutUniformW', 'ScoutUniformC', 'SnowUniformW', 'SnowUniformC', 'TankUniformW', 'TankUniformC'
];
const SAW = [
  'ATGrenadeW', 'ATRPGLightC', 'MortarAmmoFL', 'MortarAmmoSH', 'MortarAmmo',
  'StickyBomb', 'ATRifleAmmo', 'SmokeGrenade'
];
const HMF = [
  'ATRPGAmmo', 'ATRPGIndirectAmmo', 'RpgW', 'MiniTankAmmo', 'LightTankAmmo',
  'ATAmmo', 'HELaunchedGrenade', 'ATLaunchedGrenadeW'
];
const SIFA = ['ATRifleAssaultW', 'ATRifleAutomaticW', 'ATRifleLightC', 'ATRifleSniperC', 'MortarAmmoFlame'];
const larp = ['OfficerUniformW', 'OfficerUniformC', 'BannerTW', 'BannerTC', 'MaceW', 'SwordC', 'WindsockT'];
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
          <Crate name="Bandages" />
          <Crate name="BloodPlasma" />
          <Crate name="FirstAidKit" />
          <Crate name="TraumaKit" />
        </div>

        <div class="section">
          <Crate name="AssaultRifleAmmo" />
          <Crate name="AssaultRifleHeavyC" />
          <Crate name="AssaultRifleHeavyW" />
          <Crate name="AssaultRifleW" />
        </div>

        <div class="section">
          <Crate name="MGAmmo" />
          <Crate name="AssaultRifleC" />
          <Crate name="MGC" />
          <Crate name="MGW" />
        </div>

        <div class="section">
          <Crate name="RevolverAmmo" />
          <Crate name="RifleHeavyW" />
          <Crate name="Revolver" />
          <Crate name="PistolLightW" />
        </div>

        <div class="section">
          <Crate name="RifleAmmo" />
          <Crate name="RifleAutomaticC" />
          <Crate name="RifleAutomaticW" />
          <Crate name="RifleC" />
          <Crate name="RifleHeavyC" />
          <Crate name="RifleLightC" />
          <Crate name="RifleLightW" />
          <Crate name="RifleLongC" />
          <Crate name="RifleLongW" />
          <Crate name="RifleShortW" />
          <Crate name="RifleW" />
          <Crate name="SniperRifleC" />
          <Crate name="SniperRifleW" />
        </div>

        <div class="section">
          <Crate name="ShotgunAmmo" />
          <Crate name="ShotgunC" />
          <Crate name="ShotgunW" />
        </div>

        <div class="section">
          <Crate name="SMGAmmo" />
          <Crate name="SMGC" />
          <Crate name="SMGHeavyC" />
          <Crate name="SMGHeavyW" />
          <Crate name="SMGW" />
        </div>

        <div class="section">
          <Crate name="GrenadeC" />
          <Crate name="GrenadeW" />
          <Crate name="SmokeGrenade" />
          <Crate name="GreenAsh" />
        </div>

        <div class="section">
          <Crate name="ATRifleAmmo" />
          <Crate name="ATRifleAssaultW" />
          <Crate name="ATRifleAutomaticW" />
          <Crate name="ATRifleLightC" />
          <Crate name="ATRifleSniperC" />
          <Crate name="ATRifleW" />
        </div>

        <div class="section">
          <Crate name="ATRPGAmmo" />
          <Crate name="ATRPGC" />
          <Crate name="ATRPGHeavyC" />
          <Crate name="ATRPGHeavyW" />
          <Crate name="ATRPGIndirectAmmo" />
          <Crate name="ATRPGW" />
          <Crate name="RpgAmmo" />
          <Crate name="RpgW" />
          <Crate name="HELaunchedGrenade" />
          <Crate name="GrenadeLauncherC" />
        </div>

        <div class="section">
          <Crate name="Mortar" />
          <Crate name="MortarAmmoFlame" />
          <Crate name="MortarAmmoFL" />
          <Crate name="MortarAmmoSH" />
          <Crate name="MortarAmmo" />
        </div>

        <div class="section">
          <Crate name="ATGrenadeW" />
          <Crate name="ATLaunchedGrenadeW" />
          <Crate name="ATRPGLightC" />
          <Crate name="HEGrenade" />
          <Crate name="StickyBomb" />
        </div>

        <div class="section">
          <Crate name="MiniTankAmmo" />
          <Crate name="LightTankAmmo" />
          <Crate name="ATAmmo" />
          <Crate name="LightArtilleryAmmo" />
          <Crate name="HeavyArtilleryAmmo" />
          <Crate name="MortarTankAmmo" />
        </div>

        <div class="section">
          <Crate name="SandbagMaterials" />
          <Crate name="BarbedWireMaterials" />
          <Crate name="MetalBeamMaterials" />
          <Crate name="InfantryMine" />
          <Crate name="TankMine" />
        </div>

        <div class="section">
          <Crate name="Bayonet" />
          <Crate name="Binoculars" />
          <Crate name="ExplosiveLightC" />
          <Crate name="ExplosiveTripod" />
          <Crate name="SatchelChargeT" />
          <Crate name="ListeningKit" />
          <Crate name="RadioBackpack" />
          <Crate name="SatchelChargeW" />
          <Crate name="Shovel" />
          <Crate name="WorkWrench" />
          <Crate name="WaterBucket" />
          <Crate name="GasMask" />
          <Crate name="GasMaskFilter" />
          <Crate name="GrenadeAdapter" />
          <Crate name="Radio" />
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
          <Crate name="FlameTorchW" />
          <Crate name="FlameBackpackW" />
          <Crate name="FlameTorchC" />
          <Crate name="FlameBackpackC" />
          <Crate name="MaceW" />
          <Crate name="SwordC" />
        </div>

        <div class="section">
          <Crate name="AmmoUniformW" />
          <Crate name="ArmourUniformC" />
          <Crate name="ArmourUniformW" />
          <Crate name="EngineerUniformW" />
          <Crate name="EngineerUniformC" />
          <Crate name="MedicUniformW" />
          <Crate name="MedicUniformC" />
          <Crate name="RainUniformC" />
          <Crate name="ScoutUniformW" />
          <Crate name="ScoutUniformC" />
          <Crate name="SnowUniformW" />
          <Crate name="SnowUniformC" />
          <Crate name="TankUniformW" />
          <Crate name="TankUniformC" />
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
          <span>target {{ settings.targetShirtCrates }}c shirts</span>
        </div>

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
  width: 820px
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
    font-size: 14px
    text-align: center

  .crate-list
    width: 680px
</style>
