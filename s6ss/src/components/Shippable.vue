<script setup>
import { inject } from 'vue'
import ShippableCount from './ShippableCount.vue'
import { metadata } from '../../../scanner'


const props = defineProps(['name']);
const name = props.name;

const targetStockpile = inject('targetStockpile');
const sourceStockpile = inject('sourceStockpile');

const sourceSingular = sourceStockpile[name]?.countSingular || 0;
const sourceCrated = sourceStockpile[name]?.countCrated || 0;

const targetSingular = targetStockpile[name]?.countSingular || 0;
const targetCrated = targetStockpile[name]?.countCrated || 0;
</script>

<template>
  <div class="line">
    <img :src="`/icons/${name}.png`">
    <span class='name'>{{ metadata[name].displayName }}</span>

    <ShippableCount :singular="sourceSingular" :crated="sourceCrated" class="source-count" />

    <ShippableCount :singular="targetSingular" :crated="targetCrated" class="target-count" />
  </div>
</template>

<style scoped lang="sass">
.line
  background: #000
  margin-bottom: 3px

  &:nth-child(odd)
    background-color: #111

  &:hover
    background-color: #222

  span
    display: inline-block
    position: relative
    top: -8px
  
  .name
    width: 386px
    margin-left: 8px
  
  .source-count
    width: 84px
    text-align: right
    //background: green

  .target-count
    width: 84px
    margin-left: 80px
    //background: red

  img
    width: 40px

    margin-top: 2px
    margin-left: 4px

    width: 32px
</style>
