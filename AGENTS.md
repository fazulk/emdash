# AGENTS.md

The role of this file is to describe common mistakes and confusion points that agents might encounter as they work in this project. If you ever encounter something in the project that surprises you, please alert the developer working with you and indicate that this is the case in the AgentMD file to help prevent future agents from having the same issue. Always ask the developer before modifying this file.

## Keyboard shortcuts

When changing keyboard shortcut defaults, update both:
- `src/renderer/hooks/useKeyboardShortcuts.ts` for the renderer shortcut definitions
- `src/main/settings.ts` for persisted default settings

If the shortcut defaults changed from a previously shipped value, also consider adding a migration in `normalizeSettings()` in `src/main/settings.ts` so existing users with saved settings get updated.

Relevant tests:
- `src/test/main/settings.test.ts`
- `src/test/renderer/useKeyboardShortcuts.test.ts`
