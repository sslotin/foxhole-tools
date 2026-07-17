<script setup>
import { ref, computed, watch, onMounted, onBeforeUnmount, nextTick } from 'vue'
import metadata from '../../parser/data/metadata.json'
import { facilityProduced, displayName } from '../facility-calc/recipes.mjs'
import { calc, addDesired } from '../facility-calc/store.mjs'
import ItemDetail from './ItemDetail.vue'
import FacilityCalc from './FacilityCalc.vue'
import FacDesired from './FacDesired.vue'

const query = ref('')
const selectedCodeName = ref(undefined)
const detailEl = ref(null)

// Flatten metadata into a list once for filtering. Members of an upgrade
// family (T1/T2/T3) are hidden — the merged family entry is shown instead.
const entries = Object.entries(metadata)
  .filter(([, data]) => !data.inFamily)
  .map(([codeName, data]) => ({
    codeName,
    displayName: data.displayName,
    description: data.description || '',
    chassisName: data.chassisName || '',
    itemType: data.itemType || ''
  }))

// Items already pinned for production are hidden from the results.
const pinned = computed(() => new Set(calc.desired.map(d => d.codeName)))
const results = computed(() => {
  const q = query.value.trim().toLowerCase()

  // Filter by displayName, codeName, chassisName (infobox subheader), or description.
  let matched
  if (!q) {
    matched = entries
  } else {
    matched = entries.filter(e =>
      e.displayName.toLowerCase().includes(q) ||
      e.codeName.toLowerCase().includes(q) ||
      e.chassisName.toLowerCase().includes(q) ||
      e.description.toLowerCase().includes(q)
    )
  }

  // Remove already-pinned items.
  matched = matched.filter(e => !pinned.value.has(e.codeName))

  // In facility cost mode, only show facility-produced items.
  if (calc.active) {
    matched = matched.filter(e => facilityProduced.has(e.codeName))
  }

  // Sort: title match first, then chassisName (infobox subheader), then
  // description/codeName matches; tie-break alphabetically by displayName.
  if (q) {
    const score = e => {
      if (e.displayName.toLowerCase().includes(q)) return 0
      if (e.chassisName && e.chassisName.toLowerCase().includes(q)) return 1
      return 2
    }
    matched.sort((a, b) => {
      const sa = score(a), sb = score(b)
      if (sa !== sb) return sa - sb
      return a.displayName.localeCompare(b.displayName)
    })
  }

  // De-duplicate entries that share a displayName *and* the same itemType —
  // these are tier/variant duplicates of the same thing (Town Base T1/T2/T3,
  // Safe House variants, rail track variants). Keep the most informative /
  // base variant so the search box never lists the same thing twice. Entries
  // that merely share a name across different types (e.g. the Barbed Wire
  // item vs the Barbed Wire structure) are kept separate so both show up.
  const preference = (e) => {
    const d = metadata[e.codeName]
    let p = 0
    if (d?.destruction) p += 4
    if (d?.armourType) p += 2
    p -= e.codeName.length * 0.01 // shorter (base) codename preferred
    return p
  }
  const best = new Map()
  for (const e of matched) {
    const key = `${e.displayName}|${e.itemType}`
    const cur = best.get(key)
    if (!cur || preference(e) > preference(cur)) best.set(key, e)
  }
  matched = matched.filter(e => best.get(`${e.displayName}|${e.itemType}`) === e)

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

// "+" in search results: pin the item to the facility calculator AND jump to
// that view by clearing the metadata (ItemDetail) panel. addDesired() already
// flips calc.active on, so clearing the selection shows FacilityCalc.
function addToFacility(codeName) {
  addDesired(codeName)
  selectedCodeName.value = undefined
}

// Reflect the open item in the URL as /data/<codeName> so links are
// shareable and browser back/forward works. No router is used.
function urlFor(codeName) {
  return codeName ? `/data/${codeName}` : '/'
}
function syncUrl() {
  const next = urlFor(selectedCodeName.value)
  if (location.pathname !== next) history.pushState({ code: selectedCodeName.value }, '', next)
}
function onPopState(e) {
  const code = e.state?.code ?? codeFromPath(location.pathname)
  selectedCodeName.value = code && metadata[code] ? code : undefined
}
function codeFromPath(path) {
  const m = path.match(/^\/data\/([^/]+)$/)
  return m ? decodeURIComponent(m[1]) : undefined
}

onMounted(() => {
  const initial = codeFromPath(location.pathname)
  if (initial && metadata[initial]) selectedCodeName.value = initial
  window.addEventListener('popstate', onPopState)
})
onBeforeUnmount(() => window.removeEventListener('popstate', onPopState))

// Keep the URL in sync whenever the selection changes.
watch(selectedCodeName, syncUrl)

// Scroll the detail panel to the top instantly whenever a new item is opened.
watch(selectedCodeName, () => {
  nextTick(() => { if (detailEl.value) detailEl.value.scrollTop = 0 })
})

// Empty search box → return to the default (empty) view.
watch(query, q => {
  if (!q.trim()) selectedCodeName.value = undefined
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
            @click.stop="addToFacility(e.codeName)"
            title="add to facility cost calculator (opens calculator)"
          >+</button>
        </div>
        <p v-if="results.length === 0 && pinnedMatches === 0" class="no-results">no matches</p>
      </div>
    </div>
    <div class="detail" ref="detailEl">
      <ItemDetail v-if="selectedCodeName" :codeName="selectedCodeName" @select="select" />
      <div class="content fac-content" v-else-if="calc.active">
        <FacilityCalc />
      </div>
      <div class="content" v-else>
        <div class="empty">
          <p class="app-title">s6's foxhole tools <span class="version-label">v2.2.2-u65</span></p>
          <p><strong>1. Inventory mode.</strong> Pin a base, update, copy csv data, ctrl+v. Track deltas, delivery times and burn rates. Click to change report, shift-click to set reference. Set shirts target with a slider, other color-coded targets are proportional. Click to dim tech-locked items. Click faction logo to filter warden/collie/all items.</p>
          <p><strong>2. Stockpile mode.</strong> Ctrl+v a stockpile, shift-click for source, click for target. Filter categories or click items. Auto-fill and edit a shopping list. Ctrl-click on arrow increments in steps of 15, shift-click adds all available. Export shopping list as text or export full state as json that can be imported with ctrl+v or drag-and-drop.</p>
          <p><strong>3. Metadata search.</strong> Look up items, vehicles and structures. Check stats, costs, recipes and "X to kill" tables. Machine- and human-readable. WIP</p>
          <p><strong>4. Facility calculator.</strong> Click + on any facility-made item in search results and explore its supply chain. Choose what to what to produce in-house and import. Calculate inputs, intermediates and by-products. Track production times, power consumption and facility setup cost.</p>
          <p><strong>5. Logi guide.</strong> If you do not want to read, point your favorite LLM to <a href="/guide/index.html">foxhole-tools.netlify.app/guide</a> and it will tell you the optimal way to accomplish what you want.</p>
          <p>The web app is fully local and does not collect any data. New features are added before update wars.
          Persistent tracking (access management, notifications, specialized statistics, etc.) is omitted by design:
          <br>just use json exports and standard Discord features, or write a simple bot for your specific needs.
          </p>

          <p>Feedback is welcome.</p>
        </div>
        <div class="links">
          <a href='/guide/index.html'>logi guide</a>
          <a href='/changelog.txt'>changelog</a>
          <a href='https://github.com/sslotin/foxhole-tools'>source</a>
          <a href='https://github.com/sslotin/foxhole-tools/blob/main/parser/data/metadata.json'>metadata</a>
          <a href='https://discord.com/users/___s6'>message me</a>
        </div>
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


</style>