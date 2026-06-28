import React, { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  Upload,
  Download,
  FileText,
  CheckCircle2,
  AlertTriangle,
  BookOpen,
  Table,
  Binary,
  Image as ImageIcon,
  ChevronRight,
  ChevronDown,
  Copy,
  FileCode,
  RefreshCw,
  Clock,
  HardDrive,
  Info
} from "lucide-react";

// Script metadata for Python explorer
const PYTHON_SCRIPTS = [
  { id: "models.py", name: "models.py", desc: "Data Models & Dataclasses" },
  { id: "chunker.py", name: "chunker.py", desc: "Semantic Chunking Logic" },
  { id: "extractor_txt.py", name: "extractor_txt.py", desc: "Heuristic TXT Extractor" },
  { id: "extractor_pdf.py", name: "extractor_pdf.py", desc: "Heuristic PDF Extractor" },
  { id: "pipeline.py", name: "pipeline.py", desc: "Core Orchestrator & TXT Formatter" }
];

export default function App() {
  // Application State
  const [file, setFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [status, setStatus] = useState<"idle" | "uploading" | "processing" | "completed" | "error">("idle");
  const [progressMsg, setProgressMsg] = useState("");
  const [error, setError] = useState<string | null>(null);
  
  // Results State
  const [processedData, setProcessedData] = useState<any>(null);
  const [cleanedTxt, setCleanedTxt] = useState<string>("");
  const [activeTab, setActiveTab] = useState<"chunks" | "headings" | "tables" | "formulas" | "images" | "codebase">("chunks");
  
  // Python Code Explorer State
  const [selectedScript, setSelectedScript] = useState<string>("pipeline.py");
  const [scriptContent, setScriptContent] = useState<string>("");
  const [fetchingScript, setFetchingScript] = useState(false);
  const [copiedScript, setCopiedScript] = useState(false);
  
  // File Input Ref
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load selected python script on demand
  useEffect(() => {
    async function fetchScript() {
      setFetchingScript(true);
      try {
        const res = await fetch(`/api/python-script/${selectedScript}`);
        if (res.ok) {
          const json = await res.json();
          setScriptContent(json.content);
        } else {
          setScriptContent("# Failed to load script from server.");
        }
      } catch (err) {
        setScriptContent("# Error fetching script code.");
      } finally {
        setFetchingScript(false);
      }
    }
    fetchScript();
  }, [selectedScript]);

  // Handle drag over
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  // Handle drag leave
  const handleDragLeave = () => {
    setIsDragging(false);
  };

  // Triggered when file is uploaded/dropped
  const processUploadedFile = async (selectedFile: File) => {
    const ext = selectedFile.name.split(".").pop()?.toLowerCase();
    if (ext !== "pdf" && ext !== "txt") {
      setError("Unsupported file format. Please upload only .pdf or .txt textbook files.");
      setStatus("error");
      return;
    }

    if (selectedFile.size === 0) {
      setError("Corrupted or empty textbook file. File size cannot be 0 bytes.");
      setStatus("error");
      return;
    }

    setFile(selectedFile);
    setError(null);
    setStatus("uploading");
    setProcessing(true);
    setProgressMsg("Ingesting textbook raw bytes...");

    try {
      // Small artificial visual delay for pristine UI pacing
      await new Promise((resolve) => setTimeout(resolve, 600));
      setStatus("processing");
      setProgressMsg("Converting text and mapping pages...");

      const startTime = Date.now();
      const response = await fetch("/api/process", {
        method: "POST",
        body: selectedFile,
        headers: {
          "x-filename": selectedFile.name,
          "content-type": selectedFile.type || "application/octet-stream",
        },
      });

      if (!response.ok) {
        const errJson = await response.json();
        throw new Error(errJson.error || "Failed to process textbook.");
      }

      const res = await response.json();
      
      setProgressMsg("Splitting content into semantic chunks...");
      await new Promise((resolve) => setTimeout(resolve, 500));

      setProcessedData(res.data);
      setCleanedTxt(res.cleanedTxt);
      setStatus("completed");
    } catch (err: any) {
      console.error(err);
      setError(err.message || "An error occurred during pipeline execution.");
      setStatus("error");
    } finally {
      setProcessing(false);
    }
  };

  // Drag-and-drop drop handler
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      processUploadedFile(e.dataTransfer.files[0]);
    }
  };

  // Manual file input selection
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      processUploadedFile(e.target.files[0]);
    }
  };

  // Trigger upload click
  const triggerFileInput = () => {
    fileInputRef.current?.click();
  };

  // Reset current view state to allow processing a new file
  const handleReset = () => {
    setFile(null);
    setProcessedData(null);
    setCleanedTxt("");
    setStatus("idle");
    setError(null);
  };

  // Download Processed JSON file
  const downloadJSON = () => {
    if (!processedData) return;
    const jsonStr = JSON.stringify(processedData, null, 2);
    const blob = new Blob([jsonStr], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const baseName = file?.name.split(".").slice(0, -1).join(".") || "textbook";
    a.download = `${baseName}_structured.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Download Cleaned TXT file
  const downloadCleanedTxt = () => {
    if (!cleanedTxt) return;
    const blob = new Blob([cleanedTxt], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const baseName = file?.name.split(".").slice(0, -1).join(".") || "textbook";
    a.download = `${baseName}_cleaned.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Copy python script helper
  const handleCopyScript = () => {
    navigator.clipboard.writeText(scriptContent);
    setCopiedScript(true);
    setTimeout(() => setCopiedScript(false), 2000);
  };

  return (
    <div className="min-h-screen bg-[#F9F9FB] text-[#1A1A1E] font-sans antialiased" id="main_container">
      {/* Top Elegant Hub Bar */}
      <header className="border-b border-gray-200 bg-white/85 backdrop-blur-md sticky top-0 z-50 px-6 py-4" id="header_section">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-gray-100 rounded-lg text-gray-800 border border-gray-200">
              <BookOpen className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-xl font-semibold tracking-tight text-gray-900">Textbook Processing Pipeline</h1>
              <p className="text-xs text-gray-500 font-mono">Offline Conversion & Semantic Chunking Engine</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <a
              href="/api/download-pipeline"
              className="flex items-center gap-2 px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-medium font-mono rounded-md border border-gray-300 transition-all duration-150"
              title="Download full python code as zip"
              id="btn_download_pipeline"
            >
              <FileCode className="w-3.5 h-3.5 text-gray-600" />
              Download Python Code (.zip)
            </a>

            {status !== "idle" && (
              <button
                onClick={handleReset}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-white hover:bg-gray-50 text-gray-700 text-xs font-medium rounded-md border border-gray-200 transition-all duration-150"
                id="btn_reset"
              >
                <RefreshCw className="w-3.5 h-3.5 text-gray-500" />
                Upload New
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Primary Dashboard Area */}
      <main className="max-w-7xl mx-auto px-6 py-8" id="dashboard_main">
        <AnimatePresence mode="wait">
          
          {/* IDLE & PROCESSING STATE: UPLOAD SECTION */}
          {status !== "completed" && status !== "error" && (
            <motion.div
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              transition={{ duration: 0.3 }}
              className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start"
              key="uploader_view"
            >
              {/* Left Column: Brief pipeline purpose */}
              <div className="lg:col-span-5 space-y-6">
                <div className="space-y-3">
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-gray-200/65 text-gray-800 text-xs font-mono rounded-full font-medium border border-gray-300/60">
                    <span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" />
                    Offline Sandbox Mode
                  </span>
                  <h2 className="text-3xl font-bold tracking-tight text-gray-900 leading-tight">
                    Convert Textbooks into <span className="text-gray-600 font-medium">Structured Knowledge</span>
                  </h2>
                  <p className="text-sm text-gray-600 leading-relaxed">
                    This pipeline parses textbook materials and splits them into clean, semantically intact chunks ready for offline AI retrieval systems.
                  </p>
                </div>

                {/* Local environment properties */}
                <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-400 font-mono">Pipeline Features</h3>
                  
                  <div className="space-y-3">
                    <div className="flex items-start gap-3">
                      <div className="p-1 bg-gray-100 rounded text-gray-700 mt-0.5">
                        <BookOpen className="w-4 h-4" />
                      </div>
                      <div>
                        <h4 className="text-xs font-medium text-gray-800">Layout Invariance</h4>
                        <p className="text-xs text-gray-500 mt-0.5">Page-aligned tracking and heading level maps for Chapters & Sections.</p>
                      </div>
                    </div>

                    <div className="flex items-start gap-3">
                      <div className="p-1 bg-gray-100 rounded text-gray-700 mt-0.5">
                        <Table className="w-4 h-4" />
                      </div>
                      <div>
                        <h4 className="text-xs font-medium text-gray-800">Structured Objects</h4>
                        <p className="text-xs text-gray-500 mt-0.5">Local parsing of latex expressions, unicode formulas, and markdown tables.</p>
                      </div>
                    </div>

                    <div className="flex items-start gap-3">
                      <div className="p-1 bg-gray-100 rounded text-gray-700 mt-0.5">
                        <Binary className="w-4 h-4" />
                      </div>
                      <div>
                        <h4 className="text-xs font-medium text-gray-800">Semantic Windowing</h4>
                        <p className="text-xs text-gray-500 mt-0.5">Generates clean chunks with sliding character overlap bounds and ID tags.</p>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 text-xs text-gray-400 font-mono bg-gray-100/50 p-3 rounded-lg border border-dashed border-gray-200">
                  <Info className="w-4 h-4 text-gray-400 shrink-0" />
                  <span>Supports: PDF (.pdf) & Plain text textbooks (.txt) up to 50MB.</span>
                </div>
              </div>

              {/* Right Column: Uploader Dropzone or Progress */}
              <div className="lg:col-span-7">
                {status === "idle" ? (
                  <div
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={handleDrop}
                    onClick={triggerFileInput}
                    className={`border-2 border-dashed rounded-2xl bg-white p-12 text-center flex flex-col items-center justify-center min-h-[400px] cursor-pointer transition-all duration-200 group ${
                      isDragging
                        ? "border-gray-800 bg-gray-50/70"
                        : "border-gray-200 hover:border-gray-400"
                    }`}
                    id="drop_zone"
                  >
                    <input
                      type="file"
                      ref={fileInputRef}
                      onChange={handleFileChange}
                      accept=".pdf,.txt"
                      className="hidden"
                      id="file_input"
                    />

                    <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center text-gray-500 group-hover:scale-105 transition-transform duration-200 border border-gray-200 shadow-sm mb-6">
                      <Upload className="w-6 h-6 text-gray-600" />
                    </div>

                    <h3 className="text-lg font-medium text-gray-900 mb-2">Import Textbook File</h3>
                    <p className="text-sm text-gray-500 max-w-sm mb-6 leading-relaxed">
                      Drag & drop your textbook file here, or <span className="text-gray-800 font-medium underline">browse your local drive</span>
                    </p>

                    <div className="flex items-center justify-center gap-6 text-xs text-gray-400 font-mono border-t border-gray-100 pt-6 w-full max-w-md">
                      <span className="flex items-center gap-1.5"><FileText className="w-3.5 h-3.5" /> PDF Textbooks</span>
                      <span className="flex items-center gap-1.5"><FileText className="w-3.5 h-3.5" /> Plain Text TXT</span>
                    </div>
                  </div>
                ) : (
                  // Uploading & Processing Progress Screen
                  <div className="bg-white border border-gray-200 rounded-2xl p-10 flex flex-col items-center justify-center min-h-[400px]" id="processing_panel">
                    <div className="relative mb-8 flex items-center justify-center">
                      {/* Outer spinning ring */}
                      <div className="w-20 h-20 border-4 border-gray-100 border-t-gray-800 rounded-full animate-spin" />
                      {/* Inner icon */}
                      <div className="absolute">
                        <BookOpen className="w-7 h-7 text-gray-600 animate-pulse" />
                      </div>
                    </div>

                    <h3 className="text-lg font-medium text-gray-900 mb-2 font-mono">Running Pipeline Extraction</h3>
                    <p className="text-sm text-gray-500 mb-1 font-mono">{progressMsg}</p>
                    <span className="text-xs text-gray-400 italic">No cloud integrations — computing purely on local sandbox...</span>

                    <div className="w-full max-w-xs bg-gray-100 h-1.5 rounded-full overflow-hidden mt-6 border border-gray-200">
                      <motion.div
                        className="bg-gray-800 h-full rounded-full"
                        initial={{ width: "10%" }}
                        animate={{ width: status === "uploading" ? "40%" : "85%" }}
                        transition={{ duration: 1.5 }}
                      />
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
          )}

          {/* COMPLETED SUCCESS STATE */}
          {status === "completed" && processedData && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="space-y-8"
              key="success_view"
            >
              {/* Stats & Core Actions Panel */}
              <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm flex flex-col md:flex-row items-start md:items-center justify-between gap-6" id="summary_bar">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-green-50 text-green-600 rounded-full flex items-center justify-center border border-green-200 shrink-0">
                    <CheckCircle2 className="w-6 h-6" />
                  </div>
                  <div>
                    <span className="text-xs font-semibold text-green-700 uppercase tracking-wider font-mono">Conversion Completed</span>
                    <h2 className="text-xl font-bold text-gray-900">{processedData.metadata.source_file}</h2>
                    <p className="text-xs text-gray-500 mt-0.5 flex items-center gap-3">
                      <span className="flex items-center gap-1 font-mono"><Clock className="w-3 h-3" /> {processedData.metadata.processing_time_seconds}s processing time</span>
                      <span className="flex items-center gap-1 font-mono"><HardDrive className="w-3 h-3" /> {(processedData.metadata.file_size_bytes / 1024).toFixed(1)} KB size</span>
                    </p>
                  </div>
                </div>

                {/* Primary Ceiled Actions: Save Processed Outputs */}
                <div className="flex flex-wrap items-center gap-3">
                  <button
                    onClick={downloadJSON}
                    className="flex items-center gap-2 px-4 py-2.5 bg-gray-900 hover:bg-gray-800 text-white text-xs font-semibold rounded-lg shadow-sm transition-all duration-150"
                    id="btn_download_json"
                  >
                    <Download className="w-4 h-4" />
                    Download JSON (.json)
                  </button>

                  <button
                    onClick={downloadCleanedTxt}
                    className="flex items-center gap-2 px-4 py-2.5 bg-white hover:bg-gray-50 text-gray-800 text-xs font-semibold rounded-lg border border-gray-300 shadow-sm transition-all duration-150"
                    id="btn_download_txt"
                  >
                    <Download className="w-4 h-4" />
                    Download Cleaned TXT (.txt)
                  </button>
                </div>
              </div>

              {/* Statistical Bento Overview */}
              <div className="grid grid-cols-2 md:grid-cols-6 gap-4" id="stats_grid">
                <div className="bg-white border border-gray-200 p-4 rounded-xl text-center">
                  <span className="text-xs text-gray-400 font-medium font-mono uppercase block">Pages</span>
                  <span className="text-2xl font-bold text-gray-800 mt-1 block">{processedData.metadata.page_count || "N/A"}</span>
                </div>
                <div className="bg-white border border-gray-200 p-4 rounded-xl text-center">
                  <span className="text-xs text-gray-400 font-medium font-mono uppercase block">Chapters</span>
                  <span className="text-2xl font-bold text-gray-800 mt-1 block">{processedData.metadata.detected_chapters_count}</span>
                </div>
                <div className="bg-white border border-gray-200 p-4 rounded-xl text-center">
                  <span className="text-xs text-gray-400 font-medium font-mono uppercase block">Subsections</span>
                  <span className="text-2xl font-bold text-gray-800 mt-1 block">{processedData.metadata.detected_sections_count}</span>
                </div>
                <div className="bg-white border border-gray-200 p-4 rounded-xl text-center">
                  <span className="text-xs text-gray-400 font-medium font-mono uppercase block">Text Chunks</span>
                  <span className="text-2xl font-bold text-gray-800 mt-1 block">{processedData.metadata.chunks_count}</span>
                </div>
                <div className="bg-white border border-gray-200 p-4 rounded-xl text-center">
                  <span className="text-xs text-gray-400 font-medium font-mono uppercase block">Formulas</span>
                  <span className="text-2xl font-bold text-gray-800 mt-1 block">{processedData.metadata.formulas_count}</span>
                </div>
                <div className="bg-white border border-gray-200 p-4 rounded-xl text-center">
                  <span className="text-xs text-gray-400 font-medium font-mono uppercase block">Tables</span>
                  <span className="text-2xl font-bold text-gray-800 mt-1 block">{processedData.metadata.tables_count}</span>
                </div>
              </div>

              {/* Dynamic Content Explorer */}
              <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden" id="tab_panel">
                {/* Navigation Tab Header */}
                <div className="border-b border-gray-200 bg-gray-50/50 px-6 py-2 flex flex-wrap items-center justify-between gap-4">
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => setActiveTab("chunks")}
                      className={`px-3 py-3 text-xs font-semibold border-b-2 font-mono transition-all duration-150 ${
                        activeTab === "chunks"
                          ? "border-gray-900 text-gray-900"
                          : "border-transparent text-gray-400 hover:text-gray-600"
                      }`}
                    >
                      Chunks ({processedData.text_chunks.length})
                    </button>

                    <button
                      onClick={() => setActiveTab("headings")}
                      className={`px-3 py-3 text-xs font-semibold border-b-2 font-mono transition-all duration-150 ${
                        activeTab === "headings"
                          ? "border-gray-900 text-gray-900"
                          : "border-transparent text-gray-400 hover:text-gray-600"
                      }`}
                    >
                      Structure ({processedData.sections.length})
                    </button>

                    <button
                      onClick={() => setActiveTab("tables")}
                      className={`px-3 py-3 text-xs font-semibold border-b-2 font-mono transition-all duration-150 ${
                        activeTab === "tables"
                          ? "border-gray-900 text-gray-900"
                          : "border-transparent text-gray-400 hover:text-gray-600"
                      }`}
                    >
                      Tables ({processedData.table_objects.length})
                    </button>

                    <button
                      onClick={() => setActiveTab("formulas")}
                      className={`px-3 py-3 text-xs font-semibold border-b-2 font-mono transition-all duration-150 ${
                        activeTab === "formulas"
                          ? "border-gray-900 text-gray-900"
                          : "border-transparent text-gray-400 hover:text-gray-600"
                      }`}
                    >
                      Formulas ({processedData.formula_objects.length})
                    </button>

                    <button
                      onClick={() => setActiveTab("codebase")}
                      className={`px-3 py-3 text-xs font-semibold border-b-2 font-mono transition-all duration-150 ${
                        activeTab === "codebase"
                          ? "border-gray-900 text-gray-900"
                          : "border-transparent text-gray-400 hover:text-gray-600"
                      }`}
                    >
                      Python Pipeline Code
                    </button>
                  </div>

                  <span className="text-xs text-gray-400 font-mono">Live Extraction View</span>
                </div>

                {/* Tab Contents */}
                <div className="p-6">
                  
                  {/* CHUNKS TAB */}
                  {activeTab === "chunks" && (
                    <div className="space-y-4 max-h-[500px] overflow-y-auto pr-2">
                      {processedData.text_chunks.map((chunk: any) => (
                        <div key={chunk.id} className="border border-gray-200 rounded-xl p-4 bg-[#FAFBFD]/50 hover:bg-white transition-all">
                          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-100 pb-2 mb-3">
                            <span className="text-xs font-bold font-mono text-gray-800 uppercase bg-gray-200/60 px-2 py-0.5 rounded">
                              {chunk.id}
                            </span>
                            <div className="flex flex-wrap items-center gap-1.5 text-[10px] font-mono text-gray-500">
                              {chunk.page && (
                                <span className="bg-gray-100 px-1.5 py-0.5 rounded">
                                  Page {chunk.page}
                                </span>
                              )}
                              <span className="bg-gray-100 px-1.5 py-0.5 rounded truncate max-w-[150px]" title={chunk.chapter}>
                                Ch: {chunk.chapter}
                              </span>
                              {chunk.section && (
                                <span className="bg-gray-100 px-1.5 py-0.5 rounded truncate max-w-[150px]" title={chunk.section}>
                                  Sec: {chunk.section}
                                </span>
                              )}
                            </div>
                          </div>
                          <p className="text-xs text-gray-700 leading-relaxed font-sans whitespace-pre-line">
                            {chunk.content}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* STRUCTURE TAB */}
                  {activeTab === "headings" && (
                    <div className="max-h-[500px] overflow-y-auto space-y-2">
                      <h3 className="text-xs font-semibold text-gray-400 font-mono uppercase mb-3">Detected Textbook Hierarchy</h3>
                      {processedData.sections.map((section: any, idx: number) => {
                        const levelClass =
                          section.level === 1
                            ? "pl-0 font-bold text-gray-900 text-sm py-2 border-b border-gray-100"
                            : section.level === 2
                            ? "pl-6 text-gray-800 text-xs py-1"
                            : "pl-12 text-gray-500 text-[11px] italic py-0.5";

                        return (
                          <div key={idx} className={`flex items-center justify-between ${levelClass}`}>
                            <div className="flex items-center gap-2 truncate">
                              {section.level === 1 ? (
                                <ChevronDown className="w-4 h-4 text-gray-500 shrink-0" />
                              ) : (
                                <ChevronRight className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                              )}
                              <span className="truncate">{section.title}</span>
                            </div>
                            {section.page_start && (
                              <span className="text-[10px] font-mono text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded">
                                Starts on Page {section.page_start}
                              </span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* TABLES TAB */}
                  {activeTab === "tables" && (
                    <div className="space-y-6 max-h-[500px] overflow-y-auto">
                      {processedData.table_objects.length === 0 ? (
                        <div className="text-center py-10">
                          <Table className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                          <p className="text-xs text-gray-400 font-mono">No explicit grid structures detected in this textbook.</p>
                        </div>
                      ) : (
                        processedData.table_objects.map((table: any) => (
                          <div key={table.id} className="border border-gray-200 rounded-xl overflow-hidden">
                            <div className="bg-gray-50 px-4 py-2 border-b border-gray-200 flex justify-between items-center">
                              <span className="text-xs font-bold font-mono text-gray-800">{table.id.toUpperCase()}</span>
                              <span className="text-[10px] font-mono text-gray-400">Page {table.page} | Chapter: {table.chapter}</span>
                            </div>
                            <div className="p-4 overflow-x-auto">
                              <table className="min-w-full divide-y divide-gray-200 text-xs">
                                <thead className="bg-gray-50/50">
                                  <tr>
                                    {table.header.map((col: string, cIdx: number) => (
                                      <th key={cIdx} className="px-3 py-2 text-left font-semibold text-gray-600 border border-gray-200">
                                        {col}
                                      </th>
                                    ))}
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                  {table.content.slice(1).map((row: string[], rIdx: number) => (
                                    <tr key={rIdx} className="hover:bg-gray-50/50">
                                      {row.map((cell: string, cIdx: number) => (
                                        <td key={cIdx} className="px-3 py-2 text-gray-700 border border-gray-100 max-w-[200px] truncate" title={cell}>
                                          {cell}
                                        </td>
                                      ))}
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  )}

                  {/* FORMULAS TAB */}
                  {activeTab === "formulas" && (
                    <div className="space-y-4 max-h-[500px] overflow-y-auto pr-2">
                      {processedData.formula_objects.length === 0 ? (
                        <div className="text-center py-10">
                          <Binary className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                          <p className="text-xs text-gray-400 font-mono">No mathematical notation or equations detected in this textbook.</p>
                        </div>
                      ) : (
                        processedData.formula_objects.map((formula: any) => (
                          <div key={formula.id} className="border border-gray-200 rounded-xl p-4 bg-gray-50/40">
                            <div className="flex justify-between items-center border-b border-gray-100 pb-2 mb-3">
                              <span className="text-xs font-bold font-mono text-gray-800 uppercase">{formula.id}</span>
                              <span className="text-[10px] font-mono text-gray-400">Page {formula.page} | Chapter: {formula.chapter}</span>
                            </div>
                            <div className="py-3 px-4 bg-white border border-gray-100 rounded-lg text-center font-mono text-sm text-gray-800 overflow-x-auto shadow-inner">
                              {formula.content}
                            </div>
                            <div className="mt-3 text-[11px] text-gray-500 font-mono">
                              <span className="font-semibold block mb-1">Context:</span>
                              <div className="bg-gray-100/60 p-2 rounded whitespace-pre-line leading-relaxed">
                                {formula.context}
                              </div>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  )}

                  {/* PYTHON EXPLORER TAB */}
                  {activeTab === "codebase" && (
                    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 min-h-[400px]">
                      {/* Script List */}
                      <div className="lg:col-span-4 space-y-2">
                        <span className="text-[10px] font-semibold text-gray-400 font-mono uppercase tracking-wider block mb-2">
                          Pipeline Script Files
                        </span>
                        
                        {PYTHON_SCRIPTS.map((script) => (
                          <button
                            key={script.id}
                            onClick={() => setSelectedScript(script.id)}
                            className={`w-full text-left p-3 rounded-lg border transition-all flex flex-col gap-1 ${
                              selectedScript === script.id
                                ? "bg-gray-900 border-gray-900 text-white"
                                : "bg-white border-gray-200 text-gray-700 hover:border-gray-300"
                            }`}
                          >
                            <span className="text-xs font-semibold font-mono">{script.name}</span>
                            <span className={`text-[10px] ${selectedScript === script.id ? "text-gray-400" : "text-gray-400"}`}>
                              {script.desc}
                            </span>
                          </button>
                        ))}
                      </div>

                      {/* Code Viewer */}
                      <div className="lg:col-span-8 border border-gray-200 rounded-xl overflow-hidden flex flex-col bg-[#1A1A1E]">
                        <div className="bg-[#121214] px-4 py-2 flex items-center justify-between border-b border-gray-800">
                          <span className="text-[11px] font-mono text-gray-400">{selectedScript}</span>
                          <button
                            onClick={handleCopyScript}
                            className="flex items-center gap-1 text-[10px] text-gray-400 hover:text-white font-mono"
                          >
                            <Copy className="w-3 h-3" />
                            {copiedScript ? "Copied!" : "Copy"}
                          </button>
                        </div>

                        <div className="p-4 overflow-auto flex-1 font-mono text-xs text-[#E3E3E6] leading-relaxed max-h-[380px] min-h-[300px]">
                          {fetchingScript ? (
                            <div className="flex items-center justify-center h-full py-10">
                              <span className="animate-pulse">Loading script code...</span>
                            </div>
                          ) : (
                            <pre className="whitespace-pre">{scriptContent}</pre>
                          )}
                        </div>
                      </div>
                    </div>
                  )}

                </div>
              </div>
            </motion.div>
          )}

          {/* ERROR EXCEPTION STATE */}
          {status === "error" && (
            <motion.div
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.98 }}
              className="bg-white border border-red-200 rounded-2xl p-8 max-w-xl mx-auto text-center shadow-sm"
              key="error_view"
            >
              <div className="w-16 h-16 bg-red-50 text-red-600 rounded-full flex items-center justify-center border border-red-100 mx-auto mb-6">
                <AlertTriangle className="w-8 h-8" />
              </div>

              <h2 className="text-lg font-bold text-gray-900 mb-2 font-mono">Pipeline execution failed</h2>
              <p className="text-sm text-gray-600 mb-6 leading-relaxed bg-red-50/50 p-4 rounded-xl border border-red-100 font-mono">
                {error}
              </p>

              <button
                onClick={handleReset}
                className="px-5 py-2.5 bg-gray-900 hover:bg-gray-800 text-white text-xs font-semibold rounded-lg shadow transition-all duration-150"
              >
                Retry Import
              </button>
            </motion.div>
          )}

        </AnimatePresence>
      </main>

      {/* Humble Footer Margin */}
      <footer className="max-w-7xl mx-auto px-6 py-10 text-center text-xs text-gray-400 font-mono border-t border-gray-200/60 mt-16">
        <span>Offline Textbook Processing Pipeline | Pure sandboxed layout transformation</span>
      </footer>
    </div>
  );
}
