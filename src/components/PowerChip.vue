<script setup>
// Shared power/energy chip for a single facility recipe. Reused by BOTH the
// Facility Cost Calculator (FacilityCalc) and the metadata Production / Used-in
// panels (ProductionBox), so the power display stays identical across the two
// views. Renders "<energy icon> <mag>MW × <duration>s", where <mag> is the
// facility's raw power divided by 1000 (kW -> MW); multi-order facilities get a
// " (/5)" suffix. See powerFormat.mjs for the formatting logic.
//
// No +/- sign is shown — direction is conveyed by color: red = power consumed
// (in), green = power produced (out). Matches the user's "no - / +" request.
import { formatPower } from './powerFormat.mjs'

const props = defineProps({
  recipe: { type: Object, required: true },
})

const text = formatPower(props.recipe)
// 'in' = consumer (powerDelta < 0), 'out' = producer (powerDelta > 0).
const dir = props.recipe.powerDelta < 0 ? 'in' : (props.recipe.powerDelta > 0 ? 'out' : '')
</script>

<template>
  <span class="fac-item power-chip" :class="dir">
    <img src="/icons/Energy.png" class="energy-icon"
         @error="$event.target.style.visibility = 'hidden'" />
    <span class="qty">{{ text }}</span>
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

  .energy-icon
    width: 24px
    height: 24px
    object-fit: contain
    flex-shrink: 0

  // Magnitude only (no sign). Direction shown by color: red = consumed (in),
  // green = produced (out). NOT bolded — it must read as a normal usage
  // line in both the Facility Calc and metadata recipe views.
  .qty
    font-weight: 400
    flex-shrink: 0

  &.in .qty
    color: #e07a7a

  &.out .qty
    color: #7ecc7e
</style>