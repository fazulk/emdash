# Feature: Skills, MCP, and Automations

## Skills page

**Entry:** Left sidebar **Skills** (closes Settings when navigating).

### What the user sees
- Toolbar: search field placeholder **Search and discover skills...**, **Refresh** (icon), **New Skill** (outline).
- When not searching: **Recommended** section + copy **Search to discover community skills.**
- When searching: **Catalog** header; subsection **From skills.sh** (link to `https://skills.sh`); spinner while searching; if no results **No additional results on skills.sh**.
- Global empty: **No skills match your search.** or **No skills available.**
- **New Skill** dialog: **New Skill**; description **Create a new skill module in ~/.agentskills/**; **Name** field placeholder **my-skill**; hint **Lowercase letters, numbers, and hyphens**; submit **Create** / **Creating...**

### What the user can do
| Action | Result |
|--------|--------|
| Search | Filters catalog / search results. |
| Refresh | Reloads skill data. |
| Open skill | Detail modal from cards. |
| Install / uninstall | Per card actions. |
| Create skill | Validates name **Name must be lowercase letters, numbers, and hyphens (2-64 chars).**, **Description is required.**; errors **Failed to create skill** or API error message. |

### State
- Loading spinners on refresh/create.
- **isSearchActive** toggles section headers.

## MCP page

**Entry:** Sidebar **MCP**.

### What the user sees
- **MCP** heading; subtitle **Connect your agents with external data sources and tools**
- Search placeholder **Search servers...**; **Refresh providers**; **Custom MCP** button.
- Sections **Added** and **Recommended** (catalog).
- Empty search: **No servers available.**; with search: **No servers match your search.**

### What the user can do
| Action | Result |
|--------|--------|
| Add from catalog | Opens add modal for that entry. |
| Edit installed | Opens edit modal. |
| Remove | Alert **Remove MCP server?** (confirm/cancel) — exact button labels from dialog footer. |
| Custom MCP | Opens **mcpServerModal**. |

### Errors (toasts)
- **Failed to load MCP servers**
- **Failed to refresh MCP data**
- **Failed to save server**
- **Failed to remove server**

## Automations page

**Entry:** Sidebar **Automations** (only when feature available).

### What the user sees
- **Automations** heading; subtitle **Trigger automations from GitHub events, Linear tickets, or run them on a schedule**
- **Browse Templates**; **New Automation**
- Error banner: destructive text + dismiss (X).
- Inline **AutomationInlineCreate** for new/edit.
- **ExampleAutomations** when list empty and not creating.
- Sections **Active** and **Paused** (heading style matches MCP section headers).

### What the user can do
| Action | Result |
|--------|--------|
| New automation | Opens inline creator. |
| Template | Prefills creator from example. |
| Edit / delete / toggle / run now / logs | Per **AutomationRow** and modals (**RunLogsModal**, **TemplatesDialog**, delete confirm). |

### State
- **Loader** while initial load (parent shows spinner when `isLoading`).
- Inline forms slide in with short animation.

## Interactions with other features

- **Skills** and **MCP** use system APIs for file/install operations; errors surface as toasts or inline.
- **Automations** depend on **Integrations** for triggers (GitHub/Linear etc.).
