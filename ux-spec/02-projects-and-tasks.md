# Feature: Projects and Tasks

## What the user sees

### Left sidebar — Projects
- Section label (projects group).
- Each **project** row: expand/collapse folder icon, project name (with **remote** connection indicator when SSH), optional **Open on GitHub** button, **Sort tasks** control (hover), **+** to new task for that project.
- Expanded: **task** rows (status dot, name, change badges, PR chip, archive/unarchive/delete affordances per context — see Task list below).

**Sort popover** (project row hover, **Sort tasks**): heading **Sort by**; options **Creation Date**, **Last Active**, **Alphabetical** (checkmark on active).

### Project main view (project selected, no task selected)
- Project header area with **Create task** (and related controls — branch selection, filters, open PRs section, bulk select, delete project).
- **Task** rows as cards: status indicator, name, **Archived** pill when archived, agent icons/names, diff stats, PR button (**Draft** / **View PR** / **PR Merged** / etc.), row click opens task.
- Checkbox per row for multi-select mode; filter control with **ListFilter** icon.

### Task creation loading
- Full-panel loading overlay while a task is being created (including optimistic placeholder state).

### Workspace provisioning overlay (when available)
- Overlay while a remote **workspace** task is still provisioning.

## What the user can do

### Projects (sidebar)
| Action | Trigger | Result |
|--------|---------|--------|
| Reorder projects | Drag project rows | Order persisted. |
| Expand/collapse | Click folder icon | Tasks shown/hidden; new projects with first task auto-expand. |
| Select project | Click project name | Project hub opens (no task). |
| Open GitHub | Click GitHub icon (if URL known) | Browser opens repo URL. |
| Sort tasks | Open sort popover, pick criterion | Tasks reorder; order persisted per project. |
| New task for project | Click **+** on project row | Opens **New Task** modal for that project. |

### Tasks (sidebar `TaskItem`)
| Action | Trigger | Result |
|--------|---------|--------|
| Select task | Click row | Opens task view. |
| Primary hover button | Trash (default) or Archive per **Task hover action** setting | Delete flow or archive. |
| Context menu | Right-click | Items: **Pin** / **Unpin**, **New task from current branch**, **Rename**, **Archive** or **Delete** (depending on primary action setting). |
| Rename | Context **Rename** or inline edit | Name updated. |
| Pin | Context menu | Pinned tasks stay at top of lists. |

**Context menu strings:** **Unpin**, **Pin**, **New task from current branch**, **Rename**, **Archive**, **Delete**.

### Project main view
| Action | Trigger | Result |
|--------|---------|--------|
| Create task | **Create** / primary CTA | **New Task** modal. |
| Open task | Click row | Navigate to task. |
| Archive / restore / delete | Row buttons or bulk flows | Confirmation where applicable; task list updates. |

### Modals (summary — detail in dedicated specs)
- **New Task**: title **New Task**; description **Create a task and open the agent workspace.**; project name; **from** + branch selector or **Loading...** / branch name; fields **Task name (optional)** placeholder **refactor-api-routes**; **Agent**; **Workspace** buttons **Worktree**, **Direct**, **Remote** (if available); helper texts **Direct changes your current branch**, **Remote workspace provisioned via script**, **Recommended: isolated in a new worktree**; **Create** button (spinner when working).
- **New Project**: title **New Project**; repository name required; GitHub validation messages; progress **Creating repository on GitHub...**, **Repository created successfully! Adding to workspace...**; errors e.g. **Repository name is required**, **Unable to determine GitHub account. Please ensure you are authenticated.**, **Failed to create project**; optional note if repo created but setup failed (includes clone URL).
- **Clone from URL**: title **Clone from URL**; **Repository URL is required**, **Please enter a valid Git URL (https://, git@, or ssh://)**, **Directory name is required**; progress **Cloning repository...**, **Cloning to {path}...**, **Repository cloned successfully**.
- **Add Remote Project**: wizard steps **connection**, **auth**, **path**, **confirm** with SSH-specific fields, browse remote files, test connection, optional clone/create repo modes.

## User flows

1. **Add local project:** Home **Open project** → picker → project appears in sidebar → select to open hub.
2. **Create GitHub project:** **New Project** modal → fill repo name, owner, privacy → submit → project path returned and opened.
3. **Clone:** **Clone from URL** → URL + directory name → clone into `defaultDirectory` from settings (fallback text in UI uses **~/emdash-projects** if unset in clone flow).
4. **Remote:** **Add Remote Project** → complete wizard → remote project appears with connection indicator.
5. **New task:** **+** on project or **Create** on hub → **New Task** → **Create** → loading overlay → task opens.

## State transitions

| State | Cause | User-visible |
|-------|--------|--------------|
| Empty projects | No projects added | Sidebar projects area may show empty state component. |
| Project hub | Project selected, no task | Task list + project actions. |
| Task active | Task selected | Chat or multi-agent UI in main panel. |
| Optimistic task | Create in flight | Sidebar may hide task panel; loading overlay. |
| Archived task | User archived | **Archived** label; restore available. |

## Edge cases and error handling

- **Task name** validation: slug rules, max length; inline error on **New Task** form when invalid.
- **Delete task** with risks: scans and dialogs (see Git/PR feature for delete-risk copy).
- **Database schema mismatch** on app start: native dialog **Local Data Reset Required** / **Reset Local Data and Relaunch** / **Quit** (see global behaviors).

## Interactions with other features

- Tasks drive the main **agent workspace**, **right sidebar** Git panel, **Editor**, **Git changes** view, **Kanban** membership.
- **Keyboard:** **New Task** (default **⌘T** on Mac, **Ctrl** equivalent on Windows/Linux for “command” shortcuts), next/previous task, **⌘1–9** to select conversation tabs when multiple chats.
