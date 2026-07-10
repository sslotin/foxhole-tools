<script setup>
// Small inline item chip: icon + "qty× name". Used throughout the calculator
// for recipe inputs/outputs and aggregated totals.
import { displayName, isLiquid, crateItems } from '../facility-calc/recipes.mjs'
import metadata from '../../parser/data/metadata.json'

const props = defineProps({
  codeName: { type: String, required: true },
  qty: { type: [Number, String], default: null },
  plain: { type: Boolean, default: false },
  disp: { type: String, default: null },
  link: { type: Boolean, default: false },
})
const emit = defineEmits(['select'])

const suffix = (!props.plain && crateItems.has(props.codeName)) ? 'c'
  : (!props.plain && isLiquid(props.codeName)) ? 'l' : ''

const factionClass = metadata[props.codeName]?.warden === true ? 'warden'
  : metadata[props.codeName]?.warden === false ? 'collie'
  : ''
</script>

<template>
  <span class="fac-item" :class="{ link: props.link }" @click="props.link && emit('select', codeName)">
    <img :src="`/icons/${codeName}.png`" loading="lazy"
         @error="$event.target.style.visibility = 'hidden'" />
    <span v-if="disp !== null" class="qty">{{ disp }}</span>
    <span v-else-if="qty !== null" class="qty">{{ qty }}<span v-if="suffix" class="suffix">{{ suffix }}</span></span>
    <span class="nm" :class="factionClass">{{ displayName(codeName) }}</span>
  </span>
</template>

<style scoped lang="sass">
.fac-item
  display: inline-flex
  align-items: center
  gap: 4px
  white-space: nowrap
  margin: 2px 6px 2px 0
  min-width: 0
  font-size: 16px

  img
    width: 24px
    height: 24px
    object-fit: contain
    flex-shrink: 0

  .qty
    color: #e8c674
    font-weight: 600
    flex-shrink: 0

  .nm
    color: #ddd
    overflow: hidden
    text-overflow: ellipsis
    white-space: nowrap

  .suffix
    color: #b09444
    font-weight: 600
    margin-left: 1px

  .nm.warden::before
    content: '*'
    font-weight: bold
    color: blue
    margin-right: 2px

  .nm.collie::before
    content: '*'
    font-weight: bold
    color: green
    margin-right: 2px

  &.link
    cursor: pointer

    &:hover .nm
      color: #9fb2cf
</style>