import fs from 'fs';
import { parse } from './scanner.js';

const base = '/home/sereja/Pictures/Screenshots';

const files = fs.readdirSync(base).filter(file => file >= "Screenshot from 2025-01-26 23-39-40.png");

let samples = [];

for (const file of files) {
    try {
        const imagePath = `${base}/${file}`;
        const imageData = fs.readFileSync(imagePath);
        const result = await parse(imageData);
        if (result.stockpileName === '') {
            samples.push(result);
        }    
    } catch (e) {
        console.log('Error parsing', file, e);
    }
}

fs.writeFileSync('samples2.json', JSON.stringify(samples, null, 2));
console.log(samples.length);
