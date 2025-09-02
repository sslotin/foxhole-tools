import fs from 'fs';
import { parse } from './scanner.js';

//const imagePath = '../test-screenshots/seaport.png';
const imagePath = '../test-screenshots/short.png';
const imageData = fs.readFileSync(imagePath);
const result = await parse(imageData);
//console.log(result);
