<script setup>
import { ref, computed, watch } from 'vue'
import metadata from '../../parser/data/metadata.json'
import { facilityProduced, displayName } from '../facility-calc/recipes.mjs'
import { calc, addDesired } from '../facility-calc/store.mjs'
import FacilityCalc from './FacilityCalc.vue'
import FacDesired from './FacDesired.vue'

const query = ref('')
const selectedCodeName = ref(undefined)

// Flatten metadata into a list once for filtering.
const entries = Object.entries(metadata).map(([codeName, data]) => ({
  codeName,
  displayName: data.displayName
}))

// Case-insensitive substring match on displayName only.
// Items already pinned for production are hidden from the results.
const pinned = computed(() => new Set(calc.desired.map(d => d.codeName)))
const results = computed(() => {
  const q = query.value.trim().toLowerCase()
  const base = !q ? entries : entries.filter(e => e.displayName.toLowerCase().includes(q))
  const filtered = base.filter(e => !pinned.value.has(e.codeName))
  if (!calc.active) return filtered
  // When the calculator is active, surface facility-produced items first
  // (preserving existing order within each group).
  const fac = [], other = []
  for (const e of filtered) (facilityProduced.has(e.codeName) ? fac : other).push(e)
  return [...fac, ...other]
})

// Pinned items are hidden from `results`, but a query that matches one of them
// is still a real match — used to suppress the "no matches" message.
const pinnedMatches = computed(() => {
  const q = query.value.trim().toLowerCase()
  if (!q) return 0
  return calc.desired.filter(d => displayName(d.codeName).toLowerCase().includes(q)).length
})

function select(codeName) {
  // Clicking the already-active row toggles it off (exits metadata view).
  selectedCodeName.value = selectedCodeName.value === codeName ? undefined : codeName
}

// Empty search box → return to the default (empty) view.
watch(query, q => {
  if (!q.trim()) selectedCodeName.value = undefined
})

const selected = computed(() =>
  selectedCodeName.value ? metadata[selectedCodeName.value] : undefined
)
</script>

<template>
  <div class="ms">
    <div class="panel">
      <div class="search-wrap">
        <input
          class="search"
          type="text"
          v-model="query"
          placeholder="search items…"
          autofocus
        />
        <div v-if="query" class="clear" @click="query = ''">
          <div class="x">×</div>
        </div>
      </div>
      <FacDesired :selected="selectedCodeName" @select="select" />
      <div class="results" v-if="query.trim()">
        <div
          v-for="e in results"
          :key="e.codeName"
          class="row"
          :class="{ active: e.codeName === selectedCodeName }"
          @click="select(e.codeName)"
        >
          <img
            :src="`/icons/${e.codeName}.png`"
            @error="$event.target.style.visibility = 'hidden'"
          />
          <span class="name">{{ e.displayName }}</span>
          <button
            v-if="facilityProduced.has(e.codeName)"
            class="add-fac"
            @click.stop="addDesired(e.codeName)"
            title="add to facility cost calculator"
          >+</button>
        </div>
        <p v-if="results.length === 0 && pinnedMatches === 0" class="no-results">no matches</p>
      </div>
    </div>
    <div class="detail">
      <div class="content" v-if="selected">
        <div class="header">
          <h2>{{ selected.displayName }}</h2>
          <code>{{ selectedCodeName }}</code>
        </div>
        <pre>{{ JSON.stringify(selected, null, 2) }}</pre>
      </div>
      <div class="content" v-else-if="calc.active">
        <FacilityCalc />
      </div>
      <div class="content" v-else>
        <div class="empty">
          <p class="app-title">s6's foxhole tools</p>
          <p><strong>1. Inventory mode.</strong> Pin a base, update, copy csv data, ctrl+v. Track deltas, delivery times and burn rates. Click to change report, shift-click to set reference. Set shirts target with a slider, other color-coded targets are proportional. Click to dim tech-locked items. Click faction logo to filter warden/collie/all items.</p>
          <p><strong>2. Stockpile mode.</strong> Ctrl+v a stockpile, shift-click for source, click for target. Filter categories or click items. Auto-fill and edit a shopping list. Ctrl-click on arrow increments in steps of 15, shift-click adds all available. Export shopping list as text or export full state as json that can be imported with ctrl+v or drag-and-drop.</p>
          <p><strong>3. Metadata search.</strong> Look up items, vehicles and structures. Check stats, costs and recipes. WIP</p>
          <p><strong>4. Facility calculator.</strong> Click + on any facility-made item in search results. Explore production chains and compute resource and time requirements. WIP</p>
          <p><strong>5. Logi guide.</strong> If you do not want to read, point your favorite LLM to <a href="/guide/index.html">foxhole-tools.netlify.app/guide</a> and it will tell you the optimal way to do what you want.</p>
          <p>Feedback is welcome. New features are added before update wars. The app is stateless and fully local. Management/tracking/notification/sync tools will <i>not</i> be added, but you can write an app/bot downstream. Anything not relevant for logistics is out of scope.</p>
        </div>
      </div>
      <div v-if="!selected && !calc.active" class="links">
        <a href='/guide/index.html'>logi guide</a>
        <a href='/changelog.txt'>changelog</a>
        <a href='https://github.com/sslotin/foxhole-tools'>source</a>
        <a href='https://github.com/sslotin/foxhole-tools/blob/main/parser/data/metadata.json'>metadata</a>
        <a href='https://discord.com/users/___s6'>message me</a>
      </div>
    </div>
  </div>
</template>

<style scoped lang="sass">
.ms
  display: flex
  height: calc(100vh - 8px)
  --green-active: #183018

.panel
  width: 370px
  flex-shrink: 0
  display: flex
  flex-direction: column

.search-wrap
  position: relative
  margin: 12px

.search
  box-sizing: border-box
  width: 100%
  padding: 10px 30px 10px 14px
  font-size: 18px
  background: #141414
  color: #ddd
  border: none
  border-radius: 8px
  outline: none

  &:focus
    background: #0d0d0d

  &::placeholder
    color: #666

.clear
  position: absolute
  right: 8px
  top: 10px
  width: 20px
  height: 20px
  text-align: center
  border-radius: 14px
  cursor: pointer

  .x
    font-size: 16px
    line-height: 14px
    margin-top: 3px

  &:hover
    background-color: rgba(255, 255, 255, 0.2)

.results
  overflow-y: auto
  flex: 1

  &::-webkit-scrollbar
    width: 3px

  &::-webkit-scrollbar-thumb
    background: #444
    border-radius: 2px

.row
  display: flex
  align-items: center
  gap: 8px
  padding: 6px 10px
  cursor: pointer
  user-select: none

  &:hover
    background: #2a2a2a

  &.active
    background: #333

  img
    width: 32px
    height: 32px
    flex-shrink: 0
    object-fit: contain

  .name
    flex: 1
    font-size: 16px
    white-space: nowrap
    overflow: hidden
    text-overflow: ellipsis

  .add-fac
    flex-shrink: 0
    width: 22px
    height: 22px
    border: none
    border-radius: 4px
    background: #2a5a2a
    color: #bfe6bf
    font-size: 16px
    line-height: 1
    cursor: pointer

    &:hover
      background: #3a7a3a

.no-results
  padding: 16px 10px
  color: #777
  font-size: 16px

.detail
  flex: 1
  overflow: auto
  padding: 16px 20px
  position: relative

  &::-webkit-scrollbar
    width: 3px

  &::-webkit-scrollbar-thumb
    background: #444
    border-radius: 2px

.content
  width: 100%
  max-width: 1200px
  margin: 0 auto

.header
  display: flex
  align-items: baseline
  gap: 12px
  margin-bottom: 12px

  h2
    margin: 0
    font-size: 22px

  code
    background: #333
    padding: 2px 6px
    border-radius: 3px
    font-size: 13px
    color: #aaa

pre
  font-size: 13px
  line-height: 1.4
  white-space: pre-wrap
  word-break: break-word
  color: #ccc
  margin: 0

.empty
  margin: 0 auto 20px
  max-width: 700px
  font-size: 15px
  line-height: 1.6
  text-align: left

  p
    margin: 0 0 14px 0
    color: #999
    font-size: 14px

  strong
    color: #bbb
    font-weight: 600

  a
    text-decoration: none
    color: #777

    &:hover
      color: #ddd

  .app-title
    font-size: 28px
    color: #bbb
    margin: 0 0 18px 0
    font-weight: 300

.links
  position: absolute
  bottom: 20px
  left: 0
  right: 0
  text-align: center

  a
    text-decoration: none
    color: #777
    margin: 0 16px

    &:hover
      color: #ddd
</style>