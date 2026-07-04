<script setup>
import { inject } from 'vue'

import FactionToggle from './FactionToggle.vue'
import Timer from './Timer.vue'
import metadata from '../../parser/data/metadata.json'
import { relevantItems, relevantCrates, isDisplayed } from './items.js'

const submissions = inject('submissions');
const targetStockpiles = inject('targetStockpiles');
const sourceStockpiles = inject('sourceStockpiles');
const isInventory = inject('isInventory');
const settings = inject('settings');
const errorMessage = inject('errorMessage');

// how many crates of equipment are in a base
function countInventoryCrates(report) {
  let s = 0;
  for (const [name, item] of Object.entries(report.items)) {
    if (metadata[name].quantityPerCrate > 0 && relevantItems.hasOwnProperty(name) && isDisplayed(name, item.count, settings)) {
      //console.log('count', name);
      s += item.count / metadata[name].quantityPerCrate;
    }
  }
  return s;
}

function countStockpileCrates(report) {
  let s = 0;
  for (const name of relevantCrates) {
    if (report.items.hasOwnProperty(name + '-crated') && (settings.configure || !metadata[name].hasOwnProperty('warden') || metadata[name].warden == settings.warden) && !settings.hiddenCrates.includes(name)) {
      s += report.items[name + '-crated'].count;
    }
  }
  return s;
}

function handleClick(event, index) {
  if (!event.shiftKey) {
    const sourceIndex = sourceStockpiles.value.indexOf(index);
    if (sourceIndex !== -1) {
      sourceStockpiles.value.splice(sourceIndex, 1);
    }

    const targetIndex = targetStockpiles.value.indexOf(index);
    if (targetIndex === -1) {
      if (isInventory.value) {
        targetStockpiles.value = [];
      }
      targetStockpiles.value.push(index);
    } else {
      targetStockpiles.value.splice(targetIndex, 1);
    }
  } else {
    const targetIndex = targetStockpiles.value.indexOf(index);
    if (targetIndex !== -1) {
      targetStockpiles.value.splice(targetIndex, 1);
    }

    const sourceIndex = sourceStockpiles.value.indexOf(index);
    if (sourceIndex === -1) {
      if (isInventory.value) {
        sourceStockpiles.value = [];
      }
      sourceStockpiles.value.push(index);
    } else {
      sourceStockpiles.value.splice(sourceIndex, 1);
    }
  }
}

function handleClose(event, index) {
  event.stopPropagation();

  if (index == submissions.value.length - 1 && errorMessage.value !== undefined) {
    errorMessage.value = undefined;
  }

  function update(arr) {
    return arr
    .filter(i => i !== index)
    .map(i => (i > index ? i - 1 : i));
  }

  const updatedSubmissions = [...submissions.value];
  updatedSubmissions.splice(index, 1);

  //const updateTargetStockpiles = update(targetStockpiles.value);
  //const updatedSourceStockpiles = update()
  
  submissions.value = updatedSubmissions;
  targetStockpiles.value = update(targetStockpiles.value);
  sourceStockpiles.value = update(sourceStockpiles.value);
}
</script>

<template>
  <div class='wrapper'>
    <FactionToggle />
    <div class="submissions">
      <div
        v-for="(screenshot, index) in submissions"
        :key="index"
        :class="{ target: targetStockpiles.includes(index), source: sourceStockpiles.includes(index) }"
        @click="(event) => handleClick(event, index)"
        class="screenshot"
        >
        <div class='close' @click="(event) => handleClose(event, index)">×</div>
        <div v-if="screenshot.report">
          <div class="subhex">{{ screenshot.report.subhex }}</div>
          <div>{{ isInventory ? screenshot.report.stockpileType : screenshot.report.stockpileName }}</div>
        </div>
        <div v-else>
          …
        </div>
        <div class="time">
          {{ screenshot.time.toLocaleTimeString('en-US', { hour12: false }) }}
        </div>
        <div class="crate-count">
          {{ isInventory ? Math.round(countInventoryCrates(screenshot.report)) : countStockpileCrates(screenshot.report) }}c
        </div>
      </div>
    </div>
    <Timer />
  </div>
</template>

<style scoped lang="sass">
.wrapper
  display: flex
  width: 100%

.submissions
  user-select: none

  display: flex
  flex-wrap: nowrap
  justify-content: safe center
  overflow-x: auto
  width: 650px
  width: 100%
  width: calc(100% - 85px)
  padding-bottom: 4px
  padding-top: 2px
  gap: 3px

  &::-webkit-scrollbar
    height: 3px

  &::-webkit-scrollbar-thumb
    background: #444
    border-radius: 2px // Rounded edges for the scrollbar thumb

  .screenshot
    position: relative
    flex-shrink: 0
    color: white
    text-shadow: 1px 1px black
    font-size: 12px
    padding: 2px 4px

    height: 59px
    width: 88px
    background-color: #000
    white-space: nowrap

    border-radius: 4px
    border: 1px solid #222

    &.target
      border-color: #090
    
    &.source
      border-color: orange

    &:hover
      cursor: pointer
    
    .close
      position: absolute
      margin-left: 85px
      margin-top: -2px
      font-size: 16px
      display: none
      width: 22px
      height: 22px
      text-align: center
      border-radius: 20px
      
      &:hover
        background-color: rgba(255, 255, 255, 0.2)

    &:hover .close
        display: block

    .subhex
      font-size: 12px

    .time,
    .crate-count
      position: absolute
      top: 44px
      color: #999
      font-size: 12px

    .crate-count
      right: 6px

    .sources
      position: absolute
      top: 2px
      left: 2px
      font-size: 10px
      color: orange

    .target-label
      position: absolute
      top: 2px
      right: 4px
      font-size: 10px
      color: #090
</style>
