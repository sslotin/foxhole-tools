<script setup>
import { ref, onMounted, reactive, provide, watch, nextTick } from 'vue';
import { parseCSV } from '../parser/csv-parser.js';
import Submissions from './components/Submissions.vue'
import InventoryReport from './components/InventoryReport.vue'
import StockpileReport from './components/StockpileReport.vue';

const defaultSettings = {
  warden: true,
  configure: false,
  hiddenCrates: [],
  hiddenItems: [],
  targetShirts: 200,
  targetShirtCrates: 0,
  version: 2 // update when making non-compatible changes to reset old settings
};

let savedSettings = JSON.parse(localStorage.getItem('settings'));
if (savedSettings?.version !== defaultSettings.version) {
  savedSettings = defaultSettings;
}
const settings = reactive(savedSettings);

console.log(settings);

watch(
  () => settings,
  (newSettings) => {
    console.log('settings changed');
    localStorage.setItem('settings', JSON.stringify(newSettings));
  },
  { deep: true }
);

provide('settings', settings);

// contains report and time taken
const submissions = ref([]);
provide('submissions', submissions);

const isInventory = ref(true);
provide('isInventory', isInventory);

const targetStockpiles = ref([]);
const sourceStockpiles = ref([]);

provide('targetStockpiles', targetStockpiles);
provide('sourceStockpiles', sourceStockpiles);

const activeReport = ref(undefined);
const referenceReport = ref(undefined);

watch(
  targetStockpiles,
  (newTargetStockpiles) => {
    if (newTargetStockpiles.length == 1) {
      activeReport.value = submissions.value[newTargetStockpiles[newTargetStockpiles.length - 1]].report;
    } else {
      activeReport.value = undefined;
    }
  },
  { deep: true }
);

watch(
  sourceStockpiles,
  (newSourceStockpiles) => {
    if (newSourceStockpiles.length == 1) {
      referenceReport.value = submissions.value[newSourceStockpiles[newSourceStockpiles.length - 1]].report;
    } else {
      referenceReport.value = undefined;
    }
  },
  { deep: true }
);

let errorMessage = ref(undefined);
provide('errorMessage', errorMessage);

async function addCSV(text) {
  if (errorMessage.value !== undefined) {
    submissions.value.pop();
    errorMessage.value = undefined;
  }

  if (submissions.value.some(submission => submission.report === undefined)) {
    console.warn('a report is already being processed');
    return;
  }

  submissions.value = [...submissions.value, {
    report: undefined,
    time: new Date()
  }];

  nextTick(() => {
    const submissionsDiv = document.querySelector('.submissions');
    if (submissionsDiv) submissionsDiv.scrollLeft = submissionsDiv.scrollWidth;
  });

  let report;
  
  try {
    const startTime = performance.now()
    report = parseCSV(text);
    console.log(`parsing took ${Math.round(performance.now() - startTime)}ms`)
    if (Object.keys(report.items).length == 0) {
      throw new Error('CSV contains no items');
    }
  } catch(e) {
    console.log('Parsing error:', e);
    errorMessage.value = e.toString();
    return;
  }
  submissions.value[submissions.value.length - 1].report = report;

  const newIsInventory = !report.isStockpile;

  if (isInventory.value != newIsInventory) {
    isInventory.value = newIsInventory;
    submissions.value = submissions.value.slice(-1);
    targetStockpiles.value = [0];
    sourceStockpiles.value = [];
  } else if (newIsInventory) {
    targetStockpiles.value = [submissions.value.length - 1];
    sourceStockpiles.value = [];

    let reference = undefined;

    for (let i = submissions.value.length - 2; i >= 0; i--) {
      const prev = submissions.value[i].report;
      if (prev.hex === report.hex && prev.coords === report.coords) {
        reference = i;
        break;
      }
    }

    if (reference !== undefined) {
      sourceStockpiles.value = [reference];
    }
  } else {
    targetStockpiles.value = [...targetStockpiles.value, submissions.value.length - 1]; // push doesn't re-render
  }
}

onMounted(async () => {
  document.addEventListener('paste', async (event) => {
    if (event.clipboardData && event.clipboardData.files.length > 0) {
      const file = event.clipboardData.files[0];
      if (file.type.startsWith('text/')) {
        const text = await file.text();
        await addCSV(text);
      }
    } else if (event.clipboardData) {
      const text = event.clipboardData.getData('text');
      if (text && text.includes(',')) {
        await addCSV(text);
      }
    }
  });
});
</script>

<template>
  <Submissions v-if="submissions.length > 0" :key="settings" />
  <template v-else>
    <p class="ctrlv">ctrl+v a csv</p>
    <div class="links">
      <a href='/tutorial.mp4'>old tutorial</a>
      <a href='/guide/index.html'>logi guide</a>
      <a href='/changelog.txt'>changelog (v2.0.0)</a>
      <a href='https://github.com/sslotin/foxhole-tools'>github</a>
      <a href='https://discord.com/users/___s6'>message me</a>
    </div>
  </template>
  <div v-if="errorMessage" class="error">
    <p class='errorMessage'>
      {{ errorMessage }}
    </p>

    <p>
      could not parse the csv
    </p>
    
    <p>
      it might be that the game has updated (it should work for u64)
    </p>
    
    <p>
      if it is not working, please <a href='https://discord.com/users/___s6'>contact me</a>
    </p>
  </div>
  <template v-else>
    <InventoryReport
      v-if="isInventory && activeReport !== undefined"
      :key="[activeReport, referenceReport, settings]"
      :activeReport="activeReport"
      :referenceReport="referenceReport"
    />
    <StockpileReport
      v-else-if="!isInventory && (targetStockpiles.length + sourceStockpiles.length > 0)"
      :key="[targetStockpiles, sourceStockpiles, settings]"
    />
  </template>
</template>

<style lang="sass">
body
  font-size: 18px
  font-family: 'Open Sans', sans-serif
  background: #222
  color: #ddd
  margin: 0

.ctrlv
  margin-top: 20px
  text-align: center

.links
  position: absolute
  bottom: 20px
  width: 100%
  text-align: center

  a
    text-decoration: none
    color: #999
    margin: 20px

    &:hover
      color: #ddd

.error
  text-align: center
  width: 780px
  margin: 30px auto

  a
    text-decoration: none
    color: #999

.errorMessage
  font-family: monospace
  color: #966

code
  background: #333
  padding: 2px 6px
  border-radius: 3px
  font-size: 14px
</style>