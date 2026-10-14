# Reading PDF tables and scanned documents in docuMind

Your stack already has what you need. docuMind uses Spring AI with **`gpt-4o-mini`** ([application.properties](backend/src/main/resources/application.properties)), and that model can read images. You already use it that way in `questionImagetoText` in [AskService.java](backend/src/main/java/com/docuMind/backend/services/AskService.java). The PDFBox jar you already have can also **render** a page as an image (`PDFRenderer`), not just extract its text.

So you can build DPRO's tiers 1 and 3 without adding any new dependency.

## Recommended design

```
                     PDF page (PDFBox)
                            │
            PDFTextStripper on this page only
                            │
          ┌─────────────────┴──────────────────┐
          │ enough text AND no table?          │
          ▼ yes                                ▼ no (scan, or table-heavy)
   keep the stripped text              PDFRenderer → PNG (150 DPI)
   (free, ms)                                  │
                                               ▼
                               gpt-4o-mini vision, prompt:
                               "Transcribe this page as Markdown.
                                Reproduce tables as Markdown tables.
                                Do not summarise or invent."
                                               │
          └─────────────────┬──────────────────┘
                            ▼
                  chunk → embed → pgvector  (unchanged)
```

Sketch for `IngestionService.extractText`:

```java
PDFTextStripper stripper = new PDFTextStripper();
stripper.setSortByPosition(true);
PDFRenderer renderer = new PDFRenderer(document);
StringBuilder out = new StringBuilder();

for (int i = 0; i < document.getNumberOfPages(); i++) {
    stripper.setStartPage(i + 1);
    stripper.setEndPage(i + 1);
    String text = stripper.getText(document);

    if (text.strip().length() < 100) {           // no real text layer → scan
        BufferedImage img = renderer.renderImageWithDPI(i, 150);
        ByteArrayOutputStream png = new ByteArrayOutputStream();
        ImageIO.write(img, "png", png);
        text = pageToMarkdown(png.toByteArray()); // same Media call as questionImagetoText
    }
    out.append(text).append("\n\n");
}
```

## Deciding which pages go to the vision model

- **Scans are easy to detect.** A page with almost no extracted text is a scan. That's the `< 100` check above, and DPRO uses the same test.
- **Tables are harder,** because PDFBox gives no direct "this is a table" signal. Three options, from simplest to most precise:
  1. Send **every** page through vision. It gives the best quality and is simplest, but costs about one API call per page.
  2. Add a **"contains tables / scanned"** checkbox on the upload page.
  3. Use a heuristic: lots of short lines made mostly of numbers suggests a table.

## Alternatives

| Option | When it makes sense |
|---|---|
| **gpt-4o-mini vision (above)** | ✅ Best fit: no new vendor, key or dependency |
| Managed document OCR (**Azure Document Intelligence**, **AWS Textract**, **Google Document AI**, **Mistral OCR**) | You need high accuracy on many dense forms, or word coordinates. More setup, and a new vendor |
| **Docling** in your Python `analysis-service` | Documents must never leave your servers. Expect big torch/image-size costs and slow CPU processing |
| Local vision model via **Ollama** (e.g. Qwen2.5-VL) | Fully offline, but needs a GPU to be practical |

## Two points to watch

1. **Chunking can break tables.** The chunker cuts every ~500 words, which can split a Markdown table in the middle, leaving the rows without their header row. Split at page or table boundaries, or repeat the header row in each chunk.
2. **Vision models sometimes summarise or skip rows.** DPRO guards against this: if the vision output has far fewer words than the text layer, it appends the raw text too. That's worth copying for pages that do have a text layer.
