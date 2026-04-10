# Feature: Git Changes, PRs, Diff/History, and Code Editor

## What the user sees

### Right sidebar — File changes (`FileChangesPanel`)
- Tabs **changes** and **checks** (when applicable).
- Summary of staged/unstaged counts, branch info, PR section with actions **Create PR** / **Draft PR** (split dropdown to switch mode), merge controls when PR exists, check runs, PR comments, review badges.
- Toast after commit: **Changes committed with message:** plus monospace message block.
- Links to open PR in browser.

### Full-panel Git view (route `.../diff`)
- Replaces main content (not the sidebar). Header tabs **Changes (N)** and **History**; **Close diff viewer** (X).
- **Changes** tab: file list + diff viewer, resizable left panel; optional PR-diff mode when task has PR number (compares against PR base).
- **History** tab: commit list and file/history exploration.

### Code Editor (overlay)
- Full-window editor over workspace; **left sidebar hidden**.
- Header: folder icon + **{taskName}**; **● Unsaved changes** when dirty; **Save All (⌘⇧S)**; toggle right sidebar; **Back to Home** / close returns to main workspace.
- File tree, tabs for open files, Monaco editing, markdown preview where supported.
- Can show **Settings** overlay on top of editor (same Settings page component).

## What the user can do

| Action | Trigger | Result |
|--------|---------|--------|
| Open Git page | **⌘G** (default), title bar path context, or **Open changes** from sidebar | Navigates to full-panel Git view for active task. |
| Close Git view | **X**, Escape (via global close stack), or navigate back | Returns to task or project view. |
| Stage/unstage/discard | Sidebar or full-panel Git UI | Working tree updates; refresh events fire. |
| Commit | Git UI | Commit created; toast with message. |
| Create / draft PR | **Create PR** / **Draft PR** | PR flow executes; UI updates. |
| Open file diff | Click file in list | Diff opens for that file. |
| Open editor | Title bar **Open Editor** (toggles **Home** when open) or shortcut **⌘E** | Editor overlay opens for active task. |
| Save files | **Save All** or **⌘⇧S** | Saves dirty editors. |
| Move changes (modal) | From flows that open **moveChangesToTaskModal** | User picks target task to move work. |

**Open in external app** (from title bar): primary button **Open**; tooltip **Open in {app} ⌘O**; chevron **Open in options** lists installed apps (labels e.g. **Finder**, **Explorer**, **Files**, **Cursor**, **VS Code**, … per OS). Failure toast **Open in {label} failed** with **Application not available.** or error message. Choosing an app can set **default** for future primary clicks.

## User flows

1. **Iterate in terminal → review diff:** User works in agent terminal → opens **Changes** in sidebar or **⌘G** for full screen → reviews files → commits → **Create PR**.
2. **PR review:** If task linked to PR, diff data may load PR base comparison; merge when ready.
3. **Edit in app:** **Open Editor** → edit → **Save All** → close editor back to chat.

## State transitions

| State | Appearance |
|-------|--------------|
| Clean tree | Zero-change indicators. |
| Dirty | Badges with +/- counts; unsaved in editor. |
| Git operation locked | UI disabled while **operation** active (busy context). |
| PR open | PR buttons, checks tab populated. |
| Error | Toasts or inline alerts with error text from git/gh commands. |

## Edge cases and error handling

- Delete task/project flows may show **Delete risk** UI listing files when risky (see alerts in project views).
- Long commit messages still show in toast inside scrollable code block.
- **Open in** when no app available: button disabled or toast on failure.

## Interactions with other features

- **Task scope** links PR number, paths for multi-agent variants.
- **Automations** and **hooks** may refresh PR status on timers elsewhere.
- **Repository settings**: branch prefix example **{prefix}/my-feature-a3f**, auto-push, auto-close linked issues — affect PR creation text/behavior.
