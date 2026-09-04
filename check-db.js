// Simple script to read visionmachine.db
const fs = require('fs');
const path = require('path');

// Try to use the built webview - just dump pipes_json columns
const { execSync } = require('child_process');
const dbPath = 'C:/Users/user/AppData/Local/com.visionmachine.desktop/visionmachine.db';

// Use the Rust app's SQLx to query - just check what columns exist
console.log('DB exists:', fs.existsSync(dbPath));
console.log('DB size:', fs.statSync(dbPath).size);

// Read as text and search for patterns
const data = fs.readFileSync(dbPath, 'utf8');

// Find pipes_json content by looking for JSON patterns
const jsonMatches = data.match(/\{[^{}]*"id"[^{}]*"name"[^{}]*\}/g) || [];
console.log('Found', jsonMatches.length, 'potential JSON objects');

// Better approach: use the database schema directly
const sqlitePattern = /\x00pipes_json\x00/;
const idx = data.indexOf('\x00pipes_json\x00');
if (idx !== -1) {
  console.log('Found pipes_json at offset', idx);
  // Dump context around it
  console.log(data.substring(idx - 50, idx + 500));
}

// Look for "elements" vs "segments" patterns
const elementsIdx = data.indexOf('"elements"');
const segmentsIdx = data.indexOf('"segments"');
console.log('elements found at:', elementsIdx);
console.log('segments found at:', segmentsIdx);

// Check for old structure
const globalNodesIdx = data.indexOf('"globalNodes"');
const keyframesIdx = data.indexOf('"keyframes"');
console.log('globalNodes found at:', globalNodesIdx);
console.log('keyframes found at:', keyframesIdx);
