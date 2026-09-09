export type Inventory = {
  files: string[]
  modules: string[]
  hasFile: (candidate: string) => boolean
  hasDirectory: (candidate: string) => boolean
}

export function listTrackedFiles(rootDir: string): Promise<string[]>
export function buildInventory(rootDir: string, listFilesFor?: (rootDir: string) => Promise<string[]>): Promise<Inventory>
