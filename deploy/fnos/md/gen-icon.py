"""
LX Music Player App Icon Generator v4
Minimal gradient + white note + LX text
"""
from PIL import Image, ImageDraw, ImageFont
import math
import os

SIZE = 512
CORNER_RADIUS = 112
FONT_DIR = "C:/Users/levis/.claude/plugins/cache/anthropic-agent-skills/document-skills/0f7c287eaf0d/skills/canvas-design/canvas-fonts"

def create_rounded_mask(size, radius):
    mask = Image.new('L', (size, size), 0)
    draw = ImageDraw.Draw(mask)
    draw.rounded_rectangle([0, 0, size-1, size-1], radius=radius, fill=255)
    return mask

def lerp_color(c1, c2, t):
    return tuple(int(a + (b - a) * t) for a, b in zip(c1, c2))

def create_icon():
    img = Image.new('RGBA', (SIZE, SIZE), (0, 0, 0, 0))

    # === Background: coral-red to deep magenta diagonal gradient ===
    bg = Image.new('RGBA', (SIZE, SIZE), (0, 0, 0, 255))
    bg_draw = ImageDraw.Draw(bg)

    c_top_left = (250, 65, 80)
    c_top_right = (220, 50, 100)
    c_bot_left = (180, 40, 120)
    c_bot_right = (140, 30, 150)

    for y in range(SIZE):
        ty = y / SIZE
        c_left = lerp_color(c_top_left, c_bot_left, ty)
        c_right = lerp_color(c_top_right, c_bot_right, ty)
        for x in range(SIZE):
            tx = x / SIZE
            c = lerp_color(c_left, c_right, tx)
            bg_draw.point((x, y), fill=(*c, 255))

    img = Image.alpha_composite(img, bg)

    # === Music note — upper right area ===
    note = Image.new('RGBA', (SIZE, SIZE), (0, 0, 0, 0))
    note_draw = ImageDraw.Draw(note)

    white = (255, 255, 255, 245)

    # Note positioned upper-right to balance with LX text at bottom-left
    ox, oy = 40, -20  # offset from center

    n1x, n1y = 256 + ox - 42, 256 + oy + 50
    n2x, n2y = 256 + ox + 42, 256 + oy + 25
    head_rx, head_ry = 30, 22
    tilt_deg = -25

    for nx, ny in [(n1x, n1y), (n2x, n2y)]:
        pts = []
        for angle in range(0, 360, 2):
            rad = math.radians(angle)
            tilt_rad = math.radians(tilt_deg)
            x = head_rx * math.cos(rad)
            y = head_ry * math.sin(rad)
            rx = x * math.cos(tilt_rad) - y * math.sin(tilt_rad)
            ry = x * math.sin(tilt_rad) + y * math.cos(tilt_rad)
            pts.append((nx + rx, ny + ry))
        note_draw.polygon(pts, fill=white)

    # Stems
    stem_w = 8
    stem_h = 135
    s1x = n1x + 26
    s2x = n2x + 26

    note_draw.line([(s1x, n1y - 10), (s1x, n1y - stem_h)], fill=white, width=stem_w)
    note_draw.line([(s2x, n2y - 10), (s2x, n2y - stem_h)], fill=white, width=stem_w)

    # Beams
    beam_w = 12
    s1_top_y = n1y - stem_h
    s2_top_y = n2y - stem_h
    half = beam_w // 2

    beam_pts = [
        (s1x - stem_w//2, s1_top_y - half),
        (s2x + stem_w//2, s2_top_y - half),
        (s2x + stem_w//2, s2_top_y + half),
        (s1x - stem_w//2, s1_top_y + half),
    ]
    note_draw.polygon(beam_pts, fill=white)

    gap = 22
    beam2_pts = [
        (s1x - stem_w//2, s1_top_y - half + gap),
        (s2x + stem_w//2, s2_top_y - half + gap),
        (s2x + stem_w//2, s2_top_y + half + gap),
        (s1x - stem_w//2, s1_top_y + half + gap),
    ]
    note_draw.polygon(beam2_pts, fill=white)

    img = Image.alpha_composite(img, note)

    # === "LX" text — bottom left, bold, semi-transparent ===
    text_layer = Image.new('RGBA', (SIZE, SIZE), (0, 0, 0, 0))
    text_draw = ImageDraw.Draw(text_layer)

    font_path = os.path.join(FONT_DIR, "Outfit-Bold.ttf")
    font_lx = ImageFont.truetype(font_path, 120)

    # Position bottom-left with padding
    tx, ty = 52, 340
    text_draw.text((tx, ty), "LX", font=font_lx, fill=(255, 255, 255, 220))

    img = Image.alpha_composite(img, text_layer)

    # === Rounded mask ===
    mask = create_rounded_mask(SIZE, CORNER_RADIUS)
    final = Image.new('RGBA', (SIZE, SIZE), (0, 0, 0, 0))
    final.paste(img, (0, 0), mask)

    return final


def resize_icon(img, size):
    return img.resize((size, size), Image.LANCZOS)


if __name__ == '__main__':
    icon = create_icon()
    out_dir = os.path.dirname(os.path.abspath(__file__))

    icon.save(os.path.join(out_dir, 'icon_512.png'))
    resize_icon(icon, 256).save(os.path.join(out_dir, 'icon_256.png'))
    resize_icon(icon, 128).save(os.path.join(out_dir, 'icon_128.png'))
    resize_icon(icon, 64).save(os.path.join(out_dir, 'icon_64.png'))

    print("Icons generated.")
