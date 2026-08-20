const { execSync } = require('child_process');

const venvPython = '.venv\\Scripts\\python.exe';
console.log('Verifying Python environment...\n');

const tests = [
  { name: 'torch', cmd: 'import torch; print(torch.__version__)' },
  { name: 'numpy', cmd: 'import numpy; print(numpy.__version__)' },
  { name: 'PIL', cmd: 'from PIL import Image; print(Image.__version__)' },
  { name: 'cv2', cmd: 'import cv2; print(cv2.__version__)' },
  { name: 'pytest', cmd: 'import pytest; print(pytest.__version__)' },
  { name: 'pydantic', cmd: 'from pydantic import BaseModel; print(BaseModel)' },
];

let allOk = true;
for (const test of tests) {
  try {
    const result = execSync(`"${venvPython}" -c "${test.cmd}"`, { 
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore']
    }).trim();
    console.log(`✅ ${test.name}: ${result}`);
  } catch (e) {
    console.log(`❌ ${test.name}: ${e.message.split('\n')[0]}`);
    allOk = false;
  }
}

console.log(allOk ? '\nAll modules verified!' : '\nSome modules failed.');
