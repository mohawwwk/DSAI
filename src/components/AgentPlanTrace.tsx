/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from "react";
import { CheckCircle2, Loader2, AlertTriangle, Circle, Route } from "lucide-react";
import { ToolStep } from "../types";

interface AgentPlanTraceProps {
  steps: ToolStep[];
}

export default function AgentPlanTrace({ steps }: AgentPlanTraceProps) {
  if (!steps || steps.length === 0) return null;

  return (
    <div className="bg-white border border-gray-100 rounded-xl p-5 shadow-sm space-y-4">
      <div className="flex items-center gap-2 border-b border-gray-50 pb-3">
        <div className="p-1.5 bg-blue-50 text-blue-600 rounded-lg">
          <Route className="h-4 w-4" />
        </div>
        <div>
          <h3 className="text-sm font-semibold text-gray-800">Agent Reasoning Plan & Trace Steps</h3>
          <p className="text-xs text-gray-400">Chronological history of tool invocations and autonomous tasks</p>
        </div>
      </div>

      <div className="relative border-l border-gray-100 ml-3.5 pl-5 space-y-5">
        {steps.map((step, idx) => {
          const isLast = idx === steps.length - 1;

          return (
            <div key={idx} className="relative group">
              {/* Timeline marker icon */}
              <div className="absolute -left-[27px] top-0.5 bg-white rounded-full p-0.5">
                {step.status === "success" && (
                  <CheckCircle2 className="h-4 w-4 text-emerald-500 fill-emerald-50" />
                )}
                {step.status === "running" && (
                  <Loader2 className="h-4 w-4 text-blue-500 animate-spin" />
                )}
                {step.status === "error" && (
                  <AlertTriangle className="h-4 w-4 text-rose-500 fill-rose-50 animate-bounce" />
                )}
                {step.status === "skipped" && (
                  <Circle className="h-4 w-4 text-gray-300 fill-gray-50" />
                )}
              </div>

              <div className="space-y-0.5 text-left">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-gray-800 group-hover:text-gray-900">
                    {step.name}
                  </span>
                  <span className="text-[9px] text-gray-400 font-mono">
                    {step.timestamp}
                  </span>
                </div>
                <p className="text-xs text-gray-600 leading-normal">
                  {step.description}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
