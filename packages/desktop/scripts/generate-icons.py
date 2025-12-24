#!/usr/bin/env python3
"""
Generate all app icons from the HandsLogo design.
Uses PIL to draw the hand shape directly.
"""

import os
import subprocess
import shutil
from pathlib import Path
from PIL import Image, ImageDraw

ICONS_DIR = Path(__file__).parent.parent / "src-tauri" / "icons"


def draw_hands_logo(draw: ImageDraw.Draw, size: int, stroke_color: tuple, stroke_width: int, offset: tuple = (0, 0)):
    """
    Draw the Hands logo (hand shape) on the given ImageDraw object.
    Based on the SVG paths from HandsLogo component.
    """
    # Scale factor from 24x24 viewBox to target size
    scale = size / 24
    ox, oy = offset

    def scaled_point(x, y):
        return (x * scale + ox, y * scale + oy)

    def draw_arc(center, radius, start_angle, end_angle):
        """Helper to draw arc (approximation)"""
        import math
        cx, cy = center
        r = radius * scale
        # Draw arc as series of lines
        points = []
        for i in range(20):
            angle = math.radians(start_angle + (end_angle - start_angle) * i / 19)
            x = cx * scale + ox + r * math.cos(angle)
            y = cy * scale + oy + r * math.sin(angle)
            points.append((x, y))
        for i in range(len(points) - 1):
            draw.line([points[i], points[i+1]], fill=stroke_color, width=stroke_width)

    # The hand logo consists of:
    # 1. Three finger stems (vertical lines with rounded tops)
    # 2. A thumb on the right
    # 3. A palm area at bottom

    # Simplified hand shape drawn with lines
    # Finger 1 (ring finger) - leftmost
    draw.line([scaled_point(6, 14), scaled_point(6, 6)], fill=stroke_color, width=stroke_width)
    draw.ellipse([
        scaled_point(4, 4)[0], scaled_point(4, 4)[1],
        scaled_point(8, 8)[0], scaled_point(8, 8)[1]
    ], outline=stroke_color, width=stroke_width)

    # Finger 2 (middle finger)
    draw.line([scaled_point(10, 10.5), scaled_point(10, 4)], fill=stroke_color, width=stroke_width)
    draw.ellipse([
        scaled_point(8, 2)[0], scaled_point(8, 2)[1],
        scaled_point(12, 6)[0], scaled_point(12, 6)[1]
    ], outline=stroke_color, width=stroke_width)

    # Finger 3 (index finger)
    draw.line([scaled_point(14, 10), scaled_point(14, 6)], fill=stroke_color, width=stroke_width)
    draw.ellipse([
        scaled_point(12, 4)[0], scaled_point(12, 4)[1],
        scaled_point(16, 8)[0], scaled_point(16, 8)[1]
    ], outline=stroke_color, width=stroke_width)

    # Finger 4 (pinky/thumb area)
    draw.line([scaled_point(18, 11), scaled_point(18, 8)], fill=stroke_color, width=stroke_width)
    draw.ellipse([
        scaled_point(18, 6)[0], scaled_point(18, 6)[1],
        scaled_point(22, 10)[0], scaled_point(22, 10)[1]
    ], outline=stroke_color, width=stroke_width)

    # Palm and wrist area
    draw.line([scaled_point(6, 14), scaled_point(6, 22)], fill=stroke_color, width=stroke_width)
    draw.arc([
        scaled_point(6, 14)[0], scaled_point(14, 14)[1],
        scaled_point(22, 22)[0], scaled_point(22, 22)[1]
    ], start=0, end=90, fill=stroke_color, width=stroke_width)


def create_simple_hand_icon(size: int, stroke_color: tuple, bg_color: tuple = None,
                            stroke_width: int = None, padding: float = 0.15) -> Image.Image:
    """
    Create a simplified hand icon using basic shapes.
    """
    img = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    if stroke_width is None:
        stroke_width = max(1, int(size / 12))

    # Background
    if bg_color:
        corner_radius = int(size * 0.22)
        draw.rounded_rectangle([0, 0, size-1, size-1], radius=corner_radius, fill=bg_color)

    # Calculate padded area
    pad = int(size * padding)
    inner_size = size - (2 * pad)
    scale = inner_size / 24

    # Helper for scaled coordinates
    def s(x, y):
        return (int(x * scale + pad), int(y * scale + pad))

    # Draw simplified hand shape
    # This creates a recognizable hand silhouette

    # Vertical finger lines
    fingers = [
        (6, 6, 6, 14),    # Ring finger
        (10, 4, 10, 12),  # Middle finger (tallest)
        (14, 6, 14, 12),  # Index finger
        (18, 8, 18, 12),  # Pinky/thumb
    ]

    for x1, y1, x2, y2 in fingers:
        draw.line([s(x1, y1), s(x2, y2)], fill=stroke_color, width=stroke_width)
        # Rounded top
        r = stroke_width
        cx, cy = s(x1, y1)
        draw.ellipse([cx-r, cy-r, cx+r, cy+r], fill=stroke_color)

    # Palm connection (horizontal)
    draw.line([s(6, 12), s(18, 12)], fill=stroke_color, width=stroke_width)

    # Wrist/palm bottom
    draw.line([s(6, 12), s(6, 18)], fill=stroke_color, width=stroke_width)
    draw.line([s(18, 12), s(18, 18)], fill=stroke_color, width=stroke_width)
    draw.line([s(6, 18), s(18, 18)], fill=stroke_color, width=stroke_width)

    # Thumb (diagonal)
    draw.line([s(18, 12), s(21, 9)], fill=stroke_color, width=stroke_width)
    cx, cy = s(21, 9)
    draw.ellipse([cx-stroke_width//2, cy-stroke_width//2, cx+stroke_width//2, cy+stroke_width//2], fill=stroke_color)

    return img


def create_stylized_hand_icon(size: int, stroke_color: tuple, bg_color: tuple = None,
                               stroke_width: int = None, padding: float = 0.12) -> Image.Image:
    """
    Create a more stylized/recognizable hand icon.
    """
    img = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    if stroke_width is None:
        stroke_width = max(2, int(size / 10))

    # Background with gradient effect (solid for now)
    if bg_color:
        corner_radius = int(size * 0.22)
        draw.rounded_rectangle([0, 0, size-1, size-1], radius=corner_radius, fill=bg_color)

    # Calculate padded area
    pad = int(size * padding)
    inner = size - (2 * pad)

    # Hand proportions (in 24x24 space, scaled to inner)
    def s(val):
        return int(val / 24 * inner + pad)

    # Draw the hand as connected shapes
    sw = stroke_width

    # Four fingers (vertical strokes)
    finger_data = [
        # (x, top_y, bottom_y) - positions in 24-unit space
        (6, 5, 14),    # Ring
        (10, 3, 14),   # Middle (tallest)
        (14, 5, 14),   # Index
        (18, 7, 14),   # Pinky
    ]

    for fx, top, bottom in finger_data:
        x = s(fx)
        y1 = s(top)
        y2 = s(bottom)
        draw.line([(x, y1), (x, y2)], fill=stroke_color, width=sw)
        # Rounded cap at top
        r = sw // 2
        draw.ellipse([x-r, y1-r, x+r, y1+r], fill=stroke_color)

    # Palm (horizontal line connecting fingers)
    draw.line([s(6), s(14), s(18), s(14)], fill=stroke_color, width=sw)

    # Thumb sticking out to the right
    draw.line([s(18), s(10), s(22), s(8)], fill=stroke_color, width=sw)
    # Thumb cap
    r = sw // 2
    draw.ellipse([s(22)-r, s(8)-r, s(22)+r, s(8)+r], fill=stroke_color)

    # Wrist/palm bottom
    draw.line([s(6), s(14), s(4), s(20)], fill=stroke_color, width=sw)
    draw.line([s(18), s(14), s(20), s(20)], fill=stroke_color, width=sw)
    draw.line([s(4), s(20), s(20), s(20)], fill=stroke_color, width=sw)

    return img


def create_tray_icon(size: int, template: bool = True) -> Image.Image:
    """Create a tray icon. Template icons are black on transparent."""
    if template:
        # Black stroke for template icon (macOS inverts for dark mode)
        return create_stylized_hand_icon(size, stroke_color=(0, 0, 0, 255), padding=0.08)
    else:
        # Colored icon with blue background
        return create_stylized_hand_icon(
            size,
            stroke_color=(255, 255, 255, 255),
            bg_color=(59, 130, 246, 255),  # Blue
            padding=0.15
        )


def create_app_icon(size: int) -> Image.Image:
    """Create an app icon with blue gradient background."""
    # Create with blue background and white hand
    return create_stylized_hand_icon(
        size,
        stroke_color=(255, 255, 255, 255),
        bg_color=(59, 130, 246, 255),  # Tailwind blue-500
        padding=0.15
    )


def generate_all_icons():
    """Generate all required icons."""
    ICONS_DIR.mkdir(parents=True, exist_ok=True)

    print("Generating tray icons...")
    # Tray icons (template style for macOS)
    for size, suffix in [(22, ""), (44, "@2x")]:
        img = create_tray_icon(size, template=True)
        output = ICONS_DIR / f"tray-icon{suffix}.png"
        img.save(output)
        print(f"  Created {output.name}")

    print("Generating app icons...")
    # Standard app icons
    for size in [32, 64, 128, 256, 512, 1024]:
        img = create_app_icon(size)
        output = ICONS_DIR / f"{size}x{size}.png"
        img.save(output)
        print(f"  Created {output.name}")

    # Retina versions
    for size in [128, 256, 512]:
        img = create_app_icon(size * 2)
        output = ICONS_DIR / f"{size}x{size}@2x.png"
        img.save(output)
        print(f"  Created {output.name}")

    # Main icon.png (512x512)
    img = create_app_icon(512)
    img.save(ICONS_DIR / "icon.png")
    print("  Created icon.png")

    # Windows Store logos
    print("Generating Windows Store logos...")
    store_sizes = [
        ("StoreLogo", 50),
        ("Square30x30Logo", 30),
        ("Square44x44Logo", 44),
        ("Square71x71Logo", 71),
        ("Square89x89Logo", 89),
        ("Square107x107Logo", 107),
        ("Square142x142Logo", 142),
        ("Square150x150Logo", 150),
        ("Square284x284Logo", 284),
        ("Square310x310Logo", 310),
    ]
    for name, size in store_sizes:
        img = create_app_icon(size)
        output = ICONS_DIR / f"{name}.png"
        img.save(output)
        print(f"  Created {name}.png")

    print("\nGenerating macOS .icns...")
    generate_icns()

    print("\nDone! All icons generated from HandsLogo.")


def generate_icns():
    """Generate macOS .icns file from the icon PNGs."""
    iconset_dir = ICONS_DIR / "icon.iconset"
    iconset_dir.mkdir(exist_ok=True)

    # macOS iconset sizes
    sizes = [16, 32, 64, 128, 256, 512]

    for size in sizes:
        # Regular
        img = create_app_icon(size)
        img.save(iconset_dir / f"icon_{size}x{size}.png")

        # @2x
        img2x = create_app_icon(size * 2)
        img2x.save(iconset_dir / f"icon_{size}x{size}@2x.png")

    # 512@2x is 1024
    img = create_app_icon(1024)
    img.save(iconset_dir / "icon_512x512@2x.png")

    # Run iconutil to create .icns
    try:
        subprocess.run([
            'iconutil', '-c', 'icns', str(iconset_dir), '-o', str(ICONS_DIR / "icon.icns")
        ], check=True, capture_output=True)
        print("  Created icon.icns")
    except (subprocess.CalledProcessError, FileNotFoundError) as e:
        print(f"  Warning: Could not create icon.icns: {e}")

    # Clean up iconset
    shutil.rmtree(iconset_dir, ignore_errors=True)


if __name__ == "__main__":
    generate_all_icons()
