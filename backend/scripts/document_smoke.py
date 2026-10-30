"""Small live smoke check using synthetic documents only; invokes configured APIs."""
import asyncio
import io
import json
import sys
from datetime import datetime, timezone
from pathlib import Path
from time import perf_counter
from pypdf import PdfWriter
from pypdf.generic import DictionaryObject, NameObject, DecodedStreamObject
from app.services.document_pipeline import analyze_document
from app.services.rag import rag_service


def text_pdf():
    writer = PdfWriter()
    page = writer.add_blank_page(width=612, height=792)
    font = DictionaryObject({NameObject("/Type"): NameObject("/Font"),
                             NameObject("/Subtype"): NameObject("/Type1"),
                             NameObject("/BaseFont"): NameObject("/Helvetica")})
    page[NameObject("/Resources")] = DictionaryObject({NameObject("/Font"): DictionaryObject({NameObject("/F1"): writer._add_object(font)})})
    content = DecodedStreamObject()
    content.set_data(b"BT /F1 12 Tf 40 740 Td (SYNTHETIC PHILIPPINE LEASE - FOR TESTING ONLY) Tj 0 -24 Td (Tenant pays PHP 5000 monthly, due on the fifth day.) Tj 0 -24 Td (Deposit: PHP 10000. Term: January 1 to June 30, 2026.) Tj ET")
    page[NameObject("/Contents")] = writer._add_object(content)
    output = io.BytesIO()
    writer.write(output)
    return output.getvalue()


async def main():
    from PIL import Image, ImageDraw, ImageFont
    image = Image.new("RGB", (1400, 400), "white")
    draw = ImageDraw.Draw(image)
    font = ImageFont.truetype("C:/Windows/Fonts/arial.ttf", 30)
    draw.multiline_text((30, 30), "SYNTHETIC PHILIPPINE LEASE - TEST ONLY\nRent: PHP 5000 monthly, due on the fifth day.\nDeposit: PHP 10000.\nTerm: January 1 to June 30, 2026.", fill="black", font=font, spacing=15)
    png = io.BytesIO()
    image.save(png, format="PNG")
    scan = io.BytesIO()
    image.save(scan, format="PDF")
    rows = []
    for name, data, mime, question in [
        ("text.pdf", text_pdf(), "application/pdf", "Summarize only the rent, deposit and term. Do not assess the law."),
        ("image.png", png.getvalue(), "image/png", "Ibuod ang upa, deposito at tagal ayon sa dokumento lamang."),
        ("scan.pdf", scan.getvalue(), "application/pdf", "Explain the rent and deposit in Taglish, based only on this document."),
        ("law.pdf", text_pdf(), "application/pdf", "Does RA 8792 Section 6 mean an electronic lease cannot be rejected only for being electronic? Explain the limits.")]:
        start = perf_counter()
        if "--law-only" in sys.argv and name != "law.pdf":
            continue
        if "--ocr-only" in sys.argv and name not in {"image.png", "scan.pdf"}:
            continue
        try:
            if name == "law.pdf":
                await asyncio.to_thread(rag_service.initialize)
            result = await analyze_document(data, mime, name, user_prompt=question)
            if name == "law.pdf":
                assert result["sources"] and "[Source 1]" in result["answer"], "Missing retrieved citation"
            else:
                normalized = result["answer"].replace(",", "")
                assert all(value in normalized for value in ["5000", "10000", "2026"]), "Missing or incorrect extracted numbers"
                assert "[Document page 1]" in result["answer"], "Missing document citation"
            rows.append({"file": name, "seconds": perf_counter()-start, **result})
            print(name, "OK", round(rows[-1]["seconds"], 2), flush=True)
        except Exception as exc:
            rows.append({"file": name, "error": type(exc).__name__ + ": " + str(exc)})
            print(name, "FAILED", type(exc).__name__, flush=True)
    path = Path("evaluation/runs/document-law-smoke.json" if "--law-only" in sys.argv else "evaluation/runs/document-smoke.json")
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(rows, ensure_ascii=False, indent=2), encoding="utf-8")
    snapshot = path.with_name("document-smoke-" + datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S%fZ") + ".json")
    snapshot.write_text(json.dumps(rows, ensure_ascii=False, indent=2), encoding="utf-8")
    if any("error" in row for row in rows):
        raise SystemExit(1)


if __name__ == "__main__":
    asyncio.run(main())
