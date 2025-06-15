import { createCanvas } from 'canvas';
import { Buffer } from 'buffer';
import fs from 'fs';

function encodeImage(img) {
  return Buffer.from(img).toString('base64');
}

function decodeImage(str) {
  return Uint8Array.from(Buffer.from(str, 'base64'));
}

function toGrayscale(data) {
  let result = new Array(data.length / 4)
  for (let i = 0; i < data.length; i += 4) {
    const alpha = data[i + 3] / 255;
    result[i / 4] = Math.floor(alpha * (data[i] + data[i + 1] + data[i + 2]) / 3);
  }

  return Uint8Array.from(result);
}

function writeImage(img, w, h, path, verbose=false) {
  return new Promise((resolve, reject) => {
    const canvas = createCanvas(w, h);
    const ctx = canvas.getContext('2d');
    const imageData = ctx.createImageData(w, h);
    const data = imageData.data;

    for (let i = 0; i < img.length; i++) {
      data[i * 4] = img[i];
      data[i * 4 + 1] = img[i];
      data[i * 4 + 2] = img[i];
      data[i * 4 + 3] = 255; // alpha
    }

    ctx.putImageData(imageData, 0, 0);

    const out = fs.createWriteStream(path);
    const stream = canvas.createPNGStream();
    stream.pipe(out);
    out.on('finish', () => {
      if (verbose) {
        console.log(`${path} updated`)
      };
      resolve();
    });
    out.on('error', reject);
  });
}

export { toGrayscale, writeImage, encodeImage, decodeImage };
