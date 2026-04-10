# Emdash — UX Overview

## App Summary

Emdash is a desktop application for running multiple coding agents against Git-backed work. From the user’s perspective, they add **projects** (local folders, GitHub-created repos, cloned repos, or SSH **remote projects**), then create **tasks** inside a project. Each task opens an **agent workspace**: typically a terminal session with a chosen **agent** (CLI coding tool), optional **worktree** or **direct** checkout, and optional links to issues from integrations. A **right sidebar** shows file changes, terminals, and Git/PR actions; a **left sidebar** lists navigation, projects, and tasks. The user can open a full-screen **code editor**, a **Kanban** board of tasks, dedicated pages for **Skills**, **MCP** servers, and (when enabled) **Automations**, and a **Settings** overlay with agents, integrations, repository defaults, and interface options.

On first launch, a minimal **welcome** screen appears; after dismissing it, the main **workspace** is always a single main window with a custom title bar (traffic lights on macOS, window controls on Windows/Linux).

## Core Concepts

| Term | Meaning to the user |
|------|---------------------|
| **Project** | A Git repository the user opened or created; appears in the sidebar under projects. May be local or **remote** (SSH). |
| **Task** | A unit of work inside a project: named, tied to a branch/path, with one or more **conversations** (chats) or **multi-agent** variants (parallel agent workspaces). |
| **Agent** | A CLI coding assistant (e.g. Claude Code, Codex); selected per task or conversation. |
| **Conversation / chat** | A tabbed session within a single-agent task; each has its own terminal stream. |
| **Worktree** | Isolated Git worktree for the task (recommended). **Direct** means working on the current branch without a separate worktree. |
| **Remote workspace** | Optional mode: task environment provisioned by user-defined scripts (when configured and feature available). |
| **Skills** | User-managed skill snippets the app can list, install, create, and open. |
| **MCP** | Model Context Protocol servers configured in the app. |
| **Automations** | Scheduled or triggered runs (feature-flagged). |
| **Git changes / diff** | Views for reviewing diffs, history, commits, PR create/merge, checks, comments. |

## Application Structure

- **Single main window** (fixed initial size ~1400×900, minimum ~700×500; titled **Emdash**). No multi-window document model for normal use; second instance in production focuses the existing window.
- **Title bar** (top): draggable region; on Windows/Linux includes **File / Edit / View / Window / Help** menu strip; center shows **project/task context** when the pointer hovers the header; right side has **Open** (split button), **Editor** toggle, **Kanban** toggle (when a project is selected), **left sidebar** toggle, **right sidebar** toggle, **Settings**, and on non-macOS **window controls** (minimize / maximize / close).
- **Left sidebar** (resizable; hidden when **Editor** full-screen mode is on): **Home**, **Skills**, **MCP**, optionally **Automations**; collapsible **Projects** list with tasks; optional changelog card at bottom.
- **Main content** (center): depends on route/view — **Home** grid, **Project** hub (task list, branches, PRs), **task** view (single-agent chat/terminal or multi-agent split), **Settings** page, **Skills** / **MCP** / **Automations** pages, **Kanban**, or **Git changes** full-panel view (diff/history when Git page is open).
- **Right sidebar** (resizable, collapsible): **File changes** (Git/PR UI), **terminals** stack; content adapts to selected task; may show multi-agent variant sections.
- **Overlays**: **Command palette** (modal, dimmed backdrop), **Settings** (same window, main panel), **Editor** (full overlay with its own layout), **Modal dialogs** (new project, clone, remote project, task creation, MCP server, GitHub device flow, move changes, changelog, software update), **toasts** for transient messages.

## Navigation Model

- **Sidebar**: Click **Home**, **Skills**, **MCP**, **Automations** to switch top-level views (closes Settings if open). Click a project name to open the project hub; expand/collapse chevron on project rows. Click a task to open it.
- **URL hash routes** (user-visible as browser-style hash paths): `/`, `/home`, `/skills`, `/mcp`, `/automations`, `/projects/:id`, `/projects/:id/kanban`, `/projects/:id/tasks/:taskId`, `.../editor`, `.../diff` (optional query for settings tab, diff file).
- **Command palette** (keyboard): search commands, projects, tasks; execute navigation and toggles.
- **Keyboard shortcuts**: global shortcuts for palette, settings, sidebars, theme, Kanban, editor, task switching, new task/agent, agent tab numbers, open-in-external-app, Git page; see `99-global-behaviors.md`.
- **Title bar**: toggles for Editor, Kanban, sidebars, Settings; **Open** uses default external app or dropdown.
- **Native menus** (macOS menu bar / Windows/Linux app menu): Settings, Close Tab, standard Edit/View/Window, Help links and **Check for Updates…**.

## Persistent State

- **Application settings** (disk): repository defaults, notifications, default agent, disabled agents, review agent settings, task defaults (auto names, worktree, auto-approve, trust), projects default directory, keyboard bindings, interface (theme, sidebars, resource monitor, task hover action), terminal font/options, default/hidden “Open in” apps, changelog dismissed versions, provider CLI overrides, project prep (auto-install on open in editor).
- **Local database**: projects, tasks, conversations, and related app data (user sees this as “my projects and tasks reappear after restart”).
- **Browser localStorage** (examples): first-launch welcome flag, sidebar project order, per-project task order and sort mode, panel layout percentages, left sidebar open, right sidebar collapsed, update notification snooze, Kanban column status map, feature-related keys.
- **Window**: not described as restored across sessions in code reviewed; window opens with default dimensions then shows when ready.
- **Credentials / tokens**: stored for integrations and account (user configures in Settings / modals).

## Data Model (User-Facing)

- **Projects**: User adds/removes/reorders. Each has a name, path (local or remote), optional GitHub association, default branch selection for new work, task list.
- **Tasks**: User creates, renames, pins, archives, restores, deletes, reorders (per project). Each has name, branch, filesystem path, agent configuration, optional archive state, optional PR metadata, optional multi-agent variants, optional linked issues (Linear, GitHub, Jira, GitLab, Plain, Forgejo), optional initial prompt and flags (auto-approve, worktree vs direct, remote workspace).
- **Conversations**: Multiple per task in single-agent mode; main vs additional chats; titles editable; closable when more than one.
- **Skills**: Catalog entries, installed skills, user-created skills (name, description, content).
- **MCP servers**: Named configured servers, catalog discovery, add/edit/remove.
- **Automations**: Named rules with triggers and prompts (when feature enabled).
- **Integrations**: Connection state for GitHub, Linear, Jira, GitLab, Plain, Forgejo, Emdash account — surfaced in Settings and task modals.

Relationships: **Project** contains many **Tasks**. **Task** contains many **Conversations** (single-agent) or **Variants** (multi-agent). **Git/PR** state is always scoped to a task’s working tree path(s).
