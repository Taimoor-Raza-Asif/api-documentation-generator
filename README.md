# ⚡ AI API Documentation Generator

Instantly turn your source code into professional **OpenAPI 3.0** documentation.

This is a robust, AI-powered agent that analyzes codebases (Git repositories, ZIP archives, or raw files) and generates detailed API documentation using **Google's Gemini 2.5 Flash**.

It features **Smart Long-Term Memory (LTM)** to cache results, ensuring you never pay for the same compute twice, and built-in **Rate Limiting** to respect API quotas.

---

## ✨ Key Features

### 🧠 Smart Long-Term Memory (LTM)
- Uses **Content Hashing (SHA-256)** for files and **Commit SHA tracking** for Git repos.  
- If code hasn't changed, it returns a cached result instantly (**< 50ms**).

### 🛡️ Robust Rate Limiting
- Automatically throttles requests (**10 RPM**) to prevent 429 errors.  
- Queues large projects and processes them in safe batches.

### 🌐 Multi-Source Support
- **Git Repos:** Paste a `.git` URL (analyzes the latest commit).  
- **ZIP Files:** Upload a full project archive.  
- **Code Files:** Upload individual source files.

### 🔌 Supervisor Compliant
- Follows a strict **JSON message-passing protocol**, easy to plug into multi-agent systems.

---

## 🚀 How to Use

### **Method 1: The Web Interface (GUI)**
1. Deploy the agent (or run locally).  
2. Open `index.html` or your deployment URL.  
3. Select your language and input method (Git, ZIP, files).  
4. Watch the AI generate your docs in real-time!

---

### **Method 2: API Request (For Developers)**

`POST /execute`

**Endpoint:**
https://your-app-url.onrender.com/execute

**Headers:**
Content-Type: application/json

**Payload Example:**
```json
{
  "message_id": "unique-id-123",
  "sender": "user",
  "type": "task_assignment",
  "results/task": {
    "language": "javascript",
    "git_repo_url": "https://github.com/user/repo.git",
    "search_patterns": ["**/routes/**", "**/controllers/**"]
  }
}
```

## 🛠️ Local Setup

### 1. Clone the repository
```bash
git clone https://github.com/your-username/documentation-generator-agent.git
cd documentation-generator-agent
```

### 2. Install dependencies
```bash
npm install
```

### 3. Configure Environment

Create a .env file in the root directory:
```bash
GEMINI_API_KEY=your_google_gemini_key_here
PORT=3000
```
### 4. Run the Agent
```bash
npm start
```

Visit: http://localhost:3000

## ☁️ Deployment (Render.com)

This project is **Render-Ready**.

1. Fork/clone the repository.  
2. Create a new **Web Service** on Render.  
3. Connect your GitHub repository.  
4. Configure the following:

**Build Command:**
```bash
npm install
```

### Start Command:
```bash
npm start
```

### Environment Variables:
```bash
GEMINI_API_KEY
```
Done — your agent is live.

## 🏗️ Architecture Overview

- **Runtime:** Node.js & Express  
- **AI Model:** Google Gemini 2.5 Flash  
- **Git Operations:** simple-git  
- **File Processing:** adm-zip & glob  
- **Memory System:** JSON-based LTM with LRU pruning strategy  

---

**Created by Taimoor Raza Asif**
