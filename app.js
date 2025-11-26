/*
  =============================================================
  == DOCUMENTATION GENERATOR AGENT (SMART GIT LTM + ROBUST)
  =============================================================
  1. Supervisor Compliant
  2. LTM with Content Hashing (Files/Zip)
  3. LTM with Commit SHA Hashing (Git)
  4. Rate Limiting (10 RPM)
  5. Robust handling for AI JSON formats
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
const crypto = require('crypto');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 3000;

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";
app.use(cors());
app.use(express.json({ limit: '50mb' }));

// --- LTM SETUP ---
const LTM_FILE_PATH = path.join(__dirname, 'LTM', 'memory.json');
const LTM_DIR = path.dirname(LTM_FILE_PATH);
const LTM_WINDOW_SIZE = 10;

async function readLTM() {
  try {
    await fs.mkdir(LTM_DIR, { recursive: true });
    const data = await fs.readFile(LTM_FILE_PATH, 'utf-8');
    return JSON.parse(data);
  } catch (error) {
    if (error.code === 'ENOENT') return {};
    return {};
  }
}

async function writeLTM(data) {
  try {
    await fs.mkdir(LTM_DIR, { recursive: true });
    await fs.writeFile(LTM_FILE_PATH, JSON.stringify(data, null, 2));
  } catch (error) {
    console.error("[LTM] Write failed:", error.message);
  }
}

// ---  SMART GIT HASHING  ---
async function getGitCommitHash(repoUrl) {
    try {
        console.log(`[Git LTM] Fetching HEAD commit hash for ${repoUrl}...`);
        const result = await simpleGit().listRemote([repoUrl, 'HEAD']);
        if (!result) return null;
        const hash = result.split('\t')[0]; 
        console.log(`[Git LTM] Detected Commit SHA: ${hash}`);
        return hash;
    } catch (error) {
        console.warn(`[Git LTM] Failed to get remote hash: ${error.message}. Fallback to URL.`);
        return null;
    }
}

async function generateTaskSignature(taskData) {
  const hash = crypto.createHash('sha256');

  hash.update(taskData.language || 'unknown');
  hash.update(JSON.stringify(taskData.search_patterns || 'default'));

  if (taskData.zip_file_base64) {
      hash.update('mode:zip');
      hash.update(taskData.zip_file_base64); 
  } else if (taskData.code_files_base64 && taskData.code_files_base64.length > 0) {
      hash.update('mode:files');
      const sortedFiles = [...taskData.code_files_base64].sort((a, b) => a.file_path.localeCompare(b.file_path));
      for (const file of sortedFiles) {
          hash.update(file.file_path);
          hash.update(file.content_base64);
      }
  } else if (taskData.git_repo_url) {
      hash.update('mode:git');
      hash.update(taskData.git_repo_url);
      const commitHash = await getGitCommitHash(taskData.git_repo_url);
      if (commitHash) {
          hash.update(commitHash);
      } else {
          hash.update('HEAD'); 
      }
  }

  if (taskData.existing_documentation) {
      hash.update(JSON.stringify(taskData.existing_documentation));
  }

  return hash.digest('hex');
}

function findInLTM(signature, ltmData) {
  const entry = ltmData[signature];
  return (entry && entry.result && entry.timestamp) ? entry.result : null;
}

async function saveToLTM(signature, result, ltmData) {
  console.log(`[LTM] Saving result. Sig: ${signature.substring(0, 10)}...`);
  ltmData[signature] = { result, timestamp: new Date().toISOString() };
  
  const entries = Object.entries(ltmData);
  if (entries.length > LTM_WINDOW_SIZE) {
    entries.sort((a, b) => new Date(a[1].timestamp) - new Date(b[1].timestamp));
    const keysToDelete = entries.slice(0, entries.length - LTM_WINDOW_SIZE).map(e => e[0]);
    for (const k of keysToDelete) delete ltmData[k];
  }
  await writeLTM(ltmData);
}

// =-----------------------------------------------------------

app.get('/health', (req, res) => {
  res.status(200).json({ status: "I'm up", agent_name: "Doc Agent (Smart LTM)" });
});

app.post('/execute', async (req, res) => {
  const incomingMessage = req.body;
  if (!incomingMessage.message_id) {
    console.warn("[WARN] Missing message_id in request body");
    return res.status(400).json({
      message: "Missing message_id in request payload"
    });
  }
  if (incomingMessage.type !== 'task_assignment') return res.status(400).json({ message: "Invalid type" });

  const taskData = incomingMessage["results/task"] || {};
  console.log(`Received task ${incomingMessage.message_id}`);
  
  let ltmData;
  let taskSignature;

  try {
    // --- SMART LTM CHECK ---
    ltmData = await readLTM();
    taskSignature = await generateTaskSignature(taskData); 
    
    console.log(`[LTM] Signature: ${taskSignature}`);
    const cachedResult = findInLTM(taskSignature, ltmData);

    if (cachedResult) {
      console.log("[LTM HIT] Returning cached response.");
      return res.status(200).json(createSuccessResponseFromCache(incomingMessage.message_id, cachedResult));
    }

    console.log("[LTM MISS] Processing fresh...");
    
    // --- EXECUTION FLOW ---
    const { language, git_repo_url, search_patterns, zip_file_base64, code_files_base64, existing_documentation } = taskData;
    let filesToProcess = [];
    let documentation;
    let tempFilePaths = [];

    let patterns = search_patterns || {
        javascript: ["**/routes/**", "**/api/**", "server.js", "index.js", "app.js"],
        typescript: ["**/routes/**", "**/api/**", "**/controller/**", "server.ts", "index.ts", "app.ts"],
        python: ["**/api/**", "**/routes/**", "app.py", "main.py", "views.py"],
        java: ["**/src/**/controller/**", "**/src/**/api/**"],
        csharp: ["**/Controllers/**", "**/api/**"],
        go: ["**/handlers/**", "**/api/**", "main.go"],
        ruby: ["**/app/controllers/**", "config/routes.rb"],
        php: ["**/app/Http/Controllers/**", "routes/api.php"],
        cpp: ["**/routes/**", "main.cpp"],
        c: ["**/routes/**", "main.c"]
    }[language] || ["**/"];

    if (zip_file_base64) {
      console.log(`Mode: ZIP`);
      const zipFilePath = await saveBase64File(zip_file_base64, 'zip');
      tempFilePaths.push(zipFilePath);
      filesToProcess = await extractFilesFromZip(zipFilePath, patterns);
    }
    else if (git_repo_url) {
      console.log(`Mode: GIT (${git_repo_url})`);
      filesToProcess = await cloneRepoAndGetFiles(git_repo_url, patterns);
    }
    else if (code_files_base64) {
      console.log(`Mode: FILES (${code_files_base64.length})`);
      for (const file of code_files_base64) {
        filesToProcess.push({
          file_path: file.file_path,
          code_snippet: Buffer.from(file.content_base64, 'base64').toString('utf-8')
        });
      }
    }
    
    const detectedLanguage = await detectLanguage(language, filesToProcess);

    if (filesToProcess.length === 0) {
      return res.status(200).json(createSuccessResponse(incomingMessage.message_id, "No files found.", {}, {}, 0));
    }

    documentation = (existing_documentation && typeof existing_documentation === 'object') 
        ? existing_documentation 
        : { openapi: '3.0.0', info: { title: 'API Docs', version: '1.0.0' }, paths: {} };
    if (!documentation.paths) documentation.paths = {};

    // --- AGENT LOOP & RATE LIMITING ---
    let totalEndpointsFound = 0;
    let file_by_file_results = [];
    const GEMINI_RPM_LIMIT = 10; 
    const ONE_MINUTE_MS = 60000;
    
    console.log(`Starting analysis of ${filesToProcess.length} files...`);

    for (let i = 0; i < filesToProcess.length; i += GEMINI_RPM_LIMIT) {
        const batch = filesToProcess.slice(i, i + GEMINI_RPM_LIMIT);
        
        const batchPromises = batch.map(file => {
            if (!file.code_snippet || file.code_snippet.trim() === "") return Promise.resolve(null);
            return callGeminiAPI(file.code_snippet, detectedLanguage)
                .then(aiResponse => ({ file, aiResponse, status: 'success' }))
                .catch(err => { 
                    console.error(`Error ${file.file_path}: ${err.message}`);
                    return Promise.resolve({ file, aiResponse: null, status: 'error', error: err.message });
                });
        });

        const batchResults = await Promise.all(batchPromises);

        for (const result of batchResults) {
            if (!result || result.status === 'error' || !result.aiResponse) {
                file_by_file_results.push({ file_path: result?.file?.file_path || "Unknown", endpoints_found: 0, documentation: [] });
                continue;
            }
            const { file, aiResponse } = result;
            const endpoints = aiResponse.endpoints || [];
            
            file_by_file_results.push({
                file_path: file.file_path,
                language_detected: detectedLanguage,
                endpoints_found: endpoints.length,
                documentation: endpoints
            });

            for (const endpoint of endpoints) {
                const { path: apiPath, method } = endpoint;
                if (!apiPath || !method) continue;
                const openApiEndpoint = buildOpenApiEndpoint(endpoint);
                if (!documentation.paths[apiPath]) documentation.paths[apiPath] = {};
                documentation.paths[apiPath][method.toLowerCase()] = openApiEndpoint;
            }
            totalEndpointsFound += endpoints.length;
        }

        if ((i + GEMINI_RPM_LIMIT) < filesToProcess.length) {
            console.log(`Batch done. Waiting 60s for rate limit...`);
            await new Promise(resolve => setTimeout(resolve, ONE_MINUTE_MS));
        }
    }

    // --- SAVE & RESPOND ---
    const successResponse = createSuccessResponse(
      incomingMessage.message_id,
      `Processed ${totalEndpointsFound} endpoints.`,
      documentation,
      file_by_file_results,
      totalEndpointsFound
    );
    
    await saveToLTM(taskSignature, successResponse["results/task"], ltmData);
    res.status(200).json(successResponse);

  } catch (error) {
    console.error("Fatal Error:", error);
    res.status(500).json(createErrorResponse(incomingMessage.message_id, "Internal Error", error.message));
  }
});

// --- HELPERS ---

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
      ltm_hit: false
    },
    timestamp: new Date().toISOString()
  };
}

function createSuccessResponseFromCache(relatedId, cachedTaskResult) {
  const safeResult = cachedTaskResult && typeof cachedTaskResult === 'object'
    ? cachedTaskResult
    : { status_message: "Cached result unavailable", endpoints_found: 0 };

  return {
    message_id: `doc-agent-${uuidv4()}`,
    sender: "documentation_generator_agent",
    recipient: "supervisor",
    type: "task_response",
    related_message_id: relatedId,
    status: "completed",
    "results/task": {
      ...safeResult,
      status_message: `[LTM HIT] ${safeResult.status_message}`,
      ltm_hit: true
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
    "results/task": { status_message: message, error_details: error },
    timestamp: new Date().toISOString()
  };
}

async function saveBase64File(base64String, extension) {
  const tempDir = os.tmpdir();
  const tempFilePath = path.join(tempDir, `${uuidv4()}.${extension}`);
  await fs.writeFile(tempFilePath, Buffer.from(base64String, 'base64'));
  return tempFilePath;
}

async function detectLanguage(language, filesToProcess) {
  if (language && language.trim() !== "") return language;
  if (!filesToProcess || filesToProcess.length === 0) return 'javascript';
  const ext = path.extname(filesToProcess[0].file_path).toLowerCase();
  const map = {'.js':'javascript','.py':'python','.java':'java','.go':'go','.rb':'ruby','.php':'php','.cpp':'cpp','.c':'c','.cs':'csharp','.ts':'typescript'};
  if (map[ext]) return map[ext];

  const codeSnippet = filesToProcess[0].code_snippet;
  if (!GEMINI_API_KEY) throw new Error("GEMINI_API_KEY missing");
  const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${GEMINI_API_KEY}`;
  const payload = { contents: [{ parts: [{ text: `Identify language:\n\n${codeSnippet.substring(0, 1000)}` }] }] };
  const apiResponse = await fetch(apiUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
  if (!apiResponse.ok) return 'javascript';
  const result = await apiResponse.json();
  return result.candidates?.[0]?.content?.parts?.[0]?.text.trim().toLowerCase() || 'javascript';
}

async function extractFilesFromZip(zipFilePath, searchPatterns) {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'zip-extract-'));
  try {
    const zip = new AdmZip(zipFilePath);
    zip.extractAllTo(tempDir, true);
    return await findCodeFiles(tempDir, searchPatterns); 
  } finally { await fs.rm(tempDir, { recursive: true, force: true }).catch(()=>{}); }
}

async function cloneRepoAndGetFiles(repoUrl, searchPatterns) {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'git-repo-'));
  try {
    await simpleGit().clone(repoUrl, tempDir, ['--depth=1']);
    return await findCodeFiles(tempDir, searchPatterns);
  } finally { await fs.rm(tempDir, { recursive: true, force: true }).catch(()=>{}); }
}

async function findCodeFiles(baseDir, searchPatterns) {
  const defaultFileTypes = ['*.js', '*.ts', '*.py', '*.java', '*.go', '*.rb', '*.php', '*.cpp', '*.c', '*.cs'];
  const globPatterns = [];
  const patternsToUse = searchPatterns || ['**/'];
  for (const pattern of patternsToUse) {
    for (const type of defaultFileTypes) globPatterns.push(path.join(baseDir, pattern, type).replace(/\\/g, '/'));
  }
  const uniqueFiles = new Set();
  (await glob(globPatterns, { nodir: true, dot: false, ignore: '**/node_modules/**' })).forEach(f => uniqueFiles.add(f));
  const fileContents = [];
  for (const filePath of uniqueFiles) {
    try { fileContents.push({ file_path: path.relative(baseDir, filePath), code_snippet: await fs.readFile(filePath, 'utf-8') }); } catch (e) {}
  }
  return fileContents;
}

async function callGeminiAPI(codeSnippet, language) {
  if (!GEMINI_API_KEY) throw new Error("GEMINI_API_KEY missing");
  const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${GEMINI_API_KEY}`;
  const systemPrompt = `Expert API Architect. Find endpoints. Return JSON: { "endpoints": [ { "path", "method", "summary", "description", "requestBodySchema" (string), "successResponseSchema" (string), "errorResponses" } ] }. If none, {"endpoints": []}`;
  const payload = {
    contents: [{ parts: [{ text: `Lang: ${language}\nCode:\n${codeSnippet}` }] }],
    systemInstruction: { parts: [{ text: systemPrompt }] },
    generationConfig: { responseMimeType: "application/json" }
  };
  const apiResponse = await fetch(apiUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
  if (!apiResponse.ok) throw new Error(`Gemini: ${apiResponse.status}`);
  return JSON.parse((await apiResponse.json()).candidates[0].content.parts[0].text);
}


function buildOpenApiEndpoint(endpoint) {
  const { path: apiPath, method, summary, description, tags, requestBodySchema, successResponseSchema, errorResponses } = endpoint;
  const openApiEndpoint = { summary: summary || "No summary", description: description || "No description", tags: tags || [apiPath.split('/')[1] || 'default'], responses: {} };
  let reqSchema = null, resSchema = null;
  try { if(requestBodySchema) reqSchema = JSON.parse(requestBodySchema); } catch(e){}
  try { if(successResponseSchema) resSchema = JSON.parse(successResponseSchema); } catch(e){}

  if (reqSchema) openApiEndpoint.requestBody = { description: "Body", required: true, content: { "application/json": { schema: reqSchema } } };
  openApiEndpoint.responses[method.toLowerCase() === 'post' ? '201' : '200'] = { description: "Success", content: { "application/json": { schema: resSchema || { type: "object" } } } };

  //  DEFENSIVE CODING : Check if it's actually an array 
  if (Array.isArray(errorResponses)) {
      errorResponses.forEach(err => { 
          if(err.code) openApiEndpoint.responses[err.code] = { description: err.description }; 
      });
  }
  return openApiEndpoint;
}

app.listen(port, () => {
  console.log(`Agent (Smart Git LTM) listening on port ${port}`);
  console.log(`LTM Path: ${LTM_FILE_PATH}`);
});