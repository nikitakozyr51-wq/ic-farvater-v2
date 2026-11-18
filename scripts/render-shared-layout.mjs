import { renderSharedLayouts } from './shared-layout.js';
const result = renderSharedLayouts({ write: process.argv.includes('--write') });
console.log('[shared-layout]', JSON.stringify(result));
if (process.argv.includes('--check') && result.changed) process.exitCode = 1;
