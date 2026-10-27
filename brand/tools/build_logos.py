"""Build the logo SVGs in brand/logo/ with the wordmark text outlined as paths.

Needs: pip install fonttools uharfbuzz
Usage: python3 brand/tools/build_logos.py path/to/SpaceGrotesk-Bold.ttf
"""
import os
import sys

import uharfbuzz as hb
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.ttLib import TTFont

INK, PAPER, WHITE = "#14171C", "#F6F3EC", "#FFFFFF"
BARS = ["#3FA796", "#E3B341", "#E8743B", "#D9473A"]
OUT = os.path.join(os.path.dirname(__file__), "..", "logo")

font_path = sys.argv[1]
tt = TTFont(font_path)
glyphs = tt.getGlyphSet()
upem = tt["head"].unitsPerEm
hb_font = hb.Font(hb.Face(hb.Blob.from_file_path(font_path)))


def text_path(text, size, x, baseline, tracking=-0.01):
    """Return (svg path d, advance width) for text set at size with its baseline at y."""
    buf = hb.Buffer()
    buf.add_str(text)
    buf.guess_segment_properties()
    hb.shape(hb_font, buf, {"kern": True, "liga": True})
    scale = size / upem
    pen = SVGPathPen(glyphs, ntos=lambda v: f"{v:.2f}".rstrip("0").rstrip("."))
    cursor = 0
    names = tt.getGlyphOrder()
    for info, pos in zip(buf.glyph_infos, buf.glyph_positions):
        name = names[info.codepoint]
        gx = x + (cursor + pos.x_offset) * scale
        glyphs[name].draw(TransformPen(pen, (scale, 0, 0, -scale, gx, baseline)))
        cursor += pos.x_advance + tracking * upem
    return pen.getCommands(), (cursor - tracking * upem) * scale


def mark(x, y, s, tile=INK, bars=None):
    """The bar-chart mark on the site's 64 grid, scaled to s px at (x, y)."""
    k = s / 64
    bars = bars or BARS
    geo = [(12, 38, 8, 14), (24, 30, 8, 22), (36, 20, 8, 32), (48, 11, 6, 41)]
    out = []
    if tile:
        out.append(f'<rect x="{x}" y="{y}" width="{s}" height="{s}" rx="{12*k:g}" fill="{tile}"/>')
    for (bx, by, bw, bh), c in zip(geo, bars):
        out.append(f'<rect x="{x+bx*k:g}" y="{y+by*k:g}" width="{bw*k:g}" height="{bh*k:g}" rx="{1.5*k:g}" fill="{c}"/>')
    return "".join(out)


def svg(w, h, body, title="Job Exposure Index"):
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w:g} {h:g}" width="{w:g}" height="{h:g}" '
            f'role="img" aria-label="{title}"><title>{title}</title>{body}</svg>\n')


def save(name, content):
    with open(os.path.join(OUT, name), "w") as f:
        f.write(content)


os.makedirs(OUT, exist_ok=True)

# Marks
save("mark.svg", svg(64, 64, mark(0, 0, 64)))
save("mark-paper.svg", svg(64, 64, mark(0, 0, 64, tile=PAPER)))
save("mark-bars.svg", svg(64, 64, mark(0, 0, 64, tile=None)))
save("mark-mono-ink.svg", svg(64, 64, mark(0, 0, 64, tile=None, bars=[INK] * 4)))
save("mark-mono-white.svg", svg(64, 64, mark(0, 0, 64, tile=None, bars=[WHITE] * 4)))

# Lockups: ink text for light backgrounds; white text and a paper tile for dark ones,
# so the mark stays a visible square
S = 64
for suffix, text_c, tile in (("", INK, INK), ("-white", WHITE, PAPER)):
    # Horizontal: mark + two-line wordmark (as in the site header)
    fs = 30
    tx = S + 18
    d1, w1 = text_path("Job Exposure", fs, tx, 29)
    d2, w2 = text_path("Index", fs, tx, 60)
    w = tx + max(w1, w2)
    save(f"logo-horizontal{suffix}.svg", svg(w, S, mark(0, 0, S, tile=tile) + f'<path d="{d1} {d2}" fill="{text_c}"/>'))

    # Inline: mark + one-line wordmark
    fs = 34
    d, tw = text_path("Job Exposure Index", fs, S + 18, 44)
    save(f"logo-inline{suffix}.svg", svg(S + 18 + tw, S, mark(0, 0, S, tile=tile) + f'<path d="{d}" fill="{text_c}"/>'))

    # Stacked: mark above a centred two-line wordmark
    fs = 34
    _, w1 = text_path("Job Exposure", fs, 0, 0)
    _, w2 = text_path("Index", fs, 0, 0)
    W = max(w1, w2)
    M = 96
    d1, _ = text_path("Job Exposure", fs, (W - w1) / 2, M + 50)
    d2, _ = text_path("Index", fs, (W - w2) / 2, M + 88)
    save(f"logo-stacked{suffix}.svg", svg(W, M + 98, mark((W - M) / 2, 0, M, tile=tile) + f'<path d="{d1} {d2}" fill="{text_c}"/>'))
print("logos written to", os.path.abspath(OUT))
