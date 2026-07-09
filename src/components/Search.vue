<script setup>
import { ref, computed, watch } from 'vue'
import metadata from '../../parser/data/metadata.json'
import { facilityProduced, displayName } from '../facility-calc/recipes.mjs'
import { calc, addDesired } from '../facility-calc/store.mjs'
import { formatEntry, unformattedFields, classify } from './metadata-format.js'
import FacilityCalc from './FacilityCalc.vue'
import FacDesired from './FacDesired.vue'

const query = ref('')
const selectedCodeName = ref(undefined)

// Flatten metadata into a list once for filtering.
const entries = Object.entries(metadata).map(([codeName, data]) => ({
  codeName,
  displayName: data.displayName,
  description: data.description || ''
}))

// Items already pinned for production are hidden from the results.
const pinned = computed(() => new Set(calc.desired.map(d => d.codeName)))
const results = computed(() => {
  const q = query.value.trim().toLowerCase()

  // Filter by displayName, codeName, or description.
  let matched
  if (!q) {
    matched = entries
  } else {
    matched = entries.filter(e =>
      e.displayName.toLowerCase().includes(q) ||
      e.codeName.toLowerCase().includes(q) ||
      e.description.toLowerCase().includes(q)
    )
  }

  // Remove already-pinned items.
  matched = matched.filter(e => !pinned.value.has(e.codeName))

  // In facility cost mode, only show facility-produced items.
  if (calc.active) {
    matched = matched.filter(e => facilityProduced.has(e.codeName))
  }

  // Sort: displayName matches first, then description/codeName matches.
  if (q) {
    matched.sort((a, b) => {
      const aName = a.displayName.toLowerCase().includes(q)
      const bName = b.displayName.toLowerCase().includes(q)
      if (aName !== bName) return aName ? -1 : 1
      return 0
    })
  }

  return matched
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

const formatted = computed(() => {
  if (!selected.value) return null
  const { class: cls, rows, used } = formatEntry(selectedCodeName.value, selected.value)
  return { cls, rows, unformatted: unformattedFields(selectedCodeName.value, selected.value, used) }
})
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
          <span class="name" :class="{ warden: metadata[e.codeName]?.warden === true, collie: metadata[e.codeName]?.warden === false }">{{ e.displayName }}</span>
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
        <div class="infobox" v-if="formatted">
          <div class="infoclass">{{ formatted.cls }}</div>
          <div
            v-for="r in formatted.rows"
            :key="r.label"
            class="irow"
          >
            <span class="ilabel">{{ r.label }}</span>
            <span class="ivalue">{{ r.value }}</span>
          </div>
        </div>
        <details class="raw">
          <summary>unformatted fields ({{ formatted?.unformatted.length }})</summary>
          <p class="unf">{{ formatted?.unformatted.join(', ') }}</p>
        </details>
        <details class="raw" open>
          <summary>raw metadata</summary>
          <pre>{{ JSON.stringify(selected, null, 2) }}</pre>
        </details>
      </div>
      <div class="content fac-content" v-else-if="calc.active">
        <FacilityCalc />
      </div>
      <div class="content" v-else>
        <div class="empty">
          <p class="app-title">s6's foxhole tools <span class="version-label">v2.1.1-u65</span></p>
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

    &.warden::before
      content: '*'
      font-weight: bold
      color: blue
      margin-right: 2px

    &.collie::before
      content: '*'
      font-weight: bold
      color: green
      margin-right: 2px

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
  padding: 6px 10px 6px 26px
  margin: 0
  color: #777
  font-size: 16px

.detail
  flex: 1
  overflow: auto
  padding: 16px 20px
  position: relative

.content.fac-content
  display: flex
  flex-direction: column

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

    .version-label
      font-size: 16px
      color: #777
      margin-left: 10px
      font-weight: 400

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

.infobox
  border: 1px solid #2a2a2a
  border-radius: 8px
  padding: 4px 0
  margin-bottom: 14px
  max-width: 520px
  background: #141414

  .infoclass
    padding: 8px 14px
    font-size: 13px
    letter-spacing: 0.08em
    text-transform: uppercase
    color: #777
    border-bottom: 1px solid #2a2a2a

  .irow
    display: flex
    padding: 4px 14px
    font-size: 14px
    line-height: 1.5

    .ilabel
      width: 130px
      flex-shrink: 0
      color: #888

    .ivalue
      color: #ddd
      word-break: break-word

.raw
  margin: 8px 0

  summary
    cursor: pointer
    color: #888
    font-size: 13px
    padding: 4px 0
    user-select: none

    &:hover
      color: #ddd

  .unf
    color: #666
    font-size: 12px
    line-height: 1.5
    margin: 6px 0

  pre
    font-size: 13px
    line-height: 1.4
    white-space: pre-wrap
    word-break: break-word
    color: #ccc
    margin: 0

</style>