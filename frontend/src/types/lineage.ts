import type { JobType } from "./jobs";

export type LineageNodeKind = "source" | "stage" | "output";

export interface LineageNode {
  id: string;
  name: string;
  kind: LineageNodeKind;
  stageType?: "ingestion" | "validation" | "transformation" | "publication";
  description: string;
  codeReference?: string;
  filePath?: string;
  format?: string;
  columns?: string[];
  inputDatasets?: string[];
  outputDatasets?: string[];
}

export interface LineageEdge {
  source: string;
  target: string;
}

export interface AssociatedRunReport {
  batchId: string;
  mode: "baseline" | "optimized";
  runId: string | null;
  pipelineStatus: string | null;
  reconciliationStatus: string | null;
  outputRecords: number | null;
  publicationState: string | null;
  publicationTarget: string | null;
}

export type RunReportState =
  | "loading"
  | "available"
  | "unavailable"
  | "unmatched"
  | "not-applicable";

export type PipelineJobType = Extract<JobType, "baseline" | "optimized" | "both">;
