"""Render the reproducible social preview from the seed-42 cohort model.

Requires Pillow; this script is only needed when updating the checked-in PNG.
"""

from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter, ImageFont


ROOT = Path(__file__).resolve().parents[1]
SCALE = 2
WIDTH, HEIGHT = 1200 * SCALE, 630 * SCALE
FONT = "DejaVuSans.ttf"
BOLD = "DejaVuSans-Bold.ttf"


def s(value):
    return round(value * SCALE)


def font(size, bold=False):
    return ImageFont.truetype(BOLD if bold else FONT, s(size))


def observers(seed):
    state = (seed ^ 0x85EBCA6B) & 0xFFFFFFFF
    values = []
    for _ in range(4):
        state = (1664525 * state + 1013904223) & 0xFFFFFFFF
        values.append(42 + 16 * state / 4294967296)
    return values


def curves():
    members = [observers(seed) for seed in range(42, 170)]
    result = []
    for fifth in range(101):
        mean_errors, median_errors = [], []
        for fixed in members:
            values = [*fixed, fifth]
            mean_errors.append(abs(sum(values) / 5 - 50))
            median_errors.append(abs(sorted(values)[2] - 50))
        result.append((sum(mean_errors) / 128, sum(median_errors) / 128))
    return result


def main():
    image = Image.new("RGB", (WIDTH, HEIGHT))
    pixels = image.load()
    for y in range(HEIGHT):
        t = y / HEIGHT
        color = (round(7 + 9 * t), round(18 + 19 * t), round(29 + 26 * t))
        for x in range(WIDTH):
            pixels[x, y] = color

    glow = Image.new("RGBA", (WIDTH, HEIGHT), (0, 0, 0, 0))
    g = ImageDraw.Draw(glow)
    g.ellipse((s(-170), s(-220), s(790), s(740)), fill=(26, 155, 132, 56))
    g.ellipse((s(550), s(-170), s(1410), s(680)), fill=(63, 115, 163, 28))
    image = Image.alpha_composite(image.convert("RGBA"), glow.filter(ImageFilter.GaussianBlur(s(90))))
    draw = ImageDraw.Draw(image)

    mint, gold, muted, white = "#5af0c6", "#ffcb78", "#a6bdc6", "#eaf6f6"
    draw.text((s(66), s(70)), "ĀRU INTELLIGENCE  /  OPEN EXPERIMENT", font=font(17, True), fill=mint)
    draw.text((s(64), s(158)), "One number", font=font(61, True), fill=white)
    draw.text((s(64), s(237)), "changes the", font=font(61, True), fill=white)
    draw.text((s(64), s(316)), "answer.", font=font(68, True), fill=gold)
    draw.text((s(67), s(430)), "Mean vs median. One seed vs 128.", font=font(22), fill=muted)
    draw.text((s(67), s(468)), "Explore the result. Inspect every input.", font=font(22), fill=white)

    draw.rounded_rectangle((s(645), s(57), s(1146), s(564)), radius=s(28), fill="#102b3a", outline="#4b867e", width=s(2))
    draw.text((s(682), s(88)), "128-Seed Error Curves", font=font(23, True), fill=white)
    draw.ellipse((s(683), s(132), s(697), s(146)), fill=gold)
    draw.text((s(704), s(127)), "Mean", font=font(16), fill=muted)
    draw.ellipse((s(792), s(132), s(806), s(146)), fill=mint)
    draw.text((s(813), s(127)), "Median", font=font(16), fill=muted)

    left, right, top, bottom = 704, 1104, 190, 380
    for tick in range(0, 13, 3):
        y = bottom - tick * (bottom - top) / 12
        draw.line((s(left), s(y), s(right), s(y)), fill="#355869", width=s(1))
        draw.text((s(670), s(y - 9)), str(tick), font=font(14), fill=muted)
    for tick in (0, 25, 50, 75, 100):
        x = left + tick * (right - left) / 100
        draw.text((s(x - 9), s(388)), str(tick), font=font(14), fill=muted)

    points = curves()
    for index, color in ((0, gold), (1, mint)):
        coords = [(s(left + fifth * (right - left) / 100), s(bottom - values[index] * (bottom - top) / 12)) for fifth, values in enumerate(points)]
        draw.line(coords, fill=color, width=s(4), joint="curve")
    chosen_x = left + (right - left) / 2
    draw.line((s(chosen_x), s(top), s(chosen_x), s(bottom)), fill="#d4e6e4", width=s(2))
    for index, color in ((0, gold), (1, mint)):
        y = bottom - points[50][index] * (bottom - top) / 12
        draw.ellipse((s(chosen_x - 6), s(y - 6), s(chosen_x + 6), s(y + 6)), fill=color, outline="#102b3a", width=s(2))

    draw.line((s(682), s(433), s(1107), s(433)), fill="#406477", width=s(1))
    draw.text((s(684), s(451)), "AT FIFTH ESTIMATE 50", font=font(14, True), fill=muted)
    draw.text((s(684), s(481)), "Mean 1.43", font=font(21, True), fill=gold)
    draw.text((s(870), s(481)), "Median 1.56", font=font(21, True), fill=mint)
    draw.text((s(684), s(524)), "Median wins in 75 of 128 cases", font=font(17), fill=white)

    draw.line((s(66), s(553), s(575), s(553)), fill="#54798b", width=s(1))
    draw.text((s(66), s(571)), "INWARD MATHEMATICS™", font=font(16, True), fill=mint)
    draw.text((s(390), s(571)), "LIVE TOY LAB", font=font(16, True), fill=muted)

    image.convert("RGB").resize((1200, 630), Image.Resampling.LANCZOS).save(ROOT / "social-card.png", optimize=True)


if __name__ == "__main__":
    main()
