<script setup>
import { inject, ref, computed, onMounted, onUnmounted } from 'vue'

const isInventory = inject('isInventory');
const screenshots = inject('screenshots');

const rightNow = ref(Date.now());

const timeLast = computed(() => {
  const timeString = screenshots.value[screenshots.value.length - 1].time;
  return Date.parse(timeString);
});

function formatElapsed(ms) {
  const totalSec = Math.floor(ms / 1000);
  //const hours = String(Math.floor(totalSec / 3600)).padStart(2, '0');
  const mins = String(Math.floor(totalSec / 60)).padStart(2, '0');
  const secs = String(totalSec % 60).padStart(2, '0');

  return `${mins}:${secs}`
}

let timerId = null;
onMounted(() => {
  timerId = setInterval(() => {
    rightNow.value = Date.now();
  }, 1000)
})

onUnmounted(() => {
  if (timerId) {
    clearInterval(timerId);
    timerId = null;
  }
})


const offset = ref(0);
const period = 30*60*1000; // half of a day, ms

function processClick(event) {
  // new_offset + rightNow === ((old_offset + rightNow < period) ? period : 0) + event.offsetX / width * period
  const width = 56; // how to make it match?
  const isDay = (offset.value + rightNow.value) % (2 * period) < period;
  //console.log(isDay, (offset.value + rightNow) / (2 * period));
  offset.value = ((isDay ? period : 0) + Math.floor(event.offsetX / width * period) - rightNow.value % (2 * period) + 2 * period) % (2 * period);
  //console.log(isDay, (offset.value + rightNow / (2 * period)));

  // switch day and night
  // offset + rightNow = position
  /*offset.value = offset.value + event.offsetX / 60 * period;
  offset.value = (offset.value + period) % (2 * period);
  offset.value = Math.floor(offset.value / period) * period;
  console.log(event.offsetX, offset.value / (2 * period));
  */
}
</script>

<template>
  <div v-if="isInventory" class="timer" @click="processClick">
    <div class="bar" :style="{ width: ((offset + rightNow) % period / period * 100) + '50%', background: Math.floor((offset + rightNow) / period) % 2 == 0 ? '#555' : '#111' }"></div>
    <div class="elapsed">
      {{ formatElapsed(rightNow - timeLast) }}
    </div>
  </div>
</template>

<style scoped lang="sass">
.timer
  background: #444
  margin-left: 6px
  margin-right: 6px
  margin-top: 16px
  width: 60px
  height: 40px
  padding: 0
  cursor: pointer
  position: relative
  user-select: none
  border-radius: 5px
  overflow: hidden
  
.elapsed
  position: absolute
  width: 100%
  text-align: center
  top: 10px
  font-size: 15px
  text-shadow: 1px 1px rgba(0, 0, 0, 0.5)
  color: #ccc

.bar
  height: 100%
</style>
