// Render the editable vector social card using the app's existing image library.
const path = require('node:path');
const sharp = require(require.resolve('sharp', { paths: [path.join(__dirname, '../app')] }));
sharp(path.join(__dirname, 'og-image-maths.svg')).png().toFile(path.join(__dirname, '../og-image-maths.png'));
