# Feature: Onboarding and Home

## What the user sees

### First launch (Welcome)
- Full-screen overlay with centered **Emdash** icon, heading **Welcome.**, and primary button **Start shipping**.
- Tagline under logo on Home (later): **Agentic Development Environment** (Home view only).

### Home view
- Centered logo (theme-aware) and **Agentic Development Environment**.
- Four equal cards in a responsive grid:
  - **Open project** (folder icon)
  - **Create New Project** (plus icon)
  - **Clone from GitHub** (GitHub icon)
  - **Add Remote Project** (server icon)

**Default / empty:** Shown when user navigates to Home with no project focus, or from command palette **Go Home**.

## What the user can do

| Action | Trigger | Result |
|--------|---------|--------|
| Dismiss welcome | Click **Start shipping** | Welcome never shown again (persisted); main workspace appears. |
| Open project | Click **Open project** | Native folder picker; selected folder added as project and opened. |
| Create new project | Click **Create New Project** | Modal **New Project** (GitHub repo creation flow). |
| Clone | Click **Clone from GitHub** | Modal **Clone from URL**. |
| Remote project | Click **Add Remote Project** | Multi-step modal wizard (connection → auth → path → confirm). |
| Go Home | Sidebar **Home**, or command palette **Go Home** | Navigates to Home; closes Settings if it was open. |

**Keyboard / menu:** No dedicated Home shortcut beyond command palette and sidebar.

## User flows

1. **First run:** App opens → Welcome → **Start shipping** → workspace (typically Home or last route).
2. **Return Home:** **Home** in left sidebar or palette → Home cards visible; project list remains in sidebar.

## State transitions

| State | Appearance |
|-------|------------|
| Welcome visible | Only welcome UI; no sidebar project interaction until dismissed. |
| Home | Home grid; left sidebar still shows projects if any. |
| Loading project open | Handled in project management (spinners/toasts elsewhere). |

## Edge cases and error handling

- **Open project** failures: surfaced via toasts or dialogs from project flow (path in use, not a git repo, etc. — see Projects feature).
- **New Project / Clone / Remote** validation errors appear inside those modals (exact strings in their feature specs).

## Interactions with other features

- Home entry points open **ModalProvider** modals or native dialogs.
- **Go Home** from palette closes **Settings** overlay when navigating.
