#!/usr/bin/env python3
"""
Rewrites an agency-agents subagent into the shape Claude Code expects.

Upstream uses a human-readable `name` ("AEO Foundations Architect"); Claude Code
matches subagents on a kebab-case identifier. This preserves the original as
`displayName`, derives `name` from the filename, and leaves the body untouched.
"""
import re
import sys
from pathlib import Path


def normalise(src: Path, dest: Path) -> None:
    text = src.read_text(encoding="utf-8")
    slug = src.stem

    match = re.match(r"^---\r?\n(.*?)\r?\n---\r?\n(.*)$", text, re.DOTALL)
    if not match:
        # No frontmatter upstream — give it the minimum Claude Code needs.
        dest.write_text(
            f"---\nname: {slug}\ndescription: Vendored from agency-agents.\n---\n\n{text}",
            encoding="utf-8",
        )
        return

    front, body = match.group(1), match.group(2)
    lines, display = [], None

    for line in front.split("\n"):
        key = re.match(r"^([A-Za-z0-9_-]+):\s*(.*)$", line)
        if key and key.group(1) == "name":
            display = key.group(2).strip().strip("\"'")
            continue
        lines.append(line)

    header = [f"name: {slug}"]
    if display and display.lower() != slug.replace("-", " "):
        header.append(f'displayName: "{display}"')
    header.append("source: msitarzewski/agency-agents (MIT)")

    dest.write_text(
        "---\n" + "\n".join(header + lines).rstrip() + "\n---\n\n" + body.lstrip(),
        encoding="utf-8",
    )


if __name__ == "__main__":
    if len(sys.argv) != 3:
        sys.exit("usage: normalise-agent.py <src.md> <dest.md>")
    normalise(Path(sys.argv[1]), Path(sys.argv[2]))
