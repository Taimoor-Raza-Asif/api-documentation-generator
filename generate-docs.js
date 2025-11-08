/*
  This is the standalone script for your "agent".
  It scans the code, generates the openapi.json specification,
  and saves it to the 'public' folder.
  This script does NOT run the web server.
*/

const swaggerJsdoc = require('swagger-jsdoc');
const fs = require('fs');
const path = require('path');

// The same options as in app.js
const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'My Project API',
      version: '1.0.0',
      description: 'API documentation for my project, automatically generated.',
    },
    // Note: We remove the server URL or set it to a production URL
    servers: [
      {
        url: '/api/v1',
        description: 'Production server',
      },
    ],
  },
  apis: ['./app.js'], // Path to the API docs files
};

console.log('Generating API documentation...');

// Generate the OpenAPI specification
const spec = swaggerJsdoc(options);

// Define the output directory and file path
const outputDir = path.join(__dirname, 'public');
const outputFile = path.join(outputDir, 'openapi.json');

// Ensure the 'public' directory exists
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir);
  console.log(`Created directory: ${outputDir}`);
}

// Write the specification to openapi.json
fs.writeFileSync(outputFile, JSON.stringify(spec, null, 2));

console.log(`API documentation generated successfully at ${outputFile}`);