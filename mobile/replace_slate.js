const fs = require('fs');
const path = require('path');

function walk(dir) {
  let results = [];
  const list = fs.readdirSync(dir);
  list.forEach(function(file) {
    file = path.join(dir, file);
    const stat = fs.statSync(file);
    if (stat && stat.isDirectory()) { 
      results = results.concat(walk(file));
    } else { 
      if (file.endsWith('.tsx') || file.endsWith('.ts')) results.push(file);
    }
  });
  return results;
}

const files = walk('./screens').concat(walk('./components'));
files.forEach(file => {
  let content = fs.readFileSync(file, 'utf8');
  let newContent = content
    .replace(/'#1f2937'/g, "'#1e1e1e'")
    .replace(/'#374151'/g, "'#2c2c2c'")
    .replace(/'#4b5563'/g, "'#404040'")
    .replace(/'#1e3a5f'/g, "'#1e1e1e'")
    .replace(/'#0d2d52'/g, "'#121212'");
  
  if (content !== newContent) {
    fs.writeFileSync(file, newContent, 'utf8');
    console.log(`Updated ${file}`);
  }
});
