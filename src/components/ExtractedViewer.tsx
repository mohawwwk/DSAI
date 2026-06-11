/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from "react";
import { FileText, ChevronDown, ChevronRight, CheckCircle, Clock } from "lucide-react";
import { ExtractedContent } from "../types";

interface ExtractedViewerProps {
  contents: ExtractedContent[];
}

export default function ExtractedViewer({ contents }: ExtractedViewerProps) {
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  if (!contents || contents.length === 0) {
    return (
      <div className="bg-slate-50 border border-slate-100 rounded-xl p-6 text-center text-gray-400 text-xs">
        No context texts extracted yet. Upload files to observe live content extraction.
      </div>
    );
  }

  return (
    <div className="bg-white border border-gray-100 rounded-xl p-5 shadow-sm space-y-4">
      <div className="flex items-center gap-2 border-b border-gray-50 pb-3">
        <div className="p-1.5 bg-emerald-50 text-emerald-600 rounded-lg">
          <FileText className="h-4 w-4" />
        </div>
        <div>
          <h3 className="text-sm font-semibold text-gray-800">Extracted Context Details ({contents.length})</h3>
          <p className="text-xs text-gray-400">Extracted representation before modeling or reasoning</p>
        </div>
      </div>

      <div className="space-y-3">
        {contents.map((content, idx) => {
          const isOpen = openIndex === idx;

          return (
            <div key={idx} className="border border-gray-200 rounded-xl overflow-hidden shadow-sm bg-white">
              {/* Header Accordion trigger */}
              <button
                type="button"
                onClick={() => setOpenIndex(isOpen ? null : idx)}
                className="w-full flex items-center justify-between p-3.5 hover:bg-gray-50 transition-colors text-left"
              >
                <div className="flex items-center gap-2.5 overflow-hidden">
                  {isOpen ? (
                    <ChevronDown className="h-4 w-4 text-gray-400 shrink-0" />
                  ) : (
                    <ChevronRight className="h-4 w-4 text-gray-400 shrink-0" />
                  )}
                  <div className="overflow-hidden">
                    <p className="text-xs font-semibold text-gray-700 truncate">
                      {content.fileName}
                    </p>
                    <p className="text-[10px] text-gray-400 font-mono mt-0.5">
                      {content.mimeType}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {content.ocrConfidence !== undefined && (
                    <div className="flex items-center gap-1 bg-emerald-50 text-emerald-600 rounded-full px-2 py-0.5 text-[10px] font-semibold border border-emerald-100">
                      <CheckCircle className="h-3 w-3" />
                      OCR: {content.ocrConfidence}%
                    </div>
                  )}
                  {content.duration !== undefined && (
                    <div className="flex items-center gap-1 bg-blue-50 text-blue-600 rounded-full px-2 py-0.5 text-[10px] font-semibold border border-blue-100">
                      <Clock className="h-3 w-3" />
                      Len: {content.duration}
                    </div>
                  )}
                </div>
              </button>

              {/* Body */}
              {isOpen && (
                <div className="p-4 bg-gray-55/40 border-t border-gray-200 text-left">
                  <div className="bg-gray-50 rounded-lg p-3 overflow-x-auto max-h-[300px] border border-gray-25 shadow-inner">
                    <pre className="text-xs font-mono text-gray-700 leading-normal whitespace-pre-wrap breakdown-words">
                      {content.text || "[Empty content successfully parsed]"}
                    </pre>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
