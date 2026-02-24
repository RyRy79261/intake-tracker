---
name: local-agent-mode
description: Enforce pnpm usage and bypass Privy authentication for local agent testing. Use when starting the dev server or interacting with the terminal to test the application locally.
---

# Local Agent Mode and Package Management

## Package Manager
- **ALWAYS** use `pnpm` instead of `npm` for installing dependencies, running scripts, and managing the project.
- Do NOT use `npm install`, `npm run`, or `npm update`. Use `pnpm install`, `pnpm run`, etc.

## Local Agent Bypass
When running the development server to test the application or preview it using an agent browser, use the local agent mode to bypass Privy authentication. This allows you to view the app without needing to log in.

Run the development server with the bypass environment variable set:
```bash
NEXT_PUBLIC_LOCAL_AGENT_MODE=true pnpm run dev
```

Do NOT start the server without this environment variable if you plan to use an automated browser or take snapshots, as you will be stuck on the login screen.
