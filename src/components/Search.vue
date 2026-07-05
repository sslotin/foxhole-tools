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
          <p>ctrl+v a csv or use search</p>
        </div>
      </div>
      <div v-if="!selected && !calc.active" class="links">
        <a href='/tutorial.mp4'>old tutorial</a>
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
  text-align: center
  margin-top: 20px
  color: #999

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