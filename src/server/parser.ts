import fs from "fs";
import path from "path";
// Use dynamic or standard require for pdf-parse to avoid TypeScript ESM default import compile flags issues
import { createRequire } from "module";
const requireFn = createRequire(import.meta.url);
const pdf = requireFn("pdf-parse");

export interface ImageObject {
  id: string;
  name: string;
  page: number | null;
  context: string;
  chapter?: string;
  metadata?: any;
}

export interface TableObject {
  id: string;
  content: string[][];
  markdown_content: string;
  page: number | null;
  header: string[];
  chapter?: string;
  metadata?: any;
}

export interface FormulaObject {
  id: string;
  content: string;
  context: string;
  page: number | null;
  chapter?: string;
  metadata?: any;
}

export interface TextChunk {
  id: string;
  content: string;
  chapter: string;
  section: string;
  topic: string;
  page: number | null;
  source_file: string;
  metadata?: any;
}

export interface SectionNode {
  title: string;
  level: number; // 1 = Chapter, 2 = Section, 3 = Topic
  page_start: number | null;
  page_end?: number | null;
  chapter_parent?: string;
}

export interface TextbookMetadata {
  source_file: string;
  file_type: string;
  file_size_bytes: number;
  page_count: number | null;
  processed_at: string;
  processing_time_seconds: number;
  detected_chapters_count: number;
  detected_sections_count: number;
  chunks_count: number;
  tables_count: number;
  formulas_count: number;
  images_count: number;
}

export interface ProcessedTextbook {
  metadata: TextbookMetadata;
  chapters: string[];
  sections: SectionNode[];
  text_chunks: TextChunk[];
  formula_objects: FormulaObject[];
  image_objects: ImageObject[];
  table_objects: TableObject[];
}

/**
 * Text Cleaner and Spacing Helper
 */
export function removeDuplicateWhitespace(text: string): string {
  // Replace multiple horizontal spaces with a single space
  let cleaned = text.replace(/[ \t]+/g, " ");
  // Standardize page and paragraph spacing
  cleaned = cleaned.replace(/\n\s*\n/g, "\n\n");
  return cleaned.trim();
}

/**
 * Perform Semantic Chunking
 */
export function semanticChunkText(
  pages: { page: number; text: string }[],
  sections: SectionNode[],
  filename: string,
  targetSize: number = 1000,
  overlapSize: number = 150
): TextChunk[] {
  const chunks: TextChunk[] = [];
  let chunkIdCounter = 1;

  let currentChapter = "Preface";
  let currentSection = "Introduction";
  let currentTopic = "Overview";

  // Quick patterns
  const chapterRegex = /^(?:Chapter|CHAPTER|PART|Part)\s+(\d+|[IVXLCDM]+)\s*[:.-]?\s*(.*)$/i;
  const sectionRegex = /^(?:Section|SECTION)\s*(\d+(?:\.\d+)?)\s*[:.-]?\s*(.*)$/i;

  const fullParagraphs: {
    text: string;
    page: number;
    chapter: string;
    section: string;
    topic: string;
  }[] = [];

  for (const pageObj of pages) {
    const pageNum = pageObj.page;
    const text = pageObj.text;

    // Split text into paragraphs by blank lines
    const paragraphs = text.split(/\n\s*\n/);
    for (const para of paragraphs) {
      const paraClean = para.trim();
      if (!paraClean) continue;

      const lines = paraClean.split("\n");
      const firstLine = lines[0]?.trim() || "";

      let isHeading = false;
      // See if it matches any detected section node
      for (const h of sections) {
        if (
          firstLine.toLowerCase().includes(h.title.toLowerCase()) &&
          firstLine.length < 150
        ) {
          isHeading = true;
          if (h.level === 1) {
            currentChapter = h.title;
            currentSection = "";
            currentTopic = "";
          } else if (h.level === 2) {
            currentSection = h.title;
            currentTopic = "";
          } else if (h.level === 3) {
            currentTopic = h.title;
          }
          break;
        }
      }

      if (!isHeading && firstLine.length < 100) {
        if (chapterRegex.test(firstLine)) {
          currentChapter = firstLine;
          currentSection = "";
          currentTopic = "";
        } else if (sectionRegex.test(firstLine)) {
          currentSection = firstLine;
          currentTopic = "";
        }
      }

      fullParagraphs.push({
        text: paraClean,
        page: pageNum,
        chapter: currentChapter,
        section: currentSection || "General",
        topic: currentTopic || "General Content",
      });
    }
  }

  let currentChunkText: string[] = [];
  let currentChunkLen = 0;
  const chunkPages = new Set<number>();

  let chunkChapter = "Preface";
  let chunkSection = "Introduction";
  let chunkTopic = "Overview";

  for (const para of fullParagraphs) {
    const paraText = para.text;
    const paraLen = paraText.length;

    const isNewChapter =
      para.chapter !== chunkChapter && currentChunkText.length > 0;

    if (
      isNewChapter ||
      (currentChunkLen + paraLen > targetSize && currentChunkLen > 0)
    ) {
      // Flush chunk
      const chunkContent = currentChunkText.join("\n\n");
      const avgPage =
        chunkPages.size > 0
          ? Math.min(...Array.from(chunkPages))
          : para.page;

      chunks.push({
        id: `chunk_${String(chunkIdCounter++).padStart(4, "0")}`,
        content: chunkContent,
        chapter: chunkChapter,
        section: chunkSection,
        topic: chunkTopic,
        page: avgPage,
        source_file: filename,
      });

      if (isNewChapter) {
        currentChunkText = [paraText];
        currentChunkLen = paraLen;
        chunkPages.clear();
        chunkPages.add(para.page);
      } else {
        // Simple overlap implementation
        const overlapText: string[] = [];
        let overlapLen = 0;
        for (let i = currentChunkText.length - 1; i >= 0; i--) {
          const prevPara = currentChunkText[i];
          if (overlapLen + prevPara.length < overlapSize) {
            overlapText.unshift(prevPara);
            overlapLen += prevPara.length;
          } else {
            break;
          }
        }
        currentChunkText = [...overlapText, paraText];
        currentChunkLen = overlapLen + paraLen;
        chunkPages.clear();
        chunkPages.add(para.page);
      }
    } else {
      currentChunkText.push(paraText);
      currentChunkLen += paraLen;
      chunkPages.add(para.page);
    }

    chunkChapter = para.chapter;
    chunkSection = para.section;
    chunkTopic = para.topic;
  }

  // Flush last chunk
  if (currentChunkText.length > 0) {
    const chunkContent = currentChunkText.join("\n\n");
    const avgPage =
      chunkPages.size > 0 ? Math.min(...Array.from(chunkPages)) : 1;

    chunks.push({
      id: `chunk_${String(chunkIdCounter++).padStart(4, "0")}`,
      content: chunkContent,
      chapter: chunkChapter,
      section: chunkSection,
      topic: chunkTopic,
      page: avgPage,
      source_file: filename,
    });
  }

  return chunks;
}

/**
 * TXT Extractor (TypeScript version)
 */
export function extractTxt(filePath: string, bufferContent?: Buffer): Omit<ProcessedTextbook, "metadata"> {
  let content = "";
  if (bufferContent) {
    content = bufferContent.toString("utf-8");
  } else {
    content = fs.readFileSync(filePath, "utf-8");
  }

  if (!content.trim()) {
    throw new Error("Textbook file is empty.");
  }

  // Handle virtual pages (every 3000 chars)
  const virtualPages: { page: number; text: string }[] = [];
  const pageSize = 3000;
  for (let i = 0; i < content.length; i += pageSize) {
    virtualPages.push({
      page: Math.floor(i / pageSize) + 1,
      text: content.substring(i, i + pageSize),
    });
  }

  const chapters: string[] = [];
  const sections: SectionNode[] = [];
  const formulas: FormulaObject[] = [];
  const tables: TableObject[] = [];

  const chapterRegex = /^(?:Chapter|CHAPTER|PART|Part)\s+([0-9]+|[IVXLCDM]+)\s*[:.-]?\s*(.+)$/i;
  const sectionRegex = /^([0-9]+\.[0-9]+)\s+([^0-9\n].+)$/;
  const topicRegex = /^([0-9]+\.[0-9]+\.[0-9]+)\s+([^0-9\n].+)$/;

  const lines = content.split("\n");
  let currentChapter = "";
  let formulaCounter = 1;
  let tableCounter = 1;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineStripped = line.trim();
    if (!lineStripped) continue;

    // Virtual page estimation
    const charIndex = content.indexOf(line);
    const estPage = Math.floor(charIndex / pageSize) + 1;

    // Check Chapter
    if (chapterRegex.test(lineStripped)) {
      if (!chapters.includes(lineStripped)) {
        chapters.push(lineStripped);
        currentChapter = lineStripped;
        sections.push({
          title: lineStripped,
          level: 1,
          page_start: estPage,
          chapter_parent: lineStripped,
        });
      }
      continue;
    }

    // Check Section
    if (sectionRegex.test(lineStripped)) {
      sections.push({
        title: lineStripped,
        level: 2,
        page_start: estPage,
        chapter_parent: currentChapter || "Preface",
      });
      continue;
    }

    // Check Topic
    if (topicRegex.test(lineStripped)) {
      sections.push({
        title: lineStripped,
        level: 3,
        page_start: estPage,
        chapter_parent: currentChapter || "Preface",
      });
      continue;
    }

    // Check Formula
    const latexBlock = lineStripped.match(/\$\$(.*?)\$\$/);
    const inlineLatex = lineStripped.match(/\$(.*?)\$/);
    const equationSymbolMatch =
      (lineStripped.includes("=") ||
        lineStripped.includes("≈") ||
        lineStripped.includes("≠")) &&
      ["+", "-", "*", "/", "^", "√", "∑", "∫", "π", "θ", "λ"].some((sym) =>
        lineStripped.includes(sym)
      );

    if (latexBlock || inlineLatex || (equationSymbolMatch && lineStripped.length < 120 && lineStripped.length > 5)) {
      // Collect context
      const prevLine = lines[i - 1] || "";
      const nextLine = lines[i + 1] || "";
      formulas.push({
        id: `formula_${String(formulaCounter++).padStart(3, "0")}`,
        content: lineStripped,
        context: [prevLine, line, nextLine].filter(Boolean).join("\n"),
        page: estPage,
        chapter: currentChapter || "Preface",
      });
    }

    // Check Table
    if (lineStripped.includes("|") && lineStripped.split("|").length >= 3) {
      // Read multi lines
      let endTableIdx = i;
      while (
        endTableIdx < lines.length - 1 &&
        lines[endTableIdx + 1].trim().includes("|")
      ) {
        endTableIdx++;
      }

      const tableLines = lines
        .slice(i, endTableIdx + 1)
        .map((l) => l.trim());
      
      const grid: string[][] = [];
      for (const tLine of tableLines) {
        const cells = tLine
          .split("|")
          .map((c) => c.trim())
          .filter((c, idx, arr) => {
            // Keep cells inside margins
            if (idx === 0 && !c) return false;
            if (idx === arr.length - 1 && !c) return false;
            return true;
          });

        const isSeparator = cells.every((c) => /^[ -:]+$/.test(c));
        if (!isSeparator && cells.length > 0) {
          grid.push(cells);
        }
      }

      if (grid.length > 0) {
        const header = grid[0] || [];
        const prevLine = lines[i - 1] || "";
        const nextLine = lines[endTableIdx + 1] || "";

        tables.push({
          id: `table_${String(tableCounter++).padStart(3, "0")}`,
          content: grid,
          markdown_content: tableLines.join("\n"),
          page: estPage,
          header,
          chapter: currentChapter || "Preface",
        });

        i = endTableIdx; // skip table lines
      }
    }
  }

  if (chapters.length === 0) {
    chapters.push("Main Chapter");
    sections.push({
      title: "Main Chapter",
      level: 1,
      page_start: 1,
      chapter_parent: "Main Chapter",
    });
  }

  const chunks = semanticChunkText(virtualPages, sections, "uploaded.txt");

  return {
    chapters,
    sections,
    text_chunks: chunks,
    formula_objects: formulas,
    image_objects: [],
    table_objects: tables,
  };
}

/**
 * PDF Extractor (TypeScript version)
 */
export async function extractPdf(buffer: Buffer): Promise<Omit<ProcessedTextbook, "metadata">> {
  let PDFParseClass = pdf.PDFParse;
  if (!PDFParseClass && pdf.default) {
    PDFParseClass = pdf.default.PDFParse;
  }
  if (!PDFParseClass) {
    throw new Error("Could not find PDFParse constructor in loaded pdf-parse module.");
  }

  const parser = new PDFParseClass({ data: buffer });
  const textResult = await parser.getText();
  const pageTexts = textResult.pages.map((p: any) => ({
    page: p.num,
    text: p.text,
  }));

  // Re-sort extracted pages because pdf-parse render execution can be parallelized/out-of-order sometimes
  pageTexts.sort((a, b) => a.page - b.page);

  // Correct virtual page index sequential labeling
  for (let idx = 0; idx < pageTexts.length; idx++) {
    pageTexts[idx].page = idx + 1;
  }

  const chapters: string[] = [];
  const sections: SectionNode[] = [];
  const formulas: FormulaObject[] = [];
  const tables: TableObject[] = [];
  const images: ImageObject[] = [];

  const chapterRegex = /^(?:Chapter|CHAPTER|PART|Part)\s+([0-9]+|[IVXLCDM]+)\s*[:.-]?\s*(.+)$/i;
  const sectionRegex = /^([0-9]+\.[0-9]+)\s+([^0-9\n].+)$/;
  const topicRegex = /^([0-9]+\.[0-9]+\.[0-9]+)\s+([^0-9\n].+)$/;

  let formulaCounter = 1;
  let tableCounter = 1;
  let imageCounter = 1;
  let currentChapter = "Preface";

  for (const pageObj of pageTexts) {
    const pageNum = pageObj.page;
    const text = pageObj.text;
    const lines = text.split("\n");

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lineStripped = line.trim();
      if (!lineStripped) continue;

      // Identify Chapter (Level 1)
      if (chapterRegex.test(lineStripped)) {
        if (!chapters.includes(lineStripped)) {
          chapters.push(lineStripped);
          currentChapter = lineStripped;
          sections.push({
            title: lineStripped,
            level: 1,
            page_start: pageNum,
            chapter_parent: lineStripped,
          });
        }
        continue;
      }

      // Identify Section (Level 2)
      if (sectionRegex.test(lineStripped)) {
        sections.push({
          title: lineStripped,
          level: 2,
          page_start: pageNum,
          chapter_parent: currentChapter,
        });
        continue;
      }

      // Identify Topic (Level 3)
      if (topicRegex.test(lineStripped)) {
        sections.push({
          title: lineStripped,
          level: 3,
          page_start: pageNum,
          chapter_parent: currentChapter,
        });
        continue;
      }

      // Identify Formula
      const latexBlock = lineStripped.match(/\$\$(.*?)\$\$/);
      const inlineLatex = lineStripped.match(/\$(.*?)\$/);
      const equationSymbolMatch =
        (lineStripped.includes("=") || lineStripped.includes("≈")) &&
        ["+", "-", "*", "/", "^", "√", "∑", "∫", "π", "θ", "λ"].some((sym) =>
          lineStripped.includes(sym)
        );

      if (latexBlock || inlineLatex || (equationSymbolMatch && lineStripped.length < 120)) {
        const prevLine = lines[i - 1] || "";
        const nextLine = lines[i + 1] || "";
        formulas.push({
          id: `formula_${String(formulaCounter++).padStart(3, "0")}`,
          content: lineStripped,
          context: [prevLine, line, nextLine].filter(Boolean).join("\n"),
          page: pageNum,
          chapter: currentChapter,
        });
      }

      // Identify Table Heuristics
      if (lineStripped.includes("|") && lineStripped.split("|").length >= 3) {
        let endTableIdx = i;
        while (
          endTableIdx < lines.length - 1 &&
          lines[endTableIdx + 1].trim().includes("|")
        ) {
          endTableIdx++;
        }

        const tableLines = lines
          .slice(i, endTableIdx + 1)
          .map((l) => l.trim());
        const grid: string[][] = [];

        for (const tLine of tableLines) {
          const cells = tLine
            .split("|")
            .map((c) => c.trim())
            .filter((c, idx, arr) => {
              if (idx === 0 && !c) return false;
              if (idx === arr.length - 1 && !c) return false;
              return true;
            });

          const isSeparator = cells.every((c) => /^[ -:]+$/.test(c));
          if (!isSeparator && cells.length > 0) {
            grid.push(cells);
          }
        }

        if (grid.length > 0) {
          const header = grid[0] || [];
          tables.push({
            id: `table_${String(tableCounter++).padStart(3, "0")}`,
            content: grid,
            markdown_content: tableLines.join("\n"),
            page: pageNum,
            header,
            chapter: currentChapter,
          });
          i = endTableIdx; // skip table lines
        }
      }

      // Embedded Image Heuristics
      if (
        lineStripped.toLowerCase().includes("[image:") ||
        lineStripped.toLowerCase().includes("[figure:") ||
        lineStripped.toLowerCase().includes("figure ") ||
        lineStripped.toLowerCase().includes("fig. ")
      ) {
        const context = lines
          .slice(Math.max(0, i - 1), Math.min(lines.length, i + 2))
          .join("\n");
        images.push({
          id: `image_${String(imageCounter++).padStart(3, "0")}`,
          name: `img_p${pageNum}_${imageCounter}`,
          page: pageNum,
          context,
          chapter: currentChapter,
        });
      }
    }
  }

  if (chapters.length === 0) {
    chapters.push("Introduction");
    sections.push({
      title: "Introduction",
      level: 1,
      page_start: 1,
      chapter_parent: "Introduction",
    });
  }

  const chunks = semanticChunkText(pageTexts, sections, "uploaded.pdf");

  return {
    chapters,
    sections,
    text_chunks: chunks,
    formula_objects: formulas,
    image_objects: images,
    table_objects: tables,
  };
}

/**
 * Format Cleaned Text representation matching Python pipeline.py
 */
export function formatCleanedTxtNode(processed: ProcessedTextbook): string {
  const outputLines: string[] = [];

  outputLines.push("=".repeat(80));
  outputLines.push(`PROCESSED TEXTBOOK: ${processed.metadata.source_file}`);
  outputLines.push(`Processed on: ${processed.metadata.processed_at}`);
  outputLines.push("=".repeat(80));
  outputLines.push("");

  const chaptersContent: { [key: string]: SectionNode[] } = {};
  for (const chap of processed.chapters) {
    chaptersContent[chap] = [];
  }

  for (const sec of processed.sections) {
    const parent = sec.chapter_parent || "Preface";
    if (!chaptersContent[parent]) {
      chaptersContent[parent] = [];
    }
    chaptersContent[parent].push(sec);
  }

  const chunksBySection: { [key: string]: TextChunk[] } = {};
  for (const chunk of processed.text_chunks) {
    const key = `${chunk.chapter}|||${chunk.section}`;
    if (!chunksBySection[key]) {
      chunksBySection[key] = [];
    }
    chunksBySection[key].push(chunk);
  }

  for (const chap of processed.chapters) {
    outputLines.push("");
    outputLines.push(`# ${chap.toUpperCase()}`);
    outputLines.push("-".repeat(chap.length));
    outputLines.push("");

    const introKey = `${chap}|||General`;
    if (chunksBySection[introKey]) {
      for (const chunk of chunksBySection[introKey]) {
        let clean = chunk.content.replace(/[ \t]+/g, " ");
        clean = clean.replace(/\n\s*\n/g, "\n\n");
        outputLines.push(clean.trim());
        outputLines.push("");
      }
      delete chunksBySection[introKey];
    }

    const subSecs = (chaptersContent[chap] || []).filter((s) => s.level > 1);
    for (const sec of subSecs) {
      const prefix = sec.level === 2 ? "## " : "### ";
      outputLines.push("");
      outputLines.push(`${prefix}${sec.title}`);
      outputLines.push("");

      const secKey = `${chap}|||${sec.title}`;
      if (chunksBySection[secKey]) {
        for (const chunk of chunksBySection[secKey]) {
          let clean = chunk.content.replace(/[ \t]+/g, " ");
          clean = clean.replace(/\n\s*\n/g, "\n\n");
          outputLines.push(clean.trim());
          outputLines.push("");
        }
        delete chunksBySection[secKey];
      }
    }

    // Leftovers for chapter
    for (const key of Object.keys(chunksBySection)) {
      if (key.startsWith(`${chap}|||`)) {
        for (const chunk of chunksBySection[key]) {
          let clean = chunk.content.replace(/[ \t]+/g, " ");
          clean = clean.replace(/\n\s*\n/g, "\n\n");
          outputLines.push(clean.trim());
          outputLines.push("");
        }
        delete chunksBySection[key];
      }
    }
  }

  let rawOutput = outputLines.join("\n");
  rawOutput = rawOutput.replace(/\n{3,}/g, "\n\n");
  return rawOutput.trim();
}
