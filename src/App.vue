<script setup>
import { ref, onMounted, reactive, provide, watch, nextTick } from 'vue';
import { parseCSV } from '../parser/csv-parser.js';
import Submissions from './components/Submissions.vue'
import Search from './components/Search.vue'
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

// Holds state to be restored into StockpileReport on next mount
const pendingRestore = ref(null);
provide('pendingRestore', pendingRestore);

function restoreState(jsonText) {
  try {
    const state = JSON.parse(jsonText);
    if (state?.type !== 'foxhole-stockpile-state' || state?.version !== 1) {
      throw new Error('Invalid or incompatible state file');
    }

    // Replace all state
    submissions.value = state.submissions.map(s => ({
      report: s.report,
      time: new Date(s.time)
    }));

    isInventory.value = false;

    targetStockpiles.value = [...state.targetIndices];
    sourceStockpiles.value = [...state.sourceIndices];

    // Apply settings
    Object.assign(settings, state.settings);

    // Store shopping list + autofillCount for StockpileReport to pick up
    pendingRestore.value = {
      shoppingList: state.shoppingList,
      autofillCount: state.autofillCount
    };
  } catch (e) {
    console.log('State restore error:', e);
    errorMessage.value = 'Could not restore state: ' + e.toString();
  }
}

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
        const trimmed = text.trim();
        if (trimmed.startsWith('{')) {
          restoreState(trimmed);
        } else {
          await addCSV(text);
        }
      }
    } else if (event.clipboardData) {
      const text = event.clipboardData.getData('text');
      const trimmed = text.trim();
      if (trimmed.startsWith('{')) {
        restoreState(trimmed);
      } else if (text && text.includes(',')) {
        await addCSV(text);
      }
    }
  });

  // Drag-and-drop JSON/CSV files
  let dragCounter = 0;

  document.addEventListener('dragenter', (event) => {
    event.preventDefault();
    dragCounter++;
    document.body.classList.add('drag-over');
  });

  document.addEventListener('dragleave', (event) => {
    event.preventDefault();
    dragCounter--;
    if (dragCounter === 0) {
      document.body.classList.remove('drag-over');
    }
  });

  document.addEventListener('dragover', (event) => {
    event.preventDefault();
  });

  document.addEventListener('drop', async (event) => {
    event.preventDefault();
    dragCounter = 0;
    document.body.classList.remove('drag-over');

    const file = event.dataTransfer?.files?.[0];
    if (!file) return;

    const text = await file.text();
    const trimmed = text.trim();

    if (trimmed.startsWith('{')) {
      restoreState(trimmed);
    } else if (file.name.endsWith('.json')) {
      errorMessage.value = 'Invalid JSON file: must be a foxhole-stockpile-state export';
    } else if (text.includes(',')) {
      await addCSV(text);
    }
  });
});
</script>

<template>
  <Submissions v-if="submissions.length > 0" :key="settings" />
  <Search v-if="submissions.length === 0" />
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

:global(body.drag-over::after)
  content: 'Drop file here'
  position: fixed
  inset: 0
  z-index: 9999
  display: flex
  align-items: center
  justify-content: center
  background: rgba(34, 34, 34, 0.85)
  border: 3px dashed #090
  color: #090
  font-size: 28px
  font-weight: bold
  pointer-events: none
</style>