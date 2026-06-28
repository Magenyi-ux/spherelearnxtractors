# SphereLearn Extractors

Offline textbook extraction and chunking pipeline implemented purely in Python.

## Overview

This repository contains a Python-only pipeline for processing PDF and TXT textbooks. It parses structure, extracts chapters and sections, identifies formulas and tables, and generates structured JSON or cleaned text output.

## Install

Recommended:

```bash
python3 -m pip install -r requirements.txt
```

Optional install as package:

```bash
python3 -m pip install .
```

## Usage

Run the pipeline directly:

```bash
python3 scripts/pipeline.py path/to/textbook.pdf -f json -o output
```

Or use the installed console script after package installation:

```bash
extract-textbook path/to/textbook.pdf -f txt -o output
```

Supported formats:
- `.pdf`
- `.txt`

## Output

- `json` produces structured textbook metadata and chunks in a JSON file.
- `txt` produces cleaned textbook text with normalized headings and spacing.

## Project Layout

- `scripts/models.py` — data model classes
- `scripts/chunker.py` — semantic chunking logic
- `scripts/extractor_txt.py` — text extraction for TXT files
- `scripts/extractor_pdf.py` — PDF extraction logic
- `scripts/pipeline.py` — CLI orchestration and output generation

## Notes

- PDF extraction uses `pypdf` and `pdfplumber`.
- The project no longer includes any Node or React frontend artifacts. 
