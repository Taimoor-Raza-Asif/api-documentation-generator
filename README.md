Documentation Generator Agent

This is the AI agent for Section C for the SPM project. Its purpose is to intelligently update OpenAPI documentation based on code changes.

This server is a "worker" agent designed to be called by the central "Supervisor" agent.

Project Deliverables Met

Working Prototype: This server is a runnable prototype with functioning AI logic.

Deployment: It is an HTTP API-based agent.

Communication: It communicates with the Supervisor via a JSON "handshake."

Logging & Health Check: It provides a GET /health endpoint as required.

AI Agentic Behavior: It uses an LLM (Gemini) to analyze code and generate structured documentation.

Memory Strategy: It loads existing_documentation into "short-term memory" to perform updates. If none is provided, it creates a new document.

How to Run the Agent

Install Dependencies:

npm install


Run the Agent Server:

npm start


The server will now be running on http://localhost:3000.

API Contract (Handshake)

This agent exposes two endpoints for the Supervisor.

1. Health Check

Endpoint: GET /health

Description: Allows the Supervisor to confirm the agent is online and ready.

Success Response (200):

{
  "status": "I'm up and ready",
  "agent_name": "Documentation Generator Agent (Section C)"
}


2. Execute Task (Updated)

Endpoint: POST /execute

Description: This is the main "work" endpoint. The Supervisor sends code snippets that have changed. The agent analyzes the code with an AI, then updates and returns a complete documentation object.

Request Body (Input):

{
  "task": "update_documentation",
  "existing_documentation": { ... },
  "changed_files": [
    {
      "file_path": "routes/users.js",
      "code_snippet": "app.post('/api/v1/users', (req, res) => { ... });"
    }
  ]
}


Field Descriptions:

task (string, required): Must be "update_documentation".

existing_documentation (object, optional): The complete, old openapi.json object.

If provided: The agent will update this object (its "memory").

If null or omitted: The agent will create a new documentation object from scratch.

changed_files (array, required): A list of file objects, each containing the code snippet to be analyzed.

Success Response (200) (Output):

{
  "status": "success",
  "message": "Documentation successfully processed for 1 endpoint(s).",
  "updated_documentation": {
    "openapi": "3.0.0",
    "info": { ... },
    "paths": {
      "/api/v1/users": {
        "post": {
          "summary": "Creates a new user.",
          "description": "This endpoint adds a new user to the database.",
          "tags": ["Users"]
        }
      }
    }
  }
}


Error Response (500):

{
  "status": "error",
  "message": "An error occurred while processing code snippets with the AI.",
  "error": "Gemini API call failed with status: 500",
  "updated_documentation": { ... }
}
