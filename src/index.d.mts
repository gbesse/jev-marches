// Purpose: Describe normalized notices and public-contract fit decisions.
import type { JevProvider } from "./jev.mjs";
export const BOAMP_API: "https://boamp-datadila.opendatasoft.com/api/explore/v2.1/catalog/datasets/boamp/records";
export interface ProcurementNotice {
  id: string;
  kind: "procurement-notice";
  title: string;
  text: string;
  buyer: string | null;
  departments: string[];
  descriptors: string[];
  contractTypes: string[];
  deadline: string | null;
  date: string | null;
  sourceUrl: string;
  source: "BOAMP · DILA";
}
export function fetchBoampNotices(options?: {
  limit?: number;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}): Promise<ProcurementNotice[]>;
export function prefilter(
  notice: Record<string, any>,
  profile: Record<string, any>,
  now?: Date,
): { eligible: boolean; reason?: string };
export function assessNotice(
  notice: Record<string, any>,
  profile: Record<string, any>,
  provider: JevProvider,
  options?: { now?: Date; minConfidence?: number },
): Promise<any>;
export function rankNotices(
  notices: Record<string, any>[],
  profile: Record<string, any>,
  provider: JevProvider,
  options?: { now?: Date; minConfidence?: number },
): Promise<any[]>;
export function runCli(
  argv: string[],
  io?: { log(value: string): void },
): Promise<void>;
