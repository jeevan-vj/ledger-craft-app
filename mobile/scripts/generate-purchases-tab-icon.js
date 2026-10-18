const path = require('path');
const sharp = require('sharp');

const svg = `
<svg width="88" height="88" viewBox="0 0 88 88" xmlns="http://www.w3.org/2000/svg">
  <g fill="none" stroke="#000" stroke-width="7" stroke-linecap="round" stroke-linejoin="round">
    <path d="M18 22h8l6 34h32l7-24H29"/>
    <circle cx="38" cy="68" r="3" fill="#000"/>
    <circle cx="61" cy="68" r="3" fill="#000"/>
  </g>
</svg>`;

sharp(Buffer.from(svg))
  .png()
  .toFile(path.join(__dirname, '..', 'assets', 'tabs', 'purchases.png'));
