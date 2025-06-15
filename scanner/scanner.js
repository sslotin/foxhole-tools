import { createCanvas, loadImage } from 'canvas';
import { createWorker, PSM, OEM } from 'tesseract.js';
import { toGrayscale, writeImage, decodeImage } from './utils.js';

// needs to be built first:
import metadata from './metadata.json' assert { type: "json" };
import icons from './icons.json' assert { type: "json" };

for (const modDir of Object.keys(icons)) {
  for (const key of Object.keys(icons[modDir])) {
    icons[modDir][key].icon = decodeImage(icons[modDir][key].icon);
    icons[modDir][key].iconCrated = decodeImage(icons[modDir][key].iconCrated);
  }
}

async function convertScreenshot(screenshot) {
  const image = await loadImage(screenshot);

  const canvas = createCanvas(image.width + 1, image.height + 1); // + 1 for black safety border
  const ctx = canvas.getContext('2d');
  ctx.drawImage(image, 0, 0, image.width, image.height);

  return [toGrayscale(ctx.getImageData(0, 0, canvas.width, canvas.height).data), canvas.width, canvas.height];
}

async function parse(screenshot) {
  const [img, W, H] = await convertScreenshot(screenshot);

  function crop(x, y, w, h, new_w, new_h) {
    /*
    const cropped = new Uint8Array(w * h);
    for (let i = 0; i < h; i++) {
      for (let j = 0; j < w; j++) {
        cropped[i * w + j] = img[(x + i) * W + y + j];
      }
    }
    return cropped;
    */

    const old_canvas = createCanvas(w, h);
    const old_ctx = old_canvas.getContext('2d');
   
    const old_data = old_ctx.createImageData(w, h);

    for (let i = 0; i < h; i++) {
      for (let j = 0; j < w; j++) {
        const val = img[(x + i) * W + y + j];
        old_data.data[4 * (i * w + j)] = val;
        old_data.data[4 * (i * w + j) + 1] = val;
        old_data.data[4 * (i * w + j) + 2] = val;
        old_data.data[4 * (i * w + j) + 3] = 255;
      }
    }

    old_ctx.putImageData(old_data, 0, 0);

    const new_canvas = createCanvas(new_w, new_h);
    const new_ctx = new_canvas.getContext('2d');

    new_ctx.drawImage(old_canvas, 0, 0, new_w, new_h);
    const new_data = new_ctx.getImageData(0, 0, new_w, new_h);

    const cropped = new Uint8Array(new_w * new_h);

    for (let i = 0; i < new_w * new_h; i++) {
      cropped[i] = new_data.data[i * 4];
    }

    return cropped;
  }

  function check(x, y) {
    const col = img[x * W + y];
    return 97 <= col && col <= 99;
  }

  function mse(a, b) {
    let s = 0;
    for (let i = 0; i < a.length; i++) {
      //console.log(a[i], b[i]);
      s += (a[i] - b[i]) ** 2;
    }
    return s / a.length;
  }

  //const worker = await createWorker('eng', OEM.LSTM_ONLY);
  const worker = await createWorker('eng', OEM.LSTM_ONLY, {
    langPath: typeof window === 'undefined' ? '' : /* /tessdata */ 'https://s6ss.pages.dev/tessdata', // check if node or browser
    /*cacheMethod: 'none',*/
  });
  await worker.setParameters({
    tessedit_pageseg_mode: PSM.SINGLE_LINE,
    //tessedit_char_whitelist: '',
  });

  async function ocr(x, y, w, h) {
    const img = crop(x, y, w, h, w, h);

    const canvas = createCanvas(w, h);
    const ctx = canvas.getContext('2d');
    const imageData = ctx.createImageData(w, h);
    const data = imageData.data;

    for (let i = 0; i < img.length; i++) {
      const processed = 255 - img[i];
      //const processed = inv > 100 ? 255 : inv;
      //const processed = img[i] > 128 ? 0 : 255; // invert + thresholding
      data[i * 4] = processed;
      data[i * 4 + 1] = processed;
      data[i * 4 + 2] = processed;
      data[i * 4 + 3] = 255; // alpha
    }

    ctx.putImageData(imageData, 0, 0);

    const SCALING = 2;

    // tesseract.js doesn't like small images
    const resizedCanvas = createCanvas(w * SCALING, h * SCALING);
    const resizedCtx = resizedCanvas.getContext('2d');
    resizedCtx.drawImage(canvas, 0, 0, w * SCALING, h * SCALING);
  
    const ret = await worker.recognize(resizedCanvas.toDataURL());
    const text = ret.data.text.slice(0, -1);

    if (ret.data.confidence < 80) {
      console.warn('Possibly misrecognized text:', text, resizedCanvas.toDataURL('image/png'));
    }
    
    return [text, ret.data.confidence];
  }
  
  let modDir = undefined;

  let results = {
    stockpileName: undefined, // empty for bases; Public or non-empty string for stockpiles
    stockpileType: undefined,
    items: {},
  };

  for (let x = 1; x < H; x++) {
    for (let y = 1; y < W; y++) {
      //console.log(x, y);
      if (check(x, y) && !check(x - 1, y) && !check(x, y - 1)) {
        let h = 1;
        while (check(x + h, y)) {
          h++;
        }
 
        let w = 1;
        while (check(x, y + w)) {
          w++;
        }

        //if (h > 1 && w > 1) {
        //  console.log(x, y, w, h);
        //}

        //if (w == 42 && h == 32) {
        //console.log(img[x * W + y + w], img[(x + h) * W + y], Math.abs(w/h - 42/32));
        //console.log(w, h, Math.abs(w/h - 42/32));
        if (img[x * W + y + w] < 20 &&
            img[x * W + y - 1] < 20 &&
            img[(x + h) * W + y] < 20 &&
            img[(x - 1) * W + y] < 20 &&
            h > 10 &&
            Math.abs(w/h - 42/32) < 0.07) {
          function to_scale(t) {
            return Math.floor(t * w / 42); // round?
          }
          //console.log(x, y, w, h, w/h, 42/32);
          const template = crop(x, y - to_scale(44), h, h, 32, 32);
          //await writeImage(template, 32, 32, 'tmp.png', true);
          //console.log('WRITE');
          //break;

          if (results.stockpileName === undefined) {
            let lowestScore = Infinity;

            for (const modDirCandidate of Object.keys(icons)) {
              //console.log(modDirCandidate, icons[modDirCandidate]);
              //console.log(icons[modDirCandidate]['SoldierSupplies']);
              const scoreShirt = mse(template, icons[modDirCandidate]['SoldierSupplies'].icon);
              const scoreShirtCrated = mse(template, icons[modDirCandidate]['SoldierSupplies'].iconCrated);
              const score = Math.min(scoreShirt, scoreShirtCrated);

              if (score < lowestScore) {
                modDir = modDirCandidate;
                lowestScore = score;
              }
            }

            console.log('Detected icon mod:', modDir);

            let scoreShirt = mse(template, icons[modDir]['SoldierSupplies'].icon);
            let scoreShirtCrated = mse(template, icons[modDir]['SoldierSupplies'].iconCrated);

            //await writeImage(template, 32, 32, 'tmp.png', true);
            //await writeImage(icons[modDir]['SoldierSupplies'].icon, 32, 32, 'tmp2.png', true);
            //console.log(scoreShirt, scoreShirtCrated);
            //console.log(x, y, w, h);

            if (Math.min(scoreShirt, scoreShirtCrated) < 2000) {
              console.log('Shirt found:', x, y, w, h);
              [results.stockpileType, results.stockpileTypeConfidence] = await ocr(x - to_scale(36), y - to_scale(48), to_scale(120), to_scale(28));
              console.log('Stockpile type:', results.stockpileType, results.stockpileTypeConfidence);
              if (scoreShirt < scoreShirtCrated) {
                results.stockpileName = '';
              } else {
                const stockpileNameCrop = crop(x - to_scale(36), y + to_scale(306), to_scale(200), to_scale(28), to_scale(200), to_scale(28));
                //console.log(Math.max(...stockpileNameCrop));
                if (Math.max(...stockpileNameCrop) > 220) {
                  [results.stockpileName, results.stockpileNameConfidence] = await ocr(x - to_scale(36), y + to_scale(306), to_scale(200), to_scale(28));
                  console.log('Stockpile name:', results.stockpileName, results.stockpileNameConfidence);
                } else {
                  results.stockpileName = 'Public';
                }
              }
            } else {
              throw new Error('No shirt found');
            }
          }

          await worker.setParameters({
            tessedit_pageseg_mode: PSM.SINGLE_LINE,
            tessedit_char_whitelist: '0123456789k+',
          });
        
          let [countString, countConfidence] = await ocr(x, y, w, h);

          const count = parseInt(countString, 10) * (countString.includes('k') ? 1000 : 1);

          let bestMatch = null;
          let lowestScore = Infinity;
          let isCrated = undefined;

          for (const [name, data] of Object.entries(icons[modDir])) {
            const score = mse(template, data.icon);
            const scoreCrated = (results.stockpileName == '' ? Infinity : mse(template, data.iconCrated)); // bases can't have crates
            const minScore = Math.min(score, scoreCrated);

            //if (minScore < 5000) {
            //  console.log('>', name, score, scoreCrated);
            //}

            if (minScore < lowestScore) {
              lowestScore = minScore;
              bestMatch = name;
              isCrated = (scoreCrated < score);
            }
          }

          const keyName = (isCrated ? bestMatch + '-crated' : bestMatch)

          console.log(keyName, count, countConfidence, Math.floor(lowestScore));

          if (results.items.hasOwnProperty(keyName)) {
            console.warn('Item already present');
          }

          if (keyName == 'ShippingContainer') {
            console.log(x, y, w, h);
          }

          results.items[keyName] = {
            'count': count,
            'countConfidence': countConfidence,
            'iconScore': lowestScore,
            'x': x,
            'y': y,
          };

          // todo: duplicates?
        }
      }
    }
  }

  await worker.terminate();
  //await writeImage(img, 'tmp.png');

  return results;
}

export { parse, metadata };
