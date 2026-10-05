/* ============================================================================
 * PetLife — tools/check-css.js
 * Ищет CSS-классы, которые используются в разметке, но не описаны в css/*.css
 * (помогает держать визуальный стиль единым).
 * Запуск: node tools/check-css.js
 * ==========================================================================*/
"use strict";
const fs = require("fs");
const path = require("path");
const ROOT = path.resolve(__dirname, "..");

const css = ["css/style.css", "css/app.css"].map((f) => fs.readFileSync(path.join(ROOT, f), "utf8")).join("\n");
const defined = new Set();
for (const m of css.matchAll(/\.([a-zA-Z][a-zA-Z0-9_-]*)/g)) defined.add(m[1]);

const files = [];
(function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name.startsWith("_legacy")) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (/\.(js|html)$/.test(entry.name)) files.push(full);
  }
})(ROOT);

const used = new Map();
for (const file of files) {
  const text = fs.readFileSync(file, "utf8");
  const re = /class=(?:"|\\"|'|`)([^"'`\\]*)/g;
  let m;
  while ((m = re.exec(text))) {
    for (const cls of m[1].split(/\s+/)) {
      if (/^[a-z][a-z0-9-]*$/.test(cls)) {
        if (!used.has(cls)) used.set(cls, new Set());
        used.get(cls).add(path.relative(ROOT, file));
      }
    }
  }
}

const missing = [...used.keys()].filter((c) => !defined.has(c)).sort();
console.log("Классов используется: " + used.size + ", не описано в CSS: " + missing.length);
missing.forEach((c) => console.log("  " + c.padEnd(20) + [...used.get(c)].slice(0, 4).join(", ")));
process.exit(0);
