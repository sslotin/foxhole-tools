<script setup>
// "Production" infobox for the Search detail page. Lists every way the item is
// made or consumed as facility-calculator-style recipe rows (no active
// highlighting, no time). Items are clickable to navigate to that item.
import { computed } from 'vue'
import FacItem from './FacItem.vue'
import PowerChip from './PowerChip.vue'

const props = defineProps({
  recipes: { type: Array, default: () => [] },
  title: { type: String, default: 'Production' },
})
const emit = defineEmits(['select'])

// "made" = ways the item is produced; "used" = facility recipes that consume it.
const made = computed(() => props.recipes.filter(r => r.kind !== 'facility-in'))
const used = computed(() => props.recipes.filter(r => r.kind === 'facility-in'))
</script>

<template>
  <!-- "Production": every way the item is MADE (facility output recipes,
       Garage / Construction Yard build, Factory crate, Mass Production). -->
  <template v-if="made.length">
    <div class="infobox">
      <div class="infoclass">{{ title }}</div>
      <div v-for="(r, i) in made" :key="'m' + i" class="recipe-row">
        <span class="fac-info">
          <img v-if="r.iconKey" :src="`/icons/${r.iconKey}.png`" class="fac-icon"
               @error="$event.target.style.visibility = 'hidden'" />
          <span class="fac-label">{{ r.label }}</span>
        </span>
        <span class="io-inputs">
          <FacItem v-for="(inp, k) in r.inputs" :key="k" :codeName="inp.codeName" :qty="inp.quantity" link @select="emit('select', $event)" />
          <PowerChip v-if="r.powerDelta < 0" :recipe="r" />
        </span>
        <span class="arrow-col">→</span>
        <span class="io-outputs">
          <FacItem v-for="(o, k) in r.outputs" :key="k" :codeName="o.codeName" :qty="o.quantity" :disp="o.disp" link @select="emit('select', $event)" />
          <PowerChip v-if="r.powerDelta > 0" :recipe="r" />
        </span>
      </div>
    </div>
  </template>

  <!-- "Used in": facility recipes that CONSUME the item. -->
  <template v-if="used.length">
    <div class="infobox">
      <div class="infoclass">Used in</div>
      <div v-for="(r, i) in used" :key="'u' + i" class="recipe-row">
        <span class="fac-info">
          <img v-if="r.iconKey" :src="`/icons/${r.iconKey}.png`" class="fac-icon"
               @error="$event.target.style.visibility = 'hidden'" />
          <span class="fac-label">{{ r.label }}</span>
        </span>
        <span class="io-inputs">
          <FacItem v-for="(inp, k) in r.inputs" :key="k" :codeName="inp.codeName" :qty="inp.quantity" link @select="emit('select', $event)" />
          <PowerChip v-if="r.powerDelta < 0" :recipe="r" />
        </span>
        <span class="arrow-col">→</span>
        <span class="io-outputs">
          <FacItem v-for="(o, k) in r.outputs" :key="k" :codeName="o.codeName" :qty="o.quantity" :disp="o.disp" link @select="emit('select', $event)" />
          <PowerChip v-if="r.powerDelta > 0" :recipe="r" />
        </span>
      </div>
    </div>
  </template>
</template>

<style scoped lang="sass">
.infobox
  border: 1px solid #2a2a2a
  border-radius: 8px
  padding: 4px 0
  margin-bottom: 14px
  width: 100%
  background: #141414

  .infoclass
    padding: 8px 14px
    font-size: 13px
    letter-spacing: 0.08em
    text-transform: uppercase
    color: #777
    border-bottom: 1px solid #2a2a2a

.recipe-row
  display: grid
  grid-template-columns: 64px 1fr auto 1fr
  gap: 6px 8px
  padding: 6px 14px
  align-items: start

  & + &
    border-top: 1px solid #2a2a2a

  .fac-info
    display: flex
    flex-direction: column
    align-items: center
    gap: 2px
    min-width: 0

    .fac-icon
      width: 40px
      height: 40px
      object-fit: contain
      display: block

    .fac-label
      font-size: 10px
      color: #aaa
      text-align: center
      line-height: 1.2
      overflow-wrap: break-word

  .io-inputs,
  .io-outputs
    display: flex
    flex-direction: column
    gap: 2px
    min-width: 0

  .arrow-col
    color: #888
    align-self: center
    margin-right: 4px

</style>