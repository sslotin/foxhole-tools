import fs from 'fs';
import { parse } from './scanner.js';

const imagePath = '../test-screenshots/bunker.png';
const imageData = fs.readFileSync(imagePath);
const result = await parse(imageData);
//console.log(result);
