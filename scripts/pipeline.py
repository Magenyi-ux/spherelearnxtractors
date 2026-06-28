#!/usr/bin/env python3
"""
Main entry point for the Offline Textbook Processing Pipeline.
Integrates input loading, parsing, chunking, and final generation.
"""

import os
import sys
import argparse
import time
import re
from datetime import datetime
from typing import Optional

from .models import (
    TextbookMetadata,
    ProcessedTextbook,
    SectionNode
)
from .extractor_txt import extract_txt_textbook
from .extractor_pdf import extract_pdf_textbook
from .chunker import semantic_chunk_text


def format_cleaned_txt(processed: ProcessedTextbook) -> str:
    """
    Formats the processed textbook into a cleaned plain text representation:
    - Correct heading hierarchy (using standard #, ##, ### indicators or clean line breaks)
    - Proper spacing (exactly one blank line between paragraphs, two blank lines before headings)
    - Removed duplicate whitespace
    - Preserved chapter order
    """
    output_lines = []
    
    # 1. Output Header Metadata
    output_lines.append("=" * 80)
    output_lines.append(f"PROCESSED TEXTBOOK: {processed.metadata.source_file}")
    output_lines.append(f"Processed on: {processed.metadata.processed_at}")
    output_lines.append("=" * 80)
    output_lines.append("")
    
    # Track which sections belong to which chapters
    chapters_content = {}
    for chap in processed.chapters:
        chapters_content[chap] = []
        
    # Group sections by chapter
    for sec in processed.sections:
        chap_parent = sec.chapter_parent or "Preface"
        if chap_parent not in chapters_content:
            chapters_content[chap_parent] = []
        chapters_content[chap_parent].append(sec)

    # Group chunks by chapter and section
    chunks_by_section = {}
    for chunk in processed.text_chunks:
        key = (chunk.chapter, chunk.section)
        if key not in chunks_by_section:
            chunks_by_section[key] = []
        chunks_by_section[key].append(chunk)

    # Traverse according to chapter order
    for chap in processed.chapters:
        # Chapter Heading
        output_lines.append("")
        output_lines.append(f"# {chap.upper()}")
        output_lines.append("-" * len(chap))
        output_lines.append("")

        # Add chunks representing Chapter-level intro (if any) before detailed sections
        intro_key = (chap, "General")
        if intro_key in chunks_by_section:
            for chunk in chunks_by_section[intro_key]:
                # Remove duplicate whitespace inside text content
                clean_content = re.sub(r'[ \t]+', ' ', chunk.content)
                clean_content = re.sub(r'\n\s*\n', '\n\n', clean_content)
                output_lines.append(clean_content.strip())
                output_lines.append("")
            del chunks_by_section[intro_key]

        # Add individual sections
        sections_in_chap = chapters_content.get(chap, [])
        # Filter for subheadings (Level 2 or 3) since Level 1 is the chapter itself
        subsections = [s for s in sections_in_chap if s.level > 1]
        
        for sec in subsections:
            # Format subheadings
            prefix = "## " if sec.level == 2 else "### "
            output_lines.append("")
            output_lines.append(f"{prefix}{sec.title}")
            output_lines.append("")

            # Find matching chunks
            sec_key = (chap, sec.title)
            if sec_key in chunks_by_section:
                for chunk in chunks_by_section[sec_key]:
                    clean_content = re.sub(r'[ \t]+', ' ', chunk.content)
                    clean_content = re.sub(r'\n\s*\n', '\n\n', clean_content)
                    output_lines.append(clean_content.strip())
                    output_lines.append("")
                del chunks_by_section[sec_key]

        # Cleanup leftover keys for this chapter (e.g. mismatching sections)
        for key in list(chunks_by_section.keys()):
            if key[0] == chap:
                for chunk in chunks_by_section[key]:
                    clean_content = re.sub(r'[ \t]+', ' ', chunk.content)
                    clean_content = re.sub(r'\n\s*\n', '\n\n', clean_content)
                    output_lines.append(clean_content.strip())
                    output_lines.append("")
                del chunks_by_section[key]

    # Combine text and enforce clean line spacing
    raw_txt_output = "\n".join(output_lines)
    # Remove duplicate blank lines
    raw_txt_output = re.sub(r'\n{3,}', '\n\n', raw_txt_output)
    
    return raw_txt_output.strip()


def run_pipeline(input_path: str, output_format: str, output_dir: str) -> str:
    """
    Runs the offline extraction and chunking pipeline.
    """
    start_time = time.time()
    
    # 1. Error handling: Validation
    if not os.path.exists(input_path):
        raise FileNotFoundError(f"Input textbook file does not exist: {input_path}")
        
    filename = os.path.basename(input_path)
    file_size = os.path.getsize(input_path)
    
    if file_size == 0:
        raise ValueError(f"Input textbook file is empty: {filename}")
        
    _, ext = os.path.splitext(filename)
    ext = ext.lower()
    
    if ext not in ['.pdf', '.txt']:
        raise ValueError(f"Unsupported file type '{ext}'. Only .pdf and .txt files are supported.")

    print(f"[*] Starting offline extraction for textbook: {filename} ({file_size / 1024:.1f} KB)")
    
    raw_pages = []
    chapters = []
    sections = []
    formulas = []
    tables = []
    images = []

    # 2. Extract content based on file type
    if ext == '.txt':
        raw_pages, chapters, sections, formulas, tables = extract_txt_textbook(input_path)
    elif ext == '.pdf':
        raw_pages, chapters, sections, formulas, tables, images = extract_pdf_textbook(input_path)

    # 3. Create textbook metadata
    metadata = TextbookMetadata(
        source_file=filename,
        file_type="PDF" if ext == '.pdf' else "Plain Text",
        file_size_bytes=file_size,
        page_count=len(raw_pages),
        processed_at=datetime.now().strftime("%Y-%m-%d %H:%M:%S UTC"),
        detected_chapters_count=len(chapters),
        detected_sections_count=len([s for s in sections if s.level > 1]),
        tables_count=len(tables),
        formulas_count=len(formulas),
        images_count=len(images)
    )

    # 4. Generate Semantic Chunks
    print("[*] Performing semantic chunking...")
    # Convert sections nodes to simple dict lists for standard processing compatibility
    sections_dict_list = []
    for s in sections:
        sections_dict_list.append({
            "title": s.title,
            "level": s.level,
            "chapter_parent": s.chapter_parent
        })
        
    chunks = semantic_chunk_text(
        raw_text_by_page=raw_pages,
        sections_list=sections_dict_list,
        source_filename=filename
    )
    
    metadata.chunks_count = len(chunks)
    metadata.processing_time_seconds = round(time.time() - start_time, 3)

    # Compile textbook object
    processed = ProcessedTextbook(
        metadata=metadata,
        chapters=chapters,
        sections=sections,
        text_chunks=chunks,
        formula_objects=formulas,
        image_objects=images,
        table_objects=tables
    )

    # Ensure output directory exists
    os.makedirs(output_dir, exist_ok=True)
    
    # 5. Generate outputs
    base_name, _ = os.path.splitext(filename)
    
    if output_format.lower() == 'json':
        output_filename = f"{base_name}_structured.json"
        dest_path = os.path.join(output_dir, output_filename)
        with open(dest_path, 'w', encoding='utf-8') as f:
            f.write(processed.to_json())
        print(f"[+] Structured JSON saved successfully: {dest_path}")
        return dest_path
        
    elif output_format.lower() == 'txt':
        output_filename = f"{base_name}_cleaned.txt"
        dest_path = os.path.join(output_dir, output_filename)
        cleaned_txt = format_cleaned_txt(processed)
        with open(dest_path, 'w', encoding='utf-8') as f:
            f.write(cleaned_txt)
        print(f"[+] Cleaned Textbook TXT saved successfully: {dest_path}")
        return dest_path
        
    else:
        raise ValueError(f"Invalid output format specified: {output_format}")


import re

def run_pipeline_cli():
    parser = argparse.ArgumentParser(description="Offline Textbook Processing Pipeline")
    parser.add_argument("input_file", help="Path to the PDF or TXT textbook file")
    parser.add_argument("-f", "--format", choices=["json", "txt"], default="json", help="Output file format (json or txt)")
    parser.add_argument("-o", "--output-dir", default="./output", help="Directory where results will be saved")
    
    args = parser.parse_args()
    
    try:
        saved_path = run_pipeline(args.input_file, args.format, args.output_dir)
        print(f"[SUCCESS] Textbook processed successfully in {args.format.upper()} format.")
        return saved_path
    except Exception as e:
        print(f"[ERROR] Pipeline execution failed: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    run_pipeline_cli()
