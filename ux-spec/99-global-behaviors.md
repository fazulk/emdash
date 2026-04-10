# Global Behaviors

Conventions: **⌘** means Command on macOS and maps to **Ctrl** on Windows/Linux for shortcuts labeled “command-style” in the app (see behavior in keyboard hook). **⌘⇧** is Command+Shift (or Ctrl+Shift on non-Mac for those bindings). Where the native menu shows **CmdOrCtrl**, that is **⌘** on macOS and **Ctrl** on Windows/Linux.

---

## Keyboard shortcuts

Configurable shortcuts appear in **Settings → Interface → Keyboard shortcuts**; each can be **Not set** (cleared). Defaults below.

| User-facing action | Default (macOS) | Default (Windows/Linux) | Notes |
|--------------------|-----------------|-------------------------|--------|
| Command Palette | ⌘K | Ctrl+K | Works even while typing in inputs. Toggles palette. |
| Settings | ⌘, | Ctrl+, | Opens/closes Settings overlay. |
| Toggle left sidebar | Ctrl+M | Ctrl+M | Hidden when **Editor** covers sidebar. |
| Toggle right sidebar | ⌘B | Ctrl+B | |
| Toggle theme | ⌘⇧T | Ctrl+Shift+T | Shortcut description: *Cycle through light, dark navy, and dark black themes*. Settings also exposes **Dark Gray** and **System** without this shortcut. |
| Toggle Kanban | ⌘P | Ctrl+P | No-op if no project selected. |
| Toggle Editor | ⌘E | Ctrl+E | |
| Close modal / overlay | Esc | Esc | Closes **first open** of: Command palette, Settings, Git changes full view, Editor, Kanban — in that order. If a nested `role="dialog"` exists, Esc may be left to that dialog. |
| Next task | ⌘] | Ctrl+Tab | Allowed while typing in inputs. |
| Previous task | ⌘[ | Ctrl+Shift+Tab | Allowed while typing in inputs. |
| New task | ⌘T | Ctrl+T | Not fired when focus is in a normal text field (except palette). |
| New agent / new chat | ⌘N | Ctrl+N | Single-agent tasks only; opens **Add Agent to Task**. |
| Next agent (conversation) | ⌘⇧] | Ctrl+Shift+] | Allowed in inputs. |
| Previous agent (conversation) | ⌘⇧[ | Ctrl+Shift+[ | Allowed in inputs. |
| Select conversation tab 1–9 | ⌘1 … ⌘9 | Ctrl+1 … Ctrl+9 | Allowed in inputs. Closes command palette first if open. |
| Open in external app | ⌘O | Ctrl+O | Fires **Open** primary app for current path (title bar). |
| Open Git page | ⌘G | Ctrl+G | Opens full-panel Git changes for active task; clears Editor/Kanban. |

**Editor:** **Save All** tooltip documents **⌘⇧S** (Ctrl+Shift+S on Windows/Linux).

**Menu accelerators (not all duplicated in app keyboard settings):** **Close Tab** **CmdOrCtrl+W** closes the **active chat tab** when a task chat is active (same as × on tab). **Undo** **CmdOrCtrl+Z**, **Redo** **CmdOrCtrl+Y** (macOS redo also **Shift+CmdOrCtrl+Z** via system menu).

---

## Menu bar

### macOS — application menu (**Emdash**)

| Item | Action |
|------|--------|
| About Emdash | Native about panel. |
| Settings… | **⌘,** — opens Settings. |
| Check for Updates… | Opens **Software Update** modal. |
| Services | Standard macOS submenu. |
| Hide / Hide Others / Unhide | Standard. |
| Quit Emdash | **⌘Q** — quit app. |

### macOS — File

| Item | Action |
|------|--------|
| Close Tab | **⌘W** — close active chat tab (when applicable). |

### Windows / Linux — File

| Item | Action |
|------|--------|
| Settings… | **Ctrl+,** |
| Close Tab | **Ctrl+W** |
| Quit | Exit application. |

### Edit (all platforms)

| Item | Action |
|------|--------|
| Undo | Sends undo to focused editor context when wired. |
| Redo | Sends redo to focused editor context when wired. |
| Cut / Copy / Paste / Delete / Select All | Standard; macOS adds **Paste and Match Style**. |

### View (all platforms)

| Item | Action |
|------|--------|
| Reload | Reload window. |
| Force Reload | Hard reload. |
| Toggle Developer Tools | Opens devtools. |
| Actual Size / Zoom In / Zoom Out | Standard zoom. |
| Toggle Full Screen | Full screen. |

### Window

| Item | Action |
|------|--------|
| macOS | Standard **Window** menu (minimize, etc.). |
| Windows/Linux title-bar menu | Minimize, Zoom, Close. |

### Help

| Item | Action |
|------|--------|
| Docs | Opens `https://docs.emdash.sh` in default browser. |
| Changelog | Opens releases URL (`EMDASH_RELEASES_URL` in product). |
| Check for Updates… | **Windows/Linux only** (macOS has it under app menu) — **Software Update** modal. |

---

## Drag and drop

| Source | Target | Result |
|--------|--------|--------|
| Project row | Reorder within list | New project order persisted. |
| Task row | Reorder within project | Manual task order persisted for that project. |
| Kanban card | Another column | Task column status updated (Kanban store). |
| Chat tab | Another tab position | Drag/drop UI only; **reorder not implemented** (drop no-ops). |
| Files from OS | Terminal pane | **Local:** quoted paths inserted into terminal input. **SSH:** files uploaded then remote quoted paths inserted. |

---

## System integration

- **Single instance (production):** Launching again while the app runs focuses the existing window; extra instance exits.
- **File associations / protocol URLs:** No user-facing custom protocol or “open file type” behavior documented in app menus.
- **OS notifications:** When enabled, banners for agent attention/finish while app unfocused (per notification settings). **Clicking** a notification focuses the related **task** (switches project if needed, closes Settings/Kanban/Editor overlays).
- **External links:** `https://` / `http://` opened in default browser when app routes links externally.
- **Open in:** Launches Finder/Explorer/Files or editors/terminals per platform (labels like **Finder**, **VS Code**, **Cursor**, etc.).

---

## Multi-window behavior

- **One main browser window** for the UI. No secondary document windows in normal use.
- macOS: closing window does not quit app; **activate** with no windows creates a new main window.

---

## File handling

- **Open project:** Native directory picker — user chooses a folder; app adds it as a project.
- **New project:** Creates GitHub repo and local clone path via API.
- **Clone from URL:** Clones into `{defaultDirectory}/{directoryName}` (default directory from settings; clone modal mentions **~/emdash-projects** as fallback copy when settings missing).
- **Remote project:** SSH path selection and optional clone/create on server — no single “save file” dialog.
- **Editor:** Open/save files inside workspace via editor UI; **Save All** when multiple dirty buffers.
- **Skills:** Create writes under user skill path shown in dialog (**~/.agentskills/**).
- **Export:** No dedicated global “export workspace” action identified; PR/changes flows use Git/GitHub.

---

## Startup and shutdown

### Startup
1. Window created **hidden**; shown on **ready-to-show**.
2. Default dimensions **1400×900**; minimum **700×500**; title **Emdash**.
3. **Welcome** screen if first-launch flag set; otherwise workspace.
4. If local database schema incompatible: dialog **Local Data Reset Required** — explains **Required schema entries are missing:** bullet list, **Database path:** …, instructions to **Reset Local Data and Relaunch** or **Quit**; reset only removes **local app data (projects, tasks, conversations)** — **Repository files are not deleted.** Failure to reset: **Database Reset Failed** error box.
5. Other DB init failure: **Database Initialization Failed** with bullets **Running from Downloads or DMG (move to Applications)**, **Homebrew installation issues (try direct download)**, **Incomplete installation** and numbered **Please try:** steps.
6. Second instance focuses existing window.

### Shutdown
- **Quit** triggers best-effort **terminal session persistence** before exit; then telemetry shutdown, disconnect **SSH** sessions, cleanup **reserve worktrees**, stop updater/agent server/lifecycle scripts.
- **Undo/Redo** does not block quit.

---

## Background processes (automatic)

- **Update check** on workspace mount; optional toast **Update Available** (snoozed per version).
- **Auto-refresh PR status** for active task path on a timer hook.
- **Automation triggers** from main process when feature enabled (scheduled/manual).
- **Agent event** HTTP service receives callbacks from CLI agents (enables notifications/status).
- **Kanban:** timers promote columns when idle / detect git changes / PR presence (see Kanban spec).
- **Provider status cache** warmed at startup.
- **Workspace provider reconciliation** on startup (remote workspaces).
- **Sounds** for agent events when notifications+sounds enabled (respect **Sound timing**).

---

## Settings / preferences (persistence summary)

Stored in app **settings.json** (user data directory). Defaults in parentheses.

| Key area | Options | Default effect |
|----------|---------|----------------|
| `repository.branchPrefix` | string, max 50 chars | **emdash**; example branch prefix for new branches. |
| `repository.pushOnCreate` | boolean | **true** — auto-push new branch. |
| `repository.autoCloseLinkedIssuesOnPrCreate` | boolean | **true** — add closing keywords to new PRs. |
| `projectPrep.autoInstallOnOpenInEditor` | boolean | **true** |
| `notifications.enabled` | boolean | **true** |
| `notifications.sound` | boolean | **true** |
| `notifications.osNotifications` | boolean | **true** |
| `notifications.soundFocusMode` | **always** / **unfocused** | **always** |
| `notifications.soundProfile` | **default** / **gilfoyle** | **default** |
| `defaultProvider` | agent id | **claude** |
| `disabledProviders` | list | **[]** |
| `review.enabled` | boolean | **false** |
| `review.agent` | agent id | product default review agent |
| `review.prompt` | string | product default prompt text |
| `tasks.autoGenerateName` | boolean | **true** |
| `tasks.autoInferTaskNames` | boolean | **true** |
| `tasks.autoApproveByDefault` | boolean | **false** |
| `tasks.createWorktreeByDefault` | boolean | **true** |
| `tasks.autoTrustWorktrees` | boolean | **true** |
| `projects.defaultDirectory` | path | **`~/emdash-projects`** resolved to home |
| `keyboard.*` | per-action binding or null | see shortcut table |
| `interface.autoRightSidebarBehavior` | boolean | **false** |
| `interface.showResourceMonitor` | boolean | **false** |
| `interface.theme` | **light** / **dark** / **dark-black** / **dark-gray** / **system** | **system** |
| `interface.taskHoverAction` | **delete** / **archive** | **delete** |
| `terminal.fontFamily` | string | **""** (Menlo default) |
| `terminal.fontSize` | number 8–24 or 0 | **0** = default sizing |
| `terminal.autoCopyOnSelection` | boolean | **false** |
| `terminal.macOptionIsMeta` | boolean | **false** |
| `defaultOpenInApp` | app id | **terminal** |
| `hiddenOpenInApps` | list | **[]** |
| `changelog.dismissedVersions` | list | **[]** |
| `providerConfigs` | map | **{}** |

**LocalStorage (examples):** first launch, sidebar order, panel sizes, sidebar open/collapsed, Kanban statuses, update snooze, etc.

---

## Error recovery

- **Corrupt / incompatible DB:** Blocking dialog with reset path (see Startup).
- **Keyboard conflict on save:** Error **Keyboard shortcut conflict: "{name}" duplicates "{other}".** (settings save).
- **Open in failures:** Toast **Open in {label} failed** with reason.
- **MCP / Skills / network:** Destructive toasts with short titles (see MCP/Skills specs).
- **Update errors:** **Update check failed** or **A new release is being prepared right now. Check again in a few minutes.** (settings card badge).
- **Telemetry card:** **Product telemetry is currently unavailable in this build.** — switch may be inactive.

---

## Notification settings (exact strings)

| Control | Label / description |
|---------|---------------------|
| Master | **Notifications** — *Get notified when agents need your attention.* Tooltip on info: **Supported by Claude Code, Codex, Droid, and OpenCode.** |
| Sound | **Sound** — *Play audio cues for agent events.* |
| Sound timing | **Sound timing** — *When to play sounds.* Values **Always**, **Only when unfocused** |
| Sound profile | **Sound profile** — *Switch between the classic Emdash chime and the Gilfoyle bitcoin alert.* Values **Default**, **Gilfoyle Bitcoin Alert** |
| OS | **OS notifications** — *Show system banners when agents need attention or finish (while Emdash is unfocused).* |

When master notifications off, sub-rows appear **dimmed** and non-interactive.
