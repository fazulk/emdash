export function getGlobalTerminalKey(args: {
  projectPath?: string | null;
  taskPath?: string | null;
}): string {
  const projectPath = args.projectPath?.trim();
  if (projectPath) return `global::${projectPath}`;

  const taskPath = args.taskPath?.trim();
  if (taskPath) return `global::${taskPath}`;

  return 'global::home';
}
