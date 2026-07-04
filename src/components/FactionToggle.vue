<script setup>
import { inject, computed, ref } from 'vue'

const settings = inject('settings');
const scale = ref(1.0);

const imagePath = computed(() => {
  if (settings.configure) {
    scale.value = 0.75;
    return '/component.png';
  } else if (settings.warden) {
    scale.value = 0.9;
    return '/warden.webp';
  } else {
    scale.value = 1.0;
    return '/collie.webp';
  }
});

function changeState() {
  console.log(settings.configure);

  if (settings.configure) {
    settings.configure = false;
    settings.warden = true;
  } else if (settings.warden) {
    settings.warden = false;
  } else {
    settings.configure = true;
  }
};
</script>

<template>
  <img
    class='toggle'
    :src="imagePath"
    @click="changeState"
    :style="{ transform: `scale(${scale})` }"
  />
</template>

<style scoped lang="sass">
.toggle
  height: 70px
  width: 70px
  margin: 0 2px
  opacity: 0.8
  cursor: pointer
  transform-origin: center center

  &:hover
    opacity: 1
</style>
