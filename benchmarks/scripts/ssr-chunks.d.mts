interface SsrChunkReportModule {
  originalLength?: number;
  renderedLength?: number;
}

interface SsrChunkReportOutputChunk {
  type?: string;
  fileName?: string;
  code?: string;
  isEntry?: boolean;
  isDynamicEntry?: boolean;
  facadeModuleId?: string | null;
  imports?: string[];
  dynamicImports?: string[];
  modules?: Record<string, SsrChunkReportModule>;
}

interface SsrChunkReportOutputOptions {
  dir?: string;
}

interface SsrChunkReportResolvedConfig {
  root: string;
}

export interface SsrChunkReportPlugin {
  name: string;
  apply: "build";
  configResolved(config: SsrChunkReportResolvedConfig): void;
  generateBundle(
    outputOptions: SsrChunkReportOutputOptions,
    bundle: Record<string, SsrChunkReportOutputChunk>,
  ): Promise<void>;
}

export function ssrChunkReportPlugin(
  frameworkId: string,
  frameworkLabel: string,
): SsrChunkReportPlugin;

export function createSsrChunkReport(
  framework: string,
  outputDirectory: string,
  bundle: Record<string, SsrChunkReportOutputChunk>,
  projectRoot?: string,
): unknown;

export function printSsrChunkReport(root?: string): Promise<void>;
