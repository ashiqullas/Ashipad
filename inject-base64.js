const fs = require('fs');
const path = require('path');

const zipPath = path.join(__dirname, 'assets', 'ashipad-extension.zip');
const htmlPath = path.join(__dirname, 'index.html');

const zipBuffer = fs.readFileSync(zipPath);
const base64Zip = zipBuffer.toString('base64');
const dataUri = `data:application/zip;base64,${base64Zip}`;

let htmlContent = fs.readFileSync(htmlPath, 'utf8');

// Replace the href
htmlContent = htmlContent.replace(
  /href="assets\/ashipad-extension\.zip"/,
  `href="${dataUri}"`
);

// Fallback regex if we want to change it later:
// htmlContent = htmlContent.replace(/href="data:application\/zip;base64,[^"]+"/, `href="${dataUri}"`);

fs.writeFileSync(htmlPath, htmlContent);
console.log('Successfully injected base64 zip into index.html');
