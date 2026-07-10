<script setup>
import { computed } from 'vue'
import metadata from '../../parser/data/metadata.json'
import { formatEntry, unformattedFields } from './metadata-format.js'
import ProductionBox from './ProductionBox.vue'
import { productionRecipes } from './production-recipes.js'

const props = defineProps({
  codeName: { type: String, default: undefined },
})
const emit = defineEmits(['select'])

const selected = computed(() =>
  props.codeName ? metadata[props.codeName] : undefined
)

// Raw metadata: show the item's own entry, minus the derived analysis blobs
// (resistances / destruction) which are already presented in dedicated blocks above.
const RAW_EXCLUDE = new Set(['resistances', 'destruction'])
const rawEntry = computed(() => {
  const s = selected.value
  if (!s) return null
  const out = {}
  for (const k of Object.keys(s)) if (!RAW_EXCLUDE.has(k)) out[k] = s[k]
  return out
})

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

const isFamily = computed(() => !!selected.value?.isFamily)

const formatted = computed(() => {
  // Families render their own merged layout; skip the per-item formatter.
  if (!selected.value || selected.value.isFamily) return null
  const { class: cls, rows, used, missing } = formatEntry(props.codeName, selected.value)
  return { cls, rows, missing, unformatted: unformattedFields(props.codeName, selected.value, used) }
})

// ── Resistances / destruction helpers ──────────────────────────
// Armour (HP + type) — shown in the merged Resistances pane.
const armourLabel = computed(() => {
  const v = selected.value
  if (!v) return ''
  const tankArmour = v.vehicleData?.tankArmour
  const armourType = v.armourType ?? v.resistances?.armourType
  if (tankArmour == null && !armourType) return ''
  const hpPart = tankArmour === 0 ? 'Unarmored' : (tankArmour != null ? `${tankArmour} armour` : '')
  return armourType ? (hpPart ? `${hpPart} (${armourType})` : `(${armourType})`) : hpPart
})

function prettyDamageType(dt) {
  return dt
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/^./, c => c.toUpperCase())
}

// Sort key: "amount needed to kill" — fewer rounds = stronger. Infinity if none.
function killKey(counts) {
  for (const c of counts) if (c && c.toKill != null) return c.toKill
  return Infinity
}
// A damage-type group's strength = its strongest ammo (lowest toKill).
function groupKey(row) {
  let m = Infinity
  for (const a of row.ammo) m = Math.min(m, killKey(a.counts))
  return m
}

// Damage types that are pure binary noise (only 0%/100%, no graded resistance)
// and carry no logistics info. Hidden from the Resistances display — including
// Incendiary and Extinguishing. IncendiaryHighExplosive is KEPT (distinct mechanic).
// Values are faithful in the data — only filtered at render.
const HIDDEN_DAMAGE_TYPES = new Set([
  'Karate', 'PoisonGas', 'GroundZero', 'Decay', 'Environment', 'Incendiary', 'Extinguishing',
])

// ── Merged Resistances pane (resistance % + kill counts, grouped by damage type) ──
// Handles both single items and upgrade families (T1/T2/T3 columns).
const merged = computed(() => {
  const s = selected.value
  if (!s) return null
  if (s.isFamily) return familyMerged(s)
  const res = s.resistances
  const destr = s.destruction
  if (!res && !destr) return null
  const isVehicle = !!destr?.isVehicle
  const health = res?.health ?? destr?.health ?? null
  const groups = {}
  const order = []
  for (const a of destr?.ammo || []) {
    if (HIDDEN_DAMAGE_TYPES.has(a.damageType) || !a.hasIcon) continue
    if (!groups[a.damageType]) { groups[a.damageType] = []; order.push(a.damageType) }
    groups[a.damageType].push(a)
  }
  let dtRows = order.map((dt) => {
    const ammo = groups[dt]
      .map((a, i) => ({ code: a.code, label: a.label, counts: [{ toKill: a.toKill, toDisable: a.toDisable }], _i: i }))
      .sort((x, y) => (killKey(y.counts) - killKey(x.counts)) || (x._i - y._i))
      .map(({ _i, ...r }) => r)
    return {
      dt,
      label: prettyDamageType(dt),
      resist: [res?.byDamageType?.[dt] != null ? Math.round(res.byDamageType[dt] * 100) : 100],
      ammo,
    }
  })
  dtRows.sort((x, y) => groupKey(y) - groupKey(x))
  return { isFamily: false, isVehicle, health, armour: armourLabel.value, tiers: [''], dtRows }
})

function familyMerged(s) {
  const members = s.familyMembers.map((c) => metadata[c]).filter(Boolean)
  const tiers = members.map((_, i) => 'T' + (i + 1))
  const health = members.map((m) => m.resistances?.health ?? m.maxHealth ?? null)
  const groups = {}
  const order = []
  members.forEach((m, ti) => {
    for (const a of m.destruction?.ammo || []) {
      if (HIDDEN_DAMAGE_TYPES.has(a.damageType) || !a.hasIcon) continue
      if (!groups[a.damageType]) { groups[a.damageType] = {}; order.push(a.damageType) }
      if (!groups[a.damageType][a.code]) groups[a.damageType][a.code] = { code: a.code, label: a.label, perTier: new Array(members.length).fill(null) }
      groups[a.damageType][a.code].perTier[ti] = { toKill: a.toKill, toDisable: a.toDisable }
    }
  })
  let dtRows = order.map((dt) => {
    const ammo = Object.values(groups[dt])
      .map((g, i) => ({ code: g.code, label: g.label, counts: g.perTier, _i: i }))
      .sort((x, y) => (killKey(y.counts) - killKey(x.counts)) || (x._i - y._i))
      .map(({ _i, ...r }) => r)
    return {
      dt,
      label: prettyDamageType(dt),
      resist: members.map((m) => m.resistances?.byDamageType?.[dt] != null ? Math.round(m.resistances.byDamageType[dt] * 100) : 100),
      ammo,
    }
  })
  dtRows.sort((x, y) => groupKey(y) - groupKey(x))
  return { isFamily: true, isVehicle: false, tiers, health, armour: null, dtRows }
}



const mergedHeader = computed(() => {
  const m = merged.value
  if (!m) return 'Resistances'
  let h = 'Resistances'
  // Families show each tier's health in the column header (T1 (x) …);
  // single items keep the health here.
  if (m.health != null && !Array.isArray(m.health)) h += ` | ${m.health} hp`
  return h
})

// "Production" infobox: every way the item is made/consumed (facility recipes,
// Garage/Construction Yard build, Factory/MPF crate production). For upgrade
// families the representative entry is the original Tier 1 member.
const prodCode = computed(() =>
  isFamily.value ? selected.value?.familyMembers?.[0] : props.codeName)
const prodEntry = computed(() => (prodCode.value ? metadata[prodCode.value] : null))
const prodRecipes = computed(() =>
  prodEntry.value ? productionRecipes(prodCode.value, prodEntry.value) : [])
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
    <!-- Upgrade family: one page per building, Resistances pane with 1+3 tier columns -->
    <template v-if="isFamily">
      <ProductionBox :recipes="prodRecipes" @select="emit('select', $event)" />

      <div class="infobox" v-if="merged">
        <div class="infoclass">{{ mergedHeader }}<template v-if="merged.armour"> · <span class="sub">{{ merged.armour }}</span></template></div>
        <table class="ktab">
          <thead v-if="merged.tiers.length > 1">
            <tr><th class="klabel"></th><th v-for="(t, i) in merged.tiers" :key="t">{{ t }} ({{ merged.health[i] }})</th></tr>
          </thead>
          <tbody>
            <template v-for="row in merged.dtRows" :key="row.dt">
              <tr class="resist-row">
                <td class="klabel">{{ row.label }} ({{ row.resist.map((r, i) => i === row.resist.length - 1 ? r + '%' : r).join('-') }})</td>
                <td v-for="(r, i) in row.resist" :key="'e' + i" class="kval"></td>
              </tr>
              <tr class="ammo-row" v-for="a in row.ammo" :key="a.code">
                <td class="klabel">
                  <a class="link" @click.prevent="emit('select', a.code)"><img class="row-icon" :src="iconUrl(a.code)" @error="hideIcon" alt="" /><span class="alabel">{{ a.label }}</span></a>
                </td>
                <td v-for="(c, i) in a.counts" :key="i" class="kval">
                  <template v-if="merged.isVehicle && c && c.toDisable != null"><span class="dim dis">{{ c.toDisable }}|</span>{{ c.toKill }}</template>
                  <template v-else>{{ c ? c.toKill : '–' }}</template>
                </td>
              </tr>
            </template>
            <tr v-if="!merged.dtRows.length">
              <td class="klabel" :colspan="1 + merged.tiers.length">Unarmored — no damage-resistance profile.</td>
            </tr>
          </tbody>
        </table>
        <p class="dnote">Numbers do not account for low/high velocity modifiers and RNG.</p>
      </div>

      <p class="desc" v-if="selected.description">{{ selected.description }}</p>

      <details class="raw" open>
        <summary>raw metadata</summary>
        <pre>{{ JSON.stringify(rawEntry, null, 2) }}</pre>
      </details>
    </template>

    <template v-else>
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

    <ProductionBox :recipes="prodRecipes" @select="emit('select', $event)" />

    <div class="infobox" v-if="merged">
      <div class="infoclass">{{ mergedHeader }}<template v-if="merged.armour"> · <span class="sub">{{ merged.armour }}</span></template></div>
      <table class="ktab">
        <thead v-if="merged.tiers.length > 1">
          <tr><th class="klabel"></th><th v-for="(t, i) in merged.tiers" :key="t">{{ t }} ({{ merged.health[i] }})</th></tr>
        </thead>
        <tbody>
          <template v-for="row in merged.dtRows" :key="row.dt">
            <tr class="resist-row">
              <td class="klabel">{{ row.label }} ({{ row.resist.map((r, i) => i === row.resist.length - 1 ? r + '%' : r).join('-') }})</td>
              <td v-for="(r, i) in row.resist" :key="'e' + i" class="kval"></td>
            </tr>
            <tr class="ammo-row" v-for="a in row.ammo" :key="a.code">
              <td class="klabel">
                <a class="link" @click.prevent="emit('select', a.code)"><img class="row-icon" :src="iconUrl(a.code)" @error="hideIcon" alt="" /><span class="alabel">{{ a.label }}</span></a>
              </td>
              <td v-for="(c, i) in a.counts" :key="i" class="kval">
                <template v-if="merged.isVehicle && c && c.toDisable != null"><span class="dim dis">{{ c.toDisable }}|</span>{{ c.toKill }}</template>
                <template v-else>{{ c ? c.toKill : '–' }}</template>
              </td>
            </tr>
          </template>
          <tr v-if="!merged.dtRows.length">
            <td class="klabel" :colspan="1 + merged.tiers.length">Unarmored — no damage-resistance profile.</td>
          </tr>
        </tbody>
      </table>
      <p class="dnote">Numbers do not account for low/high velocity modifiers and RNG.</p>
    </div>

    <p class="desc" v-if="selected.description">{{ selected.description }}</p>

    <details class="raw" v-if="formatted">
      <summary>unformatted fields ({{ formatted?.unformatted.length }})</summary>
      <div class="unf">
        <div v-for="f in formatted.unformatted" :key="f.k" class="unf-row">{{ f.k }}: {{ f.v }}</div>
      </div>
    </details>
    <details class="raw" v-if="formatted">
      <summary>missing fields ({{ formatted?.missing.length }})</summary>
      <div class="unf">
        <div v-for="m in formatted.missing" :key="m" class="unf-row">{{ m }}</div>
      </div>
    </details>

    <details class="raw" open>
      <summary>raw metadata</summary>
      <pre>{{ JSON.stringify(rawEntry, null, 2) }}</pre>
    </details>
    </template>
  </div>
</template>

<style scoped lang="sass">
.content
  width: 100%
  max-width: 1200px
  margin: 0 auto

.header
  display: flex
  align-items: center
  gap: 12px
  margin-bottom: 12px

  h2
    margin: 0
    font-size: 22px
    display: flex
    align-items: center

    .title-icon
      width: 28px
      height: 28px
      object-fit: contain
      flex-shrink: 0
      margin-right: 8px

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

.dim
  opacity: 0.5

.link
  color: #7488a8
  cursor: pointer
  text-decoration: none

  &:hover
    text-decoration: underline
    color: #9fb2cf

.resist-row
  font-weight: 600

  td.klabel
    color: #ddd

.dnote
  margin: 6px 14px 2px
  font-size: 12px
  color: #777
  line-height: 1.4

.ktab
  border-collapse: collapse
  width: 100%
  font-size: 14px
  margin: 4px 0

  th, td
    padding: 4px 12px
    white-space: nowrap

  th
    color: #888
    font-weight: 600
    text-align: left

  td.klabel, th.klabel
    text-align: left
    white-space: nowrap
    color: #888
    width: 1%
    min-width: 180px

  .kval
    text-align: left
    color: #ddd
    width: 6em
    white-space: nowrap

.dis
  display: inline-block
  width: 4.5em
  text-align: right
  margin-right: 3px

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

    .sub
      text-transform: none

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
        color: #7488a8
        cursor: pointer
        text-decoration: none

        &:hover
          text-decoration: underline
          color: #9fb2cf

.destruction
  overflow-x: auto

  .dtab
    border-collapse: collapse
    width: 100%
    font-size: 13px

    th, td
      border: 1px solid #2a2a2a
      padding: 4px 10px
      text-align: center
      white-space: nowrap

    th
      color: #888
      font-weight: 600

    td.ammocol
      text-align: left
      color: #ddd

    th.current, td.current
      background: #243424
      color: #bdf

  .dnote
    margin: 6px 14px 2px
    font-size: 12px
    color: #777
    line-height: 1.4

  // Resistances table for merged upgrade families (1 label + T1/T2/T3 columns)
  .rtab
    border-collapse: collapse
    width: 100%
    font-size: 13px
    margin: 4px 0

    th, td
      border: 1px solid #2a2a2a
      padding: 4px 10px
      text-align: center
      white-space: nowrap

    th
      color: #888
      font-weight: 600

    td.rlabel
      text-align: left
      color: #ddd
      font-weight: 600

  // (kill-table styling moved to .irow-based .resist-row / .tcell rules)

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