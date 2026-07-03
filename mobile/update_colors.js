const fs = require('fs');
const glob = require('glob'); // Note: we can just use fs.readdirSync recursively
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
  let newContent = content.replace(/'#111827'/g, "'#121212'");
  if (content !== newContent) {
    fs.writeFileSync(file, newContent, 'utf8');
    console.log(`Updated ${file}`);
  }
});
