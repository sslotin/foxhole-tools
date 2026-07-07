<script setup>
import { computed } from 'vue'
import { calc } from '../facility-calc/store.mjs'
import {
  recipesFor, displayName,
} from '../facility-calc/recipes.mjs'
import { resolvePlan, reachableRecipes } from '../facility-calc/resolver.mjs'
import { toggleImported } from '../facility-calc/store.mjs'
import FacItem from './FacItem.vue'

const plan = computed(() => resolvePlan(calc.desired, calc.selectedRecipes, new Set(calc.imported)))

// Recipes actually running in the current plan (by identity), with their times.
const activeRecipes = computed(() => new Set(plan.value.processes.map(p => p.recipe)))
const timeByRecipe = computed(() => {
  const m = new Map()
  for (const p of plan.value.processes) m.set(p.recipe, p.time)
  return m
})

// Items the current plan actually produces (desired roots + intermediates +
// gathered raws — mines create processes too). A recipe presented under item X
// is "activatable" (clicking it would change the plan) iff X is in this set;
// recipes presented under items not in the plan (e.g. Components pulled in by
// the Recycler Cmats alternative while the base recipe is selected) can't take
// effect and are shown dimmed.
const activeItems = computed(() => new Set(plan.value.processes.map(p => p.item)))

// Stable set of every recipe that COULD be involved in producing the pinned
// items, independent of recipe choices. Each recipe is mapped to its primary
// output (see recipes.mjs determinePrimaryOutput), so a multi-output recipe
// always appears under the same heading regardless of which output triggered
// the BFS inclusion. This stability ensures that toggling a recipe choice
// never adds/removes sections — only each row's lit/dim state changes.
const reachable = computed(() => reachableRecipes(calc.desired))

// Desired (pinned) outputs — the plan's ultimate targets. Recipes that produce
// one of these sort to the top of their group.
const desiredSet = computed(() => new Set(calc.desired.map(d => d.codeName)))

// Group reachable recipes by primary output (instead of building/modification).
// No group headers are shown — each recipe row carries a facility icon on the
// left (with a hover tooltip showing the modification name).
const groups = computed(() => {
  const map = new Map()
  for (const [r, item] of reachable.value) {
    const key = r.primaryOutput
    if (!map.has(key)) map.set(key, { primaryOutput: key, label: displayName(key), recipes: [] })
    map.get(key).recipes.push({ r, item })
  }
  const arr = [...map.values()]
  for (const g of arr) {
    // Within a group (same primary output), sort by facility/mod as secondary.
    g.recipes.sort((a, b) => {
      const at = a.r.outputs.some(o => desiredSet.value.has(o.codeName)) ? 0 : 1
      const bt = b.r.outputs.some(o => desiredSet.value.has(o.codeName)) ? 0 : 1
      if (at !== bt) return at - bt
      const la = a.r.facility + '|' + (a.r.modName || '')
      const lb = b.r.facility + '|' + (b.r.modName || '')
      return la.localeCompare(lb)
    })
    g.hasTarget = g.recipes.some(({ r }) =>
      r.outputs.some(o => desiredSet.value.has(o.codeName)))
  }
  // Groups containing a target-producer sort first, then by label.
  arr.sort((a, b) => {
    if (a.hasTarget !== b.hasTarget) return a.hasTarget ? -1 : 1
    return a.label.localeCompare(b.label)
  })
  return arr
})

function chooseRecipe (item, idx) {
  calc.selectedRecipes[item] = recipesFor(item)[idx]
}
// Index of a recipe among all recipes producing its presented item — used to
// identify which alternative the user clicked.
function recipeIdx (item, r) {
  return recipesFor(item).indexOf(r)
}

function fmt (n) {
  // Resources are aggregated from fractional runs; round up so a partial
  // unit still has to be sourced. Tiny epsilon absorbs FP noise.
  return String(Math.ceil(n - 1e-6))
}
function fmtTime (s) {
  if (!s || s <= 0) return ''
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = Math.round(s % 60)
  const p = []
  if (h) p.push(h + 'h')
  if (m) p.push(m + 'm')
  if (sec || !p.length) p.push(sec + 's')
  return p.join(' ')
}

const sortBy = (a, b) => displayName(a[0]).localeCompare(displayName(b[0]))

// These items always appear under "Raw resources" even if they could be
// produced from other recipes (custom exception for salvaged resources).
const ALWAYS_RAW = new Set(['Metal', 'Coal', 'Sulfur', 'Components', 'Oil'])

const rawDisplay = computed(() => {
  const r = { ...plan.value.raw, ...plan.value.inputs }
  for (const [c, q] of Object.entries(plan.value.intermediate)) {
    if (ALWAYS_RAW.has(c)) r[c] = (r[c] || 0) + q
  }
  for (const [c, q] of Object.entries(plan.value.byproducts || {})) {
    if (ALWAYS_RAW.has(c)) r[c] = (r[c] || 0) + q
  }
  return Object.entries(r).sort(sortBy)
})

const interDisplay = computed(() =>
  Object.entries(plan.value.intermediate).filter(([c]) => !ALWAYS_RAW.has(c)).sort(sortBy)
)

const byDisplay = computed(() =>
  Object.entries(plan.value.byproducts || {}).filter(([c]) => !ALWAYS_RAW.has(c)).sort(sortBy)
)

// Items that are always in "Inputs" with no toggle: ALWAYS_RAW resources +
// anything the resolver puts in `raw` (no facility recipe or mine-only items).
const alwaysInputSet = computed(() => {
  const s = new Set(ALWAYS_RAW)
  for (const c of Object.keys(plan.value.raw)) s.add(c)
  return s
})
</script>

<template>
  <div class="fac-calc">
    <div v-if="calc.desired.length === 0" class="fc-empty">
      <p>Click <b>+</b> next to a facility-produced item in the search list to add it.</p>
    </div>

    <template v-else>
      <div class="fc-left">
        <section class="fc-block">
          <h3>Inputs</h3>
          <div v-if="rawDisplay.length" class="io-list">
            <div v-for="[c, q] in rawDisplay" :key="c"
                 class="input-row"
                 :class="{ clickable: !alwaysInputSet.has(c) }"
                 @click="alwaysInputSet.has(c) ? undefined : toggleImported(c)">
              <FacItem :codeName="c" :qty="fmt(q)" />
            </div>
          </div>
          <p v-else class="muted">none</p>
        </section>

        <section v-if="interDisplay.length" class="fc-block">
          <h3>Intermediates</h3>
          <div class="io-list">
            <div v-for="[c, q] in interDisplay" :key="c" class="inter-row" @click="toggleImported(c)">
              <FacItem :codeName="c" :qty="fmt(q)" />
            </div>
          </div>
        </section>

        <section v-if="byDisplay.length" class="fc-block">
          <h3>By-products</h3>
          <div class="io-list">
            <FacItem v-for="[c, q] in byDisplay" :key="c" :codeName="c" :qty="fmt(q)" />
          </div>
        </section>
      </div>

      <div class="fc-right">
        <div v-for="g in groups" :key="g.primaryOutput"
             class="group">
          <div
            v-for="entry in g.recipes"
            :key="entry.r.facilityKey + '|' + (entry.r.mod || '') + '|' + entry.item"
            class="recipe-row"
            :class="{ active: activeRecipes.has(entry.r), activatable: activeItems.has(entry.item) }"
            @click="chooseRecipe(entry.item, recipeIdx(entry.item, entry.r))"
          >
            <span class="fac-info">
            <img :src="`/icons/${entry.r.facilityKey}.png`"
                 class="fac-icon"
                 @error="$event.target.style.visibility = 'hidden'" />
            <span class="fac-label">{{ entry.r.mod ? entry.r.modName : entry.r.facility }}</span>
          </span>
            <span class="io-inputs">
              <FacItem v-for="(inp, k) in entry.r.inputs" :key="k" :codeName="inp.codeName" :qty="inp.quantity" />
            </span>
            <span class="arrow-col">→</span>
            <span class="io-outputs">
              <FacItem v-for="(out, k) in entry.r.outputs" :key="k" :codeName="out.codeName" :qty="out.quantity" />
            </span>
            <span class="io-time" :class="{ visible: activeRecipes.has(entry.r) }">{{ activeRecipes.has(entry.r) ? fmtTime(timeByRecipe.get(entry.r)) : '' }}</span>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped lang="sass">
.fac-calc
  display: flex
  gap: 24px
  align-items: flex-start
  width: 1180px

.fc-left
  flex: 0 0 325px

.fc-right
  flex: 1
  min-width: 0

.fc-empty
  color: #999
  text-align: center
  margin-top: 30px
  b
    color: #bfe6bf

.fc-block
  margin-bottom: 20px

  h3
    margin: 0 0 8px
    font-size: 15px
    color: #999
    text-transform: uppercase
    letter-spacing: .04em
    border-bottom: 1px solid #333
    padding-bottom: 4px

.inter-row
    display: flex
    align-items: center
    gap: 8px
    padding: 4px 8px
    border-radius: 4px
    cursor: pointer
    width: 100%

    &:hover
      background: #262626

    .fac-item
      overflow: hidden
      max-width: 100%

      .nm
        flex: 1 1 auto
        min-width: 0

.input-row
    display: flex
    align-items: center
    gap: 8px
    padding: 4px 8px
    border-radius: 4px
    width: 100%

    &.clickable
      cursor: pointer

      &:hover
        background: #262626

    .fac-item
      overflow: hidden
      max-width: 100%

      .nm
        flex: 1 1 auto
        min-width: 0

.muted
  color: #777
  font-size: 15px

.io-list
  display: flex
  flex-direction: column
  align-items: flex-start

// Primary-output groups. No headers — each recipe row carries a facility icon
// on the left (with a hover tooltip showing the modification name).
.group
  margin-bottom: 12px

.recipe-row
  position: relative
  display: grid
  grid-template-columns: 68px 1fr auto 1fr 80px
  gap: 6px 8px
  padding: 6px 8px
  border-radius: 4px
  cursor: pointer

  // Thin separator between recipes (same rule as the group header).
  & + &
    border-top: 1px solid #2a2a2a

  &:hover
    background: #262626

  .fac-info
    display: flex
    flex-direction: column
    align-items: center
    gap: 2px
    align-self: stretch
    min-width: 0
    padding-right: 6px
    border-right: 1px solid #555

    .fac-icon
      width: 48px
      height: 48px
      object-fit: contain
      display: block

    .fac-label
      font-size: 9px
      color: #aaa
      text-align: center
      line-height: 1.2
      width: 100%
      overflow-wrap: break-word

  .io-inputs
    display: flex
    flex-direction: column
    gap: 2px
    min-width: 0

    .fac-item
      overflow: hidden
      max-width: 100%

      .nm
        flex: 1 1 auto
        min-width: 0

  .io-outputs
    display: flex
    flex-direction: column
    gap: 2px
    min-width: 0

    .fac-item
      overflow: hidden
      max-width: 100%

      .nm
        flex: 1 1 auto
        min-width: 0

  .arrow-col
    color: #888
    align-self: center
    margin-right: 4px

  .io-time
    color: #9ad
    font-size: 13px
    white-space: nowrap
    font-variant-numeric: tabular-nums
    justify-self: end
    align-self: start
    visibility: hidden

    &.visible
      visibility: visible

  &.active
    background: var(--green-active)

  // Not activatable: its presented item isn't produced in the current plan, so
  // clicking does nothing → dim it. Activatable alternatives (same item, not
  // selected) stay full-bright since clicking would switch the plan to them.
  &:not(.activatable)
    opacity: 0.4

  &:hover
    opacity: 1
</style>