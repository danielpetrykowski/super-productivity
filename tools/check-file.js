#!/usr/bin/env node
const { execSync } = require('child_process');
const path = require('path');

const file = process.argv[2];
if (!file) {
  console.error('❌ Please provide a file path');
  process.exit(1);
}

// Get absolute path
const absolutePath = path.resolve(file);

try {
  // Run prettier
  console.log(`🎨 Formatting ${path.basename(file)}...`);
  execSync(`npm run prettier:file ${absolutePath}`, {
    stdio: 'pipe',
    encoding: 'utf8',
  });

  // Run lint
  console.log(`🔍 Linting ${path.basename(file)}...`);
  const lintOutput = execSync(`npm run lint:file ${absolutePath}`, {
    stdio: 'pipe',
    encoding: 'utf8',
  });

  // If we get here, both commands succeeded
  console.log(`✅ ${path.basename(file)} - All checks passed!`);
} catch (error) {
  // If there's an error, show the full output
  console.error('\n❌ Errors found:\n');
  console.error(error.stdout || error.stderr || error.message);
  process.exit(1);
}
