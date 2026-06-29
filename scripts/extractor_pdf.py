"""
PDF Extractor module for the Textbook Processing Pipeline.
Integrates text extraction, page number mapping, chapter/heading identification,
formula spotting, table parsing, and image asset referencing.
"""

import os
import re
from typing import List, Dict, Any, Tuple
from .models import SectionNode, FormulaObject, TableObject, ImageObject

# Attempt to import PDF processing library gracefully
try:
    import pypdf
    PYPDF_AVAILABLE = True
except ImportError:
    PYPDF_AVAILABLE = False

try:
    import pdfplumber
    PDFPLUMBER_AVAILABLE = True
except ImportError:
    PDFPLUMBER_AVAILABLE = False


def extract_pdf_textbook(
    file_path: str
) -> Tuple[List[Dict[str, Any]], List[str], List[SectionNode], List[FormulaObject], List[TableObject], List[ImageObject]]:
    """
    Extracts structured content from a PDF textbook file.
    Does not depend on external APIs; parses purely on local resources.
    
    Returns:
    - raw_pages: List of {"page": 1, "text": str}
    - chapters: List of chapter titles
    - sections: List of SectionNode objects
    - formulas: List of FormulaObject objects
    - tables: List of TableObject objects
    - images: List of ImageObject objects
    """
    if not os.path.exists(file_path):
        raise FileNotFoundError(f"PDF textbook file not found: {file_path}")

    raw_pages: List[Dict[str, Any]] = []
    chapters: List[str] = []
    sections: List[SectionNode] = []
    formulas: List[FormulaObject] = []
    tables: List[TableObject] = []
    images: List[ImageObject] = []

    # Heuristic pattern matching for PDF text
    chapter_regex = re.compile(
        r'^(?:Chapter|CHAPTER|PART|Part)\s+([0-9]+|[IVXLCDM]+)\s*[:.-]?\s*(.+)$', re.MULTILINE
    )
    section_regex = re.compile(r'^([0-9]+\.[0-9]+)\s+([^0-9\n].+)$', re.MULTILINE)
    topic_regex = re.compile(r'^([0-9]+\.[0-9]+\.[0-9]+)\s+([^0-9\n].+)$', re.MULTILINE)

    formula_count = 0
    table_count = 0
    image_count = 0

    pdfplumber_available = PDFPLUMBER_AVAILABLE
    pypdf_available = PYPDF_AVAILABLE

    # Execute extraction
    if pdfplumber_available:
        try:
            with pdfplumber.open(file_path) as pdf:
                if len(pdf.pages) == 0:
                    raise ValueError("The PDF textbook file has no pages.")
                    
                for page_idx, page in enumerate(pdf.pages):
                    page_num = page_idx + 1
                    text = page.extract_text() or ""
                    raw_pages.append({"page": page_num, "text": text})

                    # Try to extract tables directly using pdfplumber's geometric parser
                    page_tables = page.extract_tables()
                    for t_idx, p_table in enumerate(page_tables):
                        if p_table and len(p_table) > 1:
                            table_count += 1
                            table_id = f"table_{table_count:03d}"
                            
                            # Clean cell content
                            grid_content = []
                            for row in p_table:
                                grid_content.append([str(cell or "").strip() for cell in row])
                            
                            header = grid_content[0]
                            markdown_rows = []
                            for r_idx, row in enumerate(grid_content):
                                markdown_rows.append("| " + " | ".join(row) + " |")
                                if r_idx == 0:
                                    markdown_rows.append("|" + "---| " * len(row) + "|")
                                    
                            tables.append(TableObject(
                                id=table_id,
                                content=grid_content,
                                markdown_content="\n".join(markdown_rows),
                                page=page_num,
                                header=header
                            ))
                            
                    # Try to detect embedded images
                    if hasattr(page, 'images') and page.images:
                        for img in page.images:
                            image_count += 1
                            images.append(ImageObject(
                                id=f"image_{image_count:03d}",
                                name=f"img_p{page_num}_{image_count:02d}",
                                page=page_num,
                                context=f"Image object detected at coordinates x0={img.get('x0', 0):.1f}, y0={img.get('y0', 0):.1f} on page {page_num}"
                            ))
        except Exception as e:
            # Fall back to pypdf or mock if corrupted
            if not pypdf_available:
                raise ValueError(f"Failed to read PDF with pdfplumber, and pypdf is unavailable: {e}")
            pypdf_available = True  # force pypdf try
            
    if pypdf_available and not raw_pages:
        try:
            with open(file_path, 'rb') as f:
                reader = pypdf.PdfReader(f)
                if len(reader.pages) == 0:
                    raise ValueError("The PDF textbook file has no pages.")
                    
                for page_idx, page in enumerate(reader.pages):
                    page_num = page_idx + 1
                    try:
                        text = page.extract_text() or ""
                    except Exception:
                        text = ""  # handle empty or broken text extraction on specific pages
                    raw_pages.append({"page": page_num, "text": text})

                    # Grab images from pypdf
                    try:
                        if hasattr(page, 'images') and page.images:
                            for img_name in page.images:
                                image_count += 1
                                images.append(ImageObject(
                                    id=f"image_{image_count:03d}",
                                    name=f"img_p{page_num}_{img_name}",
                                    page=page_num,
                                    context=f"Embedded image asset '{img_name}' on Page {page_num}"
                                ))
                    except Exception:
                        pass
        except Exception as e:
            raise ValueError(f"Corrupted or invalid PDF textbook file: {e}")

    # Fallback if no library is available or extraction returned nothing (e.g. CLI environment running)
    if not PYPDF_AVAILABLE and not PDFPLUMBER_AVAILABLE:
        # For offline execution in testing without libraries, we can read strings as dummy text
        # But we must raise standard error as requested for production
        raise ImportError("No PDF extraction packages (pypdf or pdfplumber) are installed in the offline system.")

    # Post-process extracted text to parse headings, formulas, and structural nodes
    current_chapter = "Preface"
    
    for page_obj in raw_pages:
        page_num = page_obj["page"]
        text = page_obj["text"]
        lines = text.split('\n')
        
        for line_idx, line in enumerate(lines):
            line_stripped = line.strip()
            if not line_stripped or len(line_stripped) < 4:
                continue

            # Identify chapters (Level 1)
            chap_match = chapter_regex.match(line_stripped)
            if chap_match:
                title = line_stripped
                if title not in chapters:
                    chapters.append(title)
                    current_chapter = title
                    sections.append(SectionNode(
                        title=title,
                        level=1,
                        page_start=page_num,
                        chapter_parent=title
                    ))
                continue

            # Identify sections (Level 2)
            sec_match = section_regex.match(line_stripped)
            if sec_match:
                title = line_stripped
                sections.append(SectionNode(
                    title=title,
                    level=2,
                    page_start=page_num,
                    chapter_parent=current_chapter
                ))
                continue

            # Identify topics (Level 3)
            top_match = topic_regex.match(line_stripped)
            if top_match:
                title = line_stripped
                sections.append(SectionNode(
                    title=title,
                    level=3,
                    page_start=page_num,
                    chapter_parent=current_chapter
                ))
                continue

            # Check for inline or block formulas in line
            latex_block_match = re.search(r'\$\$(.*?)\$\$', line_stripped)
            inline_latex_match = re.search(r'\$(.*?)\$', line_stripped)
            equation_symbol_match = ('=' in line_stripped or '≈' in line_stripped) and \
                                    any(sym in line_stripped for sym in ['+', '-', '*', '/', '^', '√', '∑', '∫', 'π', 'θ', 'λ'])

            if latex_block_match or inline_latex_match or (equation_symbol_match and len(line_stripped) < 120):
                formula_count += 1
                formula_id = f"formula_{formula_count:03d}"
                
                # Context surrounding formula
                context_lines = []
                if line_idx > 0:
                    context_lines.append(lines[line_idx - 1])
                context_lines.append(line)
                if line_idx < len(lines) - 1:
                    context_lines.append(lines[line_idx + 1])
                    
                formulas.append(FormulaObject(
                    id=formula_id,
                    content=line_stripped,
                    context="\n".join(context_lines),
                    page=page_num,
                    chapter=current_chapter
                ))

            # Heuristic table parsing if pdfplumber was not available (identifying grid text lines)
            if not PDFPLUMBER_AVAILABLE:
                if '|' in line_stripped and line_stripped.count('|') >= 2:
                    # Parse as table row
                    start_table_idx = line_idx
                    end_table_idx = line_idx
                    while end_table_idx < len(lines) - 1 and '|' in lines[end_table_idx + 1]:
                        end_table_idx += 1
                    
                    table_lines = [lines[k].strip() for k in range(start_table_idx, end_table_idx + 1)]
                    if len(table_lines) > 1 and f"table_{start_table_idx}" not in [t.id for t in tables]:
                        table_count += 1
                        table_id = f"table_{table_count:03d}"
                        
                        grid_content = []
                        for t_line in table_lines:
                            cells = [c.strip() for c in t_line.split('|') if c.strip() or t_line.startswith('|')]
                            if not all(re.match(r'^[-:\s]+$', c) for c in cells):
                                grid_content.append(cells)
                                
                        header = grid_content[0] if grid_content else []
                        tables.append(TableObject(
                            id=table_id,
                            content=grid_content,
                            markdown_content="\n".join(table_lines),
                            page=page_num,
                            header=header,
                            chapter=current_chapter
                        ))

    # Fallback to make sure there are chapters
    if not chapters:
        chapters.append("Introduction")
        sections.append(SectionNode(
            title="Introduction",
            level=1,
            page_start=1,
            chapter_parent="Introduction"
        ))

    # Update parent references for any orphaned sections/formulas/tables
    for s in sections:
        if not s.chapter_parent:
            s.chapter_parent = chapters[0]
            
    for f in formulas:
        if not f.chapter:
            f.chapter = chapters[0]

    for t in tables:
        if not t.chapter:
            t.chapter = chapters[0]

    for img in images:
        if not img.chapter:
            img.chapter = chapters[0]

    return raw_pages, chapters, sections, formulas, tables, images
