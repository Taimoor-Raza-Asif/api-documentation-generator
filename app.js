/*
  =============================================================
  == DOCUMENTATION GENERATOR AGENT (FINAL - SUPERVISOR COMPLIANT)
  =============================================================
  This is the final, deployable agent, refactored to be 100%
  compliant with the official "Supervisor Handshake" JSON format.
*/

const express = require('express');
const fetch = require('node-fetch');
const { simpleGit } = require('simple-git');
const { glob } = require('glob');
const fs = require('fs').promises;
const path = require('path');
const os = require('os');
const AdmZip = require('adm-zip');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid'); // To generate new message_id
require('dotenv').config();

const app = express();
const port = process.env.PORT || 3000;

// =============================================================
// == ⭐️ API KEY & MIDDLEWARE ⭐️
// =============================================================
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";
app.use(cors()); // Allow requests from other origins
// (REMOVED) Multer - We no longer use multipart/form-data
// (ADDED) Use express.json() to read the Supervisor's handshake
app.use(express.json({ limit: '50mb' }));
// =-----------------------------------------------------------

// ... All your helper functions (callGeminiAPI, getLanguageFromFilePath, cloneRepoAndGetFiles, etc.) are perfect. ...
// ... I am pasting them here for completeness. ...

/*
  =============================================================
  == HELPER FUNCTIONS (File/Project Analysis)
  == (These are unchanged, they are our "agent brain")
  =============================================================
*/

// (NEW) Function to handle Base64 encoded files
async function saveBase64File(base64String, extension) {
  const tempDir = os.tmpdir();
  const tempFilePath = path.join(tempDir, `${uuidv4()}.${extension}`);
  const buffer = Buffer.from(base64String, 'base64');
  await fs.writeFile(tempFilePath, buffer);
  return tempFilePath;
}


// (UPDATED) Function to infer language OR use user-provided
async function detectLanguage(language, filesToProcess) {
  if (language && language.trim() !== "") {
    console.log(`[Config] Using language provided by Supervisor: ${language}`);
    return language;
  }
  
  if (!filesToProcess || filesToProcess.length === 0) {
    console.warn("[Config] No language provided and no files to analyze. Defaulting to 'javascript'.");
    return 'javascript';
  }

  // Auto-detect from the first file's path
  const firstFilePath = filesToProcess[0].file_path;
  const detectedLang = getLanguageFromFilePath(firstFilePath);
  
  if (detectedLang) {
    console.log(`[Config] Auto-detected language from file path '${firstFilePath}': ${detectedLang}`);
    return detectedLang;
  }

  // Fallback: AI-based detection (if path fails)
  console.log(`[Config] Could not detect language from path. Asking AI...`);
  const codeSnippet = filesToProcess[0].code_snippet;
  
  // (This is a simple, non-schema call to Gemini)
  if (!GEMINI_API_KEY) throw new Error("GEMINI_API_KEY is not configured.");
  const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${GEMINI_API_KEY}`;
  const payload = {
    contents: [{ parts: [{ text: `Analyze this code snippet and return *only* the name of the programming language (e.g., "python", "javascript", "java").\n\n${codeSnippet.substring(0, 1000)}` }] }]
  };
  
  const apiResponse = await fetch(apiUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
  if (!apiResponse.ok) throw new Error("AI Language detection failed.");
  const result = await apiResponse.json();
  const aiLang = result.candidates?.[0]?.content?.parts?.[0]?.text.trim().toLowerCase();
  
  if (aiLang) {
    console.log(`[Config] AI auto-detected language: ${aiLang}`);
    return aiLang;
  }

  console.warn("[Config] AI language detection failed. Defaulting to 'javascript'.");
  return 'javascript';
}

function getLanguageFromFilePath(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  switch (ext) {
    case '.js': case '.mjs': case '.cjs': return 'javascript';
    case '.py': return 'python';
    case '.go': return 'go';
    case '.java': return 'java';
    case '.ts': return 'typescript';
    case '.rb': return 'ruby';
    case '.php': return 'php';
    case '.cs': return 'csharp';
    default: return null;
  }
}

async function extractFilesFromZip(zipFilePath, searchPatterns) {
  console.log(`[Zip Analyst] Unzipping ${zipFilePath}...`);
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'zip-extract-'));
  try {
    const zip = new AdmZip(zipFilePath);
    zip.extractAllTo(tempDir, true);
    console.log(`[Zip Analyst] Extracted to ${tempDir}.`);
    const files = await findCodeFiles(tempDir, searchPatterns); 
    await fs.rm(tempDir, { recursive: true, force: true });
    console.log(`[Zip Analyst] Cleaned up temp directory: ${tempDir}`);
    return files;
  } catch (error) {
    console.error(`[Zip Analyst] Failed to process zip: ${error.message}`);
    await fs.rm(tempDir, { recursive: true, force: true }).catch(e => console.error(`[Zip Analyst] Failed cleanup: ${e.message}`));
    throw new Error(`Failed to process zip file: ${error.message}`);
  }
}

async function findCodeFiles(baseDir, searchPatterns) {
  const defaultFileTypes = ['*.js', '*.py', '*.go', '*.java', '*.ts', '*.rb', '*.php', '*.cs', '*.mjs', '*.cjs'];
  const globPatterns = [];
  
  const patternsToUse = searchPatterns && searchPatterns.length > 0 ? searchPatterns : ['**/'];

  for (const pattern of patternsToUse) {
    for (const type of defaultFileTypes) {
      const fullPattern = path.join(baseDir, pattern, type).replace(/\\/g, '/');
      globPatterns.push(fullPattern);
    }
  }
  
  console.log(`[File Finder] Searching with ${globPatterns.length} patterns...`);
  const uniqueFiles = new Set();
  const fileResults = await glob(globPatterns, { nodir: true, dot: false, ignore: '**/node_modules/**' });
  fileResults.forEach(file => uniqueFiles.add(file));

  console.log(`[File Finder] Found ${uniqueFiles.size} code files.`);
  const fileContents = [];
  for (const filePath of uniqueFiles) {
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      const relativePath = path.relative(baseDir, filePath);
      fileContents.push({ file_path: relativePath, code_snippet: content });
    } catch (readError) {
      console.warn(`[File Finder] Could not read file ${filePath}: ${readError.message}`);
    }
  }
  return fileContents;
}

async function cloneRepoAndGetFiles(repoUrl, searchPatterns) {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'git-repo-'));
  console.log(`[Project Analyst] Cloning ${repoUrl} into ${tempDir}...`);
  try {
    const git = simpleGit();
    await git.clone(repoUrl, tempDir, ['--depth=1']);
    console.log("[Project Analyst] Repo cloned successfully.");
    const files = await findCodeFiles(tempDir, searchPatterns);
    await fs.rm(tempDir, { recursive: true, force: true });
    console.log(`[Project Analyst] Cleaned up temp directory: ${tempDir}`);
    return files;
  } catch (error) {
    console.error(`[Project Analyst] Failed to clone or process repo: ${error.message}`);
    await fs.rm(tempDir, { recursive: true, force: true }).catch(e => console.error(`[Project Analyst] Failed cleanup: ${e.message}`));
    throw new Error(`Failed to process git repo: ${error.message}`);
  }
}

async function callGeminiAPI(codeSnippet, language) {
  if (!GEMINI_API_KEY) {
    console.error("GEMINI_API_KEY is missing. Set it as an environment variable.");
    throw new Error("GEMINI_API_KEY is not configured on the server.");
  }
  const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${GEMINI_API_KEY}`;
  
  const systemPrompt = `You are an expert API Architect. Your task is to analyze a source code file.
**First, you must determine if this file defines API endpoints (like a Router, Controller, or main API file).**
If the file is a service, utility, model, or configuration file, return {"endpoints": []}.
If (and only if) the file defines API endpoints, find ALL endpoints and generate a JSON array.
For each endpoint, you MUST infer the following:
1.  'path' and 'method'.
2.  'summary' and 'description'.
3.  'requestBodySchema': A JSON schema object, returned as a JSON-stringified STRING. If no body, return null.
4.  'successResponseSchema': A JSON schema object, returned as a JSON-stringified STRING.
5.  'errorResponses': An array of common error responses (e.g., {"code": "400", "description": "Invalid input"}).
Return ONLY the JSON object as requested in the schema.`;

  const userQuery = `Here is the complete source code file. The language is: ${language}
---
${codeSnippet}
---
Please analyze this file. **If this file does not define API endpoints (e.g., it's a service, model, or helper file), return {"endpoints": []}.**
Otherwise, find all API endpoints in this file and generate an object for each.

IMPORTANT: 'requestBodySchema' and 'successResponseSchema' MUST be JSON-stringified strings.
Return a JSON object containing a single key 'endpoints', which is an array of these objects.`;

  const responseSchema = {
    type: "OBJECT",
    properties: {
      "endpoints": {
        type: "ARRAY",
        description: "An array of all API endpoint objects found in the code.",
        items: {
          type: "OBJECT",
          properties: {
            "path": { type: "STRING" }, "method": { type: "STRING" }, "summary": { type: "STRING" }, "description": { type: "STRING" },
            "tags": { type: "ARRAY", items: { "type": "STRING" } },
            "requestBodySchema": { type: "STRING", nullable: true },
            "successResponseSchema": { type: "STRING", nullable: true },
            "errorResponses": {
              type: "ARRAY",
              items: { type: "OBJECT", properties: { "code": { "type": "STRING" }, "description": { "type": "STRING" } } },
              nullable: true 
            }
          },
          required: ["path", "method", "summary"]
        }
      }
    },
    required: ["endpoints"]
  };
  
  const payload = {
    contents: [{ parts: [{ text: userQuery }] }],
    systemInstruction: { parts: [{ text: systemPrompt }] },
    generationConfig: { responseMimeType: "application/json", responseSchema: responseSchema }
  };
  
  try {
    const apiResponse = await fetch(apiUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    if (!apiResponse.ok) {
      const errorBody = await apiResponse.text();
      console.error(`Gemini API Error: ${apiResponse.status} ${errorBody}`);
      throw new Error(`Gemini API call failed with status: ${apiResponse.status}`);
    }
    const result = await apiResponse.json();
    const aiText = result.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!aiText) {
      console.error("Gemini API Error: No text returned in response.", result);
      throw new Error("No text returned from AI.");
    }
    return JSON.parse(aiText);
  } catch (error) {
    console.error("Error in callGeminiAPI:", error);
    throw error;
  }
}


/*
  =============================================================
  == 1. HEALTH CHECK ENDPOINT
  =============================================================
  (This is still useful for Render.com and for the Supervisor to ping)
*/
app.get('/health', (req, res) => {
  console.log("Health check requested.");
  res.status(200).json({
    status: "I'm up and ready",
    agent_name: "Documentation Generator Agent (ARCHITECT)"
  });
});

/*
  =============================================================
  == 2. (NEW!) SUPERVISOR-COMPLIANT EXECUTE ENDPOINT
  =============================================================
  This is the *single* endpoint the Supervisor will call.
  It accepts their JSON handshake and returns their JSON handshake.
*/
app.post('/execute', async (req, res) => {
  // --- 1. Read the Supervisor's Handshake ---
  const incomingMessage = req.body;
  
  if (incomingMessage.type !== 'task_assignment') {
    return res.status(400).json({ message: "Invalid message type" });
  }

  // This is our *actual* task payload from the Supervisor
  const taskData = incomingMessage["results/task"] || {};
  console.log(`Received task ${incomingMessage.message_id} from ${incomingMessage.sender}`);
  
  // Extract our inputs from their task object
  const { 
    language, 
    git_repo_url, 
    search_patterns,
    zip_file_base64, // We now expect Base64
    code_files_base64, // We now expect an array of {file_path, content_base64}
    existing_documentation // This can be a full JSON object
  } = taskData;


  let filesToProcess = [];
  let documentation; // This is our "memory"
  let tempFilePaths = []; // To track temp files for cleanup

  try {
    // --- 2. Determine Search Patterns ---
    let patterns = search_patterns || {
        javascript: ["**/routes/**", "**/api/**", "server.js", "index.js"],
        python: ["**/api/**", "**/routes/**", "app.py", "main.py"],
        java: ["**/src/**/controller/**", "**/src/**/api/**"],
        csharp: ["**/Controllers/**"]
    }[language] || ["**/"]; // Default to all if language is unknown
    console.log(`[Config] Using search patterns: ${patterns.join(', ')}`);

    // --- 3. Prioritized Input Handling ---
    if (zip_file_base64) {
      console.log(`Mode: ZIP. Analyzing Base64 zip file...`);
      const zipFilePath = await saveBase64File(zip_file_base64, 'zip');
      tempFilePaths.push(zipFilePath);
      filesToProcess = await extractFilesFromZip(zipFilePath, patterns);
    }
    else if (git_repo_url) {
      console.log(`Mode: PROJECT. Analyzing full repository: ${git_repo_url}`);
      filesToProcess = await cloneRepoAndGetFiles(git_repo_url, patterns);
    }
    else if (code_files_base64 && code_files_base64.length > 0) {
      console.log(`Mode: FILES. Analyzing ${code_files_base64.length} Base64 file(s).`);
      for (const file of code_files_base64) {
        filesToProcess.push({
          file_path: file.file_path,
          code_snippet: Buffer.from(file.content_base64, 'base64').toString('utf-8')
        });
      }
    }
    
    // --- 4. Auto-Detect Language (if needed) ---
    const detectedLanguage = await detectLanguage(language, filesToProcess);

    if (filesToProcess.length === 0) {
      console.log("No files found to process. Sending success response.");
      // (Build success response in their format)
      return res.status(200).json(createSuccessResponse(
        incomingMessage.message_id,
        "No code files were found to process.",
        {}, {}, 0
      ));
    }

    // --- 5. Load "Memory" (Existing Documentation) ---
    if (existing_documentation && typeof existing_documentation === 'object') {
      console.log("Loading existing documentation from JSON body.");
      documentation = existing_documentation;
    } else {
      console.log("No existing documentation. Creating from scratch.");
      documentation = {
        openapi: '3.0.0',
        info: { title: 'New API Documentation', version: '1.0.0', description: `Generated by AI Architect Agent` },
        paths: {}
      };
    }
    if (!documentation.paths) documentation.paths = {};

    // --- 6. ⭐️ THE AGENTIC LOOP ⭐️ ---
    let totalEndpointsFound = 0;
    let file_by_file_results = []; // (NEW) For our new response format
    
    for (const file of filesToProcess) {
      if (!file.code_snippet || file.code_snippet.trim() === "") {
        console.log(`Skipping empty file: ${file.file_path}`);
        continue;
      }
      
      console.log(`Analyzing file: ${file.file_path} (as ${detectedLanguage})...`);
      
      const aiResponse = await callGeminiAPI(file.code_snippet, detectedLanguage);
      const endpoints = aiResponse.endpoints;

      if (!endpoints || endpoints.length === 0) {
        console.log(`No API endpoints found by AI for file: ${file.file_path}`);
        file_by_file_results.push({
            file_path: file.file_path,
            language_detected: detectedLanguage,
            endpoints_found: 0,
            documentation: []
        });
        continue;
      }
      
      console.log(`Found ${endpoints.length} endpoints in ${file.file_path}`);
      file_by_file_results.push({
          file_path: file.file_path,
          language_detected: detectedLanguage,
          endpoints_found: endpoints.length,
          documentation: endpoints // Store the direct AI response for this file
      });

      // "Memory Update" - Merge AI findings
      for (const endpoint of endpoints) {
        const { path: apiPath, method, ...openapiSnippet } = endpoint;
        if (!apiPath || !method) continue;
        const lcMethod = method.toLowerCase();

        // (This is the full, rich merge logic)
        const openApiEndpoint = buildOpenApiEndpoint(endpoint);
        
        if (!documentation.paths[apiPath]) {
          documentation.paths[apiPath] = {};
        }
        documentation.paths[apiPath][lcMethod] = openApiEndpoint; // Overwrite
        
        console.log(`  -> Successfully merged rich path: ${lcMethod.toUpperCase()} ${apiPath}`);
      }
      
      totalEndpointsFound += endpoints.length;
    }

    // --- 7. (NEW!) Send Supervisor-Compliant Response ---
    console.log("All tasks complete. Sending response to Supervisor.");
    res.status(200).json(createSuccessResponse(
      incomingMessage.message_id,
      `Documentation successfully processed for ${totalEndpointsFound} endpoint(s).`,
      documentation,
      file_by_file_results,
      totalEndpointsFound
    ));

  } catch (error) {
    // --- 8. (NEW!) Send Supervisor-Compliant Error ---
    console.error("An error occurred during the agentic loop:", error);
    res.status(500).json(createErrorResponse(
      incomingMessage.message_id,
      "An error occurred while processing the task.",
      error.message
    ));
  } finally {
    // --- 9. (NEW!) Cleanup Base64 Temp Files ---
    for (const tempFile of tempFilePaths) {
      await fs.rm(tempFile, { force: true }).catch(e => console.error(`Failed to cleanup temp file: ${tempFile}`));
    }
  }
});


/*
  =============================================================
  == (NEW!) HANDSHAKE RESPONSE BUILDERS
  =============================================================
  Functions to build the Supervisor's required JSON format
*/

function createSuccessResponse(relatedId, message, mergedDoc, fileResults, endpointCount) {
  return {
    message_id: `doc-agent-${uuidv4()}`,
    sender: "documentation_generator_agent",
    recipient: "supervisor",
    type: "task_response",
    related_message_id: relatedId,
    status: "completed",
    "results/task": {
      status_message: message,
      endpoints_found: endpointCount,
      file_by_file_results: fileResults,
      merged_documentation: mergedDoc
    },
    timestamp: new Date().toISOString()
  };
}

function createErrorResponse(relatedId, message, error) {
  return {
    message_id: `doc-agent-${uuidv4()}`,
    sender: "documentation_generator_agent",
    recipient: "supervisor",
    type: "task_response",
    related_message_id: relatedId,
    status: "failed",
    "results/task": {
      status_message: message,
      error_details: error
    },
    timestamp: new Date().toISOString()
  };
}

/*
  =============================================================
  == (NEW!) OPENAPI ENDPOINT BUILDER
  =============================================================
  (This is our "rich" merge logic from the last step)
*/
function buildOpenApiEndpoint(endpoint) {
  const { 
    path: apiPath, 
    method, 
    summary, 
    description, 
    tags,
    requestBodySchema,
    successResponseSchema,
    errorResponses
  } = endpoint;

  const lcMethod = method.toLowerCase();
  
  const openApiEndpoint = {
      summary: summary || "No summary provided",
      description: description || "No description provided",
      tags: tags || [apiPath.split('/')[1] || 'default'],
      responses: {}
  };
  
  // Parse stringified JSON schemas
  let reqBodySchemaObj = null;
  if (requestBodySchema) {
      try { reqBodySchemaObj = JSON.parse(requestBodySchema); }
      catch (e) { console.warn(`  -> Invalid requestBodySchema JSON: ${e.message}`); }
  }

  let successRespSchemaObj = null;
  if (successResponseSchema) {
      try { successRespSchemaObj = JSON.parse(successResponseSchema); }
      catch (e) { console.warn(`  -> Invalid successResponseSchema JSON: ${e.message}`); }
  }

  // Add request body
  if (reqBodySchemaObj && Object.keys(reqBodySchemaObj).length > 0) {
      openApiEndpoint.requestBody = {
          description: `Request body for ${lcMethod} ${apiPath}`,
          required: true,
          content: { "application/json": { schema: reqBodySchemaObj } }
      };
  }

  // Add success response
  const successCode = (lcMethod === 'post') ? '201' : '200';
  openApiEndpoint.responses[successCode] = {
      description: "Successful operation",
      content: { "application/json": { schema: successRespSchemaObj || { type: "object", properties: { message: { type: "string" } } } } }
  };

  // Add error responses
  if (errorResponses) {
      for (const err of errorResponses) {
          if (err.code) {
             openApiEndpoint.responses[err.code] = { description: err.description };
          }
      }
  }
  return openApiEndpoint;
}


// Start the server
app.listen(port, () => {
  console.log(`=================================================`);
  console.log(`   Documentation Generator Agent (SUPERVISOR-READY)`);
  console.log(`   Listening on http://localhost:${port}`);
  console.log(`=================================================`);
  console.log(`Ready to receive tasks from the Supervisor...`);
  console.log(`\n(The index.html demo UI will no longer work with this agent)`);
});