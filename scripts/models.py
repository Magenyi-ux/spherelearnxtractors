"""
Models module for the Textbook Processing Pipeline.
Defines structured classes representing textbooks, chapters, sections,
chunks, formulas, tables, and images.
"""

from typing import List, Dict, Any, Optional
from dataclasses import dataclass, field
import json

@dataclass
class ImageObject:
    id: str
    name: str
    page: Optional[int]
    context: str  # Surrounding text or caption
    chapter: Optional[str] = None
    metadata: Dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "id": self.id,
            "name": self.name,
            "page": self.page,
            "context": self.context,
            "chapter": self.chapter,
            "metadata": self.metadata
        }

@dataclass
class TableObject:
    id: str
    content: List[List[str]]  # Grid representation of table rows
    markdown_content: str     # Markdown-formatted string representation
    page: Optional[int]
    header: List[str]
    chapter: Optional[str] = None
    metadata: Dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "id": self.id,
            "content": self.content,
            "markdown_content": self.markdown_content,
            "page": self.page,
            "header": self.header,
            "chapter": self.chapter,
            "metadata": self.metadata
        }

@dataclass
class FormulaObject:
    id: str
    content: str  # LaTeX, Unicode or raw text formula
    context: str  # Inline text surrounding the formula
    page: Optional[int]
    chapter: Optional[str] = None
    metadata: Dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "id": self.id,
            "content": self.content,
            "context": self.context,
            "page": self.page,
            "chapter": self.chapter,
            "metadata": self.metadata
        }

@dataclass
class TextChunk:
    id: str
    content: str
    chapter: str
    section: str
    topic: str
    page: Optional[int]
    source_file: str
    metadata: Dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "id": self.id,
            "content": self.content,
            "chapter": self.chapter,
            "section": self.section,
            "topic": self.topic,
            "page": self.page,
            "source_file": self.source_file,
            "metadata": self.metadata
        }

@dataclass
class SectionNode:
    title: str
    level: int  # Heading level (e.g. 1 for Chapter, 2 for Section, 3 for Topic)
    page_start: Optional[int] = None
    page_end: Optional[int] = None
    chapter_parent: Optional[str] = None

    def to_dict(self) -> Dict[str, Any]:
        return {
            "title": self.title,
            "level": self.level,
            "page_start": self.page_start,
            "page_end": self.page_end,
            "chapter_parent": self.chapter_parent
        }

@dataclass
class TextbookMetadata:
    source_file: str
    file_type: str
    file_size_bytes: int
    page_count: Optional[int] = None
    processed_at: str = ""
    processing_time_seconds: float = 0.0
    detected_chapters_count: int = 0
    detected_sections_count: int = 0
    chunks_count: int = 0
    tables_count: int = 0
    formulas_count: int = 0
    images_count: int = 0

    def to_dict(self) -> Dict[str, Any]:
        return {
            "source_file": self.source_file,
            "file_type": self.file_type,
            "file_size_bytes": self.file_size_bytes,
            "page_count": self.page_count,
            "processed_at": self.processed_at,
            "processing_time_seconds": self.processing_time_seconds,
            "detected_chapters_count": self.detected_chapters_count,
            "detected_sections_count": self.detected_sections_count,
            "chunks_count": self.chunks_count,
            "tables_count": self.tables_count,
            "formulas_count": self.formulas_count,
            "images_count": self.images_count
        }

@dataclass
class ProcessedTextbook:
    metadata: TextbookMetadata
    chapters: List[str] = field(default_factory=list)
    sections: List[SectionNode] = field(default_factory=list)
    text_chunks: List[TextChunk] = field(default_factory=list)
    formula_objects: List[FormulaObject] = field(default_factory=list)
    image_objects: List[ImageObject] = field(default_factory=list)
    table_objects: List[TableObject] = field(default_factory=list)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "metadata": self.metadata.to_dict(),
            "chapters": self.chapters,
            "sections": [s.to_dict() for s in self.sections],
            "text_chunks": [tc.to_dict() for tc in self.text_chunks],
            "formula_objects": [f.to_dict() for f in self.formula_objects],
            "image_objects": [img.to_dict() for img in self.image_objects],
            "table_objects": [t.to_dict() for t in self.table_objects]
        }

    def to_json(self, indent: int = 2) -> str:
        return json.dumps(self.to_dict(), indent=indent, ensure_ascii=False)
