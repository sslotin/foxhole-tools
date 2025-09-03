<script setup>
import { inject, computed } from 'vue'
import { metadata } from '../../../scanner'
const props = defineProps(['text', 'items']);

const settings = inject('settings');
const shoppingList = inject('shoppingList');

const factionCrates = computed(() => {
  return props.items.filter((name) => {
    return !metadata[name].hasOwnProperty('warden') || metadata[name].warden == settings.warden;
  });
});

const status = computed(() => {
  if (props.items.every((name) => !settings.hiddenCrates.includes(name))) {
    return true;
  } else if (props.items.every((name) => settings.hiddenCrates.includes(name))) {
    return false;
  }
  return undefined;
});

function processClick() {
  const remove = status.value; // status will be updated after updating settings
  settings.hiddenCrates = settings.hiddenCrates.filter((name) => !props.items.includes(name));
  if (remove) {
    settings.hiddenCrates = settings.hiddenCrates.concat(props.items);
    for (const name of props.items) {
      shoppingList[name] = 0;
    }
  }
  //console.log(remove, settings.hiddenCrates);
}

const targetStockpile = inject('targetStockpile');
const sourceStockpile = inject('sourceStockpile');

function categoryCount(stockpile) {
  let sum = 0;
  for (const item of factionCrates.value) {
    if (stockpile[item]) {
      sum += stockpile[item].countTotal;
    }
  }
  return sum;
}

//console.log(factionCrates.value, targetStockpile, sourceStockpile)
</script>

<template>
  <div @click="processClick()">
    <span :style="{ color: { true: '#090', false: '#900', undefined: 'orange' }[status] }">
      {{ { true: '+', false: '−', undefined: '~' }[status] }}
    </span>
    {{ text }}

    <i class="count">
      <template v-if="Object.keys(sourceStockpile).length > 0 && Object.keys(targetStockpile).length > 0">
        {{ categoryCount(sourceStockpile) }}+{{ categoryCount(targetStockpile) }}
      </template>
      <template v-else>
        {{ categoryCount(sourceStockpile) + categoryCount(targetStockpile) }}
      </template>
    </i>
  </div>
</template>

<style scoped lang="sass">
div
  opacity: 0.75
  cursor: pointer
  font-style: italic
  white-space: nowrap

  span
    font-weight: bold
    font-size: 20px
    position: relative
    margin-right: 2px
    top: 2px
  
  .count
    color: #999
    font-size: 10px
    position: relative
    top: -1px

  &:hover
    opacity: 1
</style>
