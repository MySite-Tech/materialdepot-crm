import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { STATE_FILE } from './constants.mjs';
import { seed } from './seed/index.mjs';

const file = resolve(process.cwd(), STATE_FILE);

export function persist(state) {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(`${file}.tmp`, JSON.stringify(state, null, 1));
  renameSync(`${file}.tmp`, file);
}

export function loadState({ reset }) {
  if (!reset && existsSync(file)) {
    try {
      return { state: JSON.parse(readFileSync(file, 'utf8')), file, fresh: false };
    } catch {
      console.warn(`${STATE_FILE} is unreadable, reseeding`);
    }
  }
  const state = seed();
  persist(state);
  return { state, file, fresh: true };
}
