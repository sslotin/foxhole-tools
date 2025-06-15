<script setup>
const props = defineProps(['singular', 'crated']);
</script>

<template>
  <span class="wrapper">
    <span class="crated" v-if="crated > 0">{{ crated }}<span class='x3'>×3</span></span>
    <span class="plus" v-if="singular > 0 && crated > 0"> + </span>
    <span class="singular" v-if="singular > 0">{{ singular }}</span>
  </span>
</template>

<style scoped lang="sass">
.hidden
  visibility: hidden

.wrapper
  white-space: nowrap

  .x3
    color: #666
    margin-left: 2px
    font-size: 12px
  //font-size: 16px
  
  //span
  //  display: inline-block

  //.crated
  //  width: 52px
  //  text-align: right

  .plus
    color: #666
    margin-left: -2px
    margin-right: -2px
  //  width: 14px
  //  text-align: center
</style>
