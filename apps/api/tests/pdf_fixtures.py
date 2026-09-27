"""Builds minimal, valid one-page PDFs for resume-parsing tests, without needing reportlab or any
other PDF-authoring dependency — pypdf tolerates the missing/wrong xref offset here by falling
back to scanning the file for objects, the same tolerance real-world resume PDFs from a variety
of exporters also rely on. Shared by test_resume_parser.py and test_resume_router.py so the PDF
object-graph boilerplate exists in exactly one place."""


def pdf_with_text(text: str) -> bytes:
    """A one-page PDF whose content stream draws `text` — pypdf's `extract_text()` reads it back
    out. `text` must not contain characters outside Latin-1 (real resumes are English-language
    plain text for this test's purposes)."""
    escaped = text.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")
    stream = f"BT /F1 12 Tf 20 250 Td ({escaped}) Tj ET".encode("latin-1")
    return (
        b"%PDF-1.4\n"
        b"1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n"
        b"2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n"
        b"3 0 obj\n<< /Type /Page /Parent 2 0 R /Resources << /Font << /F1 4 0 R >> >> "
        b"/MediaBox [0 0 300 300] /Contents 5 0 R >>\nendobj\n"
        b"4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n"
        b"5 0 obj\n<< /Length "
        + str(len(stream)).encode()
        + b" >>\nstream\n"
        + stream
        + b"\nendstream\nendobj\n"
        b"xref\n0 6\n0000000000 65535 f \ntrailer\n<< /Size 6 /Root 1 0 R >>\n"
        b"startxref\n0\n%%EOF"
    )


def pdf_with_no_text() -> bytes:
    """A structurally valid one-page PDF with no /Contents at all — extract_text() returns ""
    for this, exercising the "scanned image, no text layer" rejection path."""
    return (
        b"%PDF-1.4\n"
        b"1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n"
        b"2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n"
        b"3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 300] >>\nendobj\n"
        b"xref\n0 4\n0000000000 65535 f \ntrailer\n<< /Size 4 /Root 1 0 R >>\n"
        b"startxref\n0\n%%EOF"
    )
