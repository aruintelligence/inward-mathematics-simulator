"""Render the printable two-page worksheet. Requires reportlab and DejaVu Sans."""

from pathlib import Path
import sys

from reportlab.graphics import renderPDF
from reportlab.graphics.barcode.qr import QrCodeWidget
from reportlab.graphics.shapes import Drawing
from reportlab.lib import colors
from reportlab.lib.pagesizes import letter
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / "output/pdf/mean-vs-median-worksheet.pdf"
URL = "https://aruintelligence.github.io/inward-mathematics-simulator/worksheet.html"
FONT_DIR = Path("/usr/share/fonts/truetype/dejavu")
pdfmetrics.registerFont(TTFont("DejaVu", str(FONT_DIR / "DejaVuSans.ttf")))
pdfmetrics.registerFont(TTFont("DejaVu-Bold", str(FONT_DIR / "DejaVuSans-Bold.ttf")))

INK = colors.HexColor("#102B3B")
GREEN = colors.HexColor("#087E61")
GOLD = colors.HexColor("#B27425")
SOFT = colors.HexColor("#EDF5F2")
PALE = colors.HexColor("#F5F8F7")
LINE = colors.HexColor("#B7C8CA")
MUTED = colors.HexColor("#4B6570")
W, H = letter


def text(pdf, x, y, value, size=10, bold=False, color=INK):
    pdf.setFillColor(color)
    pdf.setFont("DejaVu-Bold" if bold else "DejaVu", size)
    pdf.drawString(x, y, value)


def right(pdf, x, y, value, size=10, bold=False, color=INK):
    pdf.setFillColor(color)
    pdf.setFont("DejaVu-Bold" if bold else "DejaVu", size)
    pdf.drawRightString(x, y, value)


def rect(pdf, x, y, width, height, fill, stroke=None, radius=0):
    pdf.setFillColor(fill)
    pdf.setStrokeColor(stroke or fill)
    pdf.roundRect(x, y, width, height, radius, fill=1, stroke=int(stroke is not None))


def line(pdf, x1, y1, x2, y2, color=LINE, width=0.8):
    pdf.setStrokeColor(color)
    pdf.setLineWidth(width)
    pdf.line(x1, y1, x2, y2)


def header(pdf, page):
    rect(pdf, 42, 764, 528, 4, GREEN)
    text(pdf, 42, 744, "ĀRU INTELLIGENCE  /  INWARD MATHEMATICS™", 8, True, INK)
    right(pdf, 570, 744, f"CLASSROOM FIELD NOTES   /   {page:02}", 7.5, True, GREEN)


def footer(pdf, page):
    line(pdf, 42, 38, 570, 38)
    text(pdf, 42, 24, "aruintelligence.github.io/inward-mathematics-simulator/worksheet.html", 7.5, False, MUTED)
    right(pdf, 570, 24, f"{page} / 2", 7.5, True, MUTED)


def qr(pdf, x, y, size):
    code = QrCodeWidget(URL)
    left, bottom, right_bound, top = code.getBounds()
    original = right_bound - left
    drawing = Drawing(size, size, transform=[size / original, 0, 0, size / original, 0, 0])
    drawing.add(code)
    renderPDF.draw(drawing, pdf, x, y)


def case(pdf, top, letter_name, readings, target):
    height = 140
    rect(pdf, 42, top - height, 528, height, PALE, LINE, 8)
    rect(pdf, 42, top - height, 4, height, GREEN)
    text(pdf, 57, top - 19, f"CASE {letter_name}", 12, True)
    rect(pdf, 457, top - 30, 97, 22, SOFT, None, 9)
    right(pdf, 546, top - 23, f"TARGET  {target}", 9, True, GREEN)

    for i, number in enumerate(readings):
        x = 57 + i * 100
        rect(pdf, x, top - 58, 92, 26, colors.white, LINE, 5)
        pdf.setFillColor(INK)
        pdf.setFont("DejaVu-Bold", 12)
        pdf.drawCentredString(x + 46, top - 50, str(number))

    text(pdf, 57, top - 74, "PREDICT BEFORE CALCULATING", 7.2, True, MUTED)
    for x, label in ((60, "Mean"), (165, "Median"), (282, "Equal error")):
        pdf.setStrokeColor(MUTED)
        pdf.circle(x + 5, top - 88, 5, fill=0, stroke=1)
        text(pdf, x + 15, top - 91, label, 9.3)

    text(pdf, 57, top - 111, "Mean", 8.5, True)
    line(pdf, 94, top - 113, 158, top - 113, MUTED)
    text(pdf, 169, top - 111, "Error", 8.5, True)
    line(pdf, 204, top - 113, 258, top - 113, MUTED)
    text(pdf, 276, top - 111, "Median", 8.5, True)
    line(pdf, 326, top - 113, 392, top - 113, MUTED)
    text(pdf, 403, top - 111, "Error", 8.5, True)
    line(pdf, 438, top - 113, 554, top - 113, MUTED)
    text(pdf, 57, top - 130, "Smaller error belongs to:", 8.5, True)
    line(pdf, 204, top - 132, 554, top - 132, MUTED)


def student_page(pdf):
    header(pdf, 1)
    text(pdf, 42, 708, "Can the mean lose, win, and tie?", 20, True)
    text(pdf, 42, 687, "Three predictions. Five readings each. One stated target per case.", 9.2, False, MUTED)
    text(pdf, 42, 666, "NAME", 8, True, MUTED)
    line(pdf, 83, 663, 334, 663)
    text(pdf, 353, 666, "DATE", 8, True, MUTED)
    line(pdf, 389, 663, 570, 663)
    rect(pdf, 42, 607, 528, 45, SOFT, None, 6)
    text(pdf, 54, 635, "1  Predict.    2  Mean = sum ÷ 5.    3  Median = middle sorted reading.", 9, True)
    text(pdf, 54, 619, "4  Absolute error = distance from target. Circle the smaller error, or a tie.", 8.5)

    case(pdf, 595, "A", [48, 49, 50, 51, 85], 50)
    case(pdf, 446, "B", [40, 42, 50, 60, 68], 52)
    case(pdf, 297, "C", [0, 0, 50, 100, 100], 50)

    text(pdf, 42, 140, "EXPLAIN", 8, True, GREEN)
    text(pdf, 42, 126, "What do these cases show about claiming one estimator always wins?", 9.1, True)
    line(pdf, 42, 105, 476, 105, MUTED)
    line(pdf, 42, 83, 476, 83, MUTED)
    rect(pdf, 496, 75, 74, 74, colors.white, LINE, 4)
    qr(pdf, 502, 81, 62)
    right(pdf, 570, 67, "SCAN TO CHECK", 6.2, True, GREEN)
    footer(pdf, 1)
    pdf.showPage()


def answer_row(pdf, bottom, case_name, mean, mean_error, median, median_error, winner, stripe):
    if stripe:
        rect(pdf, 42, bottom, 528, 57, PALE)
    text(pdf, 54, bottom + 21, case_name, 11, True)
    text(pdf, 108, bottom + 31, mean, 8.9, True)
    text(pdf, 108, bottom + 14, f"Absolute error: {mean_error}", 8, False, MUTED)
    text(pdf, 272, bottom + 31, median, 8.9, True)
    text(pdf, 272, bottom + 14, f"Absolute error: {median_error}", 8, False, MUTED)
    text(pdf, 455, bottom + 22, winner, 8.7, True, GREEN)
    line(pdf, 42, bottom, 570, bottom)


def answer_page(pdf):
    header(pdf, 2)
    text(pdf, 42, 708, "Worked answer key", 22, True)
    text(pdf, 42, 686, "The same two estimators can produce three different outcomes.", 9.4, False, MUTED)
    rect(pdf, 42, 640, 528, 31, INK)
    text(pdf, 54, 651, "CASE", 8, True, colors.white)
    text(pdf, 108, 651, "MEAN / ERROR", 8, True, colors.white)
    text(pdf, 272, 651, "MEDIAN / ERROR", 8, True, colors.white)
    text(pdf, 455, 651, "CLOSER", 8, True, colors.white)
    answer_row(pdf, 583, "A", "283 ÷ 5 = 56.6", "6.6", "50", "0", "Median", True)
    answer_row(pdf, 526, "B", "260 ÷ 5 = 52", "0", "50", "2", "Mean", False)
    answer_row(pdf, 469, "C", "250 ÷ 5 = 50", "0", "50", "0", "Equal", True)

    text(pdf, 42, 433, "THE IDEA TO TAKE AWAY", 9, True, GREEN)
    rect(pdf, 42, 332, 528, 88, SOFT, None, 7)
    text(pdf, 56, 395, "The winner depends on the readings AND the stated target.", 11, True)
    text(pdf, 56, 375, "Case A: a high reading pulls the mean away from 50.", 9.1)
    text(pdf, 56, 358, "Case B: the mean lands exactly on the supplied target of 52.", 9.1)
    text(pdf, 56, 341, "Case C: both estimates and both errors are equal.", 9.1)

    text(pdf, 42, 311, "FACILITATOR PROMPTS", 9, True, GREEN)
    text(pdf, 42, 287, "1. Ask for a prediction before anyone calculates.", 9.3)
    text(pdf, 42, 266, "2. Have students show both absolute errors, not just the estimates.", 9.3)
    text(pdf, 42, 245, "3. Change only the target. Can the closer estimate change?", 9.3)
    text(pdf, 42, 218, "These are invented readings and chosen targets, not measured ground truth.", 8.5, False, MUTED)
    text(pdf, 42, 201, "An unusual observation is not automatically wrong.", 8.5, False, MUTED)

    line(pdf, 42, 175, 570, 175)
    text(pdf, 42, 155, "TAKE IT ONLINE", 9, True, GREEN)
    text(pdf, 42, 135, "Scan for blind checks of A, B, and C, then change", 9)
    text(pdf, 42, 119, "the values in the interactive lab.", 9)
    rect(pdf, 475, 77, 95, 95, colors.white, LINE, 4)
    qr(pdf, 482, 84, 81)
    text(pdf, 42, 84, "ĀRU Intelligence Inc.  /  Daniel Jacob Read IV", 8, True, INK)
    text(pdf, 42, 69, "Created with Shane Travis Horman. Source and methods: MIT license.", 7.3, False, MUTED)
    footer(pdf, 2)
    pdf.showPage()


def main():
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    pdf = canvas.Canvas(str(OUTPUT), pagesize=letter, pageCompression=1, invariant=1)
    pdf.setTitle("Mean vs Median: Three-Case Worksheet and Answer Key")
    pdf.setAuthor("Daniel Jacob Read IV / ĀRU Intelligence Inc.")
    pdf.setSubject("Printable classroom worksheet with invented cases and interactive checks")
    student_page(pdf)
    answer_page(pdf)
    pdf.save()
    print(OUTPUT)


if __name__ == "__main__":
    main()
