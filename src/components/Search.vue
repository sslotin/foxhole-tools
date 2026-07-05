<script setup>
import { ref, computed, watch } from 'vue'
import metadata from '../../parser/data/metadata.json'

const query = ref('')
const selectedCodeName = ref(undefined)

// Flatten metadata into a list once for filtering.
const entries = Object.entries(metadata).map(([codeName, data]) => ({
  codeName,
  displayName: data.displayName
}))

// Case-insensitive substring match on displayName only.
const results = computed(() => {
  const q = query.value.trim().toLowerCase()
  if (!q) return entries
  return entries.filter(e => e.displayName.toLowerCase().includes(q))
})

function select(codeName) {
  selectedCodeName.value = codeName
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
        </div>
        <p v-if="results.length === 0" class="no-results">no matches</p>
      </div>
    </div>
    <div class="detail">
      <div class="content">
        <template v-if="selected">
          <div class="header">
            <h2>{{ selected.displayName }}</h2>
            <code>{{ selectedCodeName }}</code>
          </div>
          <pre>{{ JSON.stringify(selected, null, 2) }}</pre>
        </template>
        <div v-else class="empty">
          <p>ctrl+v a csv or use search</p>
        </div>
      </div>
      <div v-if="!selected" class="links">
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
  width: 320px
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

    .name
      font-weight: bold

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
  max-width: 1000px
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