# Feature: Kanban, Command Palette, and Cross-Navigation

## Kanban

### What the user sees
- Three columns titled **To‑do**, **In‑progress**, **Ready for review** (note Unicode hyphen in **To‑do**).
- Cards for each task; **New task** action in column header area when provided.
- Drag handles on cards (draggable).

### What the user can do
| Action | Trigger | Result |
|--------|---------|--------|
| Open Kanban | Title bar toggle (shows **Toggle Kanban view** / **Home** when open), shortcut **⌘P** (default) | Main content shows board; closes editor/Kanban mutual exclusion handled by toggles. |
| Move card | Drag card to another column | Task **status** stored in local kanban map for layout. |
| Open task | Click card | Opens task; Kanban closes. |
| Create task | **New task** on board | Opens task creation modal. |

### Automatic column moves (no user action)
- Task becomes **In‑progress** when activity/PTY indicates busy.
- After **10 seconds** idle following in-progress, may move to **Ready for review**.
- PTY exit while idle may move from **In‑progress** to **Ready for review**.
- Periodic checks (~10s / ~30s): local git changes or open PR can promote toward **Ready for review** when not busy.

### State / edge cases
- Empty columns show column chrome with zero counts.
- Board scoped to current **project**.

## Command palette

### What the user sees
- Modal dialog labeled **Command palette**; scrim **Search commands, projects, tasks...**; empty state **No results found.**
- Groups: **Navigation**, **Toggles**, **Projects**, **Tasks**.
- Footer hints: **Select** (enter icon), **Close** **ESC**, **Navigate** ↑↓.

### Commands (labels)
- **Go Home** — *Return to home screen*
- **Open Project** — *Open a new project folder*
- **Open Settings** — uses settings shortcut hint when set
- **Keyboard Shortcuts** — *Customize app shortcuts*
- **Toggle Left Sidebar** / **Toggle Right Sidebar** / **Toggle Theme**
- Each **project** by name (description: path)
- Each **task** by name (description: `{project} • {branch}`)

### What the user can do
| Action | Trigger | Result |
|--------|---------|--------|
| Open/close palette | **⌘K** (default), or type while palette focused | Toggles; Escape closes. |
| Filter | Type in search | List filters. |
| Run command | Enter on selection | Palette closes; action runs after short delay. |
| Click outside | Click backdrop | Closes. |

### Edge cases
- When palette open, other global shortcuts first close palette then run (100ms delay) except palette toggle.
- Shortcuts hidden if user cleared binding (**Not set** in settings).

## Title bar context (hover)

- Center of title bar fades in on hover: dropdowns to switch **project** and **task** quickly.

## Interactions

- Kanban and Editor toggles close **Settings** or **Command palette** when needed (title bar handlers).
- **Next/Previous task** shortcuts switch tasks globally (defaults: Mac **⌘[** / **⌘]**; Windows/Linux **Ctrl+Tab** / **Ctrl+Shift+Tab**).
