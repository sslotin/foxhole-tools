<script setup>
import { computed, ref } from 'vue'
import { calc } from '../facility-calc/store.mjs'
import {
  recipesFor, displayName, modLabel, isPad, energyMWh, defaultRecipe,
} from '../facility-calc/recipes.mjs'
import { powerByFacility as computePowerByFacility, peakPowerMW as computePeakPowerMW } from '../facility-calc/power.mjs'
import { resolvePlan, reachableRecipes } from '../facility-calc/resolver.mjs'
import {
  focusItems,
  recipeOptions,
  isActiveFor,
  activeRecipes as activeForPlan,
  clickableRecipes as clickableForReachable,
} from '../facility-calc/activation.mjs'
import { toggleImported, toggleSkipAutoImport, chooseRecipe, toggleEnergy } from '../facility-calc/store.mjs'
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

// Recipes actually running in the current plan (by identity) — used by the
// focus model so an active/pinned recipe can never get stuck dimmed.
const activeRecipes = computed(() => activeForPlan(plan.value))
const timeByRecipe = computed(() => {
  const m = new Map()
  for (const p of plan.value.processes) m.set(p.recipe, p.time)
  return m
})

// Focus model: the right panel highlights recipe OPTIONS for the currently
// focused left-panel resource; with no focus it highlights the TARGET options.
// A recipe is clickable (bright, never dimmed) iff it produces the focused
// item — or, with no focus, a desired target — UNION every active recipe (so
// an active/pinned recipe can never get stuck dimmed and can always be
// deactivated). Pure logic in activation.mjs (focusItems / clickableRecipes).
const focused = ref(null)
const clickableRecipes = computed(() =>
  clickableForReachable(reachable.value, focused.value, activeRecipes.value, calc.desired))

// Stable set of every recipe that COULD be involved in producing the pinned
// items, independent of recipe choices. Each recipe is mapped to its primary
// output (see recipes.mjs determinePrimaryOutput), so a multi-output recipe
// always appears under the same heading regardless of which output triggered
// the BFS inclusion. This stability ensures that toggling a recipe choice
// never adds/removes sections — only each row's lit/dim state changes.
const reachable = computed(() => reachableRecipes(calc.desired))



// Right-panel option groups. One group per FOCUSED resource, or (with no
// focus) one group per desired TARGET. Each group lists the recipes that can
// produce that resource, so the picker shows ONLY the relevant options.
// Special exception: the Sulfuric Reactor is a power plant — it is never
// offered as an assignable recipe for sulfur (sulfur is only its by-product).
const pickerGroups = computed(() => {
  const items = focusItems(focused.value, calc.desired)
  const out = []
  for (const codeName of items) {
    // The default recipe (used when the user hasn't pinned one) is tagged so
    // the picker can show a subtle '(default)' note on its row when NO recipe
    // is assigned for this resource (it is imported / terminal).
    const def = defaultRecipe(codeName)
    const assigned = plan.value.assigned[codeName]
    // Tag each option with whether it is the recipe assigned to produce THIS
    // resource (not merely a recipe that happens to also output it while being
    // assigned for some other resource).
    let recipes = recipeOptions(codeName)
      .map(r => ({ r, item: codeName, active: isActiveFor(plan.value.assigned, codeName, r), showDefault: r === def && !assigned }))
    if (recipes.length) out.push({ codeName, label: displayName(codeName), recipes })
  }
  return out
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
// Energy shows in Imports only when it's an actual import need (imported mode
// with a deficit); otherwise it's produced/covered and shows in Intermediates.
const energyInImports = computed(() => calc.energyImported && energyDeficitMWh.value > 1e-6)

// Per-facility power aggregation + peak are pure (src/facility-calc/power.mjs,
// unit-tested). Power-producing buildings sort LAST and contribute 0 to peak
// (they supply power, they don't demand it). See power.mjs for details.
const powerByFacility = computed(() => computePowerByFacility(plan.value))
const peakPowerMW = computed(() => computePeakPowerMW(powerByFacility.value))

function handleInputClick (codeName) {
  if (DEFAULT_IMPORTED.includes(codeName)) { toggleSkipAutoImport(codeName); return }
  // A manually-pinned intermediate (selectedRecipes[codeName] set) must have its
  // pin cleared, otherwise expandState force-produces the pinned recipe and the
  // import toggle is overridden — clicking the resource looks like a no-op
  // (the "can't unassign Petrol" bug). After clearing the pin we force-import
  // (add if missing), mirroring clicking the active recipe in the right panel.
  if (codeName in calc.selectedRecipes) {
    chooseRecipe(codeName, null)
    if (!calc.imported.includes(codeName)) calc.imported.push(codeName)
    return
  }
  // Unpinned intermediate: standard import <-> produce toggle.
  toggleImported(codeName)
}

// Click a recipe row in the right-panel picker.
//  - An inactive recipe is pinned (the resource is produced with it).
//  - The already-active recipe is DEACTIVATED: the resource stops being
//    produced and is imported instead. We must both drop the manual recipe
//    pin (otherwise expandState would keep force-producing it) and mark the
//    resource imported. This mirrors the left-panel row click (which toggles
//    imported <-> produced-with-default) and matches the user's mental model:
//    "click the assigned recipe to unassign it" => import it.
function handleRecipePick (entry) {
  if (!entry.active) {
    chooseRecipe(entry.item, entry.r)
    return
  }
  // Active recipe clicked -> unassign to an import. We must drop the manual
  // pin (otherwise expandState keeps force-producing it) AND mark the
  // resource imported. The import is FORCED (added if missing), not toggled
  // — a resource that was already imported before being pinned must stay
  // imported after unassign, not flip back to its default-produced recipe.
  if (entry.item === 'Energy') { toggleEnergy(); return } // flips to import (clears pin)
  chooseRecipe(entry.item, null) // drop the manual pin first
  if (DEFAULT_IMPORTED.includes(entry.item)) {
    if (calc.skipAutoImport.includes(entry.item)) toggleSkipAutoImport(entry.item)
  } else if (!calc.imported.includes(entry.item)) {
    calc.imported.push(entry.item)
  }
}

// Click a recipe to toggle it: an already-active (pinned) recipe is
// deactivated (reverts to the default), an inactive alternative is pinned.
// Deactivating drops outputs other recipes depended on, and re-resolution
// automatically moves those unmet demands to Imports.
// Click a recipe to toggle it (pure toggle in activation.mjs, kept in sync
// with the tests): an already-active (pinned) recipe is deactivated
// (reverts to the default), an inactive alternative is pinned.
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
// Energy is shown on its own dedicated row (as MWh) with the import/produce
// toggle, so exclude it here to avoid a duplicate "Energy" entry beside the
// "MWh" one.
const rawDisplay = computed(() => {
  const r = {}
  for (const [c, q] of Object.entries(plan.value.raw)) r[c] = (r[c] || 0) + q
  for (const [c, q] of Object.entries(plan.value.inputs)) r[c] = (r[c] || 0) + q
  return Object.entries(r).filter(([c]) => c !== 'Energy').sort(sortBy)
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
  // Energy is shown on its own dedicated MWh row (with the import/produce
  // toggle); exclude it from the generic intermediates list.
  Object.entries(plan.value.intermediate).filter(([c]) => c !== 'Energy').sort(sortBy)
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
  <div class="fac-calc" @mouseleave="focused = null">
    <div v-if="calc.desired.length === 0" class="fc-empty">
      <p>Click <b>+</b> next to a facility-produced item in the search list to add it.</p>
    </div>

    <template v-else>
      <div class="fc-left">
        <section v-if="rawDisplay.length || energyInImports" class="fc-block">
          <h3>Imports</h3>
          <div v-if="rawDisplay.length || energyInImports" class="io-list">
            <div v-for="[c, q] in irreducibleInputs" :key="c"
                 class="input-row irreducible"
                 @mouseenter="focused = c">
              <FacItem :codeName="c" :qty="fmt(q)" />
            </div>
            <div v-if="irreducibleInputs.length && reducibleInputs.length" class="input-separator"></div>
            <div v-for="[c, q] in reducibleInputs" :key="c"
                 class="input-row"
                 :class="{ clickable: !alwaysInputSet.has(c) }"
                 @mouseenter="focused = c"
                 @click="alwaysInputSet.has(c) ? undefined : handleInputClick(c)">
              <FacItem :codeName="c" :qty="fmt(q)" />
            </div>
            <div v-if="energyInImports" class="input-row clickable" @click="toggleEnergy" title="toggle energy: import / produce"
                 @mouseenter="focused = 'Energy'">
              <FacItem codeName="Energy" :qty="fmtEnergyMWh(energyDeficitMWh)" label="MWh" />
            </div>
          </div>
          <p v-else class="muted">none</p>
        </section>

        <section v-if="interDisplay.length || energyProducedMWh > 1e-6" class="fc-block">
          <h3>Intermediates</h3>
          <div class="io-list">
            <div v-for="[c, q] in interDisplay" :key="c" class="inter-row"
                 @mouseenter="focused = c"
                 @click="handleInputClick(c)">
              <FacItem :codeName="c" :qty="fmt(q)" />
            </div>
            <div v-if="energyProducedMWh > 1e-6" class="inter-row" @click="toggleEnergy" title="toggle energy: import / produce"
                 @mouseenter="focused = 'Energy'">
              <FacItem codeName="Energy" :qty="fmtEnergyMWh(energyProducedMWh)" label="MWh" />
            </div>
          </div>
        </section>

        <section v-if="byDisplay.length" class="fc-block">
          <h3>By-products</h3>
          <div class="io-list">
            <div v-for="[c, q] in byDisplay" :key="c" class="by-row"
                 @mouseenter="focused = c">
              <FacItem :codeName="c" :qty="fmt(q)" />
            </div>
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
          <div class="peak-power">= {{ fmtMW(peakPowerMW) }}MW peak</div>
        </section>

        
      </div>

      <div class="fc-right">
        <div v-for="g in pickerGroups" :key="g.codeName"
             class="group">
          <div
            v-for="entry in g.recipes"
            :key="entry.r.facilityKey + '|' + (entry.r.mod || '') + '|' + entry.item"
            class="recipe-row"
            :class="{ active: entry.active, clickable: clickableRecipes.has(entry.r) }"
            :title="entry.active ? 'click to deactivate' : ''"
            @click="handleRecipePick(entry)"
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
            <span class="io-time" :class="{ visible: entry.active || entry.showDefault, default: entry.showDefault }">{{ entry.active ? fmtTime(timeByRecipe.get(entry.r)) : (entry.showDefault ? '(default)' : '') }}</span>
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
  padding-right: 16px
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
  margin-bottom: 12px

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
    padding: 1px 8px
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
    padding: 1px 8px
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
  padding: 1px 8px
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
    margin-right: 0
    padding-right: 0

  .pw
    color: #9ad
    font-size: 14px
    white-space: nowrap
    font-variant-numeric: tabular-nums
    flex-shrink: 0
    margin-left: auto
    text-align: right

    &.neg
      color: #e07a7a

    &.pos
      color: #7ecc7e

.peak-power
  margin-top: 6px
  margin-right: -7px
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

    &.default
      color: #8a8a8a

  &.active
    background: var(--green-active)

    // Hover on the active recipe: slightly lighter than --green-active so the
    // user gets feedback that it is clickable to deactivate (unassign).
    &:hover
      background: #244824

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