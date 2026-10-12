"""Render the answer-free social card for the prediction challenge (Pillow)."""

from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter, ImageFont


ROOT = Path(__file__).resolve().parents[1]
SCALE = 2
W, H = 1200 * SCALE, 630 * SCALE


def s(value):
    return round(value * SCALE)


def font(size, bold=False):
    return ImageFont.truetype("DejaVuSans-Bold.ttf" if bold else "DejaVuSans.ttf", s(size))


def main():
    image = Image.new("RGB", (W, H))
    draw = ImageDraw.Draw(image)
    for y in range(H):
        t = y / H
        draw.line((0, y, W, y), fill=(round(7 + 10 * t), round(18 + 18 * t), round(29 + 20 * t)))
    glow = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    light = ImageDraw.Draw(glow)
    light.ellipse((s(-180), s(-140), s(830), s(760)), fill=(27, 166, 139, 65))
    light.ellipse((s(570), s(-200), s(1430), s(690)), fill=(90, 130, 172, 35))
    image = Image.alpha_composite(image.convert("RGBA"), glow.filter(ImageFilter.GaussianBlur(s(80))))
    draw = ImageDraw.Draw(image)

    mint, gold, white, muted = "#5af0c6", "#ffcb78", "#eaf6f6", "#a6bdc6"
    draw.text((s(67), s(71)), "ĀRU INTELLIGENCE  /  INWARD MATHEMATICS™", font=font(17, True), fill=mint)
    draw.text((s(66), s(171)), "MEAN", font=font(72, True), fill=gold)
    draw.text((s(66), s(258)), "OR MEDIAN?", font=font(72, True), fill=white)
    draw.text((s(68), s(391)), "Five readings. One target.", font=font(25), fill=muted)
    draw.text((s(68), s(435)), "Make the call before the reveal.", font=font(25, True), fill=white)
    draw.line((s(68), s(537), s(576), s(537)), fill="#54798b", width=s(2))
    draw.text((s(68), s(555)), "A SHAREABLE PREDICTION CHALLENGE", font=font(17, True), fill=mint)

    draw.rounded_rectangle((s(681), s(80), s(1134), s(548)), radius=s(27), fill="#102b3a", outline="#4b867e", width=s(2))
    draw.text((s(723), s(116)), "TARGET 50", font=font(22, True), fill=white)
    draw.line((s(723), s(174), s(1091), s(174)), fill="#416579", width=s(2))
    draw.rounded_rectangle((s(722), s(210), s(1094), s(306)), radius=s(15), fill="#152d3b", outline="#ac8550", width=s(2))
    draw.text((s(746), s(230)), "MEAN", font=font(23, True), fill=gold)
    draw.text((s(1010), s(220)), "?", font=font(42, True), fill=gold)
    draw.rounded_rectangle((s(722), s(327), s(1094), s(423)), radius=s(15), fill="#152d3b", outline="#4b9682", width=s(2))
    draw.text((s(746), s(347)), "MEDIAN", font=font(23, True), fill=mint)
    draw.text((s(1010), s(337)), "?", font=font(42, True), fill=mint)
    draw.text((s(724), s(463)), "YOUR PREDICTION FIRST", font=font(17, True), fill=muted)

    image.convert("RGB").resize((1200, 630), Image.Resampling.LANCZOS).quantize(
        colors=128, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE
    ).save(ROOT / "challenge-card.png", optimize=True)


if __name__ == "__main__":
    main()
