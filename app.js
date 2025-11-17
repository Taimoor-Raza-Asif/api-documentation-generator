/*
  =============================================================
  == DOCUMENTATION GENERATOR AGENT (LTM-ENABLED)
  =============================================================
  This agent is Supervisor-compliant and now includes a
  file-based Long-Term Memory (LTM) module.
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
const { v4: uuidv4 } = require('uuid');
const crypto = require('crypto'); // <--  For LTM hashing
require('dotenv').config();

const app = express();
const port = process.env.PORT || 3000;

// =============================================================
// ==  API KEY & MIDDLEWARE 
// =============================================================
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";
app.use(cors());
app.use(express.json({ limit: '50mb' }));

// =============================================================
// ==   LONG-TERM MEMORY (LTM) MODULE 
// =============================================================

//  Configuration for our LTM
const LTM_FILE_PATH = path.join(__dirname, 'LTM', 'memory.json');
const LTM_DIR = path.dirname(LTM_FILE_PATH);
const LTM_WINDOW_SIZE = 10; // Store the last 10 successful tasks

/**
 *  Reads the LTM file.
 * Creates the directory/file if it doesn't exist.
 */
async function readLTM() {
  try {
    await fs.mkdir(LTM_DIR, { recursive: true });
    const data = await fs.readFile(LTM_FILE_PATH, 'utf-8');
    return JSON.parse(data);
  } catch (error) {
    if (error.code === 'ENOENT') {
      // File doesn't exist, which is fine. Return empty memory.
      return {};
    }
    console.error("[LTM Error] Failed to read memory.json:", error.message);
    return {}; // Return empty on parse error
  }
}

/**
 *  Writes data to the LTM file.
 */
async function writeLTM(data) {
  try {
    await fs.mkdir(LTM_DIR, { recursive: true });
    await fs.writeFile(LTM_FILE_PATH, JSON.stringify(data, null, 2));
  } catch (error) {
    console.error("[LTM Error] Failed to write memory.json:", error.message);
  }
}

/**
 *  Generates a unique SHA-256 hash for a given task.
 * This "signature" is based on all critical inputs.
 */
function generateTaskSignature(taskData) {
  // We stringify the key inputs to create a stable, hashable string
  const signatureString = JSON.stringify({
    lang: taskData.language,
    git: taskData.git_repo_url,
    zip_hash: taskData.zip_file_base64 ? crypto.createHash('sha256').update(taskData.zip_file_base64).digest('hex') : null,
    files: taskData.code_files_base64,
    doc: taskData.existing_documentation,
    patterns: taskData.search_patterns
  });
  
  return crypto.createHash('sha256').update(signatureString).digest('hex');
}

/**
 *  Finds a task result in the LTM data by its signature.
 */
function findInLTM(signature, ltmData) {
  const entry = ltmData[signature];
  if (entry) {
    // Check if entry is valid (has a result and timestamp)
    if (entry.result && entry.timestamp) {
      return entry.result;
    }
  }
  return null;
}

/**
 *  Saves a new result to the LTM and enforces the window size.
 */
async function saveToLTM(signature, result, ltmData) {
  console.log(`[LTM] Saving new result to memory for sig: ${signature.substring(0, 10)}...`);
  
  // 1. Add new result
  ltmData[signature] = {
    result: result, // This is the "results/task" object
    timestamp: new Date().toISOString()
  };

  // 2. Enforce window size
  const entries = Object.entries(ltmData);
  if (entries.length > LTM_WINDOW_SIZE) {
    // Sort by timestamp, oldest first
    entries.sort((a, b) => new Date(a[1].timestamp) - new Date(b[1].timestamp));
    
    // Find keys to delete
    const toDeleteCount = entries.length - LTM_WINDOW_SIZE;
    const keysToDelete = entries.slice(0, toDeleteCount).map(entry => entry[0]);
    
    for (const key of keysToDelete) {
      delete ltmData[key];
      console.log(`[LTM] Pruned old entry: ${key.substring(0, 10)}...`);
    }
  }

  // 3. Write the updated (and possibly pruned) data back to disk
  await writeLTM(ltmData);
}

// =-----------------------------------------------------------

/*
  =============================================================
  == 1. HEALTH CHECK ENDPOINT
  =============================================================
*/
app.get('/health', (req, res) => {
  console.log("Health check requested.");
  res.status(200).json({
    status: "I'm up and ready",
    agent_name: "Documentation Generator Agent (LTM-Enabled)"
  });
});

/*
  =============================================================
  == 2. SUPERVISOR-COMPLIANT EXECUTE ENDPOINT (LTM-ENABLED)
  =============================================================
*/
app.post('/execute', async (req, res) => {
  // --- 1. Read the Supervisor's Handshake ---
  const incomingMessage = req.body;
  
  if (incomingMessage.type !== 'task_assignment') {
    return res.status(400).json({ message: "Invalid message type" });
  }

  const taskData = incomingMessage["results/task"] || {};
  console.log(`Received task ${incomingMessage.message_id} from ${incomingMessage.sender}`);
  
  let ltmData; // To store our memory
  let taskSignature; // The unique hash for this task

  try {
    // ---  2. LTM CHECK (PRE-EXECUTION) ---
    ltmData = await readLTM();
    taskSignature = generateTaskSignature(taskData);
    
    console.log(`[LTM] Task Signature: ${taskSignature}`);
    const cachedResult = findInLTM(taskSignature, ltmData);

    // ---  3. LTM HIT ---
    if (cachedResult) {
      console.log("[LTM HIT] Found identical task in memory. Returning cached response.");
      // We found a match. Return the cached "results/task" object.
      // We must build a new handshake response wrapper.
      return res.status(200).json(
        createSuccessResponseFromCache(
          incomingMessage.message_id,
          cachedResult
        )
      );
    }

    // --- 4. LTM MISS (Continue with normal execution) ---
    console.log("[LTM MISS] Task not in memory. Executing full agent flow.");
    
    const { 
      language, 
      git_repo_url, 
      search_patterns,
      zip_file_base64,
      code_files_base64,
      existing_documentation
    } = taskData;

    let filesToProcess = [];
    let documentation;
    let tempFilePaths = [];

    // --- 5. Determine Search Patterns ---
    let patterns = search_patterns || {
        javascript: ["**/routes/**", "**/api/**", "server.js", "index.js", "app.js"],
        typescript: ["**/routes/**", "**/api/**", "**/controller/**", "server.ts", "index.ts", "app.ts"],
        python: ["**/api/**", "**/routes/**", "app.py", "main.py", "views.py"],
        java: ["**/src/**/controller/**", "**/src/**/api/**", "**/src/**/controllers/**"],
        csharp: ["**/Controllers/**", "**/api/**"],
        go: ["**/handlers/**", "**/api/**", "**/routes/**", "main.go", "server.go"],
        ruby: ["**/app/controllers/**", "**/api/**", "config/routes.rb"],
        php: ["**/app/Http/Controllers/**", "**/src/Controller/**", "**/api/**", "index.php", "routes/api.php"],
        cpp: ["**/routes/**", "**/api/**", "**/controller/**", "main.cpp", "server.cpp"],
        c: ["**/routes/**", "**/api/**", "**/controller/**", "main.c", "server.c"]
    }[language] || ["**/"];
    console.log(`[Config] Using search patterns: ${patterns.join(', ')}`);

    // --- 6. Prioritized Input Handling ---
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
    
    // --- 7. Auto-Detect Language (if needed) ---
    const detectedLanguage = await detectLanguage(language, filesToProcess);

    if (filesToProcess.length === 0) {
      // (This is still a "success", but we don't cache it as it's not a real task)
      console.log("No files found to process. Sending success response.");
      return res.status(200).json(createSuccessResponse(
        incomingMessage.message_id,
        "No code files were found to process.",
        {}, {}, 0
      ));
    }

    // --- 8. Load "Memory" (Existing Documentation) ---
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

    // --- 9.  THE AGENTIC LOOP (WITH RATE LIMITING)  ---
    let totalEndpointsFound = 0;
    let file_by_file_results = [];
    const GEMINI_RPM_LIMIT = 10; // Gemini 2.5 Flash RPM (based on your screenshot)
    const ONE_MINUTE_MS = 60000;
    
    console.log(`[Agent Loop] Starting to process ${filesToProcess.length} files in batches of ${GEMINI_RPM_LIMIT}...`);

    for (let i = 0; i < filesToProcess.length; i += GEMINI_RPM_LIMIT) {
        const batch = filesToProcess.slice(i, i + GEMINI_RPM_LIMIT);
        console.log(`[Agent Loop] Processing batch ${Math.floor(i / GEMINI_RPM_LIMIT) + 1} of ${Math.ceil(filesToProcess.length / GEMINI_RPM_LIMIT)} (${batch.length} files)...`);

        //  Process this batch in parallel to be efficient
        const batchPromises = batch.map(file => {
            if (!file.code_snippet || file.code_snippet.trim() === "") {
                console.log(`Skipping empty file: ${file.file_path}`);
                return Promise.resolve(null); // Return a resolved promise for empty files
            }
            
            console.log(`Analyzing file: ${file.file_path} (as ${detectedLanguage})...`);
            // Return the promise from callGeminiAPI, wrapped to handle success/failure
            return callGeminiAPI(file.code_snippet, detectedLanguage)
                .then(aiResponse => ({ // Wrap success
                    file: file,
                    aiResponse: aiResponse,
                    status: 'success'
                }))
                .catch(err => { // Wrap error
                    console.error(`Error analyzing ${file.file_path}: ${err.message}`);
                    return Promise.resolve({ // Resolve, so one failure doesn't kill Promise.all
                        file: file, 
                        aiResponse: null, 
                        status: 'error', 
                        error: err.message 
                    });
                });
        });

        // Wait for all 10 requests in the batch to complete
        const batchResults = await Promise.all(batchPromises);

        // Now, serially process the results (to avoid race conditions on `documentation` object)
        for (const result of batchResults) {
            if (!result || result.status === 'error' || !result.aiResponse) {
                // This was an empty file or an analysis error
                file_by_file_results.push({
                    file_path: result?.file?.file_path || "Unknown file",
                    language_detected: detectedLanguage,
                    endpoints_found: 0,
                    documentation: []
                });
                continue;
            }

            const { file, aiResponse } = result;
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
                documentation: endpoints
            });

            // "Memory Update" - Merge AI findings
            for (const endpoint of endpoints) {
                const { path: apiPath, method, ...openapiSnippet } = endpoint;
                if (!apiPath || !method) continue;
                const lcMethod = method.toLowerCase();
                const openApiEndpoint = buildOpenApiEndpoint(endpoint);
                
                if (!documentation.paths[apiPath]) {
                    documentation.paths[apiPath] = {};
                }
                documentation.paths[apiPath][lcMethod] = openApiEndpoint;
                
                console.log(`  -> Successfully merged rich path: ${lcMethod.toUpperCase()} ${apiPath}`);
            }
            
            totalEndpointsFound += endpoints.length;
        } // End of processing batch results

        //  Check if we need to wait
        const moreFilesToProcess = (i + GEMINI_RPM_LIMIT) < filesToProcess.length;
        if (moreFilesToProcess) {
            console.log(`[Agent Loop] Batch complete. Reached RPM limit. Waiting 1 minute...`);
            await new Promise(resolve => setTimeout(resolve, ONE_MINUTE_MS));
            console.log("[Agent Loop] Resuming next batch.");
        }

    } // End of main batch loop

    // --- 10.  Send Response & SAVE TO LTM ---
    console.log("All tasks complete. Sending response to Supervisor.");
    
    // Create the response *object* first
    const successResponse = createSuccessResponse(
      incomingMessage.message_id,
      `Documentation successfully processed for ${totalEndpointsFound} endpoint(s).`,
      documentation,
      file_by_file_results,
      totalEndpointsFound
    );
    
    //  Save the "results/task" part to our LTM
    await saveToLTM(taskSignature, successResponse["results/task"], ltmData);
    
    // Send the full response
    res.status(200).json(successResponse);

  } catch (error) {
    // --- 11. (UNCHANGED) Send Supervisor-Compliant Error ---
    console.error("An error occurred during the agentic loop:", error);
    res.status(500).json(createErrorResponse(
      incomingMessage.message_id,
      "An error occurred while processing the task.",
      error.message
    ));
  } finally {
    
  }
});


/*
  =============================================================
  ==  HANDSHAKE RESPONSE BUILDERS
  =============================================================
*/

/**
 * Builds a success response for a standard (LTM Miss) execution.
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
      merged_documentation: mergedDoc,
      ltm_hit: false //  Add LTM status
    },
    timestamp: new Date().toISOString()
  };
}

/**
 *  Builds a success response from a cached (LTM Hit) result.
 */
function createSuccessResponseFromCache(relatedId, cachedTaskResult) {
  // We use the cached "results/task" object directly
  const cachedResultWithLtmFlag = {
    ...cachedTaskResult,
    status_message: `[LTM HIT] ${cachedTaskResult.status_message}`,
    ltm_hit: true //  Add LTM status
  };

  return {
    message_id: `doc-agent-${uuidv4()}`,
    sender: "documentation_generator_agent",
    recipient: "supervisor",
    type: "task_response",
    related_message_id: relatedId,
    status: "completed",
    "results/task": cachedResultWithLtmFlag, // Use the modified cached result
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
  == HELPER FUNCTIONS (File/Project Analysis)
  =============================================================
*/

async function saveBase64File(base64String, extension) {
  const tempDir = os.tmpdir();
  const tempFilePath = path.join(tempDir, `${uuidv4()}.${extension}`);
  const buffer = Buffer.from(base64String, 'base64');
  await fs.writeFile(tempFilePath, buffer);
  return tempFilePath;
}

async function detectLanguage(language, filesToProcess) {
  if (language && language.trim() !== "") {
    console.log(`[Config] Using language provided by Supervisor: ${language}`);
    return language;
  }
  
  if (!filesToProcess || filesToProcess.length === 0) {
    console.warn("[Config] No language provided and no files to analyze. Defaulting to 'javascript'.");
    return 'javascript';
  }

  const firstFilePath = filesToProcess[0].file_path;
  const detectedLang = getLanguageFromFilePath(firstFilePath);
  
  if (detectedLang) {
    console.log(`[Config] Auto-detected language from file path '${firstFilePath}': ${detectedLang}`);
    return detectedLang;
  }

  console.log(`[Config] Could not detect language from path. Asking AI...`);
  const codeSnippet = filesToProcess[0].code_snippet;
  
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
  let files = [];
  try {
    const zip = new AdmZip(zipFilePath);
    zip.extractAllTo(tempDir, true);
    console.log(`[Zip Analyst] Extracted to ${tempDir}.`);
    files = await findCodeFiles(tempDir, searchPatterns); 
  } catch (error) {
    console.error(`[Zip Analyst] Failed to process zip: ${error.message}`);
    throw new Error(`Failed to process zip file: ${error.message}`);
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true }).catch(e => console.error(`[Zip Analyst] Failed cleanup: ${e.message}`));
    console.log(`[Zip Analyst] Cleaned up temp directory: ${tempDir}`);
  }
  return files;
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
  let files = [];
  try {
    const git = simpleGit();
    await git.clone(repoUrl, tempDir, ['--depth=1']);
    console.log("[Project Analyst] Repo cloned successfully.");
    files = await findCodeFiles(tempDir, searchPatterns);
  } catch (error) {
    console.error(`[Project Analyst] Failed to clone or process repo: ${error.message}`);
    throw new Error(`Failed to process git repo: ${error.message}`);
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true }).catch(e => console.error(`[Project Analyst] Failed cleanup: ${e.message}`));
    console.log(`[Project Analyst] Cleaned up temp directory: ${tempDir}`);
  }
  return files;
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
  == OPENAPI ENDPOINT BUILDER
  =============================================================
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
  const successCode = (lcMethod === 'post') ? '201Ã' : '200';
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
  console.log(`   Documentation Generator Agent (LTM-ENABLED)`);
  console.log(`   Listening on http://localhost:${port}`);
  console.log(`=================================================`);
  console.log(`Ready to receive tasks from the Supervisor...`);
  console.log(`LTM storage initialized at: ${LTM_FILE_PATH}`);
  
});