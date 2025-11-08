API Documentation Generator Agent

This project demonstrates how to create an automated "agent" (a CI/CD pipeline) that scans your Node.js code, generates an OpenAPI specification, and deploys it as a static website using GitHub Actions.

This fulfills all the requirements:

Scans source files: swagger-jsdoc scans app.js for @openapi comments.

Regenerates sections: The npm run docs:generate script creates a new public/openapi.json file.

Integrates with version control: The agent is a GitHub Actions workflow.

Triggers on commits/pull requests: The on: [push, pull_request] trigger in docs.yml handles this.

Minimal manual effort: Developers only need to write code and the @openapi comments. The rest is automated.

How to Run Locally

1. Install Dependencies

npm install


2. Run the Live Server

This runs the Express server, which hosts your API and a live, interactive version of the Swagger UI.

npm start


Your API is at: http://localhost:3000/api/v1/users

Your live interactive docs are at: http://localhost:3000/api-docs

3. Test the Static Generation

This is what the "agent" will do. It generates the static files in the /public folder.

npm run docs:generate


This creates public/openapi.json.

To see the final website, just open the public/index.html file directly in your web browser. It will load openapi.json and display the documentation using ReDoc.

How the "Agent" Works (Automation)

A developer pushes a commit or opens a pull request to the main branch.

This triggers the GitHub Action defined in .github/workflows/docs.yml.

The workflow (on a remote server) checks out the code, installs dependencies, and runs npm run docs:generate.

This creates the public/openapi.json file, capturing any changes from the new code.

The final step of the workflow takes the entire public folder (which includes index.html and the newly generated openapi.json) and deploys it to your repository's GitHub Pages website.

Your documentation site is now live and up-to-date with the latest code.