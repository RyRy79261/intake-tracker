---
phase: quick
plan: 1
type: execute
wave: 1
depends_on: []
files_modified: []
autonomous: false
requirements: [QUICK-PENCIL-SETUP]

must_haves:
  truths:
    - "Pencil.dev AppImage runs via WSLg and displays the design canvas"
    - "Pencil MCP server connects to the running AppImage instance"
    - "Claude Code can call Pencil MCP tools successfully"
  artifacts: []
  key_links:
    - from: "Pencil AppImage (WSLg)"
      to: "MCP server binary"
      via: "-app flag pointing to correct target"
      pattern: "mcp-server-linux-x64 -app"
---

<objective>
Download and run Pencil.dev Linux AppImage via WSLg, verify MCP server connectivity, and confirm Claude Code can use Pencil tools.

Purpose: Enable visual design-to-code workflow in this project using Pencil.dev's MCP integration with Claude Code.
Output: Running Pencil.dev instance accessible via MCP from Claude Code CLI.
</objective>

<execution_context>
@./.claude/get-shit-done/workflows/execute-plan.md
@./.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
Current state:
- WSLg is available (mount at /mnt/wslg/ exists) but $DISPLAY is not set in this shell
- MCP binary exists: ~/.cursor-server/extensions/highagency.pencildev-0.6.30-universal/out/mcp-server-linux-x64
- MCP server already registered in Claude Code project settings for intake-tracker with `-app cursor`
- The MCP server needs a running Pencil app instance to connect to (the `-app` flag tells it which app to talk to)
- Extension version is 0.6.30 (memory says 0.6.28 -- outdated)
- Pencil docs confirm AppImage is a supported Linux distribution format
- Known limitation: "Some Wayland/Hyprland UI issues may occur" -- X11 more stable
</context>

<tasks>

<task type="auto">
  <name>Task 1: Download Pencil.dev AppImage and launch via WSLg</name>
  <files>none (external tool setup)</files>
  <action>
1. Set up WSLg display environment:
   - Export DISPLAY=:0 (WSLg default X11 socket)
   - Verify X11 forwarding works: `xdpyinfo | head -5` or similar quick test

2. Download Pencil.dev Linux AppImage:
   - Check https://pencil.dev for download links, or check GitHub releases at https://github.com/nicepkg/pencil (the publisher is "highagency" per the VS Code extension)
   - If direct URL not found, check the Cursor extension's package.json for download URLs or use the extension's own update mechanism
   - Alternative: search for AppImage at common distribution points (GitHub releases, pencil.dev/download)
   - Save to ~/Applications/pencil.AppImage (create dir if needed)

3. Make AppImage executable and launch:
   - `chmod +x ~/Applications/pencil.AppImage`
   - `~/Applications/pencil.AppImage &` (background, WSLg will handle display)
   - If AppImage fails with FUSE error: extract with `--appimage-extract` and run from squashfs-root
   - If WSLg X11 fails: try `export DISPLAY=$(cat /etc/resolv.conf | grep nameserver | awk '{print $2}'):0` for X server on Windows side

4. Verify the app window appears and the design canvas loads.
  </action>
  <verify>
    <automated>pgrep -f pencil && echo "Pencil process running" || echo "FAIL: No pencil process"</automated>
  </verify>
  <done>Pencil.dev AppImage is running and showing the design canvas window via WSLg</done>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <what-built>Pencil.dev AppImage running via WSLg with MCP server binary available</what-built>
  <how-to-verify>
1. Confirm you can see the Pencil.dev design canvas window on your screen
2. Check that the MCP server connects -- Claude will test this by updating the MCP config's `-app` flag if needed (may need to change from `cursor` to the correct app identifier for the standalone AppImage)
3. In this Claude Code session, check if Pencil MCP tools appear in the tool list (they should auto-register since the MCP server is already configured in project settings)
4. If tools appear, try calling one (e.g., list available design tools or take a screenshot of the canvas)

Note: The MCP server config currently uses `-app cursor`. For standalone AppImage, this may need to change. If the MCP server cannot connect, we will update the config in ~/.claude.json to point to the correct app target.
  </how-to-verify>
  <resume-signal>Type "approved" if Pencil canvas is visible and MCP tools work, or describe what went wrong</resume-signal>
</task>

</tasks>

<verification>
- Pencil.dev process is running (`pgrep -f pencil`)
- MCP server can communicate with the running instance
- Claude Code shows Pencil tools in available MCP tools
</verification>

<success_criteria>
Pencil.dev design canvas is visible via WSLg, MCP server is connected, and Claude Code can invoke at least one Pencil MCP tool successfully.
</success_criteria>

<output>
After completion, update MEMORY.md to reflect:
- Correct Pencil.dev extension version (0.6.30, not 0.6.28)
- AppImage location and launch command
- Any WSLg environment variables needed (DISPLAY etc.)
- MCP `-app` flag value that works for standalone AppImage
</output>
