# Plan: expertise report in PHOVA's design (template_phova.pdf)

Started 21 November 2026. PHOVA's design team sent `template_phova.pdf` (6 pages, made in Word from one of our
generated v2 reports, 23AP08 / Réf. 43c75b1a). The company wants the generated reports to follow it:
- a cover page like page 1;
- Poppins and Arial as the fonts;
- tables in the same colours and alignment;
- a faint blue strip in the page gutter.

## What the design specifies (measured from the PDF, not by eye)

| Element | Design |
|---|---|
| Colours | navy `#1c2345` · light blue `#25a7e0` · grey text `#848484` · table header `#f2f2f2` · tiles `#f0fafe` · sommaire rules `#e1e4e8` |
| States | À remplacer `#c00000` · Anomalies / à réparer `#e2ac00` · Réutilisable `#00b050`, as bold text (no pill) |
| Fonts | Poppins Bold for titles (36 pt cover, 18 pt chapters, 14 pt kicker, 9 pt sommaire and block titles); Poppins Regular 8 pt for tile labels; Arial 9 pt for body and tables, 8 pt in the identification tables |
| Cover | grid pattern top-left, PHOVA logo (vector), grey « Référence » box, 2.25 pt blue bar, kicker « RAPPORT D'EXPERTISE », the kind as title, 12-row facts table (label 144 pt, gap 13 pt, value 302 pt, black 0.5 pt rules, values bold navy), pump line drawing at the bottom. No UM6P / OCP logos, no photos, no verdict box |
| Page 2 | three paragraphs presenting the report (the design team's text), no title |
| Header | logo 61 pt wide on the left, « Réf. … » grey 9 pt on the right, `#f2f2f2` rule under it |
| Footer | « Rapport d'expertise · <kind> — <pump> » on the left, « Page - N » on the right, grey 9 pt, no rule |
| Gutter | 3 mm strip on the left edge of every page but the cover: white down to ~40 mm, then fading to `#d8f2fc` at the bottom |
| Chapters | « 02 - Pompe réceptionnée »: number light blue, title navy, Poppins Bold 18 pt; subtitle grey Arial 9 pt; no rule |
| Tables | header row `#f2f2f2`, bold black; 0.5 pt black rule under each row; regular black text |
| Cards | grey header strip between black rules (name left, state right), photo left without a frame, findings right with ■ bullets, black rule at the bottom |

## Decisions

1. **Scope:** the v2 report PDF (`expertise-report-v2.html`) gets the whole design. The final file
   (`expertise-dossier.html`) shares `expertise/parts.html`, so it picks up the new fonts, header, footer, gutter
   and tables, but keeps its own cover. The other PDFs (checklists, control sheets, check reports, v1 reports)
   don't change.
2. **Arial:** Arial is a Monotype font. We can't ship its files in the jar or the Docker image without a
   licence. The PDFs ask for `Arial` first, then fall back to **Liberation Sans**: it's open-source (SIL OFL) and
   has Arial's exact letter widths, so the layout is identical and the shapes are near-identical. If PHOVA
   provides licensed `Arial.ttf` and `Arial-Bold.ttf`, putting them in `backend/src/main/resources/fonts/` makes
   the PDFs use real Arial; no code change is needed.
3. **Poppins:** bundled (SIL OFL, from Google Fonts), Regular, SemiBold and Bold, with its licence.
4. **Assets taken from the design PDF:**
   - the logo, rendered from its vector paths to a transparent 1158 px PNG (the current PNG is 256 px wide and
     blurs at cover size);
   - the cover's grid pattern and pump drawing, merged into one page-sized background
     (`static/report/cover-background.png`, 271 KB), placed exactly where the design puts them.
5. **Reference:** the « Référence » box and the header show the same reference as today: the intervention number
   when there is one, otherwise the first 8 characters of the report's id. A preview says so in both places.
6. **Cover facts:** in the design's order (Client, Équipement, Fabricant, N° de commande, Date, Vérifié par,
   Site / entité, Type, Fluide, N° d'opération, Rédigé par, Version); empty fields are still dropped.
7. **State colours** follow the tone everywhere. The design shows « Anomalies » in red on the reception card
   but amber in the table; I kept amber in both places.
8. **Unchanged:** the content and order of chapters, the hors-tolérance tables, the points à reprendre, the
   traceability and verification blocks. They only take the new table style.
9. **The cover keeps the same side margins as the other pages.** OpenHTMLtoPDF lays out the whole document at
   the first page's width. A cover with zero margins made every later page 210 mm wide, then clipped it at the
   margin (the 5th tile, the Page column and the sommaire's page numbers disappeared). So the cover's full-bleed art is
   the first page's `@page` background, like the gutter, and only the logo, title and facts are positioned.
   The final file's cover got the same side margins for the same reason.
10. **Images in the PDF need a width and a height.** With a width alone, OpenHTMLtoPDF leaves the image at its
    own pixel size (the header logo vanished, the cover logo filled the page).

## Steps

- [x] Take the design PDF apart: fonts, sizes, colours, positions, images, gutter gradient
- [x] Get the fonts (Poppins, Liberation Sans) and extract the logo, grid and drawing
- [x] Add the fonts and images to `backend/src/main/resources` (`fonts/`, `static/report/`)
- [x] `SubmissionPdfService`: register the fonts (and Arial if present), pass the new images to the v2 report
      and the final file
- [x] `expertise/parts.html`: new styles, header, footer and gutter, chapter headings, tables, cards
- [x] `expertise-report-v2.html`: new cover, the presentation page, sommaire
- [x] `ExpertiseReportV2.coverFacts()`: the design's order
- [x] Test: render a v2 complet report modelled on 23AP08, plus a final file. Check the text, check the fonts
      are embedded (Poppins, Liberation Sans, no Helvetica), save the PNG pages to compare with the design
- [x] Compare page by page with `template_phova.pdf` and adjust
- [x] `mvn test`

## How to check it

`cd backend && ./mvnw test -Dtest=ExpertiseReportPdfTest`, then open `backend/target/pdf-preview/`:
- `expertise-v2.pdf`, with its pages as `expertise-v2-page-N.png`: the design's own report (23AP08);
- `expertise-v2-montage.pdf`: a montage report with a check not conforming;
- `expertise-v2-preview.pdf`: a preview not sent;
- `dossier.pdf`: the final file.

## Result (21 November 2026)

- `ExpertiseReportPdfTest`: 3 tests pass. They check the cover, page 2, the header and footer, the chapter
  headings and block titles. They also check the embedded fonts: Poppins and Liberation Sans, no PDF base-14 font.
- Full suite: every test passes except `BackendApplicationTests`, which needs Postgres (Docker wasn't running).
- Pages 1 and 3 to 6 compared with `template_phova.pdf`: same positions, sizes and colours. One difference
  goes the other way: the design's sommaire numbers are one page off, because page 2 was added by hand in Word.
  Ours are computed.
- The longest title, « Démontage et expertise », takes 444 of the 468 pt the cover leaves it at 36 pt.
  A longer kind label would wrap.

## Open questions for PHOVA

- **Page 2's text** describes a complete expertise, including « l'état final de la pompe après remontage ».
  It's printed as written in every report, including the démontage-only and montage-only ones. Should those
  get their own wording, or no page 2?
- **The final file's cover** still has the old navy style. Should it get the same cover as the reports?
- **Real Arial:** does PHOVA have a licence covering the server? (See decision 2.)
