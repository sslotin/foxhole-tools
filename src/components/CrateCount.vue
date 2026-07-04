<script setup>
const props = defineProps(['total', 'target', 'needed', 'resources']);
</script>

<template>
  <span :class="{ shifted: resources > 0 }" class="wrapper">
    <span class='total' :class="{ hidden: total == 0 }">{{ total }}</span>
    <span class='needed' v-if="needed > total"> + {{ needed - total }}</span>
    <span class='target' v-if="target > 0"> / {{ target }}</span>
    <span class='resources' v-if="resources > 0"><br>~{{ (resources / 1000).toFixed(1) }}k</span>
  </span>
</template>

<style scoped lang="sass">
.hidden
  visibility: hidden

.wrapper
  white-space: nowrap
  span
    display: inline-block

  .total
    width: 30px
    text-align: right
    padding-right: 4px
    //background: red

  .needed
    color: #d66
    font-size: 12px

  .target
    color: #666
    font-size: 12px

.shifted
  font-size: 12px
  .total
    width: 24px
  span
    position: relative
    top: -10px
  .resources
    position: absolute
    left: 0px
    top: -8px
    color: #666
</style>
