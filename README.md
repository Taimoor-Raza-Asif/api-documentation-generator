# 🤖 Documentation Generator AI Agent

This repository contains the **Supervisor-Compliant *Documentation
Generator Agent*** for the **Software Project Management (SPM)** course,
**Section C**.

This is a fully autonomous, callable AI "worker agent" built using
**Node.js** and **Express**.\
It is designed to be triggered by a **Supervisor Agent** to perform one
complex task:

> **Analyze source code (any language) → Generate rich, professional
> OpenAPI 3.0 documentation using the Gemini AI API.**

The implementation is **100% compliant** with the official **Supervisor
message-passing protocol**.

## ✨ Key Features

-   **Supervisor-Compliant Protocol**\
    Fully follows the JSON handshake (`message_id`, `sender`, `type`,
    `status`, etc.) for both input and output.

-   **AI-Powered Documentation**\
    Uses **Gemini 2.5 Flash** to infer:

    -   API endpoint summaries
    -   Descriptions
    -   Tags
    -   Request/Response bodies
    -   Parameter schemas

-   **Language-Agnostic**\
    Automatically detects languages if not provided.

-   **Multi-Modal Input Support**

    -   Git Repo Mode (`git_repo_url`)
    -   Zip File Mode (`zip_file_base64`)
    -   Code Files Mode (`code_files_base64`)

-   **Smart File Discovery**\
    Detects relevant API files automatically while ignoring junk
    directories.

-   **Adaptive Memory**\
    Can generate new documentation or update existing OpenAPI specs.

-   **Detailed Output Structure**\
    Includes `file_by_file_results` and final `merged_documentation`.

## 🚀 Local Setup

### Prerequisites

-   Node.js v20+
-   Gemini API Key

### Installation

``` bash
git clone <your-repo-url>
cd documentation-generator-agent
npm install
```

### Environment Variables

Create `.env`:

    GEMINI_API_KEY=YOUR_API_KEY_HERE

### Run

``` bash
npm start
```

Agent runs at:

    http://localhost:3000

## ☁️ Deployment (Render.com)

1.  Push project to GitHub.

2.  Create new Render Web Service.

3.  Set:

    -   Build Command: `npm install`
    -   Start Command: `npm start`

4.  Add environment variable:

        GEMINI_API_KEY=YOUR_API_KEY

Render provides a deployment URL (e.g.,
`https://doc-agent.onrender.com`).

## 🤝 Supervisor API Contract

### Endpoint

    POST /execute
    Content-Type: application/json

### Example Supervisor Request

``` json
{
  "message_id": "uuid-from-supervisor-123",
  "sender": "supervisor",
  "recipient": "documentation_generator_agent",
  "type": "task_assignment",
  "related_message_id": null,
  "status": "pending",
  "timestamp": "2025-11-15T12:00:00Z",
  "results/task": {
    "language": "javascript",
    "git_repo_url": "https://github.com/user/repo.git",
    "zip_file_base64": null,
    "code_files_base64": null,
    "existing_documentation": null,
    "search_patterns": ["**/routes/**"]
  }
}
```

## Successful Response

``` json
{
  "message_id": "doc-agent-uuid-456",
  "sender": "documentation_generator_agent",
  "recipient": "supervisor",
  "type": "task_response",
  "related_message_id": "uuid-from-supervisor-123",
  "status": "completed",
  "timestamp": "2025-11-15T12:01:00Z",
  "results/task": {
    "status_message": "Documentation successfully processed for 7 endpoint(s).",
    "endpoints_found": 7,
    "file_by_file_results": [],
    "merged_documentation": {}
  }
}
```

## Failure Response

``` json
{
  "message_id": "doc-agent-uuid-789",
  "sender": "documentation_generator_agent",
  "recipient": "supervisor",
  "type": "task_response",
  "related_message_id": "uuid-from-supervisor-123",
  "status": "failed",
  "timestamp": "2025-11-15T12:01:00Z",
  "results/task": {
    "status_message": "An error occurred while processing the task.",
    "error_details": "Failed to process git repo: Repository not found."
  }
}
```
