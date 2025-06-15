<script setup>
import { inject } from 'vue'

const settings = inject('settings');
</script>

<template>
  <img class='toggle' :src="settings.warden ? '/warden.webp' : 'collie.webp'" @click="settings.warden = !settings.warden" />
</template>

<style scoped lang="sass">
.toggle
  height: 70px
  width: 70px
  margin: 0 5px
  opacity: 0.8
  cursor: pointer

  &:hover
    opacity: 1
</style>
