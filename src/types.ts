/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface UploadedFile {
  name: string;
  mimeType: string;
  size: number;
  base64: string;
}

export interface ExtractedContent {
  fileName: string;
  mimeType: string;
  text: string;
  ocrConfidence?: number; // image/pdf
  duration?: string; // audio
}

export interface ToolStep {
  name: string;
  status: 'running' | 'success' | 'error' | 'skipped';
  description: string;
  timestamp: string;
}

export interface AgentResponse {
  isFollowUpRequired: boolean;
  followUpQuestion?: string;
  extractedContents: ExtractedContent[];
  planTrace: ToolStep[];
  finalResult?: string;
  estimatedInputTokens: number;
  estimatedOutputTokens: number;
  estimatedCostUsd: number;
}

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  files?: { name: string; mimeType: string; size: number }[];
  responseDetails?: AgentResponse;
  timestamp: string;
}
