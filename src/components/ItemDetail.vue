<script setup>
import { computed } from 'vue'
import metadata from '../../parser/data/metadata.json'
import { formatEntry, unformattedFields } from './metadata-format.js'

const props = defineProps({
  codeName: { type: String, default: undefined },
})
const emit = defineEmits(['select'])

const selected = computed(() =>
  props.codeName ? metadata[props.codeName] : undefined
)

// Resolve a linked row (e.g. the Ammo code) to its display name.
function rowDisplay(r) {
  if (r.code) return metadata[r.code]?.displayName || r.code
  return r.value
}

// Icon URL for a given code name; missing icons are hidden.
function iconUrl(code) {
  return `/icons/${code}.png`
}
function hideIcon(e) {
  e.target.style.visibility = 'hidden'
}

const formatted = computed(() => {
  if (!selected.value) return null
  const { class: cls, rows, used, missing } = formatEntry(props.codeName, selected.value)
  return { cls, rows, missing, unformatted: unformattedFields(props.codeName, selected.value, used) }
})
</script>

<template>
  <div class="content" v-if="selected">
    <div class="header">
      <h2>
        <img class="title-icon" :src="iconUrl(codeName)" @error="hideIcon" alt="" />
        <span class="fact" :class="{ warden: selected.warden === true, collie: selected.warden === false }"></span><span class="title-name">{{ selected.displayName }}</span>
      </h2>
      <code>{{ codeName }}</code>
    </div>
    <p class="desc" v-if="selected.description">{{ selected.description }}</p>
    <div class="infobox" v-if="formatted">
      <div class="infoclass">{{ formatted.cls }}</div>
      <div
        v-for="r in formatted.rows"
        :key="r.label"
        class="irow"
      >
        <span class="ilabel">{{ r.label }}</span>
        <span class="ivalue">
          <!-- Crate cost: list of ingredients, each with an icon -->
          <span v-if="r.items" class="items">
            <span v-for="(it, i) in r.items" :key="i" class="item">
              <a v-if="metadata[it.code]" class="link" @click.prevent="emit('select', it.code)">
                <span class="qty">{{ it.qty }} ×</span><img class="row-icon" :src="iconUrl(it.code)" @error="hideIcon" alt="" />
              </a>
              <span v-else>
                <span class="qty">{{ it.qty }} ×</span><img class="row-icon" :src="iconUrl(it.code)" @error="hideIcon" alt="" />
              </span>
            </span>
          </span>
          <!-- Single linked code (e.g. Ammo) with an icon -->
          <a v-else-if="r.code" class="link" @click.prevent="emit('select', r.code)">
            <img class="row-icon" :src="iconUrl(r.code)" @error="hideIcon" alt="" />{{ rowDisplay(r) }}
          </a>
          <template v-else>{{ r.value }}</template>
        </span>
      </div>
    </div>
    <details class="raw">
      <summary>unformatted fields ({{ formatted?.unformatted.length }})</summary>
      <div class="unf">
        <div v-for="f in formatted.unformatted" :key="f.k" class="unf-row">{{ f.k }}: {{ f.v }}</div>
      </div>
    </details>
    <details class="raw">
      <summary>missing fields ({{ formatted?.missing.length }})</summary>
      <div class="unf">
        <div v-for="m in formatted.missing" :key="m" class="unf-row">{{ m }}</div>
      </div>
    </details>
    <details class="raw" open>
      <summary>raw metadata</summary>
      <pre>{{ JSON.stringify(selected, null, 2) }}</pre>
    </details>
  </div>
</template>

<style scoped lang="sass">
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
    display: flex
    align-items: center
    gap: 8px

    .title-icon
      width: 28px
      height: 28px
      object-fit: contain
      flex-shrink: 0

    .fact
      &.warden::before
        content: '*'
        font-weight: bold
        color: blue
        margin-right: 0

      &.collie::before
        content: '*'
        font-weight: bold
        color: green
        margin-right: 0

.row-icon
  width: 18px
  height: 18px
  object-fit: contain
  vertical-align: middle
  margin-right: 4px
  flex-shrink: 0

.items
  display: flex
  flex-wrap: wrap
  gap: 2px 4px

  .item
    display: inline-flex
    align-items: center

    .row-icon
      margin-left: 4px

.desc
  margin: 0 0 14px 0
  font-style: italic
  color: #999
  font-size: 14px
  line-height: 1.5
  max-width: 700px

pre
  font-size: 13px
  line-height: 1.4
  white-space: pre-wrap
  word-break: break-word
  color: #ccc
  margin: 0

.infobox
  border: 1px solid #2a2a2a
  border-radius: 8px
  padding: 4px 0
  margin-bottom: 14px
  max-width: 700px
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

      .link
        color: #6cf
        cursor: pointer
        text-decoration: none

        &:hover
          text-decoration: underline
          color: #9df

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

    .unf-row
      white-space: pre-wrap
      word-break: break-word

  pre
    font-size: 13px
    line-height: 1.4
    white-space: pre-wrap
    word-break: break-word
    color: #ccc
    margin: 0
</style>