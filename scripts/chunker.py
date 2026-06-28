"""
Chunker module for the Textbook Processing Pipeline.
Splits textbook content into semantic chunks while preserving context, hierarchy,
and document references.
"""

import re
from typing import List, Optional, Dict, Any
from .models import TextChunk

def semantic_chunk_text(
    raw_text_by_page: List[Dict[str, Any]],  # List of {"page": int, "text": str}
    sections_list: List[Dict[str, Any]],     # List of sections/headings with hierarchy
    source_filename: str,
    target_chunk_size: int = 1000,
    chunk_overlap: int = 150
) -> List[TextChunk]:
    """
    Chunks raw textbook pages into semantic chunks of approx `target_chunk_size` characters,
    tracking heading hierarchy and pages.
    """
    text_chunks: List[TextChunk] = []
    chunk_id_counter = 1

    # Active states as we traverse pages
    current_chapter = "Preface"
    current_section = "Introduction"
    current_topic = "Overview"

    # Compile common patterns
    chapter_pattern = re.compile(r'^(?:Chapter|CHAPTER|PART|Part)\s+(\d+|[IVXLCDM]+)\s*[:.-]?\s*(.*)$', re.IGNORECASE)
    section_pattern = re.compile(r'^(?:Section|SECTION)\s*(\d+(?:\.\d+)?)\s*[:.-]?\s*(.*)$', re.IGNORECASE)

    # Pre-parse section headings with their corresponding pages if available
    # to find matching hierarchy as we parse text.
    headings_on_pages = []
    for s in sections_list:
        headings_on_pages.append(s)

    # Let's merge pages into a continuous stream of text but annotate with page transitions
    full_paragraphs = []
    
    for page_obj in raw_text_by_page:
        page_num = page_obj["page"]
        text = page_obj["text"]
        
        # Split text into paragraphs (double newlines or list items)
        paragraphs = re.split(r'\n\s*\n', text)
        for para in paragraphs:
            para_clean = para.strip()
            if not para_clean:
                continue
                
            # Check if this paragraph looks like a new chapter, section, or topic heading
            # Let's see if we match any of our detected sections or standard heading patterns
            lines = para_clean.split('\n')
            first_line = lines[0].strip() if lines else ""
            
            # Simple heuristic mapping
            is_heading = False
            for h in headings_on_pages:
                if h["title"].lower() in first_line.lower() and len(first_line) < 150:
                    is_heading = True
                    if h["level"] == 1:
                        current_chapter = h["title"]
                        current_section = ""
                        current_topic = ""
                    elif h["level"] == 2:
                        current_section = h["title"]
                        current_topic = ""
                    elif h["level"] == 3:
                        current_topic = h["title"]
                    break

            # Fallback regex checks if not matched with detected sections
            if not is_heading and len(first_line) < 100:
                chap_match = chapter_pattern.match(first_line)
                sec_match = section_pattern.match(first_line)
                if chap_match:
                    current_chapter = first_line
                    current_section = ""
                    current_topic = ""
                elif sec_match:
                    current_section = first_line
                    current_topic = ""
                    
            full_paragraphs.append({
                "text": para_clean,
                "page": page_num,
                "chapter": current_chapter,
                "section": current_section or "General",
                "topic": current_topic or "General Content"
            })

    # Now, group paragraphs into chunks of target_chunk_size
    current_chunk_text = []
    current_chunk_len = 0
    chunk_pages = set()
    
    # Track the hierarchy for the active chunk
    chunk_chapter = "Preface"
    chunk_section = "Introduction"
    chunk_topic = "Overview"

    for idx, para in enumerate(full_paragraphs):
        para_text = para["text"]
        para_len = len(para_text)
        
        # If this paragraph represents a new major chapter, let's flush current chunk first
        is_new_chapter = (para["chapter"] != chunk_chapter) and len(current_chunk_text) > 0
        
        if is_new_chapter or (current_chunk_len + para_len > target_chunk_size and current_chunk_len > 0):
            # Flush the current chunk
            chunk_content = "\n\n".join(current_chunk_text)
            avg_page = sorted(list(chunk_pages))[0] if chunk_pages else para["page"]
            
            text_chunks.append(TextChunk(
                id=f"chunk_{chunk_id_counter:04d}",
                content=chunk_content,
                chapter=chunk_chapter,
                section=chunk_section,
                topic=chunk_topic,
                page=avg_page,
                source_file=source_filename
            ))
            chunk_id_counter += 1
            
            # Start a new chunk. Implement overlap if not a hard chapter transition
            if is_new_chapter:
                current_chunk_text = [para_text]
                current_chunk_len = para_len
                chunk_pages = {para["page"]}
            else:
                # Basic sentence/word overlap from the end of the previous chunk
                overlap_text = []
                overlap_len = 0
                for prev_para in reversed(current_chunk_text):
                    if overlap_len + len(prev_para) < chunk_overlap:
                        overlap_text.insert(0, prev_para)
                        overlap_len += len(prev_para)
                    else:
                        break
                current_chunk_text = overlap_text + [para_text]
                current_chunk_len = overlap_len + para_len
                chunk_pages = {para["page"]}
        else:
            current_chunk_text.append(para_text)
            current_chunk_len += para_len
            chunk_pages.add(para["page"])
            
        # Update active hierarchy for next iteration
        chunk_chapter = para["chapter"]
        chunk_section = para["section"]
        chunk_topic = para["topic"]

    # Flush the last chunk
    if current_chunk_text:
        chunk_content = "\n\n".join(current_chunk_text)
        avg_page = sorted(list(chunk_pages))[0] if chunk_pages else 1
        text_chunks.append(TextChunk(
            id=f"chunk_{chunk_id_counter:04d}",
            content=chunk_content,
            chapter=chunk_chapter,
            section=chunk_section,
            topic=chunk_topic,
            page=avg_page,
            source_file=source_filename
        ))

    return text_chunks
