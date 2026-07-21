#!/usr/bin/env python3
"""
build_map.py
Assembles the self-contained mapc-choropleth-map.html from scripts/map_template.html
(a lean shell with <link>/<script src> tags), scripts/styles.css, scripts/js/*.js,
and the data files in assets/. Run this after editing any of those, or refreshing
any of the data files — the shipped HTML must stay a single file (no server, no
build step for the end user), so everything gets inlined at build time here instead
of being hand-edited inside the giant HTML.

The shell's own <link rel="stylesheet" href="styles.css"> and local
<script src="js/....js"> tags (NOT the CDN <script src="https://...">  tags, which
stay as external references per the project's CDN-only rule) exist so the shell can
also be opened directly in a browser during development, without running this build
first.

Usage:
    python build_map.py [--output ../mapc-choropleth-map.html]
"""

import argparse
import base64
import json
import os
import re

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

PLACEHOLDERS = {
    "__BOUNDARY_TOPOJSON__": os.path.join(REPO, "assets", "mapc-101-boundaries.topojson"),
    "__MAPC_LOOKUP__": os.path.join(REPO, "assets", "mapc-lookup.json"),
    "__SAMPLE_DATA__": os.path.join(REPO, "assets", "sample-data.json"),
    "__REGION_OUTLINE__": os.path.join(REPO, "assets", "mapc-region-outline.geojson"),
}

# Binary assets inlined as base64 data URIs (not JSON, so kept separate from PLACEHOLDERS above).
IMAGE_PLACEHOLDERS = {
    "__MAPC_LOGO__": os.path.join(REPO, "assets", "logo.png"),
}

# Matches only local relative-path files (styles.css, js/foo.js) — CDN <script src="https://...">
# tags in <head> must NOT be touched, they stay as external references.
LOCAL_CSS_LINK_RE = re.compile(r'<link rel="stylesheet" href="((?!https?://)[^"]+\.css)">')
LOCAL_SCRIPT_SRC_RE = re.compile(r'<script src="((?!https?://)[^"]+\.js)"></script>')


def assemble_shell(template_path):
    """Reads the shell template and inlines its local styles.css / js/*.js references,
    in document order, so the result is equivalent to the old single-<style>/<script>
    monolith this function replaces."""
    shell_dir = os.path.dirname(template_path)
    with open(template_path, encoding="utf-8") as f:
        html = f.read()

    def inline_css(match):
        css_path = os.path.join(shell_dir, match.group(1))
        with open(css_path, encoding="utf-8") as f:
            return "<style>\n" + f.read() + "</style>"

    html = LOCAL_CSS_LINK_RE.sub(inline_css, html)

    def inline_js(match):
        js_path = os.path.join(shell_dir, match.group(1))
        with open(js_path, encoding="utf-8") as f:
            return "<script>\n" + f.read() + "</script>"

    html = LOCAL_SCRIPT_SRC_RE.sub(inline_js, html)
    return html


def main():
    parser = argparse.ArgumentParser(description="Build the self-contained choropleth HTML")
    parser.add_argument("--output", default=os.path.join(REPO, "mapc-choropleth-map.html"))
    parser.add_argument("--template", default=os.path.join(REPO, "scripts", "map_template.html"))
    args = parser.parse_args()

    html = assemble_shell(args.template)

    banner = (
        "<!--\n"
        "  GENERATED FILE — do not hand-edit, changes will be overwritten.\n"
        "  Source: scripts/map_template.html + scripts/styles.css + scripts/js/*.js\n"
        "  Rebuild: python scripts/build_map.py\n"
        "-->\n"
    )
    html = html.replace("<!DOCTYPE html>", "<!DOCTYPE html>\n" + banner, 1)

    for placeholder, data_path in PLACEHOLDERS.items():
        if placeholder not in html:
            raise ValueError(f"Template is missing placeholder {placeholder}")
        with open(data_path, encoding="utf-8") as f:
            data = json.load(f)  # validates it's well-formed before inlining
        html = html.replace(placeholder, json.dumps(data, separators=(",", ":")))

    for placeholder, image_path in IMAGE_PLACEHOLDERS.items():
        if placeholder not in html:
            raise ValueError(f"Template is missing placeholder {placeholder}")
        ext = os.path.splitext(image_path)[1].lstrip(".").lower()
        mime = "image/svg+xml" if ext == "svg" else f"image/{ext}"
        with open(image_path, "rb") as f:
            encoded = base64.b64encode(f.read()).decode("ascii")
        html = html.replace(placeholder, f"data:{mime};base64,{encoded}")

    with open(args.output, "w", encoding="utf-8") as f:
        f.write(html)

    print(f"Built {args.output} ({os.path.getsize(args.output) / 1024:.1f} KB)")


if __name__ == "__main__":
    main()
