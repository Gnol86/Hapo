"""Render Hapo's original house-and-resident icon from geometric primitives.

Run with ``uv run python scripts/build_brand.py``. Pillow is available in the
locked Home Assistant development environment. No runtime dependency is added.
"""

from pathlib import Path

from PIL import Image, ImageDraw

BRAND = Path(__file__).resolve().parents[1] / "custom_components" / "hapo" / "brand"
SCALE = 8
HOUSE = "#7C5CDB"
RESIDENT = "#159E9A"


def build() -> None:
    """Create transparent, antialiased 256px and 512px PNG assets."""
    canvas = Image.new("RGBA", (256 * SCALE, 256 * SCALE))
    drawing = ImageDraw.Draw(canvas)

    def box(bounds: tuple[int, int, int, int]) -> tuple[int, ...]:
        return tuple(value * SCALE for value in bounds)

    outline = [(30, 111), (128, 31), (226, 111)]
    drawing.line(
        [(x * SCALE, y * SCALE) for x, y in outline],
        fill=HOUSE,
        width=18 * SCALE,
        joint="curve",
    )
    for x, y in outline:
        drawing.ellipse(box((x - 9, y - 9, x + 9, y + 9)), fill=HOUSE)
    drawing.line(
        [(48 * SCALE, 109 * SCALE), (48 * SCALE, 216 * SCALE)],
        fill=HOUSE,
        width=18 * SCALE,
    )
    drawing.line(
        [(208 * SCALE, 109 * SCALE), (208 * SCALE, 216 * SCALE)],
        fill=HOUSE,
        width=18 * SCALE,
    )
    drawing.rounded_rectangle(box((39, 207, 217, 225)), 9 * SCALE, fill=HOUSE)
    drawing.ellipse(box((105, 93, 151, 139)), fill=RESIDENT)
    drawing.rounded_rectangle(box((87, 151, 169, 197)), 23 * SCALE, fill=RESIDENT)

    BRAND.mkdir(parents=True, exist_ok=True)
    for filename, size in (("icon.png", 256), ("icon@2x.png", 512)):
        canvas.resize((size, size), Image.Resampling.LANCZOS).save(
            BRAND / filename, optimize=True
        )


if __name__ == "__main__":
    build()
