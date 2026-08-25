import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

export const emptyState = () => ({
  requests: [], suppliers: [], allocations: [], orders: [],
  sync: { lastSuccessfulAt: null, lastAttemptAt: null, error: null }
});

export class JsonStore {
  constructor(file) { this.file = file; this.state = emptyState(); }
  async load() {
    try { this.state = { ...emptyState(), ...JSON.parse(await readFile(this.file, "utf8")) }; }
    catch (error) { if (error.code !== "ENOENT") throw error; }
    return this.state;
  }
  async save() {
    await mkdir(dirname(this.file), { recursive: true });
    const temp = `${this.file}.tmp`;
    await writeFile(temp, JSON.stringify(this.state, null, 2));
    await rename(temp, this.file);
  }
  snapshot() { return structuredClone(this.state); }
}
