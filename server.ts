import express from "express";
import path from "path";
import fs from "fs";
import { createServer as createViteServer } from "vite";
import JSZip from "jszip";
import {
  extractPdf,
  extractTxt,
  formatCleanedTxtNode,
  removeDuplicateWhitespace,
  ProcessedTextbook,
  TextbookMetadata,
} from "./src/server/parser.js";

const app = express();
const PORT = 3000;

// Enable CORS and raw body parsing for textbook processing
app.use(express.json({ limit: "50mb" }));

// Endpoint to process a textbook raw buffer
app.post(
  "/api/process",
  express.raw({ type: ["application/pdf", "text/plain"], limit: "50mb" }),
  async (req, res) => {
    const startTime = Date.now();
    try {
      const filename = (req.headers["x-filename"] as string) || "textbook.txt";
      const contentType = req.headers["content-type"] || "";
      const fileBuffer = req.body;

      if (!fileBuffer || fileBuffer.length === 0) {
        return res.status(400).json({ error: "Empty file uploaded." });
      }

      const fileExtension = path.extname(filename).toLowerCase();
      if (fileExtension !== ".pdf" && fileExtension !== ".txt") {
        return res.status(400).json({
          error: "Unsupported file format. Only PDF (.pdf) and Plain Text (.txt) files are supported.",
        });
      }

      console.log(`[*] Processing textbook '${filename}' of size ${fileBuffer.length} bytes`);

      let extracted: Omit<ProcessedTextbook, "metadata">;

      if (fileExtension === ".pdf") {
        extracted = await extractPdf(fileBuffer);
      } else {
        extracted = extractTxt(filename, fileBuffer);
      }

      const processingTime = (Date.now() - startTime) / 1000;

      const metadata: TextbookMetadata = {
        source_file: filename,
        file_type: fileExtension === ".pdf" ? "PDF" : "Plain Text",
        file_size_bytes: fileBuffer.length,
        page_count: extracted.sections[0]?.page_start ? extracted.sections[extracted.sections.length - 1]?.page_start : 1,
        processed_at: new Date().toISOString().replace("T", " ").substring(0, 19) + " UTC",
        processing_time_seconds: parseFloat(processingTime.toFixed(3)),
        detected_chapters_count: extracted.chapters.length,
        detected_sections_count: extracted.sections.filter((s) => s.level > 1).length,
        chunks_count: extracted.text_chunks.length,
        tables_count: extracted.table_objects.length,
        formulas_count: extracted.formula_objects.length,
        images_count: extracted.image_objects.length,
      };

      // Set page count correctly on metadata if PDF
      if (fileExtension === ".pdf") {
        // Find highest page index in chunks or formulas or tables
        let maxPage = 1;
        extracted.text_chunks.forEach((c) => { if (c.page && c.page > maxPage) maxPage = c.page; });
        metadata.page_count = maxPage;
      }

      const processedBook: ProcessedTextbook = {
        metadata,
        chapters: extracted.chapters,
        sections: extracted.sections,
        text_chunks: extracted.text_chunks,
        formula_objects: extracted.formula_objects,
        image_objects: extracted.image_objects,
        table_objects: extracted.table_objects,
      };

      // Generate the cleaned text alternative as well
      const cleanedTxt = formatCleanedTxtNode(processedBook);

      return res.json({
        success: true,
        data: processedBook,
        cleanedTxt,
      });
    } catch (error: any) {
      console.error("[ERROR] Failed to process textbook:", error);
      return res.status(500).json({
        success: false,
        error: error.message || "An error occurred during textbook conversion.",
      });
    }
  }
);

// Endpoint to dynamically package and download the Python offline codebase
app.get("/api/download-pipeline", async (req, res) => {
  try {
    const zip = new JSZip();

    // Read the python scripts we created and add them to the zip
    const scriptFiles = [
      "scripts/models.py",
      "scripts/chunker.py",
      "scripts/extractor_txt.py",
      "scripts/extractor_pdf.py",
      "scripts/pipeline.py",
      "input/README.md",
      "output/README.md",
    ];

    for (const file of scriptFiles) {
      const fullPath = path.join(process.cwd(), file);
      if (fs.existsSync(fullPath)) {
        const fileContent = fs.readFileSync(fullPath, "utf-8");
        zip.file(file, fileContent);
      }
    }

    const contentBuffer = await zip.generateAsync({ type: "nodebuffer" });

    res.setHeader("Content-Type", "application/zip");
    res.setHeader(
      "Content-Disposition",
      "attachment; filename=offline_textbook_pipeline.zip"
    );
    return res.send(contentBuffer);
  } catch (error: any) {
    console.error("[ERROR] Failed to generate code zip:", error);
    return res.status(500).json({ error: "Failed to download code package." });
  }
});

// Endpoint to fetch specific python script contents for view
app.get("/api/python-script/:name", (req, res) => {
  try {
    const scriptName = req.params.name;
    const allowed = [
      "models.py",
      "chunker.py",
      "extractor_txt.py",
      "extractor_pdf.py",
      "pipeline.py",
    ];

    if (!allowed.includes(scriptName)) {
      return res.status(400).json({ error: "Access denied." });
    }

    const filePath = path.join(process.cwd(), "scripts", scriptName);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: "Script not found." });
    }

    const content = fs.readFileSync(filePath, "utf-8");
    return res.json({ name: scriptName, content });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// Integrate Vite Middleware or Production Server
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
