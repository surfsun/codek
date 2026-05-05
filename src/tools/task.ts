import type { Task, TaskStatus } from '../types.js';

const tasks = new Map<string, Task>();
let nextId = 1;

export function createTask(subject: string, description?: string): string {
  const id = String(nextId++);
  tasks.set(id, {
    id,
    subject,
    description: description || '',
    status: 'pending',
    createdAt: Date.now(),
  });
  return id;
}

export function getTask(id: string): string {
  const task = tasks.get(id);
  if (!task) return `Task not found: ${id}`;
  let result = `[${task.status}] ${task.subject}`;
  if (task.description) result += `\n  ${task.description}`;
  return result;
}

export function listTasks(): string {
  if (tasks.size === 0) return '(no tasks)';
  const lines = Array.from(tasks.values())
    .filter(t => t.status !== 'deleted')
    .map(t => `${t.id}. [${t.status}] ${t.subject}`);
  return lines.length > 0 ? lines.join('\n') : '(no tasks)';
}

export function updateTask(
  id: string,
  updates: { subject?: string; description?: string; status?: string },
): string {
  const task = tasks.get(id);
  if (!task) return `Task not found: ${id}`;
  if (updates.subject !== undefined) task.subject = updates.subject;
  if (updates.description !== undefined) task.description = updates.description;
  if (updates.status !== undefined) task.status = updates.status as TaskStatus;
  return `Updated task ${id}`;
}

export function stopTask(id: string): string {
  const task = tasks.get(id);
  if (!task) return `Task not found: ${id}`;
  task.status = 'deleted';
  return `Stopped task ${id}`;
}
