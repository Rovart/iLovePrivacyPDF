// Post-build script to copy static files for standalone deployment
const fs = require('fs');
const path = require('path');

const source = path.join(__dirname, '.next', 'static');
const destination = path.join(__dirname, '.next', 'standalone', '.next', 'static');

if (fs.existsSync(source)) {
  console.log('Copying static files to standalone build...');
  fs.cpSync(source, destination, { recursive: true });
  console.log('✓ Static files copied');
} else {
  console.log('No static files to copy');
}

// Also copy public directory
const publicSource = path.join(__dirname, 'public');
const publicDest = path.join(__dirname, '.next', 'standalone', 'public');

if (fs.existsSync(publicSource)) {
  console.log('Copying public files to standalone build...');
  fs.cpSync(publicSource, publicDest, { recursive: true });
  console.log('✓ Public files copied');
}
