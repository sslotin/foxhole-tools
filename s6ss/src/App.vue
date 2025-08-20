<script setup>
import { ref, onMounted, reactive, provide, watch, nextTick } from 'vue';
import { parse } from '../../scanner';
import Screenshots from './components/Screenshots.vue'
import InventoryReport from './components/InventoryReport.vue'
import StockpileReport from './components/StockpileReport.vue';

const defaultSettings = {
  warden: true,
  hiddenCrates: [],
  targetShirts: 200,
  targetShirtCrates: 0
};

const savedSettings = JSON.parse(localStorage.getItem('settings')) || defaultSettings;
const settings = reactive(savedSettings);

watch(
  () => settings,
  (newSettings) => {
    console.log('settings changed');
    localStorage.setItem('settings', JSON.stringify(newSettings));
  },
  { deep: true }
);

provide('settings', settings);

// contains image, report and time taken
const screenshots = ref([]);
provide('screenshots', screenshots);

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
      activeReport.value = screenshots.value[newTargetStockpiles[newTargetStockpiles.length - 1]].report;
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
      referenceReport.value = screenshots.value[newSourceStockpiles[newSourceStockpiles.length - 1]].report;
    } else {
      referenceReport.value = undefined;
    }
  },
  { deep: true }
);

let errorMessage = ref(undefined);
provide('errorMessage', errorMessage);

async function addScreenshot(img) {
  if (errorMessage.value !== undefined) {
    screenshots.value.pop();
    errorMessage.value = undefined;
  }

  if (screenshots.value.some(screenshot => screenshot.report === undefined)) {
    console.warn('a screenshot is already being processed');
    return;
  }

  screenshots.value = [...screenshots.value, {
    image: img,
    report: undefined,
    time: new Date().toLocaleTimeString('en-US', { hour12: false })
  }];

  nextTick(() => {
    const screenshotsDiv = document.querySelector('.screenshots');
    screenshotsDiv.scrollLeft = screenshotsDiv.scrollWidth;
  });

  let report;
  
  try {
    report = await parse(img);
  } catch(e) {
    console.log('Parsing error:', e);
    errorMessage.value = e.toString();
    return;
  }
  screenshots.value[screenshots.value.length - 1].report = report;

  const newIsInventory = (report.stockpileName == '');

  if (isInventory.value != newIsInventory) {
    isInventory.value = newIsInventory;
    screenshots.value = screenshots.value.slice(-1);
    targetStockpiles.value = [0];
    sourceStockpiles.value = [];
  } else if (newIsInventory) {
    targetStockpiles.value = [screenshots.value.length - 1];
    sourceStockpiles.value = [];
    
    let reference = undefined;
    
    function isSame(a, b) {
      if (a.stockpileType != b.stockpileType) {
        return false;
      }
      let matches = 0;
      for (const name of Object.keys(a.items)) {
        if (b.items.hasOwnProperty(name) && b.items[name].count == a.items[name].count) {
          matches += 1;
        }
      }
      //console.log('matches:', matches);
      return matches >= 7;
    }

    for (let i = screenshots.value.length - 2; i >= 0; i--) {
      if (isSame(report, screenshots.value[i].report)) {
        reference = i;
        break;
      }
    }

    if (reference !== undefined) {
      //console.log('reference found:', reference);
      sourceStockpiles.value = [reference];
    }
  } else {
    targetStockpiles.value = [...targetStockpiles.value, screenshots.value.length - 1]; // push doesn't re-render
  }
  //console.log('activeReport:', activeReport.value);
  //console.log('referenceReport:', referenceReport.value);
}

onMounted(async () => {
  //await addScreenshot('/screenshots/bunker.png');
  //await addScreenshot('/screenshots/seaport.png');
  //await addScreenshot('/screenshots/seaport2.png');
  //await addScreenshot('/screenshots/bunker2.png');
  //console.log(isInventory.value, targetStockpiles.value);

  // not sure if it should be there
  document.addEventListener('paste', async (event) => {
    if (event.clipboardData && event.clipboardData.files.length > 0) {
      const file = event.clipboardData.files[0];
      if (file.type.startsWith('image/')) {
        const reader = new FileReader();
        reader.onload = async (e) => {
          await addScreenshot(e.target.result);
        };
        reader.readAsDataURL(file);
      }
    }
  });

});
</script>

<template>
  <Screenshots v-if="screenshots.length > 0" :key="settings" />
  <template v-else>
    <p class="ctrlv">ctrl+v a screenshot</p>
    <div class="links">
      <a href='/tutorial.mp4'>tutorial</a>
      <a href='/guide/index.html'>logi guide</a>
      <a href='/changelog.txt'>changelog (v1.1.0)</a>
      <a href='https://discord.com/users/___s6'>message me</a>
    </div>
  </template>
  <div v-if="errorMessage" class="error">
    <p>
      could not parse the last screenshot
    </p>
    
    <p>
      check that it is not compressed or resized, contains all fields including title,
      <br>and that you're using either
      vanilla icons,
      <a href="https://ashdeuzofr.itch.io/foxhole-clean-icons-essential">Clean Icons Essential</a>
      or
      <a href="https://rainbowbu.itch.io/new-icons-modfoxhole">New Icons Mod</a>
    </p>
    
    <p>
      if it is still not working, please <a href='https://discord.com/users/___s6'>send me</a> the image and your specs
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
  width: 700px
  margin: 30px auto

  a
    text-decoration: none
    color: #999
</style>
