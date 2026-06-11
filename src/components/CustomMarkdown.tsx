/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from "react";

interface CustomMarkdownProps {
  content: string;
}

export default function CustomMarkdown({ content }: CustomMarkdownProps) {
  if (!content) return null;

  // Split content by code blocks first
  const parts = content.split(/(```[\s\S]*?```)/g);

  return (
    <div className="space-y-3 text-sm leading-relaxed text-gray-800">
      {parts.map((part, partIdx) => {
        if (part.startsWith("```") && part.endsWith("```")) {
          // It's a code block
          const match = part.match(/```(\w*)\n([\s\S]*?)```/);
          const lang = match ? match[1] : "";
          const code = match ? match[2] : part.slice(3, -3);

          return (
            <div key={partIdx} className="my-3 overflow-hidden rounded-lg border border-gray-200 shadow-sm bg-gray-50">
              {lang && (
                <div className="flex items-center justify-between bg-gray-100 px-3 py-1 text-xs text-gray-600 font-mono border-b border-gray-200">
                  <span>{lang}</span>
                </div>
              )}
              <pre className="overflow-x-auto p-4 text-xs font-mono text-gray-900 bg-gray-50 leading-normal">
                <code>{code.trim()}</code>
              </pre>
            </div>
          );
        }

        // Parse regular lines
        const lines = part.split("\n");
        return (
          <div key={partIdx} className="space-y-2">
            {lines.map((line, lineIdx) => {
              const trimmed = line.trim();
              if (!trimmed) return <div key={lineIdx} className="h-2" />;

              // Headers
              if (trimmed.startsWith("# ")) {
                return (
                  <h1 key={lineIdx} className="text-xl md:text-2xl font-bold text-gray-900 pt-3 pb-1 border-b border-gray-100 tracking-tight">
                    {parseInlineMarkdown(trimmed.slice(2))}
                  </h1>
                );
              }
              if (trimmed.startsWith("## ")) {
                return (
                  <h2 key={lineIdx} className="text-lg md:text-xl font-semibold text-gray-900 pt-2 pb-1 tracking-tight">
                    {parseInlineMarkdown(trimmed.slice(3))}
                  </h2>
                );
              }
              if (trimmed.startsWith("### ")) {
                return (
                  <h3 key={lineIdx} className="text-base md:text-lg font-medium text-gray-900 pt-1">
                    {parseInlineMarkdown(trimmed.slice(4))}
                  </h3>
                );
              }

              // Bullet points
              if (trimmed.startsWith("- ") || trimmed.startsWith("* ")) {
                return (
                  <ul key={lineIdx} className="list-disc pl-5 my-1 space-y-1">
                    <li className="text-gray-800">{parseInlineMarkdown(trimmed.slice(2))}</li>
                  </ul>
                );
              }

              // Numbered checklists
              const numMatch = trimmed.match(/^(\d+)\.\s(.*)/);
              if (numMatch) {
                return (
                  <ol key={lineIdx} className="list-decimal pl-5 my-1 space-y-1">
                    <li className="text-gray-800">{parseInlineMarkdown(numMatch[2])}</li>
                  </ol>
                );
              }

              // Quote block
              if (trimmed.startsWith("> ")) {
                return (
                  <blockquote key={lineIdx} className="border-l-4 border-gray-300 pl-4 py-1 my-2 italic text-gray-600 bg-gray-50/50 rounded-r-md">
                    {parseInlineMarkdown(trimmed.slice(2))}
                  </blockquote>
                );
              }

              // Normal paragraph line
              return (
                <p key={lineIdx} className="text-gray-800">
                  {parseInlineMarkdown(trimmed)}
                </p>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

// Simple helper to parse bold (`**text**`), italic (`*text*`), and inline code (``code``)
function parseInlineMarkdown(text: string): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  let index = 0;

  // Let's tokenise the text
  // We match **bold**, *italic*, `inline code`
  const regex = /(\*\*.*?\*\*|\*.*?\*|`.*?`)/g;
  const matches = text.split(regex);

  return matches.map((chunk, idx) => {
    if (chunk.startsWith("**") && chunk.endsWith("**")) {
      return <strong key={idx} className="font-semibold text-gray-900">{chunk.slice(2, -2)}</strong>;
    }
    if (chunk.startsWith("*") && chunk.endsWith("*")) {
      return <em key={idx} className="italic text-gray-800">{chunk.slice(1, -1)}</em>;
    }
    if (chunk.startsWith("`") && chunk.endsWith("`")) {
      return <code key={idx} className="px-1.5 py-0.5 mx-0.5 rounded text-xs bg-gray-100 text-red-600 font-mono">{chunk.slice(1, -1)}</code>;
    }
    return chunk;
  });
}
