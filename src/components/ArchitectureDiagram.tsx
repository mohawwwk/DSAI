/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from "react";
import { ArrowRight, Cpu, Layers, Disc, Radio, AlertCircle } from "lucide-react";

export default function ArchitectureDiagram() {
  return (
    <div className="bg-slate-50 border border-slate-100 rounded-xl p-5 shadow-sm">
      <div className="flex items-center gap-2 mb-4 border-b border-gray-100 pb-3">
        <Cpu className="h-5 w-5 text-indigo-600" />
        <div>
          <h3 className="text-sm font-semibold text-gray-800">Pipeline Pipeline Architecture</h3>
          <p className="text-xs text-gray-400">Underneath the multi-tool agent routing and reasoning engine</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-5 gap-3 items-center text-center">
        {/* Step 1: Inputs */}
        <div className="bg-white border border-gray-100 p-3 rounded-lg shadow-sm flex flex-col items-center justify-center">
          <DiskIcon className="bg-indigo-50 text-indigo-600 p-2 rounded-full mb-1" />
          <span className="text-xs font-semibold text-gray-700">Inputs Supported</span>
          <span className="text-[10px] text-gray-400 font-mono mt-0.5">Text, JPG, PDF, Audio</span>
        </div>

        <div className="hidden md:flex justify-center text-gray-300">
          <ArrowRight className="h-4 w-4" />
        </div>

        {/* Step 2: Extractors */}
        <div className="bg-white border border-gray-100 p-3 rounded-lg shadow-sm flex flex-col items-center justify-center">
          <Layers className="h-5 w-5 text-purple-600 mb-1" />
          <span className="text-xs font-semibold text-gray-700">Content Extractors</span>
          <span className="text-[10px] text-gray-400 font-mono mt-0.5">Image OCR | Audio STT</span>
        </div>

        <div className="hidden md:flex justify-center text-gray-300">
          <ArrowRight className="h-4 w-4" />
        </div>

        {/* Step 3: Tool Reg */}
        <div className="bg-white border border-gray-100 p-3 rounded-lg shadow-sm flex flex-col items-center justify-center">
          <Radio className="h-5 w-5 text-emerald-600 mb-1" />
          <span className="text-xs font-semibold text-gray-700">Tool Registries</span>
          <span className="text-[10px] text-gray-400 font-mono mt-0.5">YouTube puller / Context sync</span>
        </div>

        {/* Step 4: Intent assess */}
        <div className="md:col-span-5 flex justify-center py-1">
          <div className="h-5 w-0.5 bg-slate-200 hidden md:block" />
        </div>

        {/* Unified Decision Engine */}
        <div className="md:col-span-5 bg-white border border-indigo-100/80 p-4 rounded-xl shadow-sm text-left max-w-lg mx-auto w-full">
          <div className="flex gap-2.5">
            <div className="p-2 bg-indigo-50 text-indigo-600 rounded-lg">
              <Cpu className="h-5 w-5" />
            </div>
            <div>
              <h4 className="text-xs font-semibold text-indigo-900 uppercase tracking-widest">
                Agentic Brain: Intent & Decider Flow
              </h4>
              <p className="text-[11px] text-slate-500 mt-0.5 leading-relaxed">
                Applies the <strong>Mandatory Follow-up rule</strong>. If parameters are deficient, interrupts
                with a clarifications query; otherwise selects tasks: <em>Summarization, Sentiment, Bug Audit,
                STT, or Combined reasoning.</em>
              </p>
            </div>
          </div>
        </div>

        <div className="md:col-span-5 flex justify-center py-1">
          <div className="h-5 w-0.5 bg-slate-200 hidden md:block" />
        </div>

        {/* Output */}
        <div className="md:col-span-5 bg-indigo-900 text-white p-3 rounded-lg shadow-sm max-w-sm mx-auto w-full">
          <p className="text-xs font-semibold">Clean Text-Only Output Panel</p>
          <p className="text-[10px] text-indigo-200 font-mono mt-0.5">Structured results, markdown, or code explain</p>
        </div>
      </div>
    </div>
  );
}

function DiskIcon({ className }: { className?: string }) {
  return (
    <div className={className}>
      <Disc className="h-5 w-5" />
    </div>
  );
}
