export interface StorageDriver {
  readFile(projectId: string, filePath: string): Promise<string>;
  writeFile(
    projectId: string,
    filePath: string,
    content: string
  ): Promise<{ sha256: string; bytes: number }>;
  deleteFile(projectId: string, filePath: string): Promise<boolean>;
  deleteDirectory(projectId: string, directoryPath: string): Promise<boolean>;
  listFiles(
    projectId: string,
    prefix?: string
  ): Promise<Array<{ path: string; size: number; lastModified: Date }>>;
}
