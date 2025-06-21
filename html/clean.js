const fs = require('fs');
const words = JSON.parse(fs.readFileSync('words.json', 'utf8'));
const filtered = words.filter(word => word.length > 3);
console.log(`Removed ${words.length - filtered.length} short words`);
fs.writeFileSync('words.json', JSON.stringify(filtered, null, 2));
console.log('Done!');