/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useRef, useState } from "react";
import { Upload, X, FileText, Image, Music, FileCode } from "lucide-react";
import { UploadedFile } from "../types";

interface UploadZoneProps {
  files: UploadedFile[];
  onChange: React.Dispatch<React.SetStateAction<UploadedFile[]>>;
}

export default function UploadZone({ files, onChange }: UploadZoneProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragActive, setIsDragActive] = useState(false);

  const processFiles = (selectedFiles: FileList) => {
    const list = Array.from(selectedFiles);

    list.forEach((file) => {
      // Basic safeguard for size (allow up to 10MB)
      if (file.size > 10 * 1024 * 1024) {
        alert(`File ${file.name} exceeds the 10MB size limit.`);
        return;
      }

      const reader = new FileReader();
      reader.onload = () => {
        const base64 = reader.result as string;
        const uploaded: UploadedFile = {
          name: file.name,
          mimeType: file.type || "application/octet-stream",
          size: file.size,
          base64,
        };

        // Avoid adding duplicates
        onChange((prev) => {
          if (prev.some((f) => f.name === uploaded.name)) return prev;
          return [...prev, uploaded];
        });
      };
      reader.readAsDataURL(file);
    });
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setIsDragActive(true);
    } else if (e.type === "dragleave") {
      setIsDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      processFiles(e.dataTransfer.files);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      processFiles(e.target.files);
    }
  };

  const removeFile = (name: string) => {
    onChange((prev) => prev.filter((f) => f.name !== name));
  };

  const getFileIcon = (mimeType: string) => {
    if (mimeType.startsWith("image/")) return <Image className="h-5 w-5 text-indigo-500" />;
    if (mimeType === "application/pdf") return <FileText className="h-5 w-5 text-red-500" />;
    if (mimeType.startsWith("audio/")) return <Music className="h-5 w-5 text-emerald-500" />;
    return <FileCode className="h-5 w-5 text-gray-500" />;
  };

  const formatSize = (bytes: number) => {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const dm = 1;
    const sizes = ["Bytes", "KB", "MB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + " " + sizes[i];
  };

  return (
    <div className="space-y-4">
      <div
        id="drop-zone"
        onDragEnter={handleDrag}
        onDragOver={handleDrag}
        onDragLeave={handleDrag}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        className={`relative flex flex-col items-center justify-center border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-all duration-200 ${
          isDragActive
            ? "border-indigo-500 bg-indigo-50/50"
            : "border-gray-200 hover:border-gray-300 hover:bg-gray-50/40 bg-white"
        }`}
      >
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept="image/*,application/pdf,audio/*"
          onChange={handleFileSelect}
          className="hidden"
        />

        <div className="rounded-full bg-slate-50 p-3 mb-3 border border-gray-100 shadow-sm">
          <Upload className="h-6 w-6 text-indigo-500" />
        </div>

        <p className="text-sm font-medium text-gray-700">
          Drag and drop context files, or <span className="text-indigo-600 hover:text-indigo-700">browse</span>
        </p>
        <p className="text-xs text-gray-400 mt-1">
          Supports PNG, JPG, PDF, or Audio (MP3, WAV, M4A) up to 10MB each
        </p>
      </div>

      {files.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-widest pl-1">
            Selected Context ({files.length})
          </h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
            {files.map((file) => (
              <div
                key={file.name}
                className="flex items-center justify-between p-3 bg-white border border-gray-200 rounded-lg shadow-sm gap-2 text-left"
              >
                <div className="flex items-center gap-2 overflow-hidden">
                  {getFileIcon(file.mimeType)}
                  <div className="overflow-hidden">
                    <p className="text-xs font-medium text-gray-700 truncate" title={file.name}>
                      {file.name}
                    </p>
                    <p className="text-[10px] text-gray-400 font-mono">
                      {formatSize(file.size)}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    removeFile(file.name);
                  }}
                  className="rounded-full p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
