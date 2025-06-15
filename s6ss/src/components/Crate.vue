<script setup>
import { inject, computed } from 'vue'
import CrateCount from './CrateCount.vue'
import { relevantItems, getTarget } from './items.js'
import { metadata } from '../../../scanner'

const props = defineProps(['name']);
const name = props.name;

const sourceStockpile = inject('sourceStockpile');
const targetStockpile = inject('targetStockpile');
const settings = inject('settings');
const shoppingList = inject('shoppingList');

shoppingList[name] = 0;

const sourceTotal = sourceStockpile[name]?.countTotal || 0;
const sourcePublic = sourceStockpile[name]?.countPublic || 0;

const targetTotal = targetStockpile[name]?.countTotal || 0;
const targetPublic = targetStockpile[name]?.countPublic || 0;

function processChange(event, sign) {
  if (event.shiftKey) {
    if (sign == 1) {
      shoppingList[name] = sourceTotal;
    } else {
      shoppingList[name] = 0;
    }
    return;
  }
  if (event.ctrlKey) {
    sign *= 10;
  }
  shoppingList[name] += sign;
  shoppingList[name] = Math.max(shoppingList[name], 0);
  shoppingList[name] = Math.min(shoppingList[name], 999);
}

function processClick() {
  if (settings.hiddenCrates.includes(name)) {
    settings.hiddenCrates = settings.hiddenCrates.filter(x => x != name);
  } else {
    settings.hiddenCrates.push(name);
    shoppingList[name] = 0;
  }
}

function resourceCount(crates) {
  return ['Explosive', 'HeavyExplosive', 'GroundMaterials'].includes(name) ? metadata[name].quantityPerCrate * crates : 0;
}

const target = computed(() => {
  return Math.ceil(
    (relevantItems.hasOwnProperty(name) ? getTarget(name, settings) : 0)
    / metadata[name].quantityPerCrate
    / settings.targetShirts
    * settings.targetShirtCrates
    * 10
    - 0.001
  );
});
//console.log(settings);
</script>

<template>
  <div class='line' :class="{ dimmed: settings.hiddenCrates.includes(name) }" v-if="!metadata[name].hasOwnProperty('warden') || metadata[name].warden == settings.warden">
    <img :src="`/icons/${name}.png`">
    <span class='name' @click="processClick()">{{ metadata[name].displayName }}</span>

    <CrateCount :total='sourceTotal' :target='0' :needed='shoppingList[name]' class='source-count' :resources="resourceCount(sourceTotal)" />

    <span class='decrease' :class="{ hidden: shoppingList[name] == 0 }" @click="(event) => processChange(event, -1)"><</span>
    <input type="number" min="0" max="999"
      v-model="shoppingList[name]"
      @input="shoppingList[name] = Math.max(Math.min(shoppingList[name], 999), 0);"
      :class='{ full: shoppingList[name] >= sourceTotal }'>
    <span class='increase' @click="(event) => processChange(event, 1)">></span>

    <CrateCount :total='targetTotal' :target='target' :needed='0' class='target-count' :resources="resourceCount(targetTotal)" />
  </div>
</template>

<style scoped lang="sass">
.hidden
  visibility: hidden

.dimmed
  opacity: 0.25
  user-select: none

  input, .decrease, .increase
    visibility: hidden

.line
  background-color: #000
  margin-bottom: 3px

  &:nth-child(odd)
    background-color: #111

  &:hover
    background-color: #222
  
  span, input
    display: inline-block
    position: relative
    top: -8px
  
  .name
    width: 402px
    margin-left: 10px
    //background: blue
    cursor: pointer

  .source-count
    width: 70px
    margin-right: 0px
    //background: green

  .increase, .decrease
    width: 20px
    color: #666
    text-align: center
    user-select: none
    cursor: pointer

    &:hover
      font-weight: bold
  
  .target-count
    width: 70px
    margin-left: 15px
    //background: red

  input
    background: none
    color: #ddd
    border: none
    border-bottom: 1px solid #000
    text-align: center
    width: 30px
    font-size: 1em
    
    &::-webkit-outer-spin-button,
    &::-webkit-inner-spin-button
      -webkit-appearance: none
    
    &:focus
      outline: none
      border-bottom: 1px solid #333
    
    &.full
      color: #999
      font-weight: bold

  img
    margin-top: 2px
    margin-left: 4px

    width: 32px
</style>
