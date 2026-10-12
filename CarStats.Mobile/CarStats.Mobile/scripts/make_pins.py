# Draws the map pin images: python scripts/make_pins.py
from PIL import Image, ImageDraw, ImageFont

ROOT = __import__("os").path.dirname(__import__("os").path.dirname(__import__("os").path.abspath(__file__)))
FONT = ROOT + r"\node_modules\@expo\vector-icons\build\vendor\react-native-vector-icons\Fonts\MaterialIcons.ttf"
OUT = ROOT + "/assets/images"

BLUE, WHITE, GREEN = "#003FB1", "#FFFFFF", "#059669"
WRENCH, STAR = "\ue869", "\ue838"

PINS = {
    "pin-shop":     (BLUE,  WHITE, WRENCH, WHITE),
    "pin-shop-alt": (WHITE, BLUE,  WRENCH, BLUE),
    "pin-brand":    (GREEN, WHITE, STAR,   WHITE),
}

SIZE_DP, RING_DP, ICON_DP = 40, 2, 20

for name, (fill, ring, glyph, glyph_colour) in PINS.items():
    for scale in (1, 2, 3):
        ss = 4
        px = SIZE_DP * scale * ss
        img = Image.new("RGBA", (px, px), (0, 0, 0, 0))
        d = ImageDraw.Draw(img)
        d.ellipse([0, 0, px - 1, px - 1], fill=ring)
        r = RING_DP * scale * ss
        d.ellipse([r, r, px - 1 - r, px - 1 - r], fill=fill)
        font = ImageFont.truetype(FONT, ICON_DP * scale * ss)
        d.text((px / 2, px / 2), glyph, font=font, fill=glyph_colour, anchor="mm")
        img = img.resize((SIZE_DP * scale, SIZE_DP * scale), Image.LANCZOS)
        suffix = "" if scale == 1 else f"@{scale}x"
        img.save(f"{OUT}\\{name}{suffix}.png")
        print("saved", f"{name}{suffix}.png", img.size)
