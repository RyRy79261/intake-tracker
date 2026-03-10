# Quick Task 1: Pencil.dev AppImage Setup — Summary

**Completed:** 2026-03-10
**Commit:** 911f838

## What Was Done

1. **Downloaded Pencil.dev Linux AppImage** (238MB) from `https://pencil.dev/download/Pencil-linux-x86_64.AppImage`
2. **Extracted AppImage** with `--appimage-extract` (FUSE unavailable in WSL) to `~/Applications/squashfs-root/`
3. **Launched via WSLg** with `DISPLAY=:0 ~/Applications/squashfs-root/pencil --no-sandbox`
4. **User authenticated** in Pencil.dev and connected their account
5. **Updated MCP config** from `-app cursor` to `--app desktop` pointing to AppImage's bundled MCP binary
6. **Pencil added to PATH** by user

## MCP Configuration

- **Binary:** `/home/ryan/Applications/squashfs-root/resources/app.asar.unpacked/out/mcp-server-linux-x64`
- **Args:** `--app desktop`
- **Scope:** local (project-level in `~/.claude.json`)
- **Status:** Config updated; requires Claude Code session restart to pick up new MCP server process

## Launch Command

```bash
DISPLAY=:0 ~/Applications/squashfs-root/pencil --no-sandbox &
```

## Remaining

- Restart Claude Code session to verify MCP tools connect with `--app desktop`
- Old Cursor extension binary still exists but is no longer referenced in MCP config
