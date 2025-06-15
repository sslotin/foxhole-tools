<script setup>
import { inject, computed } from 'vue'
import { relevantItems, getTarget, isDisplayed } from './items.js'
import { metadata } from '../../../scanner'

const props = defineProps(['name', 'stat']);
const name = props.name;

const activeReport = inject('activeReport');
const referenceReport = inject('referenceReport');
const settings = inject('settings');

const data = {...activeReport.items[name], ...relevantItems[name], ...metadata[name]};

data.count = (data.count === undefined ? 0 : data.count);

function formatCount(count) {
  if (count >= 1000) {
    return Math.floor(count / 1000) + 'k+';
  }
  return count;
}

function formatChange(count) {
    if (count > 0) {
        return "+" + count;
    } else {
        return "−" + (-count);
    }
}

let countChange = 0;

if (referenceReport !== undefined) {
  const prevCount = referenceReport.items[name];
  countChange = data.count - (prevCount === undefined ? 0 : prevCount.count);
}

function interpolate(a, b, t) {
  function f(x, y) {
    return Math.round(x + (y - x) * t)
  }
  return `rgb(${f(a[0], b[0])}, ${f(a[1], b[1])}, ${f(a[2], b[2])})`;
}

const red = [255, 0, 0];
const gold = [255, 221, 0];
const grey = [221, 221, 221];

const color = computed(() => {
  //console.log('!!! computed !!!');
  const target = getTarget(name, settings);
  const percentage = (target == 0 ? 1 : Math.min(data.count == 0 ? 0 : data.count / target + 0.2, 1));
  return (percentage < 0.5 ? interpolate(red, gold, percentage * 2) : interpolate(gold, grey, percentage * 2 - 1));  
  //return getTarget(data, settings);
});

/*
let s = 0;

for (const [name, itemData] of Object.entries(relevantItems)) {
  if (getTarget(itemData, settings.warden) > 0 && metadata[name].hasOwnProperty('quantityPerCrate') && (!metadata[name].hasOwnProperty('warden') || metadata[name].warden == settings.warden)) {
    //console.log(name, getTarget(itemData, settings.warden), metadata[name].quantityPerCrate);
    s += getTarget(itemData, settings.warden) / metadata[name].quantityPerCrate;
  }
}

console.log('Total:', s);
*/

if (name == 'SoldierSupplies' && data.count > settings.targetShirts) {
  settings.targetShirts = data.count;
}
</script>

<template>
  <div class="item" v-if="isDisplayed(name, data.count, settings)">
    <img :src="`/icons/${name}.png`">
    <span class='change' v-if="countChange != 0" :class="{ negative: countChange < 0 }">{{ formatChange(countChange) }}</span>
    <span class='name' :class='{ warden: (data.warden !== undefined) && data.warden && !settings.warden, collie: (data.warden !== undefined) && !data.warden && settings.warden }'>{{ data.short }}</span>
    <span class='stat'>{{ props.stat }}</span>
    <span class='count' :style="{ color: color }">
      {{ formatCount(data.count) }}
      <span class="target" v-if="name == 'SoldierSupplies'"> / {{ settings.targetShirts == 1000 ? '1k' : settings.targetShirts }}</span>
    </span>
    <template v-if="name == 'SoldierSupplies'">
      <div class="bar" :style="{ width: (Math.min(data.count / 10, 100) * 1.12 - 4) + 'px' }"></div>
      <input type="range" min="50" max="1000" step="50" v-model="settings.targetShirts" />
    </template>
  </div>
</template>

<style scoped lang="sass">
.item
  margin: 6px auto
  background: black
  width: 108px
  height: 46px
  //border-radius: 4px
  padding: 2px
  //border-left: 2px solid black

  *
    display: inline-block
  
  &:hover
    .target
      display: inline-block

    input
      opacity: 0.3

.target
  //text-shadow: 1px 1px black
  display: none
  font-size: 10px
  color: #999
  margin-top: 8px
  margin-left: 1px
  text-align: left
  position: absolute
  width: 100px
  //background: red

input
  appearance: none
  background: black
  width: 112px
  height: 50px
  margin-top: -2px
  margin-left: -42px
  opacity: 0.2
  position: absolute
  cursor: ew-resize // pointer
  overflow: hidden

  &::-webkit-slider-runnable-track
    height: 100%

  &::-webkit-slider-thumb
    appearance: none
    width: 0
    box-shadow: -200px 0 0 200px white
    height: 100%

.bar
  position: absolute
  height: 50px
  margin-left: -42px
  margin-top: -2px
  background: rgba(255, 255, 255, 0.2)
  //border-right: 1px solid rgba(255, 255, 255, 0.2)

img
  width: 40px

.count
  position: absolute
  margin-left: 4px
  margin-top: 4px
  font-size: 18px
  text-align: center
  width: 50px

.change
  position: absolute
  text-align: right
  width: 66px
  margin-top: -2px
  font-size: 10px
  color: #6d6

  &.negative
    color: #d66

.name
  position: absolute
  margin-left: -6px
  margin-top: 27px
  font-size: 12px
  text-align: center
  width: 70px

.stat
  font-size: 10px
  font-style: italic
  color: #999

  width: 108px
  text-align: center

  position: absolute
  margin-top: -22px
  margin-left: -40px  

.warden
  &::before
    content: '*'
    font-weight: bold
    color: blue
    //color: #235683

.collie
  &::before
    content: '*'
    font-weight: bold
    //position: absolute
    //font-size: 14px
    //margin-left: -8px
    color: green
    //color: #516c4b
</style>
