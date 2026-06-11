/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from "react";
import { DollarSign, Cpu, HelpCircle } from "lucide-react";

interface CostEstimatorProps {
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
}

export default function CostEstimator({ inputTokens, outputTokens, costUsd }: CostEstimatorProps) {
  if (inputTokens === 0 && outputTokens === 0) return null;

  return (
    <div className="bg-slate-50/50 border border-slate-100 rounded-xl p-4 shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
      <div className="flex items-center gap-3">
        <div className="p-2 bg-indigo-50 text-indigo-600 rounded-xl">
          <Cpu className="h-5 w-5" />
        </div>
        <div>
          <h4 className="text-xs font-semibold text-gray-700">Estimated API Resources</h4>
          <p className="text-[10px] text-gray-400">Calculated strictly per request tokens volume</p>
        </div>
      </div>

      <div className="flex flex-wrap sm:flex-nowrap gap-4 w-full sm:w-auto">
        <div className="bg-white border border-gray-100 rounded-lg px-3 py-1.5 shadow-sm text-left flex-1 sm:flex-initial min-w-[90px]">
          <p className="text-[10px] text-gray-400 font-medium">Input Tokens</p>
          <p className="text-sm font-bold text-gray-800 font-mono">
            {inputTokens.toLocaleString()}
          </p>
        </div>

        <div className="bg-white border border-gray-100 rounded-lg px-3 py-1.5 shadow-sm text-left flex-1 sm:flex-initial min-w-[90px]">
          <p className="text-[10px] text-gray-400 font-medium">Output Tokens</p>
          <p className="text-sm font-bold text-gray-800 font-mono">
            {outputTokens.toLocaleString()}
          </p>
        </div>

        <div className="bg-indigo-50 border border-indigo-100/50 rounded-lg px-4 py-1.5 shadow-sm text-left flex-1 sm:flex-initial min-w-[110px]">
          <p className="text-[10px] text-indigo-500 font-semibold uppercase tracking-wider">Estimated Cost</p>
          <p className="text-sm font-black text-indigo-700 font-mono flex items-center">
            <DollarSign className="h-3 ml-[-2px] w-3" />
            {costUsd.toFixed(6)}
          </p>
        </div>
      </div>
    </div>
  );
}
