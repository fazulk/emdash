# Feature: Settings, Account, Updates, and Changelog

## Opening Settings

- **⌘,** (default) or menu **Settings…** or title bar gear **Open settings** or command palette **Open Settings**.
- Settings opens as a **full main-panel overlay** (left sidebar remains). URL gains a `settingsTab` query when supported.
- Header: **Settings**, subtitle **Manage your account settings and set preferences.**, **Close settings** (X). **Escape** closes unless a nested dialog handled it.
- Left nav tabs: **General**, **Agents**, **Integrations**, **Repository**, **Interface**, **Account**, **Docs** (opens `https://docs.emdash.sh` in browser, external link icon).

## General tab

**Title:** General  
**Description:** Manage your account, privacy settings, notifications, and app updates.

| Control | Copy | Default |
|---------|------|---------|
| Privacy & Telemetry | **Privacy & Telemetry**; body **Product telemetry is currently unavailable in this build.** | Switch **Enable anonymous telemetry**; disabled when **Inactive in this build** |
| Auto-generate task names | **Auto-generate task names** — *Automatically suggests a task name when creating a new task.* | On |
| Auto-infer task names | **Auto-infer task names from conversation** — *Replaces the generated task name with one inferred from the conversation context.*; note **Requires “Auto-generate task names” to be enabled.** | On |
| Auto-approve by default | **Auto-approve by default** — *Skips permission prompts for file operations in new tasks.*; tooltip lists supported agents | Off |
| Create worktree by default | **Create worktree by default** — *New tasks start on the current branch when disabled.* | On |
| Auto-trust worktrees | **Auto-trust worktree directories** — *Skip the folder trust prompt in Claude Code for new tasks.*; tooltip *Only applies to Claude Code…* | On |
| Notifications | See notifications card in `99-global-behaviors.md` (full strings) | Master on; sound on; timing **Always**; profile **Default**; OS notifications on |
| Version / updates | **Version** badge **v{version}**; messages **Checking for updates...**, **Version X is available**, **Downloading update...**, **Update ready. Restart Emdash to use the new version.**, **Installing update. Emdash will close and restart automatically — this may take a few seconds.**, error badge **A new release is being prepared right now. Check again in a few minutes.**, idle **You're up to date.** + **View changelog ↗** | Buttons **Download**, **Restart**; refresh icon **Check for updates** |

**Development build:** **Auto-updates are enabled in production builds.** + **View changelog ↗**; check button disabled, aria **Check for updates (disabled in development)**.

## Agents tab

**Title:** Agents  
**Description:** Manage CLI agents and model configurations.

- **Default agent** — *The agent that will be selected by default when creating a new task.* — dropdown.
- **Review preset** card:
  - **Review preset** — *Adds a dedicated review action in task chats and the changes panel.* — switch (**Enable review preset**).
  - **Review agent** — *Used when you launch a review chat from the task UI.*
  - **Review prompt** textarea; **Reset**; note *This prompt is sent only for the review preset. Regular extra chat tabs stay unchanged.*
- **CLI agents** list: per-agent row with disable toggle (disabled agents excluded from default picker when not installed).

## Integrations tab

**Title:** Integrations  
**Description:** Connect external services and tools.

- **Integrations** section: rows for **GitHub**, **Linear**, **Jira**, **GitLab**, **Plain**, **Forgejo**, **Sentry** (and flows): connect/disconnect, modals for API keys or device flow (**GithubDeviceFlowModal**), errors inline per integration.
- **Workspace provider** card (when shown): marketing copy, **Bring your own infrastructure** docs link `https://docs.emdash.sh/bring-your-own-infrastructure`, **Request access** style flow with modal validation **Please describe your infrastructure setup.** and success/error toasts.

## Repository tab

**Title:** Repository  
**Description:** Configure repository and branch settings.

- Section **Branch name**: input placeholder **Branch prefix**, aria **Branch prefix**; example line **Example:** `{prefix}/my-feature-a3f`.
- **Auto-push to origin** — *Push the new branch to origin and set upstream after creation.* — default **on**.
- **Auto-close linked issues on PR creation** — long explanatory paragraph — default **on**.

## Interface tab

**Title:** Interface  
**Description:** Customize the appearance and behavior of the app.

- **Color mode** — *Choose how Emdash looks.* — options **Light**, **Dark Navy**, **Dark Gray**, **Dark Black**, **System** (default **System**).
- **Terminal** card: font picker (**Default (Menlo)** + list), font size, **Auto-copy on selection**, macOS **Option is Meta** (or similar labeling in UI).
- **Keyboard shortcuts** card: per-action row, **Not set**, **Record shortcut**, clear; capture errors **Please use either Cmd or Ctrl, not both.**, **Alt/Option can only be used by itself.**, **Please press a modifier key (Cmd/Ctrl/Alt/Shift) + key**; save toast **Shortcut conflict** / **Shortcut updated** / **Shortcut removed**; conflict description **Conflicts with "{label}". Choose a different shortcut.**
- **Workspace** subsection:
  - **Show resource monitor in titlebar** — *Display the CPU and memory monitor chip in the app header.* — default off.
  - **Auto-collapse right sidebar on home pages** — *Collapse sidebar on home/repo pages, expand on tasks* — default off.
  - **Task hover action** — *Primary action when hovering over tasks in the sidebar.* — **Delete** (default) or **Archive**.
- **Tools** subsection: list of **Open in** apps with **Detected** / **Not detected**; switch tooltips **Hide from menu** / **Show in menu**.

## Account tab

**Title:** Account  
**Description:** Manage your Emdash account.

- Account session UI (sign in/out, profile) as implemented in **AccountTab** component.

## Software Update modal (Help / menu)

- **Software Update** dialog; **Current version: v… · Changelog** (link).
- States mirror Update card: **Checking for updates...**, **Emdash is up to date.** buttons **OK**, **Check Again**; **Version X is available.** **Download**; downloading/progress text; **Update downloaded and ready to install.** **Later**, **Restart Now**; **Installing update. Emdash will close automatically when ready.**; error **Update check failed** or server message with **Close**, **Try Again**.

## Update availability toast

- **Update Available** — *Version {version} is ready. Open Settings to review and download when convenient.* — action **Open Settings** (snoozed per localStorage key **emdash:update:lastNotified** for 6 hours per version).

## Changelog modal

- Opened from sidebar notification card / changelog flow: shows release notes (exact copy from **ChangelogModal**).

## User flows

1. **Change theme:** Interface → click **Dark Navy** → immediate theme change; **⌘⇧T** cycles light → dark navy → dark black (per shortcut description).
2. **Rebind shortcut:** Interface → keyboard card → record → save or conflict toast.
3. **Connect GitHub:** Integrations → GitHub → follow modal/device flow → connected state.

## Edge cases

- Saving invalid keyboard binding shows inline error + destructive toast.
- Telemetry switch disabled when **Inactive in this build**.

## Interactions

- Settings can stay open over **Editor** overlay.
- **Check for Updates…** in Help opens **Software Update** modal.
