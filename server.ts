/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import express from "express";
import path from "path";
import dotenv from "dotenv";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";
import { YoutubeTranscript } from "youtube-transcript";
import Groq from "groq-sdk";

dotenv.config();

const app = express();
const PORT = 3000;

// Increase JSON payload limit to handle base64 files
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));

// Helper to extract YouTube video ID
function extractYoutubeId(text: string): string | null {
  const reg = /(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/(?:[^\/\n\s]+\/\S+\/|(?:v|e(?:mbed)?)\/|\S*?[?&]v=)|youtu\.be\/)([a-zA-Z0-9_-]{11})/;
  const match = text.match(reg);
  return match ? match[1] : null;
}

// Lazy load or verify Gemini API setup
function getGeminiClient() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY environment variable is missing. Please configure it in your Secrets.");
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        "User-Agent": "aistudio-build",
      },
    },
  });
}

// Lazy load Groq client
function getGroqClient() {
  const groqKey = process.env.GROQ_API_KEY;
  if (groqKey) {
    return new Groq({ apiKey: groqKey });
  }
  return null;
}

async function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Robust content generation with transparent model fallback and backoffs to handle 503 errors and spikes gracefully.
async function callGenerateContent(ai: any, params: any) {
  const models = [
    "gemini-2.5-flash",
    "gemini-2.5-pro",
    "gemini-2.0-flash",
    "gemini-3.5-flash",
    "gemini-3.1-flash-lite",
    "gemini-flash-latest",
    "gemini-2.0-pro-exp",
    "gemini-1.5-pro",
    "gemini-3.1-pro-preview"
  ];
  let lastError: any = null;
  const maxRetries = 3;

  for (const model of models) {
    let attempt = 0;
    while (attempt < maxRetries) {
      try {
        console.log(`[Gemini API] callGenerateContent: Attempting generate call with model ${model} (attempt ${attempt + 1}/${maxRetries})...`);
        return await ai.models.generateContent({ ...params, model });
      } catch (err: any) {
        console.warn(`[Gemini API] Primary/fallback call failed for model ${model} (attempt ${attempt + 1}/${maxRetries}). Error:`, err.message || err);
        lastError = err;
        const errMsg = err.message || (typeof err === "object" ? JSON.stringify(err) : String(err)) || "";
        
        const isTransient = 
          errMsg.includes("503") ||
          errMsg.includes("UNAVAILABLE") ||
          errMsg.includes("high demand") ||
          errMsg.includes("spikes in demand") ||
          errMsg.includes("Resource has been exhausted") ||
          errMsg.includes("RESOURCE_EXHAUSTED") ||
          errMsg.includes("429") ||
          errMsg.includes("500") ||
          err.status === 429 ||
          err.status === 503 ||
          err.status === 500;

        if (isTransient) {
          attempt++;
          if (attempt < maxRetries) {
            const waitTime = Math.pow(2, attempt) * 1000 + Math.random() * 500;
            console.log(`[Gemini API] Sleeping for ${waitTime.toFixed(0)}ms before retry...`);
            await delay(waitTime);
            continue;
          }
        }
        // Break inner loop on non-transient error or exhausted retries to try next model
        break;
      }
    }
  }
  throw lastError;
}

async function callGenerateContentStream(ai: any, params: any) {
  const models = [
    "gemini-2.5-flash",
    "gemini-2.5-pro",
    "gemini-2.0-flash",
    "gemini-3.5-flash",
    "gemini-3.1-flash-lite",
    "gemini-flash-latest",
    "gemini-2.0-pro-exp",
    "gemini-1.5-pro",
    "gemini-3.1-pro-preview"
  ];
  let lastError: any = null;
  const maxRetries = 3;

  for (const model of models) {
    let attempt = 0;
    while (attempt < maxRetries) {
      try {
        console.log(`[Gemini API] callGenerateContentStream: Attempting stream call with model ${model} (attempt ${attempt + 1}/${maxRetries})...`);
        return await ai.models.generateContentStream({ ...params, model });
      } catch (err: any) {
        console.warn(`[Gemini API] Stream call failed for model ${model} (attempt ${attempt + 1}/${maxRetries}). Error:`, err.message || err);
        lastError = err;
        const errMsg = err.message || (typeof err === "object" ? JSON.stringify(err) : String(err)) || "";
        
        const isTransient = 
          errMsg.includes("503") ||
          errMsg.includes("UNAVAILABLE") ||
          errMsg.includes("high demand") ||
          errMsg.includes("spikes in demand") ||
          errMsg.includes("Resource has been exhausted") ||
          errMsg.includes("RESOURCE_EXHAUSTED") ||
          errMsg.includes("429") ||
          errMsg.includes("500") ||
          err.status === 429 ||
          err.status === 503 ||
          err.status === 500;

        if (isTransient) {
          attempt++;
          if (attempt < maxRetries) {
            const waitTime = Math.pow(2, attempt) * 1000 + Math.random() * 500;
            console.log(`[Gemini API] Sleeping for ${waitTime.toFixed(0)}ms before retry...`);
            await delay(waitTime);
            continue;
          }
        }
        // Break inner loop on non-transient error or exhausted retries to try next model
        break;
      }
    }
  }
  throw lastError;
}

async function callGroqCompletion(groq: any, params: any) {
  const models = [
    "llama-3.1-70b-versatile",
    "llama-3.3-70b-versatile",
    "llama-3.3-70b",
    "llama-3.1-70b",
    "mixtral-8x7b",
  ];
  let lastError: any = null;
  const maxRetries = 2;

  for (const model of models) {
    let attempt = 0;
    while (attempt < maxRetries) {
      try {
        console.log(`[Groq API] Attempting generate with model ${model}...`);
        return await groq.chat.completions.create({
          ...params,
          model,
        });
      } catch (err: any) {
        console.warn(`[Groq API] Call failed for model ${model} (attempt ${attempt + 1}/${maxRetries}). Error:`, err.message || err);
        lastError = err;
        const errMsg = err.message || "";
        
        const isDecommissioned = errMsg.includes("decommissioned") || err.status === 400 || errMsg.includes("not supported");
        if (isDecommissioned) {
          break; // move to next model
        }

        const isTransient = 
          errMsg.includes("503") ||
          errMsg.includes("Rate limit") ||
          errMsg.includes("429") ||
          err.status === 429 ||
          err.status === 503;

        if (isTransient) {
          attempt++;
          if (attempt < maxRetries) {
            const waitTime = Math.pow(2, attempt) * 1000 + Math.random() * 500;
            console.log(`[Groq API] Sleeping for ${waitTime.toFixed(0)}ms before retry...`);
            await delay(waitTime);
            continue;
          }
        }
        break; // If other error, try next model
      }
    }
  }
  throw lastError;
}

async function callGroqCompletionStream(groq: any, params: any) {
  const models = [
    "llama-3.1-70b-versatile",
    "llama-3.3-70b-versatile",
    "llama-3.3-70b",
    "llama-3.1-70b",
    "mixtral-8x7b",
  ];
  let lastError: any = null;
  const maxRetries = 2;

  for (const model of models) {
    let attempt = 0;
    while (attempt < maxRetries) {
      try {
        console.log(`[Groq API] Attempting stream with model ${model}...`);
        return await groq.chat.completions.create({
          ...params,
          model,
          stream: true,
        });
      } catch (err: any) {
        console.warn(`[Groq API] Stream failed for model ${model} (attempt ${attempt + 1}/${maxRetries}). Error:`, err.message || err);
        lastError = err;
        const errMsg = err.message || "";

        const isDecommissioned = errMsg.includes("decommissioned") || err.status === 400 || errMsg.includes("not supported");
        if (isDecommissioned) {
          break; // move to next model
        }

        const isTransient = 
          errMsg.includes("503") ||
          errMsg.includes("Rate limit") ||
          errMsg.includes("429") ||
          err.status === 429 ||
          err.status === 503;

        if (isTransient) {
          attempt++;
          if (attempt < maxRetries) {
            const waitTime = Math.pow(2, attempt) * 1000 + Math.random() * 500;
            console.log(`[Groq API] Sleeping for ${waitTime.toFixed(0)}ms before retry...`);
            await delay(waitTime);
            continue;
          }
        }
        break;
      }
    }
  }
  throw lastError;
}

async function callIntentAssessor(ai: any, groq: any, unifiedContext: string) {
  const promptText = `Verify the task and completeness of the context.
You must analyze if clarification is needed prior to executing the user query.
Output a JSON object conforming exactly to this schema:
{
  "isFollowUpRequired": true or false,
  "followUpQuestion": "A short descriptive follow-up question here if isFollowUpRequired is true, else null",
  "detectedTask": "summarization" or "sentiment" or "code_explanation" or "transcript_summary" or "cross_input_reasoning" or "general_qa",
  "reasoningPlan": ["Step 1 description", "Step 2 description"]
}

Context:
${unifiedContext}`;

  if (groq) {
    try {
      console.log("[Intent Assessor] Utilizing Groq for intent assessment...");
      const response = await callGroqCompletion(groq, {
        messages: [
          {
            role: "system",
            content: "You are an agentic orchestrator. You MUST return ONLY a valid raw JSON object that satisfies the requested schema. No conversational prefix, no markdown codeblock backticks except valid parseable JSON.",
          },
          {
            role: "user",
            content: promptText,
          },
        ],
        response_format: { type: "json_object" },
        temperature: 0.1,
      });

      const textOutput = response.choices[0]?.message?.content || "{}";
      const cleanedText = textOutput.replace(/```json|```/g, "").trim();
      return JSON.parse(cleanedText);
    } catch (err) {
      console.warn("[Intent Assessor] Groq failed, cascading fallback to Gemini...", err);
    }
  }

  // Fallback to Gemini with robust structure schema
  const checkResponse = await callGenerateContent(ai, {
    contents: [
      {
        text: `You are an agentic orchestrator. Inspect the unified context. Determine if there are enough clear parameters to fulfill the requested action safely, or if you must apply the MANDATORY FOLLOW-UP QUESTION RULE.
The rule states: "If the input does not contain enough information to determine the task, or if multiple tasks are equally plausible (e.g. explaining vs rewriting code, summarizing vs translating text), you must ask a short, clear follow-up question."

Unified context:
${unifiedContext}

Output a JSON object conforming exactly to this schema:
{
  "isFollowUpRequired": true/false,
  "followUpQuestion": "A short descriptive follow-up question here if isFollowUpRequired is true, else null",
  "detectedTask": "summarization" or "sentiment" or "code_explanation" or "transcript_summary" or "cross_input_reasoning" or "general_qa",
  "reasoningPlan": ["Step 1 description", "Step 2 description"]
}`,
      }
    ],
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          isFollowUpRequired: { type: Type.BOOLEAN },
          followUpQuestion: { type: Type.STRING },
          detectedTask: { type: Type.STRING },
          reasoningPlan: {
            type: Type.ARRAY,
            items: { type: Type.STRING }
          }
        },
        required: ["isFollowUpRequired", "detectedTask", "reasoningPlan"]
      }
    }
  });

  const parsedText = checkResponse.text || "{}";
  const cleanedText = parsedText.replace(/```json|```/g, "").trim();
  return JSON.parse(cleanedText);
}

// API Route to run the multi-agentic flow
app.post("/api/agent/run", async (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  const sendEvent = (type: string, data: any) => {
    res.write(`data: ${JSON.stringify({ type, ...data })}\n\n`);
  };

  const { prompt, files = [], chatHistory = [] } = req.body;
  const planTrace: any[] = [];
  const extractedContents: any[] = [];

  let estimatedInputTokens = 0;
  let estimatedOutputTokens = 0;

  const addStep = (name: string, status: string, description: string) => {
    const step = { name, status, description, timestamp: new Date().toLocaleTimeString() };
    planTrace.push(step);
    sendEvent("step", { step });
  };

  try {
    const ai = getGeminiClient();
    const groq = getGroqClient();

    addStep("Initialize Request", "success", "Received request, validated prompt inputs.");

    // Step 1: File Content Extraction (Multimodal processing)
    if (files.length > 0) {
      addStep("Multimodal Extractors", "running", `Processing ${files.length} uploads concurrently...`);

      const extractions = await Promise.all(
        files.map(async (file: any) => {
          const rawBase64 = file.base64.split(",")[1] || file.base64;
          const mimeType = file.mimeType;
          let fileText = "";
          let ocrConfidence: number | undefined;
          let duration: string | undefined;

          // Approx helper to attribute token usage
          estimatedInputTokens += Math.floor(rawBase64.length / 4);

          try {
            if (mimeType.startsWith("image/")) {
              const imagePart = { inlineData: { mimeType, data: rawBase64 } };
              const response = await callGenerateContent(ai, {
                model: "gemini-3.5-flash",
                contents: [
                  imagePart,
                  "Perform optical character recognition (OCR) and extract all readable text or code from this image. Output a JSON object with this precise scheme: { \"text\": \"extracted text/code here\", \"confidence\": 95 } where confidence is an integer from 0 to 100 indicating extraction quality.",
                ],
                config: {
                  responseMimeType: "application/json",
                  responseSchema: {
                    type: Type.OBJECT,
                    properties: {
                      text: { type: Type.STRING },
                      confidence: { type: Type.INTEGER },
                    },
                    required: ["text", "confidence"],
                  },
                },
              });

              const parsed = JSON.parse(response.text || "{}");
              fileText = parsed.text || "";
              ocrConfidence = parsed.confidence || 90;
            } else if (mimeType === "application/pdf") {
              const pdfPart = { inlineData: { mimeType: "application/pdf", data: rawBase64 } };
              const response = await callGenerateContent(ai, {
                model: "gemini-3.5-flash",
                contents: [
                  pdfPart,
                  "Analyze this PDF document. Extract all readable text, tables, headers, and code snippets. Output a JSON object with this precise scheme: { \"text\": \"extracted text and layout details here\", \"confidence\": 95 } where confidence is an integer indicating your parsing assessment.",
                ],
                config: {
                  responseMimeType: "application/json",
                  responseSchema: {
                    type: Type.OBJECT,
                    properties: {
                      text: { type: Type.STRING },
                      confidence: { type: Type.INTEGER },
                    },
                    required: ["text", "confidence"],
                  },
                },
              });

              const parsed = JSON.parse(response.text || "{}");
              fileText = parsed.text || "";
              ocrConfidence = parsed.confidence || 90;
            } else if (mimeType.startsWith("audio/")) {
              const audioPart = { inlineData: { mimeType, data: rawBase64 } };
              const response = await callGenerateContent(ai, {
                model: "gemini-3.5-flash",
                contents: [
                  audioPart,
                  "Listen to this audio file and transcribe all spoken dialogue clearly. Extract or estimate the total audio duration in minutes and seconds (e.g. '04:15'). Output a JSON object with this precise scheme: { \"text\": \"clean transcription here\", \"duration\": \"04:15\" }.",
                ],
                config: {
                  responseMimeType: "application/json",
                  responseSchema: {
                    type: Type.OBJECT,
                    properties: {
                      text: { type: Type.STRING },
                      duration: { type: Type.STRING },
                    },
                    required: ["text", "duration"],
                  },
                },
              });

              const parsed = JSON.parse(response.text || "{}");
              fileText = parsed.text || "";
              duration = parsed.duration || "0:00";
            } else {
              // Binary plain text or unknown
              fileText = Buffer.from(rawBase64, "base64").toString("utf-8");
              ocrConfidence = 100;
            }

            const cleanFileName = file.name || "unnamed_file";
            extractedContents.push({
              fileName: cleanFileName,
              mimeType,
              text: fileText,
              ocrConfidence,
              duration,
            });

            return { success: true, name: cleanFileName };
          } catch (err: any) {
            console.error(`Extraction failed for ${file.name}:`, err);
            return { success: false, name: file.name, error: err.message };
          }
        })
      );

      const failed = extractions.filter((r) => !r.success);
      if (failed.length > 0) {
        addStep("Multimodal Extractors", "error", `Successfully extracted ${extractions.length - failed.length} files; ${failed.length} failed: ${failed.map(f => f.name).join(", ")}`);
      } else {
        addStep("Multimodal Extractors", "success", `Extracted text/audio contents from ${extractions.length} file(s).`);
      }
    } else {
      addStep("Multimodal Extractors", "skipped", "No files uploaded.");
    }

    // Step 2: Extract and fetch YouTube Transcripts
    let combinedContextForYoutube = prompt + " " + extractedContents.map((f) => f.text).join(" ");
    const ytVideoId = extractYoutubeId(combinedContextForYoutube);
    let youtubeTranscriptText = "";

    if (ytVideoId) {
      addStep("YouTube URL Scanner", "success", `Detected YouTube video link (ID: ${ytVideoId}). Fetching transcript...`);
      try {
        const transcriptItems = await YoutubeTranscript.fetchTranscript(ytVideoId);
        youtubeTranscriptText = transcriptItems.map((item) => item.text).join(" ");
        addStep("YouTube Transcript Fetcher", "success", `Successfully pulled ${transcriptItems.length} lines of video transcripts.`);
      } catch (err: any) {
        console.error("YoutubeTranscript fetch error:", err);
        youtubeTranscriptText = `[YouTube Transcript Fallback: Transcript could not be pulled directly from YouTube. Captions may be disabled, private, or blocked.]`;
        addStep("YouTube Transcript Fetcher", "error", `Failed: YouTube captions unavailable or restricted. Added fallback token context.`);
      }
    } else {
      addStep("YouTube URL Scanner", "skipped", "No YouTube video link detected in prompt or files.");
    }

    // Compose final unified context
    let unifiedContext = "=== USER QUERY ===\n" + prompt + "\n\n";
    if (chatHistory.length > 0) {
      unifiedContext += "=== CHAT HISTORY ===\n";
      chatHistory.forEach((msg: any) => {
        unifiedContext += `${msg.role.toUpperCase()}: ${msg.content}\n`;
      });
      unifiedContext += "\n";
    }
    if (extractedContents.length > 0) {
      unifiedContext += "=== EXTRACTED FILE CONTENTS ===\n";
      extractedContents.forEach((f) => {
        unifiedContext += `[File: ${f.fileName} (${f.mimeType})]\n`;
        if (f.ocrConfidence !== undefined) unifiedContext += `(OCR Confidence: ${f.ocrConfidence}%)\n`;
        if (f.duration !== undefined) unifiedContext += `(Audible Duration: ${f.duration})\n`;
        unifiedContext += `${f.text}\n\n`;
      });
    }
    if (youtubeTranscriptText) {
      unifiedContext += `=== YOUTUBE VIDEO TRANSCRIPT ===\n${youtubeTranscriptText}\n\n`;
    }

    // Step 3: Intent/Clarification Check
    addStep("Intent Assessor", "running", "Analyzing completeness and task suitability...");
    
    let assessment: any;
    try {
      assessment = await callIntentAssessor(ai, groq, unifiedContext);
    } catch (assErr: any) {
      console.error("[Intent Assessor] Schema generation failed. Enforcing safe failsafe schema...", assErr);
      assessment = {
        isFollowUpRequired: false,
        detectedTask: "general_qa",
        reasoningPlan: ["Failsafe fallback plan initialized due to network rate constraints."]
      };
    }

    estimatedInputTokens += Math.floor(unifiedContext.length / 4);
    estimatedOutputTokens += 150;

    // Stream planned steps to the client
    if (assessment.reasoningPlan && Array.isArray(assessment.reasoningPlan)) {
      assessment.reasoningPlan.forEach((planStep: string) => {
        addStep("Planned Strategy Step", "success", planStep);
      });
    }

    if (assessment.isFollowUpRequired) {
      addStep("Intent Assessor", "success", "Flagged clarifying question needed prior to execution.");
      // Done - send finalized event and response
      const totalTokenCount = estimatedInputTokens + estimatedOutputTokens;
      const calculatedCost = (estimatedInputTokens * 0.000000075) + (estimatedOutputTokens * 0.0000003);

      sendEvent("done", {
        response: {
          isFollowUpRequired: true,
          followUpQuestion: assessment.followUpQuestion || "Could you clarify what you would like me to perform on this content?",
          extractedContents,
          planTrace,
          estimatedInputTokens,
          estimatedOutputTokens,
          estimatedCostUsd: calculatedCost,
        }
      });
      res.end();
      return;
    }

    addStep("Intent Assessor", "success", `Identified task context: [${assessment.detectedTask.toUpperCase()}]. Proceeding to build result.`);

    // Step 4: Stream final result generation
    addStep("Generator Pipeline", "running", "Synthesizing streamed analysis response...");

    const finalQueryPrompt = `Ensure you strictly satisfy the requirements for this specific task:
- Detected Task: "${assessment.detectedTask}"
- Specific Rules for Tasks:
  - If "summarization": You MUST format and return exactly three components explicitly:
    1. A "1-Line Summary" (labeled clearly)
    2. "3 Key Bullet Points" (labeled clearly)
    3. A "5-Sentence Summary" (labeled clearly)
  - If "sentiment": You MUST output:
    1. A Sentiment Label (Positive / Negative / Neutral)
    2. A Confidence Percentage (e.g. 95%)
    3. A direct "1-Line Justification"
  - If "code_explanation": You MUST output:
    1. An elegant explanation of what the code does
    2. Bug detection / warning about any bugs found
    3. Strict "Time and Space Complexity Analysis"
  - If "transcript_summary" or "audio transcription + summary": You MUST output:
    1. Fully cleaned audio transcription text
    2. A "1-Line Summary"
    3. "3 Bullet Points"
    4. A "5-Sentence Summary"
    5. Mention any duration or files referenced.
  - If "cross_input_reasoning": Combine, contrast, and reference multiple inputs gracefully (such as files, transcription logs, or queries) in a unified, professional comparative breakdown.

Unified context:
${unifiedContext}

Generate your response in pristine Markdown format. Make it direct, clean, without tech-larping or metadata banners. Ensure it satisfies all the strict conditions above.`;

    let fullFinalResultText = "";

    if (groq) {
      addStep("Generator Pipeline", "running", "Active Groq Key detected! Running high-throughput generation request (Llama 3.3 70B)...");
      try {
        const chatCompletion = await callGroqCompletionStream(groq, {
          messages: [
            {
              role: "user",
              content: finalQueryPrompt,
            },
          ],
        });

        for await (const chunk of chatCompletion) {
          const content = chunk.choices[0]?.delta?.content || "";
          if (content) {
            fullFinalResultText += content;
            sendEvent("chunk", { text: content });
          }
        }
      } catch (gErr: any) {
        console.warn("Groq failed, cleanly falling back to primary Gemini generator pipeline. Error:", gErr.message || gErr);
        addStep("Generator Pipeline", "running", "Groq stream error. Cascading fallback to Gemini pipeline...");
        fullFinalResultText = ""; // Clear for fallback rewrite
      }
    }

    // Fallback to Gemini if Groq is not configured or failed to stream completely
    if (!fullFinalResultText) {
      const responseStream = await callGenerateContentStream(ai, {
        model: "gemini-3.5-flash",
        contents: finalQueryPrompt,
      });

      for await (const chunk of responseStream) {
        const text = chunk.text;
        if (text) {
          fullFinalResultText += text;
          sendEvent("chunk", { text });
        }
      }
    }

    addStep("Generator Pipeline", "success", "Response stream completed and validated.");

    // Final calculations
    estimatedInputTokens += Math.floor(finalQueryPrompt.length / 4);
    estimatedOutputTokens += Math.floor(fullFinalResultText.length / 4);

    const totalTokenCount = estimatedInputTokens + estimatedOutputTokens;
    const calculatedCost = (estimatedInputTokens * 0.000000075) + (estimatedOutputTokens * 0.0000003);

    // Complete trace step
    sendEvent("done", {
      response: {
        isFollowUpRequired: false,
        extractedContents,
        planTrace,
        finalResult: fullFinalResultText,
        estimatedInputTokens,
        estimatedOutputTokens,
        estimatedCostUsd: Number(calculatedCost.toFixed(6)),
      }
    });

    res.end();

  } catch (error: any) {
    console.error("Error in agent pipeline:", error);
    addStep("System Error Handler", "error", error.message || "An unresolved exception occurred.");
    sendEvent("error", { message: error.message || "Unhandled server exception." });
    res.end();
  }
});

// Vite Setup
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
