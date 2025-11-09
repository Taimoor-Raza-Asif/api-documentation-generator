/*
  This is your main application file.
  It runs the Express server and includes the OpenAPI (Swagger) comments
  that will be scanned.
  It also serves the *interactive* Swagger UI for local development.
*/
const express = require('express');
const swaggerUi = require('swagger-ui-express');
const swaggerJsdoc = require('swagger-jsdoc');
const path = require('path');

const app = express();
const port = 3000;

// --- OpenAPI (Swagger) Definition ---
// This is the core configuration for swagger-jsdoc
const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'My Project API',
      version: '1.0.0',
      description: 'API documentation for my project, automatically generated.',
    },
    servers: [
      {
        url: `http://localhost:${port}`,
        description: 'Development server',
      },
    ],
  },
  // Path to the API docs files (this file and any others)
  apis: ['./app.js'], 
};

// Generate the OpenAPI specification
const openapiSpecification = swaggerJsdoc(options);

// --- Serve Interactive Docs (for Local Dev) ---
// This endpoint will host the live, interactive Swagger UI
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(openapiSpecification));

// --- Serve Static Docs (what GitHub Pages will host) ---
// This serves the 'public' folder which contains our static index.html and generated openapi.json
app.use('/static-docs', express.static(path.join(__dirname, 'public')));

// --- Your API Endpoints ---

/**
 * @openapi
 * components:
 *   schemas:
 *     User:
 *       type: object
 *       properties:
 *         id:
 *           type: integer
 *           example: 1
 *         name:
 *           type: string
 *           example: 'Jane Doe'
 *         email:
 *           type: string
 *           example: 'jane.doe@example.com'
 *
 * /api/v1/users:
 *   get:
 *     summary: Retrieve a list of users
 *     description: Fetches a list of all users.
 *     tags:
 *       - Users
 *     responses:
 *       '200':
 *         description: A successful response.
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/User'
 *
 * /api/v1/users/{id}:
 *   get:
 *     summary: Get a user by ID
 *     description: Fetches a single user by their ID.
 *     tags:
 *       - Users
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: The user's ID
 *     responses:
 *       '200':
 *         description: A single user object.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/User'
 *       '404':
 *         description: User not found
 */

// User data mock
const users = [
  { id: 1, name: 'Jane Doe', email: 'jane.doe@example.com' },
  { id: 2, name: 'John Smith', email: 'john.smith@example.com' },
];

// API Routes
// Route paths include the /api/v1 prefix to match the OpenAPI server URL
app.get('/api/v1/users', (req, res) => {
  res.json(users);
});

app.get('/api/v1/users/:id', (req, res) => {
  const user = users.find(u => u.id === parseInt(req.params.id));
  if (user) {
    res.json(user);
  } else {
    res.status(404).json({ message: 'User not found' });
  }
});


app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
  console.log(`Live interactive docs at http://localhost:${port}/api-docs`);
  console.log(`Static generated docs at http://localhost:${port}/static-docs`);
});