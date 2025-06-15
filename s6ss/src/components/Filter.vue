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
</script>

<template>
  <div @click="processClick()">
    <span :style="{ color: { true: '#090', false: '#900', undefined: 'orange' }[status] }">
      {{ { true: '+', false: '−', undefined: '~' }[status] }}
    </span>
    {{ text }}
  </div>
</template>

<style scoped lang="sass">
div
  opacity: 0.75
  cursor: pointer
  font-style: italic

  span
    font-weight: bold
    font-size: 24px
    position: relative
    margin-right: 2px
    top: 2px

  &:hover
    opacity: 1
</style>
