#!/usr/bin/env python3
"""
build_map.py
Assembles index.html from scripts/map_template.html, scripts/styles.css,
scripts/js/*.js, and the data files in assets/. Run after editing any of those.

Usage:
    python build_map.py [--output ../index.html]
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
    "__REGION_OUTLINE__": os.path.join(REPO, "assets", "mapc-region-outline.topojson"),
}
LOGO = os.path.join(REPO, "assets", "logo.png")

# Matches only local files (styles.css, js/foo.js), not CDN <script> tags
LOCAL_CSS_LINK_RE = re.compile(r'<link rel="stylesheet" href="((?!https?://)[^"]+\.css)">')
LOCAL_SCRIPT_SRC_RE = re.compile(r'<script src="((?!https?://)[^"]+\.js)"></script>')


def assemble_shell(template_path):
    """Reads the shell template and inlines its local styles.css / js/*.js references."""
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
    parser.add_argument("--output", default=os.path.join(REPO, "index.html"))
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

    for placeholder in [*PLACEHOLDERS, "__MAPC_LOGO__"]:
        if placeholder not in html:
            raise ValueError(f"Template is missing placeholder {placeholder}")

    for placeholder, data_path in PLACEHOLDERS.items():
        with open(data_path, encoding="utf-8") as f:
            data = json.load(f)  # validates it's well-formed before inlining
        html = html.replace(placeholder, json.dumps(data, separators=(",", ":")))

    with open(LOGO, "rb") as f:
        html = html.replace("__MAPC_LOGO__", "data:image/png;base64," + base64.b64encode(f.read()).decode("ascii"))

    with open(args.output, "w", encoding="utf-8") as f:
        f.write(html)

    print(f"Built {args.output} ({os.path.getsize(args.output) / 1024:.1f} KB)")


if __name__ == "__main__":
    main()
