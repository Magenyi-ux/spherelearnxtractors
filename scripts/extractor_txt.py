"""
TXT Extractor module for the Textbook Processing Pipeline.
Handles plain text files (.txt), parsing headings, chapters, section splits,
and preparing structured representations.
"""

import os
import re
import time
from typing import List, Dict, Any, Tuple
from .models import SectionNode, FormulaObject, TableObject

def extract_txt_textbook(
    file_path: str
) -> Tuple[List[Dict[str, Any]], List[str], List[SectionNode], List[FormulaObject], List[TableObject]]:
    """
    Reads a plaintext file and extracts its textbook structure.
    Detects:
    - Chapters (Level 1)
    - Sections (Level 2)
    - Topics (Level 3)
    - Formulas (LaTeX or standard symbol structures)
    - Tables (Markdown format, csv, or aligned whitespace grids)

    Returns:
    - raw_pages: List of {"page": 1, "text": str}
    - chapters: List of chapter titles
    - sections: List of SectionNode objects
    - formulas: List of FormulaObject objects
    - tables: List of TableObject objects
    """
    if not os.path.exists(file_path):
        raise FileNotFoundError(f"TXT textbook file not found: {file_path}")

    # Read content with encoding fallback
    encodings = ['utf-8', 'latin-1', 'cp1252']
    text_content = ""
    for enc in encodings:
        try:
            with open(file_path, 'r', encoding=enc) as f:
                text_content = f.read()
            break
        except UnicodeDecodeError:
            continue
    else:
        raise ValueError(f"Could not decode text file {file_path} using common encodings.")

    if not text_content.strip():
        raise ValueError("Textbook file is empty.")

    # Plain text files don't have built-in pages, but we can simulate them
    # by splitting text every 3000 characters or using form feeds (\x0c) or page marks.
    page_splits = re.split(r'\x0c|\n-+\s*Page\s+\d+\s*-+\n|\n\s*\[Page\s+\d+\]\s*\n', text_content)
    
    raw_pages: List[Dict[str, Any]] = []
    
    if len(page_splits) > 1:
        # File has explicit page breaks
        for idx, p_text in enumerate(page_splits):
            raw_pages.append({
                "page": idx + 1,
                "text": p_text
            })
    else:
        # Simulate pages every 3000 chars (approx 450 words) to support page numbers
        chunk_size = 3000
        for i in range(0, len(text_content), chunk_size):
            raw_pages.append({
                "page": (i // chunk_size) + 1,
                "text": text_content[i:i+chunk_size]
            })

    chapters: List[str] = []
    sections: List[SectionNode] = []
    formulas: List[FormulaObject] = []
    tables: List[TableObject] = []

    # Compile regex pattern for chapters, sections, and topics
    chapter_regex = re.compile(
        r'^(?:Chapter|CHAPTER|PART|Part)\s+([0-9]+|[IVXLCDM]+)\s*[:.-]?\s*(.+)$', re.MULTILINE
    )
    # Match decimal numbering (e.g., 1.1 Introduction, 4.3.2 Deep Learning)
    section_regex = re.compile(r'^([0-9]+\.[0-9]+)\s+([^0-9\n].+)$', re.MULTILINE)
    topic_regex = re.compile(r'^([0-9]+\.[0-9]+\.[0-9]+)\s+([^0-9\n].+)$', re.MULTILINE)

    # Alternate heading formats (e.g., All Caps headings under 50 chars as sections)
    caps_regex = re.compile(r'^([A-Z0-9\s,.:\-\'\(\)]{5,50})$', re.MULTILINE)

    # Search lines for structure
    lines = text_content.split('\n')
    current_chapter = ""
    
    # Simple state trackers
    formula_count = 0
    table_count = 0

    for line_idx, line in enumerate(lines):
        line_stripped = line.strip()
        if not line_stripped:
            continue

        # Check for Chapter (Level 1)
        chap_match = chapter_regex.match(line_stripped)
        if chap_match:
            title = line_stripped
            if title not in chapters:
                chapters.append(title)
                current_chapter = title
                # Estimate which virtual page we are on
                current_char_idx = text_content.find(line)
                page_est = (current_char_idx // 3000) + 1
                sections.append(SectionNode(
                    title=title,
                    level=1,
                    page_start=page_est,
                    chapter_parent=title
                ))
            continue

        # Check for Section (Level 2)
        sec_match = section_regex.match(line_stripped)
        if sec_match:
            title = line_stripped
            current_char_idx = text_content.find(line)
            page_est = (current_char_idx // 3000) + 1
            sections.append(SectionNode(
                title=title,
                level=2,
                page_start=page_est,
                chapter_parent=current_chapter or "Preface"
            ))
            continue

        # Check for Topic (Level 3)
        top_match = topic_regex.match(line_stripped)
        if top_match:
            title = line_stripped
            current_char_idx = text_content.find(line)
            page_est = (current_char_idx // 3000) + 1
            sections.append(SectionNode(
                title=title,
                level=3,
                page_start=page_est,
                chapter_parent=current_chapter or "Preface"
            ))
            continue

        # Check for potential tables (e.g. lines with multiple | characters or tab-separated structures)
        if '|' in line_stripped and line_stripped.count('|') >= 2:
            # Let's see if this is part of a markdown table block
            # Read a few lines before and after to get context
            start_table_idx = line_idx
            end_table_idx = line_idx
            while end_table_idx < len(lines) - 1 and '|' in lines[end_table_idx + 1]:
                end_table_idx += 1
            
            # Extract full table content
            table_lines = [lines[k].strip() for k in range(start_table_idx, end_table_idx + 1)]
            if len(table_lines) > 1 and f"table_{start_table_idx}" not in [t.id for t in tables]:
                table_count += 1
                table_id = f"table_{table_count:03d}"
                
                # Split cell content
                grid_content = []
                for t_line in table_lines:
                    cells = [c.strip() for c in t_line.split('|') if c.strip() or t_line.startswith('|')]
                    # Filter out purely separator rows (e.g. --- | ---)
                    if not all(re.match(r'^[-:\s]+$', c) for c in cells):
                        grid_content.append(cells)
                
                header = grid_content[0] if grid_content else []
                current_char_idx = text_content.find(line)
                page_est = (current_char_idx // 3000) + 1
                
                # Context surrounding table
                context_start = max(0, start_table_idx - 2)
                context_end = min(len(lines), end_table_idx + 3)
                context_text = "\n".join(lines[context_start:context_end])
                
                tables.append(TableObject(
                    id=table_id,
                    content=grid_content,
                    markdown_content="\n".join(table_lines),
                    page=page_est,
                    header=header,
                    chapter=current_chapter or "Preface"
                ))

        # Check for formulas (LaTeX blocks e.g. $$ ... $$ or equations containing algebraic terms)
        # Match standard inline or block LaTeX patterns like $$ ... $$ or \[ ... \]
        latex_block_match = re.search(r'\$\$(.*?)\$\$', line_stripped)
        inline_latex_match = re.search(r'\$(.*?)\$', line_stripped)
        equation_symbol_match = ('=' in line_stripped or '≈' in line_stripped or '≠' in line_stripped) and \
                                any(sym in line_stripped for sym in ['+', '-', '*', '/', '^', '√', '∑', '∫', 'π', 'θ', 'λ'])

        if latex_block_match or inline_latex_match or (equation_symbol_match and len(line_stripped) < 120 and len(line_stripped) > 5):
            formula_count += 1
            formula_id = f"formula_{formula_count:03d}"
            formula_content = line_stripped
            
            # Deduce context (previous line + next line)
            context_lines = []
            if line_idx > 0:
                context_lines.append(lines[line_idx - 1])
            context_lines.append(line)
            if line_idx < len(lines) - 1:
                context_lines.append(lines[line_idx + 1])
                
            current_char_idx = text_content.find(line)
            page_est = (current_char_idx // 3000) + 1
            
            formulas.append(FormulaObject(
                id=formula_id,
                content=formula_content,
                context="\n".join(context_lines),
                page=page_est,
                chapter=current_chapter or "Preface"
            ))

    # If absolutely no chapters were detected, create a fallback chapter
    if not chapters:
        chapters.append("Main Chapter")
        sections.append(SectionNode(
            title="Main Chapter",
            level=1,
            page_start=1,
            chapter_parent="Main Chapter"
        ))

    return raw_pages, chapters, sections, formulas, tables
