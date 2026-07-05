<script setup>
import { computed } from 'vue'
import { calc } from '../facility-calc/store.mjs'
import {
  recipesFor, displayName, modLabel,
} from '../facility-calc/recipes.mjs'
import { resolvePlan, reachableRecipes } from '../facility-calc/resolver.mjs'
import FacItem from './FacItem.vue'

const plan = computed(() => resolvePlan(calc.desired, calc.selectedRecipes))

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

// Stable map of every recipe that could possibly be involved (→ the demanded
// output it's presented under), independent of recipe choices, so the displayed
// groups/rows don't shift when toggling a choice.
const reachable = computed(() => reachableRecipes(calc.desired))

// Desired (pinned) outputs — the plan's ultimate targets. Recipes that produce
// one of these sort to the top of their group.
const desiredSet = computed(() => new Set(calc.desired.map(d => d.codeName)))

// Group reachable recipes by (facility, mod), in a fixed order.
const groups = computed(() => {
  const map = new Map()
  for (const [r, item] of reachable.value) {
    const key = `${r.facility}|${r.mod || ''}`
    if (!map.has(key)) map.set(key, { facility: r.facility, mod: r.mod, label: modLabel(r), recipes: [] })
    map.get(key).recipes.push({ r, item })
  }
  const arr = [...map.values()]
  for (const g of arr) {
    // Within a group, recipes producing a target output sort first, then by
    // the presented output's display name.
    g.recipes.sort((a, b) => {
      const at = a.r.outputs.some(o => desiredSet.value.has(o.codeName)) ? 0 : 1
      const bt = b.r.outputs.some(o => desiredSet.value.has(o.codeName)) ? 0 : 1
      if (at !== bt) return at - bt
      return displayName(a.item).localeCompare(displayName(b.item))
    })
    g.hasTarget = g.recipes.some(({ r }) =>
      r.outputs.some(o => desiredSet.value.has(o.codeName)))
  }
  // Groups containing a target-producer sort first (so the building that
  // actually makes what you pinned is on top), then by facility / mod.
  arr.sort((a, b) => {
    if (a.hasTarget !== b.hasTarget) return a.hasTarget ? -1 : 1
    if (a.facility !== b.facility) return a.facility.localeCompare(b.facility)
    if ((a.mod || '') === (b.mod || '')) return 0
    if (!a.mod) return -1
    if (!b.mod) return 1
    return a.mod.localeCompare(b.mod)
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
  const d = Math.floor(s / 86400)
  const h = Math.floor((s % 86400) / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = Math.round(s % 60)
  const p = []
  if (d) p.push(d + 'd')
  if (h) p.push(h + 'h')
  if (m) p.push(m + 'm')
  if (sec || !p.length) p.push(sec + 's')
  return p.join(' ')
}

const sortBy = (a, b) => displayName(a[0]).localeCompare(displayName(b[0]))
const rawList = computed(() => Object.entries(plan.value.raw).sort(sortBy))
const interList = computed(() => Object.entries(plan.value.intermediate).sort(sortBy))
const byList = computed(() => Object.entries(plan.value.byproducts || {}).sort(sortBy))
</script>

<template>
  <div class="fac-calc">
    <div v-if="calc.desired.length === 0" class="fc-empty">
      <p>Click <b>+</b> next to a facility-produced item in the search list to add it.</p>
    </div>

    <template v-else>
      <div class="fc-left">
        <section class="fc-block">
          <h3>Raw resources</h3>
          <div v-if="rawList.length" class="io-list">
            <FacItem v-for="[c, q] in rawList" :key="c" :codeName="c" :qty="fmt(q)" />
          </div>
          <p v-else class="muted">none</p>
        </section>

        <section v-if="interList.length" class="fc-block">
          <h3>Intermediate resources</h3>
          <div class="io-list">
            <FacItem v-for="[c, q] in interList" :key="c" :codeName="c" :qty="fmt(q)" />
          </div>
        </section>

        <section v-if="byList.length" class="fc-block">
          <h3>By-products</h3>
          <div class="io-list">
            <FacItem v-for="[c, q] in byList" :key="c" :codeName="c" :qty="fmt(q)" />
          </div>
        </section>
      </div>

      <div class="fc-right">
        <div v-for="g in groups" :key="g.facility + '|' + (g.mod || '')"
             class="group">
          <div class="group-head">{{ g.label }}</div>
          <div
            v-for="entry in g.recipes"
            :key="entry.r.facilityKey + '|' + (entry.r.mod || '') + '|' + entry.item"
            class="recipe-row"
            :class="{ active: activeRecipes.has(entry.r), activatable: activeItems.has(entry.item) }"
            @click="chooseRecipe(entry.item, recipeIdx(entry.item, entry.r))"
          >
            <span class="io">
              <span class="io-in">
                <FacItem v-for="(inp, k) in entry.r.inputs" :key="k" :codeName="inp.codeName" :qty="inp.quantity" />
              </span>
              <span class="arrow">→</span>
              <span class="io-out">
                <FacItem v-for="(out, k) in entry.r.outputs" :key="k" :codeName="out.codeName" :qty="out.quantity" />
              </span>
            </span>
            <span v-if="activeRecipes.has(entry.r)" class="time">{{ fmtTime(timeByRecipe.get(entry.r)) }}</span>
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

.fc-left
  flex: 0 0 320px

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

.muted
  color: #777
  font-size: 15px

.io-list
  display: flex
  flex-direction: column
  align-items: flex-start

// Building/modification groups
.group
  margin-bottom: 16px

.group-head
  font-size: 14px
  color: #999
  text-transform: uppercase
  letter-spacing: .04em
  border-bottom: 1px solid #2a2a2a
  padding-bottom: 4px
  margin-bottom: 6px

.recipe-row
  position: relative
  display: flex
  align-items: center
  flex-wrap: wrap
  gap: 8px
  padding: 4px 6px
  border-radius: 4px
  cursor: pointer

  // Thin separator between recipes (same rule as the group header).
  & + &
    border-top: 1px solid #2a2a2a

  &:hover
    background: #262626

  .io
    display: flex
    align-items: center
    flex-wrap: wrap
    gap: 6px

  .arrow
    color: #777

  .time
    position: absolute
    top: 4px
    right: 6px
    color: #9ad
    font-size: 13px
    white-space: nowrap
    font-variant-numeric: tabular-nums

  &.active
    background: #2a5a2a

  // Not activatable: its presented item isn't produced in the current plan, so
  // clicking does nothing → dim it. Activatable alternatives (same item, not
  // selected) stay full-bright since clicking would switch the plan to them.
  &:not(.activatable)
    opacity: 0.4

  &:hover
    opacity: 1
</style>