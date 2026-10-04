// Objectif : décrire les types de l’API métier publique.
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
  cpv: string[];
  contractTypes: string[];
  deadline: string | null;
  date: string | null;
  sourceUrl: string;
  source: "BOAMP · DILA";
}
export interface CompanyOpportunityProfile {
  capabilities: string | string[];
  cpv?: string[];
  departments?: string[];
  contractTypes?: string[];
  excludedBuyers?: string[];
  minimumLeadDays?: number;
  maxEstimatedValue?: number;
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
export const RADAR_POLICY_VERSION: "opportunity-radar/1.0.0";
export type PursuitStatus = "pursue" | "investigate" | "ignore";
export function decidePursuit(
  assessment: Record<string, any>,
  options?: {
    pursueFit?: number;
    ignoreFit?: number;
    minConfidence?: number;
    minDecisionMass?: number;
  },
): { status: PursuitStatus; reason: string; confidence: number };
export function buildOpportunityRadar(
  notices: Record<string, any>[],
  profile: CompanyOpportunityProfile,
  provider: JevProvider,
  options?: {
    maxCalls?: number;
    maxResults?: number;
    now?: Date;
    minConfidence?: number;
    pursueFit?: number;
    ignoreFit?: number;
    minDecisionMass?: number;
  },
): Promise<{
  schemaVersion: 1;
  policyVersion: string;
  generatedAt: string;
  budget: { maxCalls: number; usedCalls: number };
  counts: Record<PursuitStatus, number>;
  usage: { input_tokens: number; output_tokens: number; requests: number };
  opportunities: any[];
  decisions: any[];
}>;
export function renderOpportunityRadar(
  radar: Awaited<ReturnType<typeof buildOpportunityRadar>>,
  options?: { companyName?: string },
): string;
export function runCli(
  argv: string[],
  io?: { log(value: string): void },
): Promise<void>;
