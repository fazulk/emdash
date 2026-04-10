# Feature: Agent Workspace (Chat, Terminal, Multi-Agent)

## What the user sees

### Single-agent task view
- **Install banner** when agent CLI missing or failed to start: messages like **{agent label} isn’t installed.** or **{agent label} couldn’t start.**; **Run this in the terminal to use it:** with command, **Copy command** / **Run in terminal**; or **Install the CLI to use it.**; on PTY disabled, extra note **Embedded terminals are disabled/unavailable. Unset `EMDASH_DISABLE_PTY` (or set it to `0`) and ensure the PTY native module is installed.**
- **Context badges** (task metadata: branch, worktree, linked issues, etc.).
- **Conversation tabs** (when multiple): agent icon, truncated title, status dot when not active; **Close chat** (×) on each tab when more than one tab; double-click title to rename (inline input); Enter to confirm, Escape to cancel; blur confirms rename.
- **Terminal** region: live CLI agent session (xterm); footer may show branch/worktree summary.
- **Create chat / add agent**: UI to add another conversation — opens modal **Add Agent to Task** (agent picker, optional review section, create action).

### Multi-agent task view
- Horizontal **tabs** for each agent **variant** (labels like agent name, or **{name} #{n}** when duplicated).
- Shared **prompt** input area (with send affordance).
- **Open** menu in header (same family as title bar **Open**).
- Per-variant **terminal** panes; **Spinner** while variants initialize.

### Terminal behavior (user-visible)
- Click/mousedown on terminal area focuses the session.
- **Find in terminal** overlay when the user invokes in-terminal search.
- **Drag files** from the OS onto the terminal: local paths are quoted and inserted into the terminal input line; over SSH, files may be uploaded then remote paths inserted.

## What the user can do

| Action | Trigger | Result |
|--------|---------|--------|
| Switch conversation | Click tab, or **⌘⇧]** / **⌘⇧[** (defaults) cycle | Active terminal/chat switches. |
| Jump to tab N | **⌘1** … **⌘9** (Mac; Windows/Linux uses Ctrl as “command” for these) | Selects Nth conversation tab (closes command palette first if open). |
| New chat / agent | **⌘N** (default) or UI | Opens **Add Agent to Task** modal (single-agent tasks only; no-op on multi-agent). |
| Close active chat tab | **⌘W** menu **Close Tab** | Closes active conversation tab. |
| Rename chat | Double-click tab title | Inline edit. |
| Open external docs | Click agent name link in install banner | Browser opens provider docs when URL exists. |
| Copy/run install command | Banner buttons | Clipboard or terminal injection. |
| Send prompt / interact | Type in terminal | Normal shell/agent interaction. |
| Theme | Follows app theme | Terminal colors follow light/dark. |

**Modal: Add Agent to Task** — pick installed agent; optional review flow when settings allow; submit creates new conversation.

## User flows

1. **Start task:** After **Create**, user lands on main conversation; terminal starts agent (or banner if missing).
2. **Add second agent:** **⌘N** → modal → new tab appears.
3. **Multi-agent task:** User sees pre-created variant tabs; switches tabs to view each agent’s terminal.
4. **Drop files into terminal:** Drag from desktop → paths appear at prompt (or SCP then remote paths on SSH).

## State transitions

| State | Appearance |
|-------|--------------|
| Agent status unknown | Banner may show until detection completes. |
| Missing CLI | **isn’t installed** banner. |
| Start failed | **couldn’t start** + **Error:** details. |
| Busy / idle | Tab status dots mirror activity classification. |
| Workspace waiting for connection | Terminals may wait for remote connection before starting. |

## Edge cases and error handling

- **Undo/Redo** from Edit menu routes to editor-focused undo when the code editor has focus; otherwise behavior follows the app’s menu undo/redo wiring (see global behaviors).
- **Escape** in command palette vs terminal: palette captures Escape first when open.
- Empty or whitespace rename reverts.

## Interactions with other features

- **Right sidebar**: file changes and terminals for same task scope.
- **Settings**: default agent, disabled agents, auto-approve, review presets affect this view.
- **Notifications**: agent events can play sounds and OS notifications per settings.
