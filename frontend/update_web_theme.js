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
      if (file.endsWith('.jsx') || file.endsWith('.js') || file.endsWith('.tsx')) results.push(file);
    }
  });
  return results;
}

const files = walk('./app');
files.forEach(file => {
  let content = fs.readFileSync(file, 'utf8');
  // Replace teal dark backgrounds with neutral dark or glassmorphic
  let newContent = content
    .replace(/bg-teal-900/g, "bg-[#121212]")
    .replace(/bg-teal-950/g, "bg-[#121212]")
    .replace(/bg-teal-800/g, "bg-white\/5 backdrop-blur-md border border-white\/10")
    .replace(/bg-teal-700/g, "bg-white\/10")
    .replace(/bg-gray-800/g, "bg-[#1e1e1e]")
    .replace(/bg-gray-900/g, "bg-[#121212]");
  
  if (content !== newContent) {
    fs.writeFileSync(file, newContent, 'utf8');
    console.log(`Updated ${file}`);
  }
});
