<script setup>
// Pinned "producing" list — lives in the left panel, below the search bar,
// above the search results. Each row: icon + name + editable quantity + remove.
// Clicking the item's icon/name opens its metadata in the right panel.
import { calc } from '../facility-calc/store.mjs'
import { displayName } from '../facility-calc/recipes.mjs'
import FacItem from './FacItem.vue'

defineProps({
  selected: { type: String, default: undefined },
})
defineEmits(['select'])

function setQty (i, v) {
  calc.desired[i].qty = Math.max(1, parseInt(v, 10) || 1)
}
function removeItem (i) {
  calc.desired.splice(i, 1)
  if (calc.desired.length === 0) calc.active = false
}
</script>

<template>
  <div class="fac-pinned" v-if="calc.active && calc.desired.length">
    <div v-for="(d, i) in calc.desired" :key="i" class="pin-row"
      :class="{ active: d.codeName === selected }">
      <FacItem :codeName="d.codeName" @click="$emit('select', d.codeName)" />
      <input
        type="number" class="qty-input" min="1" step="1"
        :value="d.qty" @input="setQty(i, $event.target.value)"
      />
      <button class="rm" @click="removeItem(i)" title="remove">×</button>
    </div>
  </div>
</template>

<style scoped lang="sass">
.fac-pinned
  // Pinned to the top of the left panel, no enclosing box — rows sit flush
  // with the search results below and are tinted green to stand out.

.pin-row
  display: flex
  align-items: center
  gap: 8px
  padding: 6px 10px
  background: var(--green-active)

  // Selected (its metadata is open in the right panel) — match the search
  // result row's active background instead of the green tint.
  &.active
    background: #333

  // FacItem fills the available width so the name can truncate instead of
  // pushing the (fixed) count box + remove button out of the panel. Its
  // internals are sized to match a search-result row (32px icon, 16px name,
  // 8px gap) so a pinned item is the same height/styling as a listed one.
  :deep(.fac-item)
    flex: 1
    min-width: 0
    margin: 0
    gap: 8px
    cursor: pointer

    img
      width: 32px
      height: 32px

    .nm
      min-width: 0
      font-size: 16px

  .qty-input
    flex-shrink: 0
    width: 46px
    text-align: left
    padding: 3px 4px 3px 5px
    font-size: 14px
    background: #141414
    color: #ddd
    border: 1px solid #333
    border-radius: 4px
    outline: none

    -moz-appearance: textfield
    appearance: textfield
    &::-webkit-inner-spin-button,
    &::-webkit-outer-spin-button
      -webkit-appearance: none
      margin: 0

    &:focus
      border-color: #555

  .rm
    flex-shrink: 0
    width: 20px
    height: 20px
    border: none
    border-radius: 4px
    background: #4a2222
    color: #e6bfbf
    font-size: 14px
    line-height: 1
    cursor: pointer
    &:hover
      background: #6a2a2a
</style>