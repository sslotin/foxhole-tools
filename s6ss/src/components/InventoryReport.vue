<script setup>
import { provide, inject } from 'vue'
import Item from './Item.vue'

const props = defineProps(['activeReport', 'referenceReport']);

provide('activeReport', props.activeReport);
provide('referenceReport', props.referenceReport);

function countOne(name) {
  const x = props.activeReport.items[name];
  return x === undefined ? 0 : x.count;
}

function count(...args) {
  return args.reduce((sum, name) => sum + countOne(name), 0);
}

const normalRifles = count(
  'RifleW',
  'RifleC',
  'RifleLightW',
  'RifleLightC',
  'RifleAutomaticW',
  'RifleAutomaticC',
  'RifleLongW',
  'RifleLongC',
  'RifleHeavyC',
  'SniperRifleW',
  'SniperRifleC',
)

const grenades = count(
  'HEGrenade',
  'GrenadeW',
  'GrenadeC',
  'StickyBomb',
  'ATRPGLightC',
  'ATGrenadeW',
  'GreenAsh',
  'SmokeGrenade',
)

const ATRifles = count(
  'ATRifleW',
  'ATRifleTC',
  'ATRifleSniperC',
  'ATRifleLightC',
  'ATRifleAutomaticW',
  'ATRifleAssaultW',
)

const SMGs = count(
  'SMGW',
  'SMGC',
  'SMGHeavyW',
  'SMGHeavyC',
)

const assaultRifles = count(
  'AssaultRifleHeavyW',
  'AssaultRifleW',
  'AssaultRifleHeavyC',
)

const mortarShells = count(
  'MortarAmmo',
  'MortarAmmoSH',
  'MortarAmmoFL',
  'MortarAmmoFlame',
)

const liveGuns = Math.min(normalRifles, Math.round(count('RifleAmmo') / 3))
  + Math.min(SMGs, Math.round(count('SMGAmmo') / 3))
  + Math.min(assaultRifles, Math.round(count('AssaultRifleAmmo') / 3))
  + Math.min(count('ShotgunW', 'ShotgunC'), Math.round(count('ShotgunAmmo') / 3))
  + Math.min(count('RifleHeavyW'), Math.round(count('RevolverAmmo') / 3));

//console.log('render inventory report:', props.activeReport, props.referenceReport);

const settings = inject('settings');
</script>

<template>
  <div class="inventory-report">
    <div class="section">
      <Item name="SoldierSupplies" :stat="`${liveGuns} live guns`" />
      <Item name="Cloth" />
      <Item name="Bandages" />
      <Item name="BloodPlasma" />
      <Item name="FirstAidKit" />
      <Item name="TraumaKit" />
      <Item name="MedicUniformW" />
      <Item name="MedicUniformC" />
    </div>
    <div class="section">
      <Item name="WorkWrench" />
      <Item name="Radio" />
      <Item name="Shovel" />
      <Item name="Binoculars" />
      <Item name="Tripod" />
      <Item name="GasMask" />
      <Item name="GasMaskFilter" />
    </div>
    <div class="section">
      <Item name="RifleAmmo" :stat="`${normalRifles} rifles`" />
      <Item name="RifleW" />
      <Item name="RifleC" />
      <Item name="RifleLightW" />
      <Item name="RifleLightC" />
      <Item name="RifleAutomaticW" />
      <Item name="RifleAutomaticC" />
      <Item name="RifleLongW" />
      <Item name="RifleLongC" />
      <Item name="RifleHeavyC" />
      <Item name="SniperRifleW" />
      <Item name="SniperRifleC" />
    </div>
    <div class="section">
      <Item name="HEGrenade" :stat="`${grenades} grenades`" />
      <Item name="GrenadeW" />
      <Item name="GrenadeC" />
      <Item name="StickyBomb" />
      <Item name="ATRPGLightC" />
      <Item name="ATGrenadeW" />
      <Item name="GreenAsh" />
      <Item name="SmokeGrenade" />
    </div>
    <div class="section">
      <Item name="Bayonet" />
      <Item name="ATLaunchedGrenadeW" />
      <Item name="HELaunchedGrenade" />
      <Item name="GrenadeAdapter" />
      <Item name="GrenadeLauncherTC" />
      <Item name="GrenadeLauncherC" />
      <Item name="PistolLightW" />
      <Item name="RifleShortW" />
      <Item name="MaceW" />
      <Item name="SwordC" />
    </div>
    <div class="section">
      <Item name="ATRPGAmmo" />
      <Item name="ATRPGHeavyW" />
      <Item name="ATRPGC" />
      <Item name="ATRPGHeavyC" />

      <Item name="RpgAmmo" />
      <Item name="RpgW" />
      <Item name="RPGTW" />
    </div>
    <div class="section">
      <Item name="ATRifleAmmo" :stat="`${ATRifles} AT rifles`" />
      <Item name="ATRifleW" />
      <Item name="ATRifleTC" />
      <Item name="ATRifleSniperC" />
      <Item name="ATRifleLightC" />
      <Item name="ATRifleAutomaticW" />
      <Item name="ATRifleAssaultW" />

      <Item name="ATRPGIndirectAmmo" />
      <Item name="ATRPGW" />
      <Item name="ATRPGTW" />
    </div>
    <div class="section">
      <Item name="AmmoUniformW" />
      <Item name="GrenadeUniformC" />
      <Item name="ArmourUniformW" />
      <Item name="ArmourUniformC" />
      <Item name="TankUniformW" />
      <Item name="TankUniformC" />
      <Item name="EngineerUniformW" />
      <Item name="EngineerUniformC" />
      <Item name="ScoutUniformW" />
      <Item name="ScoutUniformC" />
      <Item name="SnowUniformW" />
      <Item name="SnowUniformC" />
      <Item name="RainUniformC" />
    </div>
    <div class="section">
      <Item name="ATAmmo" />
      <Item name="LightTankAmmo" />
      <Item name="MiniTankAmmo" />
      <Item name="ISGTC" />
      <!-- large shells? -->
      <Item name="Wood" />
      <Item name="Wreckage" />
      <Item name="Components" />
      <Item name="HeavyExplosive" />
      <Item name="Explosive" />
    </div>
    <div class="section">
      <Item name="ShotgunAmmo" />
      <Item name="ShotgunC" />
      <Item name="ShotgunW" />
      <Item name="RevolverAmmo" />
      <Item name="RifleHeavyW" />
      <Item name="Revolver" />
    </div>
    <div class="section">
      <Item name="SMGAmmo" :stat="`${SMGs} SMGs`" />
      <Item name="SMGW" />
      <Item name="SMGC" />
      <Item name="SMGHeavyW" />
      <Item name="SMGHeavyC" />
    </div>
    <div class="section">
      <Item name="AssaultRifleAmmo" :stat="`${assaultRifles} assault rifles`" />
      <Item name="AssaultRifleHeavyW" />
      <Item name="AssaultRifleW" />
      <Item name="AssaultRifleHeavyC" />

      <Item name="FlameTorchW" />
      <Item name="FlameTorchC" />
      <Item name="FlameBackpackW" />
      <Item name="FlameBackpackC" />
      <!-- flame ammo? -->
    </div>
    <div class="section">
      <Item name="MGAmmo" />
      <Item name="MGW" />
      <Item name="MGC" />
      <Item name="MGTW" />
      <Item name="MGTC" />
      <Item name="AssaultRifleC" />
    </div>
    <div class="section">
      <Item name="Mortar" :stat="`${mortarShells} shells`" />
      <Item name="MortarAmmo" />
      <Item name="MortarAmmoSH" />
      <Item name="MortarAmmoFL" />
      <Item name="MortarAmmoFlame" />
    </div>
    <div class="section">
      <Item name="SandbagMaterials" />
      <Item name="BarbedWireMaterials" />
      <Item name="MetalBeamMaterials" />
      <Item name="TankMine" />
      <Item name="InfantryMine" />
      <Item name="WaterBucket" />
    </div>
    <div class="section">
      <Item name="RadioBackpack" />
      <Item name="ListeningKit" />
      <Item name="SatchelChargeW" />
      <Item name="ExplosiveLightC" />
      <Item name="SatchelChargeT" />
      <Item name="ExplosiveTripod" />
      <Item name="MortarTankAmmo" />
    </div>
  </div>
</template>

<style scoped lang="sass">
.inventory-report
  display: flex
  flex-wrap: wrap
  width: 944px
  margin: 0 auto

.section
  width: 118px
  margin-top: 20px
</style>
