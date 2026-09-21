// Purpose: Describe normalized notices and public-contract fit decisions.
import type { JevProvider } from "./jev.mjs";
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
