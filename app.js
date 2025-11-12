// /*
//   =============================================================
//   == DOCUMENTATION GENERATOR AGENT (PERFECTED)
//   =============================================================
//   This is the core of the AI agent, upgraded for cloud deployment
//   and enhanced "Project Analyst" capabilities.

//   It can:
//   1. Read the GEMINI_API_KEY from environment variables (for Render).
//   2. Analyze a list of 'changed_files' (Original logic).
//   3. Analyze a full 'git_repo_url' by cloning it, finding all
//      code files, and analyzing them one by one (New logic).
// */

// const express = require('express');
// const fetch = require('node-fetch'); // For calling Gemini API
// const { simpleGit } = require('simple-git'); // For cloning repos
// const { glob } = require('glob'); // For finding files
// const fs = require('fs').promises; // For reading file contents
// const path = require('path'); // For handling file paths
// const os = require('os'); // For creating temp directories
// const app = express();
// const port = process.env.PORT || 3000; // Use port from environment or default to 3000

// // =============================================================
// // == ⭐️ (CRITICAL UPDATE) API KEY CONFIGURATION ⭐️
// // =============================================================
// // This now reads the API key from the environment variables
// // (like on Render.com) for security and deployability.
// const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";
// // =============================================================


// // Middleware to parse JSON bodies from the Supervisor
// app.use(express.json({ limit: '50mb' })); // Increased limit for full repos

// /*
//   =============================================================
//   == (NEW!) "PROJECT ANALYST" HELPER FUNCTION
//   =============================================================
//   This function clones a Git repo, finds all code files,
//   and returns their content in the same format as 'changed_files'.
// */
// async function cloneRepoAndGetAllFiles(repoUrl) {
//   // 1. Create a unique temporary directory
//   const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'git-repo-'));
//   console.log(`[Project Analyst] Cloning ${repoUrl} into ${tempDir}...`);
  
//   try {
//     // 2. Clone the repo (shallow clone for speed)
//     const git = simpleGit();
//     await git.clone(repoUrl, tempDir, ['--depth=1']);
//     console.log("[Project Analyst] Repo cloned successfully.");

//     // 3. Define file patterns to search for (add/remove as needed)
//     const filePatterns = [
//       '**/*.js', '**/*.py', '**/*.go', '**/*.java',
//       '**/*.ts', '**/*.rb', '**/*.php', '**/*.cs'
//     ];
    
//     // Glob needs forward slashes, even on Windows
//     const globPatterns = filePatterns.map(pattern => path.join(tempDir, pattern).replace(/\\/g, '/'));
    
//     // 4. Find all matching files, ignoring node_modules
//     const files = await glob(globPatterns, { 
//       nodir: true, 
//       dot: false, 
//       ignore: '**/node_modules/**' 
//     });
    
//     console.log(`[Project Analyst] Found ${files.length} code files.`);

//     // 5. Read the content of each file
//     const fileContents = [];
//     for (const filePath of files) {
//       try {
//         const content = await fs.readFile(filePath, 'utf-8');
//         const relativePath = path.relative(tempDir, filePath); // Get path relative to repo root
//         fileContents.push({
//           file_path: relativePath,
//           code_snippet: content
//         });
//       } catch (readError) {
//         console.warn(`[Project Analyst] Could not read file ${filePath}: ${readError.message}`);
//       }
//     }

//     // 6. Clean up the temp directory
//     await fs.rm(tempDir, { recursive: true, force: true });
//     console.log(`[Project Analyst] Cleaned up temp directory: ${tempDir}`);
    
//     return fileContents; // This array mimics the 'changed_files' structure

//   } catch (error) {
//     console.error(`[Project Analyst] Failed to clone or process repo: ${error.message}`);
//     // Attempt to clean up even on failure
//     try {
//       await fs.rm(tempDir, { recursive: true, force: true });
//     } catch (cleanupError) {
//       console.error(`[Project Analyst] Failed to cleanup temp dir ${tempDir}: ${cleanupError.message}`);
//     }
//     throw new Error(`Failed to process git repo: ${error.message}`);
//   }
// }


// /*
//   =============================================================
//   == AI HELPER FUNCTION (Language Agnostic)
//   =============================================================
//   This function calls the Gemini API to analyze an *entire file*
//   and return *all* endpoints found within it.
// */
// async function callGeminiAPI(codeSnippet, language) {
  
//   // (CRITICAL UPDATE) Check for API key
//   if (!GEMINI_API_KEY) {
//     console.error("GEMINI_API_KEY is missing. Set it as an environment variable.");
//     throw new Error("GEMINI_API_KEY is not configured on the server.");
//   }

//   const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${GEMINI_API_KEY}`;

//   // System instruction
//   const systemPrompt = `You are an expert software engineer and API documentation writer. 
// Your task is to analyze a *complete* source code file, find *all* API endpoint definitions within it, 
// and generate a *JSON array* where each object is a single endpoint.
// Return ONLY the JSON object as requested in the schema.`;

//   // User query
//   const userQuery = `Here is the complete source code file. The language is: ${language}
// ---
// ${codeSnippet}
// ---
// Please find all API endpoints in this file. For each endpoint, generate an object with its
// path, method, summary, description, and tags. Return a JSON object containing a single key 
// 'endpoints', which is an array of these objects.`;

//   // The JSON schema we want the AI to return
//   const responseSchema = {
//     type: "OBJECT",
//     properties: {
//       "endpoints": {
//         type: "ARRAY",
//         description: "An array of all API endpoint objects found in the code.",
//         items: {
//           type: "OBJECT",
//           properties: {
//             "path": { 
//               type: "STRING",
//               description: "The full API path (e.g., /api/v1/users/:id)"
//             },
//             "method": {
//               type: "STRING",
//               description: "The HTTP method in lowercase (e.g., get, post, put, delete)"
//             },
//             "summary": {
//               type: "STRING",
//               description: "A concise, one-sentence summary of what the endpoint does."
//             },
//             "description": {
//               type: "STRING",
//               description: "A detailed, one-paragraph description of the endpoint's behavior."
//             },
//             "tags": { 
//               type: "ARRAY",
//               items: { "type": "STRING" }
//             }
//           },
//           required: ["path", "method", "summary"]
//         }
//       }
//     },
//     required: ["endpoints"]
//   };

//   const payload = {
//     contents: [{ parts: [{ text: userQuery }] }],
//     systemInstruction: {
//       parts: [{ text: systemPrompt }]
//     },
//     generationConfig: {
//       responseMimeType: "application/json",
//       responseSchema: responseSchema
//     }
//   };

//   try {
//     const apiResponse = await fetch(apiUrl, {
//       method: 'POST',
//       headers: { 'Content-Type': 'application/json' },
//       body: JSON.stringify(payload)
//     });

//     if (!apiResponse.ok) {
//       const errorBody = await apiResponse.text();
//       console.error(`Gemini API Error: ${apiResponse.status} ${errorBody}`);
//       throw new Error(`Gemini API call failed with status: ${apiResponse.status}`);
//     }

//     const result = await apiResponse.json();
//     const aiText = result.candidates?.[0]?.content?.parts?.[0]?.text;

//     if (!aiText) {
//       console.error("Gemini API Error: No text returned in response.", result);
//       throw new Error("No text returned from AI.");
//     }
    
//     // The AI returns a JSON *string*, so we parse it.
//     // The response will look like: { "endpoints": [ ... ] }
//     return JSON.parse(aiText);

//   } catch (error) {
//     console.error("Error in callGeminiAPI:", error);
//     throw error; // Propagate the error up
//   }
// }


// /*
//   =============================================================
//   == 1. HEALTH CHECK ENDPOINT (Required)
//   =============================================================
// */
// app.get('/health', (req, res) => {
//   console.log("Health check requested by Supervisor.");
//   res.status(200).json({
//     status: "I'm up and ready",
//     agent_name: "Documentation Generator Agent (Perfected)"
//   });
// });

// /*
//   =============================================================
//   == 2. EXECUTE TASK ENDPOINT (PERFECTED)
//   =============================================================
//   This endpoint is now a "super-agent" that can handle
//   EITHER a 'changed_files' list OR a 'git_repo_url'.
// */
// app.post('/execute', async (req, res) => {
//   console.log("Received a new task from the Supervisor...");

//   // --- 1. Read the Handshake (Input) ---
//   const { task, language, existing_documentation, changed_files, git_repo_url } = req.body;

//   // Basic validation
//   if (task !== 'update_documentation' || !language) {
//     console.error("Invalid request: Missing 'task' or 'language'.", req.body);
//     return res.status(400).json({
//       status: "error",
//       message: "Invalid request. Missing 'task' or 'language'."
//     });
//   }

//   // (NEW) Super-agent validation: Must have one or the other
//   if (!changed_files && !git_repo_url) {
//     console.error("Invalid request: Missing 'changed_files' or 'git_repo_url'.", req.body);
//     return res.status(400).json({
//       status: "error",
//       message: "Invalid request. Must provide 'changed_files' or 'git_repo_url'."
//     });
//   }

//   // --- 2. Perform Agentic Work (The "AI" part) ---
//   console.log(`Task: ${task} for language: ${language}`);
  
//   let filesToProcess = [];
//   let documentation; // This will hold our "memory"

//   try {
//     // --- (NEW!) "Project Analyst" Logic ---
//     if (git_repo_url) {
//       console.log(`Mode: PROJECT. Analyzing full repository: ${git_repo_url}`);
//       filesToProcess = await cloneRepoAndGetAllFiles(git_repo_url);
//     } 
//     // --- "File Analyst" Logic (Original) ---
//     else {
//       console.log(`Mode: FILES. Analyzing ${changed_files.length} changed file(s).`);
//       filesToProcess = changed_files;
//     }
    
//     if (filesToProcess.length === 0) {
//       console.log("No files found to process. Sending success response.");
//       return res.status(200).json({
//         status: "success",
//         message: "No code files were found to process.",
//         updated_documentation: existing_documentation || {} 
//       });
//     }

//     // ADAPTIVE BEHAVIOR (Memory Initialization)
//     if (existing_documentation) {
//       console.log("Loading existing documentation into memory.");
//       documentation = { ...existing_documentation }; 
//       if (!documentation.paths) documentation.paths = {};
//     } else {
//       console.log("No existing documentation. Creating from scratch.");
//       documentation = {
//         openapi: '3.0.0',
//         info: {
//           title: 'New API Documentation',
//           version: '1.0.0',
//           description: `Generated from scratch by Documentation Generator Agent (Perfected)`
//         },
//         paths: {}
//       };
//     }

//     // --- THE AGENTIC LOOP (Works for both modes) ---
//     let totalEndpointsFound = 0;
    
//     for (const file of filesToProcess) {
//       const codeSnippet = file.code_snippet;
//       console.log(`Analyzing file: ${file.file_path}...`);
      
//       // We make ONE call per file for the AI to find and document
//       // *all* endpoints within it.
//       const aiResponse = await callGeminiAPI(codeSnippet, language);
      
//       const endpoints = aiResponse.endpoints;

//       if (!endpoints || endpoints.length === 0) {
//         console.log(`No endpoints returned from AI for file: ${file.file_path}`);
//         continue;
//       }

//       // "Memory Update" - Merge AI findings into our main object
//       for (const endpoint of endpoints) {
//         const { path, method, ...openapiSnippet } = endpoint;
        
//         if (!path || !method) {
//             console.warn(`  -> Skipping endpoint with missing path or method in ${file.file_path}`);
//             continue;
//         }
        
//         const lcMethod = method.toLowerCase();

//         if (!documentation.paths[path]) {
//           documentation.paths[path] = {};
//         }
        
//         documentation.paths[path][lcMethod] = {
//           ...documentation.paths[path][lcMethod], // Keep old data
//           ...openapiSnippet                     // Overwrite with new AI-generated data
//         };
        
//         console.log(`  -> Successfully merged path: ${lcMethod.toUpperCase()} ${path}`);
//       }
      
//       const endpointCount = endpoints.length;
//       totalEndpointsFound += endpointCount;
//       console.log(`Successfully parsed and merged ${endpointCount} endpoints from ${file.file_path}.`);
//     }

//     // --- 3. Send Response (Output) ---
//     console.log("All tasks complete. Sending response to Supervisor.");
//     res.status(200).json({
//       status: "success",
//       message: `Documentation successfully processed for ${totalEndpointsFound} endpoint(s).`,
//       updated_documentation: documentation // Send the full, updated object
//     });

//   } catch (error) {
//     // Handle errors during the main loop (e.g., Git clone failed, AI call failed)
//     console.error("An error occurred during the agentic loop:", error);
//     res.status(500).json({
//       status: "error",
//       message: "An error occurred while processing the task.",
//       error: error.message,
//       updated_documentation: documentation // Send back what we have so far
//     });
//   }
// });


// // Start the server
// app.listen(port, () => {
//   console.log(`=================================================`);
//   console.log(`   Documentation Generator Agent (PERFECTED)`);
//   console.log(`   Listening on http://localhost:${port}`);
//   console.log(`=================================================`);
//   console.log(`Ready to receive tasks from the Supervisor...`);
//   console.log(`\nTest with:`);
//   console.log(`  Health Check: curl http://localhost:${port}/health`);
//   console.log(`  Execute Task: (Use Postman or curl with a JSON file)`);
// });




/*
  =============================================================
  == DOCUMENTATION GENERATOR AGENT (PERFECTED)
  =============================================================
  This is the core of the AI agent, upgraded for cloud deployment
  and enhanced "Project Analyst" capabilities.
*/

const express = require('express');
const fetch = require('node-fetch'); // For calling Gemini API
const { simpleGit } = require('simple-git'); // For cloning repos
const { glob } = require('glob'); // For finding files
const fs = require('fs').promises; // For reading file contents (Promise API)
const path = require('path'); // For handling file paths
const os = require('os'); // For creating temp directories
require('dotenv').config();

const app = express();
const port = process.env.PORT || 3000; // Use port from environment or default to 3000

// =============================================================
// == ⭐️ (CRITICAL UPDATE) API KEY CONFIGURATION ⭐️
// =============================================================
// This now reads the API key from the environment variables (like on Render.com)
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";
// =============================================================


// Middleware to parse JSON bodies from the Supervisor
app.use(express.json({ limit: '50mb' })); // Increased limit for full repos

/*
  =============================================================
  == (NEW!) "PROJECT ANALYST" HELPER FUNCTION
  =============================================================
  This function clones a Git repo, finds all code files,
  and returns their content in the same format as 'changed_files'.
*/
async function cloneRepoAndGetAllFiles(repoUrl) {
  // 1. Create a unique temporary directory
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'git-repo-'));
  console.log(`[Project Analyst] Cloning ${repoUrl} into ${tempDir}...`);
  
  try {
    // 2. Clone the repo (shallow clone for speed)
    const git = simpleGit();
    await git.clone(repoUrl, tempDir, ['--depth=1']);
    console.log("[Project Analyst] Repo cloned successfully.");

    // 3. Define file patterns to search for (add/remove as needed)
    const filePatterns = [
      '**/*.js', '**/*.py', '**/*.go', '**/*.java',
      '**/*.ts', '**/*.rb', '**/*.php', '**/*.cs'
    ];
    
    // Glob needs forward slashes, even on Windows
    const globPatterns = filePatterns.map(pattern => path.join(tempDir, pattern).replace(/\\/g, '/'));
    
    // 4. Find all matching files, ignoring node_modules
    const files = await glob(globPatterns, { 
      nodir: true, 
      dot: false, 
      ignore: '**/node_modules/**' 
    });
    
    console.log(`[Project Analyst] Found ${files.length} code files.`);

    // 5. Read the content of each file
    const fileContents = [];
    for (const filePath of files) {
      try {
        const content = await fs.readFile(filePath, 'utf-8');
        const relativePath = path.relative(tempDir, filePath); // Get path relative to repo root
        fileContents.push({
          file_path: relativePath,
          code_snippet: content
        });
      } catch (readError) {
        console.warn(`[Project Analyst] Could not read file ${filePath}: ${readError.message}`);
      }
    }

    // 6. Clean up the temp directory
    await fs.rm(tempDir, { recursive: true, force: true });
    console.log(`[Project Analyst] Cleaned up temp directory: ${tempDir}`);
    
    return fileContents; // This array mimics the 'changed_files' structure

  } catch (error) {
    console.error(`[Project Analyst] Failed to clone or process repo: ${error.message}`);
    // Attempt to clean up even on failure
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch (cleanupError) {
      console.error(`[Project Analyst] Failed to cleanup temp dir ${tempDir}: ${cleanupError.message}`);
    }
    throw new Error(`Failed to process git repo: ${error.message}`);
  }
}


/*
  =============================================================
  == AI HELPER FUNCTION (Language Agnostic)
  =============================================================
*/
async function callGeminiAPI(codeSnippet, language) {
  
  // (CRITICAL UPDATE) Check for API key
  if (!GEMINI_API_KEY) {
    console.error("GEMINI_API_KEY is missing. Set it as an environment variable.");
    throw new Error("GEMINI_API_KEY is not configured on the server.");
  }

  const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${GEMINI_API_KEY}`;

  // System instruction
  const systemPrompt = `You are an expert software engineer and API documentation writer. 
Your task is to analyze a *complete* source code file, find *all* API endpoint definitions within it, 
and generate a *JSON array* where each object is a single endpoint.
Return ONLY the JSON object as requested in the schema.`;

  // User query
  const userQuery = `Here is the complete source code file. The language is: ${language}
---
${codeSnippet}
---
Please find all API endpoints in this file. For each endpoint, generate an object with its
path, method, summary, description, and tags. Return a JSON object containing a single key 
'endpoints', which is an array of these objects.`;

  // The JSON schema we want the AI to return
  const responseSchema = {
    type: "OBJECT",
    properties: {
      "endpoints": {
        type: "ARRAY",
        description: "An array of all API endpoint objects found in the code.",
        items: {
          type: "OBJECT",
          properties: {
            "path": { 
              type: "STRING",
              description: "The full API path (e.g., /api/v1/users/:id)"
            },
            "method": {
              type: "STRING",
              description: "The HTTP method in lowercase (e.g., get, post, put, delete)"
            },
            "summary": {
              type: "STRING",
              description: "A concise, one-sentence summary of what the endpoint does."
            },
            "description": {
              type: "STRING",
              description: "A detailed, one-paragraph description of the endpoint's behavior."
            },
            "tags": { 
              type: "ARRAY",
              items: { "type": "STRING" }
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
    systemInstruction: {
      parts: [{ text: systemPrompt }]
    },
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: responseSchema
    }
  };

  try {
    const apiResponse = await fetch(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

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
    
    // The AI returns a JSON *string*, so we parse it.
    // The response will look like: { "endpoints": [ ... ] }
    return JSON.parse(aiText);

  } catch (error) {
    console.error("Error in callGeminiAPI:", error);
    throw error; // Propagate the error up
  }
}


/*
  =============================================================
  == 1. HEALTH CHECK ENDPOINT (Required)
  =============================================================
*/
app.get('/health', (req, res) => {
  console.log("Health check requested by Supervisor.");
  res.status(200).json({
    status: "I'm up and ready",
    agent_name: "Documentation Generator Agent (Perfected)"
  });
});

/*
  =============================================================
  == 2. EXECUTE TASK ENDPOINT (PERFECTED)
  =============================================================
  This endpoint is now a "super-agent" that can handle
  EITHER a 'changed_files' list OR a 'git_repo_url'.
*/
app.post('/execute', async (req, res) => {
  console.log("Received a new task from the Supervisor...");

  // --- 1. Read the Handshake (Input) ---
  const { task, language, existing_documentation, changed_files, git_repo_url } = req.body;

  // Basic validation
  if (task !== 'update_documentation' || !language) {
    console.error("Invalid request: Missing 'task' or 'language'.", req.body);
    return res.status(400).json({
      status: "error",
      message: "Invalid request. Missing 'task' or 'language'."
    });
  }

  // (NEW) Super-agent validation: Must have one or the other
  if (!changed_files && !git_repo_url) {
    console.error("Invalid request: Missing 'changed_files' or 'git_repo_url'.", req.body);
    return res.status(400).json({
      status: "error",
      message: "Invalid request. Must provide 'changed_files' or 'git_repo_url'."
    });
  }

  // --- 2. Perform Agentic Work (The "AI" part) ---
  console.log(`Task: ${task} for language: ${language}`);
  
  let filesToProcess = [];
  let documentation; // This will hold our "memory"

  try {
    // --- (NEW!) "Project Analyst" Logic ---
    if (git_repo_url) {
      console.log(`Mode: PROJECT. Analyzing full repository: ${git_repo_url}`);
      filesToProcess = await cloneRepoAndGetAllFiles(git_repo_url);
    } 
    // --- "File Analyst" Logic (Original) ---
    else {
      console.log(`Mode: FILES. Analyzing ${changed_files.length} changed file(s).`);
      filesToProcess = changed_files;
    }
    
    if (filesToProcess.length === 0) {
      console.log("No files found to process. Sending success response.");
      return res.status(200).json({
        status: "success",
        message: "No code files were found to process.",
        updated_documentation: existing_documentation || {} 
      });
    }

    // ADAPTIVE BEHAVIOR (Memory Initialization)
    if (existing_documentation) {
      console.log("Loading existing documentation into memory.");
      documentation = { ...existing_documentation }; 
      if (!documentation.paths) documentation.paths = {};
    } else {
      console.log("No existing documentation. Creating from scratch.");
      documentation = {
        openapi: '3.0.0',
        info: {
          title: 'New API Documentation',
          version: '1.0.0',
          description: `Generated from scratch by Documentation Generator Agent (Perfected)`
        },
        paths: {}
      };
    }

    // --- THE AGENTIC LOOP (Works for both modes) ---
    let totalEndpointsFound = 0;
    
    for (const file of filesToProcess) {
      const codeSnippet = file.code_snippet;
      console.log(`Analyzing file: ${file.file_path}...`);
      
      // We make ONE call per file for the AI to find and document
      // *all* endpoints within it.
      const aiResponse = await callGeminiAPI(codeSnippet, language);
      
      const endpoints = aiResponse.endpoints;

      if (!endpoints || endpoints.length === 0) {
        console.log(`No endpoints returned from AI for file: ${file.file_path}`);
        continue;
      }

      // "Memory Update" - Merge AI findings into our main object
      for (const endpoint of endpoints) {
        const { path, method, ...openapiSnippet } = endpoint;
        
        if (!path || !method) {
            console.warn(`  -> Skipping endpoint with missing path or method in ${file.file_path}`);
            continue;
        }
        
        const lcMethod = method.toLowerCase();

        if (!documentation.paths[path]) {
          documentation.paths[path] = {};
        }
        
        documentation.paths[path][lcMethod] = {
          ...documentation.paths[path][lcMethod], // Keep old data
          ...openapiSnippet                     // Overwrite with new AI-generated data
        };
        
        console.log(`  -> Successfully merged path: ${lcMethod.toUpperCase()} ${path}`);
      }
      
      const endpointCount = endpoints.length;
      totalEndpointsFound += endpointCount;
      console.log(`Successfully parsed and merged ${endpointCount} endpoints from ${file.file_path}.`);
    }

    // --- 3. Send Response (Output) ---
    console.log("All tasks complete. Sending response to Supervisor.");
    res.status(200).json({
      status: "success",
      message: `Documentation successfully processed for ${totalEndpointsFound} endpoint(s).`,
      updated_documentation: documentation // Send the full, updated object
    });

  } catch (error) {
    // Handle errors during the main loop (e.g., Git clone failed, AI call failed)
    console.error("An error occurred during the agentic loop:", error);
    res.status(500).json({
      status: "error",
      message: "An error occurred while processing the task.",
      error: error.message,
      updated_documentation: documentation // Send back what we have so far
    });
  }
});


// Start the server
app.listen(port, () => {
  console.log(`=================================================`);
  console.log(`   Documentation Generator Agent (PERFECTED)`);
  console.log(`   Listening on http://localhost:${port}`);
  console.log(`=================================================`);
  console.log(`Ready to receive tasks from the Supervisor...`);
  console.log(`\nTest with:`);
  console.log(`  Health Check: curl http://localhost:${port}/health`);
  console.log(`  Execute Task: (Use Postman or curl with a JSON file)`);
});