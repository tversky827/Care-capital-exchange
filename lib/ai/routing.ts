/**
 * Model routing. Each task names its own model so a cheap classifier and an
 * expensive reasoning pass are never coupled, and so swapping one provider's
 * model out does not touch call sites.
 */
export type AiTask =
  | 'ocr'
  | 'extraction'
  | 'classification'
  | 'reconciliation'
  | 'reasoning'
  | 'memo'
  | 'chat'
  | 'match_explanation'
  | 'data_requests'

export interface TaskConfig {
  model: string
  temperature: number
  maxTokens: number
  /** USD per million tokens, used for cost tracking and budget enforcement. */
  inputCostPerMillion: number
  outputCostPerMillion: number
}

const DEFAULTS: Record<AiTask, TaskConfig> = {
  ocr: { model: 'gpt-4o-mini', temperature: 0, maxTokens: 4000, inputCostPerMillion: 0.15, outputCostPerMillion: 0.6 },
  extraction: { model: 'gpt-4o-mini', temperature: 0, maxTokens: 8000, inputCostPerMillion: 0.15, outputCostPerMillion: 0.6 },
  classification: { model: 'gpt-4o-mini', temperature: 0, maxTokens: 500, inputCostPerMillion: 0.15, outputCostPerMillion: 0.6 },
  reconciliation: { model: 'gpt-4o', temperature: 0, maxTokens: 4000, inputCostPerMillion: 2.5, outputCostPerMillion: 10 },
  reasoning: { model: 'gpt-4o', temperature: 0.1, maxTokens: 6000, inputCostPerMillion: 2.5, outputCostPerMillion: 10 },
  memo: { model: 'gpt-4o', temperature: 0.2, maxTokens: 12000, inputCostPerMillion: 2.5, outputCostPerMillion: 10 },
  chat: { model: 'gpt-4o-mini', temperature: 0.1, maxTokens: 2000, inputCostPerMillion: 0.15, outputCostPerMillion: 0.6 },
  match_explanation: { model: 'gpt-4o-mini', temperature: 0.2, maxTokens: 1000, inputCostPerMillion: 0.15, outputCostPerMillion: 0.6 },
  data_requests: { model: 'gpt-4o-mini', temperature: 0, maxTokens: 2000, inputCostPerMillion: 0.15, outputCostPerMillion: 0.6 },
}

const ENV_OVERRIDES: Partial<Record<AiTask, string | undefined>> = {
  extraction: process.env.AI_MODEL_EXTRACTION,
  reasoning: process.env.AI_MODEL_REASONING,
  memo: process.env.AI_MODEL_MEMO,
  chat: process.env.AI_MODEL_CHAT,
  classification: process.env.AI_MODEL_CLASSIFICATION,
}

export function taskConfig(task: AiTask): TaskConfig {
  const base = DEFAULTS[task]
  const override = ENV_OVERRIDES[task]
  return override ? { ...base, model: override } : base
}

export function estimateCost(task: AiTask, tokensIn: number, tokensOut: number): number {
  const config = taskConfig(task)
  const cost =
    (tokensIn / 1_000_000) * config.inputCostPerMillion +
    (tokensOut / 1_000_000) * config.outputCostPerMillion
  return Math.round(cost * 1e6) / 1e6
}

export function monthlyBudgetUsd(): number {
  const configured = Number(process.env.AI_MONTHLY_BUDGET_USD)
  return Number.isFinite(configured) && configured > 0 ? configured : 250
}
