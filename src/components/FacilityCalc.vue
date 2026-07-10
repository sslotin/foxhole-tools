<script setup>
import { computed } from 'vue'
import { calc } from '../facility-calc/store.mjs'
import {
  recipesFor, displayName, modLabel, isPad, energyMWh,
} from '../facility-calc/recipes.mjs'
import { powerByFacility as computePowerByFacility, peakPowerMW as computePeakPowerMW } from '../facility-calc/power.mjs'
import { resolvePlan, reachableRecipes } from '../facility-calc/resolver.mjs'
import {
  relevantItems as relevantItemsForPlan,
  activatableRecipes as activatableForReachable,
  activeRecipes as activeForPlan,
  clickableRecipes as clickableForReachable,
  toggleRecipe,
} from '../facility-calc/activation.mjs'
import { toggleImported, toggleSkipAutoImport } from '../facility-calc/store.mjs'
import FacItem from './FacItem.vue'
import PowerChip from './PowerChip.vue'

// ALWAYS_RAW resources (Metal, Coal, Sulfur, Components, Oil) default to being
// imported (sourced from the world) rather than manufactured, but stay
// clickable so the user can opt to produce them instead. The user's explicit
// choices live in two sets:
//   - calc.imported        — items explicitly marked as imported (non-default
//     reducible items start manufactured and are imported on click)
//   - calc.skipAutoImport  — ALWAYS_RAW items the user has opted to manufacture
//     instead of auto-importing.
// An item is imported iff it is in calc.imported OR (it is ALWAYS_RAW and not
// in calc.skipAutoImport).
const DEFAULT_IMPORTED = ['Metal', 'Coal', 'Sulfur', 'Components', 'Oil']

const plan = computed(() => {
  const effectiveImports = new Set(calc.imported)
  for (const c of DEFAULT_IMPORTED) {
    if (!calc.skipAutoImport.includes(c)) effectiveImports.add(c)
  }
  return resolvePlan(calc.desired, calc.selectedRecipes, effectiveImports, { energyImported: calc.energyImported })
})

// Recipes actually running in the current plan (by identity), with their times.
const activeRecipes = computed(() => activeForPlan(plan.value))
const timeByRecipe = computed(() => {
  const m = new Map()
  for (const p of plan.value.processes) m.set(p.recipe, p.time)
  return m
})

// A recipe is clickable/activatable iff it PRODUCES an Import, an
// Intermediate, or Energy (pure logic in activation.mjs, unit-tested there).
// Energy is treated as an intermediate so power-plant recipes stay clickable
// like any other intermediate producer. Desired targets are excluded: you get
// a desired item's recipe by setting its quantity, not by pinning a recipe.
const relevantItems = computed(() => relevantItemsForPlan(plan.value))

const activatableRecipes = computed(() =>
  activatableForReachable(reachable.value, relevantItems.value))
// Clickable (bright, never dimmed) = activatable recipes ∪ active recipes.
// Guarantees an active/pinned recipe can never get stuck dimmed (its output
// may have left the relevant set), so it stays deactivatable. See
// clickableRecipes() in activation.mjs.
const clickableRecipes = computed(() =>
  clickableForReachable(reachable.value, relevantItems.value, activeRecipes.value))

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

// Net energy across the plan (MWh, signed). Producers positive, consumers
// negative. Deficit (what must be imported) and produced are derived from it.
const energyNetMWh = computed(() => {
  let mwh = 0
  for (const p of plan.value.processes) mwh += energyMWh(p.recipe) * p.runs
  return mwh
})
const energyDeficitMWh = computed(() => Math.max(0, -energyNetMWh.value))
const energyProducedMWh = computed(() => {
  // Gross energy PRODUCED by power facilities (positive contributions
  // only), NOT the net — in 'produced' mode the resolver covers the
  // deficit with a power plant, so net ~0 while real production scales
  // with the requested target.
  let mwh = 0
  for (const p of plan.value.processes) mwh += Math.max(0, energyMWh(p.recipe) * p.runs)
  return mwh
})
// Energy shows in Imports only when it's an actual import need (imported mode
// with a deficit); otherwise it's produced/covered and shows in Intermediates.
const energyInImports = computed(() => calc.energyImported && energyDeficitMWh.value > 1e-6)
function toggleEnergy () { calc.energyImported = !calc.energyImported }

// Per-facility power aggregation + peak are pure (src/facility-calc/power.mjs,
// unit-tested). Power-producing buildings sort LAST and contribute 0 to peak
// (they supply power, they don't demand it). See power.mjs for details.
const powerByFacility = computed(() => computePowerByFacility(plan.value))
const peakPowerMW = computed(() => computePeakPowerMW(powerByFacility.value))

function handleInputClick (codeName) {
  // ALWAYS_RAW items toggle their auto-import opt-out; everything else toggles
  // explicit import.
  if (DEFAULT_IMPORTED.includes(codeName)) toggleSkipAutoImport(codeName)
  else toggleImported(codeName)
}

// Click a recipe to toggle it: an already-active (pinned) recipe is
// deactivated (reverts to the default), an inactive alternative is pinned.
// Deactivating drops outputs other recipes depended on, and re-resolution
// automatically moves those unmet demands to Imports.
// Click a recipe to toggle it (pure toggle in activation.mjs, kept in sync
// with the tests): an already-active (pinned) recipe is deactivated
// (reverts to the default), an inactive alternative is pinned.
function chooseRecipe (item, recipe) {
  calc.selectedRecipes = toggleRecipe(calc.selectedRecipes, item, recipe)
}
function fmt (n) {
  // Resources are aggregated from fractional runs; round up so a partial
  // unit still has to be sourced. Tiny epsilon absorbs FP noise.
  return String(Math.ceil(n - 1e-6))
}
// MW display (matches PowerChip): up to 1 dp, hide trailing ".0", no grouping.
function fmtMW (n) {
  const v = Math.round(n * 10) / 10
  return Number.isInteger(v) ? String(v) : v.toFixed(1)
}
// Round a value UP to 1 decimal place (for energy budget, overestimate).
function ceil1 (n) {
  return Math.ceil(n * 10 - 1e-9) / 10
}
// Energy MWh display: values below 0.1 are shown as "<0.1" so a tiny
// surplus/deficit doesn't read as a precise (misleading) decimal.
function fmtEnergyMWh (v) {
  return v < 0.1 ? '<0.1' : ceil1(v)
}
function fmtTime (s) {
  if (!s || s <= 0) return ''
  s = Math.round(s) // round to whole seconds ONCE, then derive h/m/s by flooring
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  const p = []
  if (h) p.push(h + 'h')
  if (m) p.push(m + 'm')
  if (sec || !p.length) p.push(sec + 's')
  return p.join(' ')
}

// Facilities list power label: consumers show "<MW>MW × <time>" (red, counted
// in Peak power); producers show their output (green, excluded from Peak);
// power-neutral buildings show just the time.
function facPowerText (f) {
  if (f.consumptionKw > 0) return fmtMW(f.consumptionKw / 1000) + 'MW × ' + fmtTime(f.timeActive)
  if (f.productionKw > 0) return fmtMW(f.productionKw / 1000) + 'MW × ' + fmtTime(f.timeActive)
  return fmtTime(f.timeActive)
}

const sortBy = (a, b) => displayName(a[0]).localeCompare(displayName(b[0]))

// Resources displayed under Imports section: raw (no recipe, or node-only
// mines) + imported (user-toggled or default-gathered resources).
const rawDisplay = computed(() => {
  const r = {}
  for (const [c, q] of Object.entries(plan.value.raw)) r[c] = (r[c] || 0) + q
  for (const [c, q] of Object.entries(plan.value.inputs)) r[c] = (r[c] || 0) + q
  return Object.entries(r).sort(sortBy)
})

// Irreducible imports: items with no facility recipe at all — must be
// sourced from outside (mined/gathered/farmed), can't be facility-crafted.
// Displayed at the top of the Imports section, separated from reducible
// imports by a thin horizontal line.
const irreducibleInputs = computed(() =>
  rawDisplay.value.filter(([c]) => recipesFor(c).length === 0)
)

// Reducible imports: items in rawDisplay that have at least one facility
// recipe (node mines or facility recipes) — they could be produced instead
// of imported. Shown below the separator.
const reducibleInputs = computed(() =>
  rawDisplay.value.filter(([c]) => recipesFor(c).length > 0)
)

const interDisplay = computed(() =>
  Object.entries(plan.value.intermediate).sort(sortBy)
)

const byDisplay = computed(() =>
  Object.entries(plan.value.byproducts || {}).sort(sortBy)
)

// Items with no facility recipe at all (truly irreducible, must be sourced
// from outside). These stay non-clickable because clicking can't manufacture
// them.
const alwaysInputSet = computed(() => {
  const s = new Set()
  for (const c of Object.keys(plan.value.raw)) {
    if (recipesFor(c).length === 0) s.add(c)
  }
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
        <section v-if="rawDisplay.length || energyInImports" class="fc-block">
          <h3>Imports</h3>
          <div v-if="rawDisplay.length || energyInImports" class="io-list">
            <div v-for="[c, q] in irreducibleInputs" :key="c"
                 class="input-row irreducible">
              <FacItem :codeName="c" :qty="fmt(q)" />
            </div>
            <div v-if="irreducibleInputs.length && reducibleInputs.length" class="input-separator"></div>
            <div v-for="[c, q] in reducibleInputs" :key="c"
                 class="input-row"
                 :class="{ clickable: !alwaysInputSet.has(c) }"
                 @click="alwaysInputSet.has(c) ? undefined : handleInputClick(c)">
              <FacItem :codeName="c" :qty="fmt(q)" />
            </div>
            <div v-if="energyInImports" class="input-row clickable" @click="toggleEnergy" title="toggle energy: import / produce">
              <FacItem codeName="Energy" :qty="fmtEnergyMWh(energyDeficitMWh)" label="MWh" />
            </div>
          </div>
          <p v-else class="muted">none</p>
        </section>

        <section v-if="interDisplay.length || energyProducedMWh > 1e-6" class="fc-block">
          <h3>Intermediates</h3>
          <div class="io-list">
            <div v-for="[c, q] in interDisplay" :key="c" class="inter-row" @click="handleInputClick(c)">
              <FacItem :codeName="c" :qty="fmt(q)" />
            </div>
            <div v-if="energyProducedMWh > 1e-6" class="inter-row" @click="toggleEnergy" title="toggle energy: import / produce">
              <FacItem codeName="Energy" :qty="fmtEnergyMWh(energyProducedMWh)" label="MWh" />
            </div>
          </div>
        </section>

        <section v-if="byDisplay.length" class="fc-block">
          <h3>By-products</h3>
          <div class="io-list">
            <FacItem v-for="[c, q] in byDisplay" :key="c" :codeName="c" :qty="fmt(q)" />
          </div>
        </section>

        <section v-if="powerByFacility.length" class="fc-block">
          <h3>Facilities</h3>
          <div class="power-list">
            <div v-for="f in powerByFacility" :key="f.facilityKey + '|' + f.mod" class="power-row">
              <img :src="`/icons/${f.facilityKey}.png`"
                   class="fac-icon"
                   @error="$event.target.style.visibility = 'hidden'" />
              <span class="nm">{{ f.label }}</span>
              <span class="pw" :class="{ neg: f.consumptionKw > 0, pos: f.productionKw > 0 }">{{ facPowerText(f) }}</span>
            </div>
          </div>
          <div class="peak-power">Peak: {{ fmtMW(peakPowerMW) }}MW</div>
        </section>

        
      </div>

      <div class="fc-right">
        <div v-for="g in groups" :key="g.primaryOutput"
             class="group">
          <div
            v-for="entry in g.recipes"
            :key="entry.r.facilityKey + '|' + (entry.r.mod || '') + '|' + entry.item"
            class="recipe-row"
            :class="{ active: activeRecipes.has(entry.r), clickable: clickableRecipes.has(entry.r) }"
            :title="activeRecipes.has(entry.r) ? 'click to deactivate' : ''"
            @click="chooseRecipe(entry.item, entry.r)"
          >
            <span class="fac-info">
            <img :src="`/icons/${entry.r.facilityKey}.png`"
                 class="fac-icon"
                 @error="$event.target.style.visibility = 'hidden'" />
            <span class="fac-label">{{ modLabel(entry.r) }}</span>
          </span>
            <span class="io-inputs">
              <FacItem v-for="(inp, k) in entry.r.inputs" :key="k" :codeName="inp.codeName" :qty="inp.quantity" />
              <PowerChip v-if="entry.r.powerDelta < 0" :recipe="entry.r" />
            </span>
            <span class="arrow-col">→</span>
            <span class="io-outputs">
              <FacItem v-for="(out, k) in entry.r.outputs.filter(o => o.codeName !== 'Energy')" :key="k" :codeName="out.codeName" :qty="out.quantity" />
              <PowerChip v-if="entry.r.powerDelta > 0" :recipe="entry.r" />
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
  flex: 0 0 340px
  overflow-y: auto
  overflow-x: hidden
  position: sticky
  top: 0
  max-height: 100vh
  align-self: start

  &::-webkit-scrollbar
    width: 3px

  &::-webkit-scrollbar-thumb
    background: #444
    border-radius: 2px

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
    margin-right: 8px
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
    padding: 3px 8px
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
    padding: 3px 8px
    border-radius: 4px
    width: 100%
    cursor: default
    opacity: 0.65

    &.irreducible
      // No special visual needed — base styles already dim and
      // use default cursor for items with no facility recipe.

    &.clickable
      cursor: pointer
      opacity: 1

      &:hover
        background: #262626

    .fac-item
      overflow: hidden
      max-width: 100%

      .nm
        flex: 1 1 auto
        min-width: 0

.input-separator
  height: 0
  border-top: 1px dashed #333
  margin: 2px 8px
  align-self: stretch

.muted
  color: #777
  font-size: 15px

.io-list
  display: flex
  flex-direction: column
  align-items: flex-start

.fac-list
  display: flex
  flex-direction: column
  align-items: flex-start

.fac-row
  display: flex
  align-items: center
  gap: 8px
  padding: 3px 8px
  border-radius: 4px
  width: 100%

  .fac-icon
    width: 28px
    height: 28px
    object-fit: contain
    flex-shrink: 0

  .nm
    color: #ddd
    font-size: 15px

.power-list
  display: flex
  flex-direction: column
  align-items: flex-start

.power-row
  display: flex
  align-items: center
  gap: 8px
  padding: 3px 8px
  border-radius: 4px
  width: 100%

  .fac-icon
    width: 28px
    height: 28px
    object-fit: contain
    flex-shrink: 0

  .nm
    color: #ddd
    font-size: 15px
    flex: 1 1 auto
    min-width: 0
    overflow: hidden
    text-overflow: ellipsis
    white-space: nowrap

  .pw
    color: #9ad
    font-size: 14px
    white-space: nowrap
    font-variant-numeric: tabular-nums
    flex-shrink: 0

    &.neg
      color: #e07a7a

    &.pos
      color: #7ecc7e

.peak-power
  margin-top: 6px
  text-align: right
  color: #ddd
  font-size: 15px
  font-weight: 400

// Primary-output groups. Each group has a right border.
.group
  margin-bottom: 12px
  border-right: 1px solid #555
  padding-right: 12px

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

  // The power×time line (PowerChip) must never be clipped — keep it at its
  // natural width even if its grid column is tight, so “<mag>MW × <time>s”
  // always reads in full.
  .io-inputs, .io-outputs
    .power-chip
      overflow: visible
      min-width: auto

  .arrow-col
    color: #888
    align-self: center
    margin-right: 4px

  // Energy pseudo-resource now renders via <FacItem> (codeName="Energy"),
  // so it shares FacItem's exact styling. No bespoke .energy-row styles.

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

  // Dimmed (not clickable): a recipe that neither produces a relevant item nor
  // is currently active. Clicking can't usefully change the plan for it, so
  // clickable (a pinned recipe that outlives its output stays deactivatable) —
  &:not(.clickable)
    opacity: 0.4
    pointer-events: none
    cursor: default

  &:hover
    opacity: 1
</style>