export interface QuestionTypeDistribution {
  recall?: number;
  application?: number;
  analysis?: number;
  caseBased?: number;
  numerical?: number;
  derivation?: number;
}

const TEMPERATURE_BY_TYPE: Record<keyof QuestionTypeDistribution, number> = {
  recall: 0.05,
  application: 0.15,
  analysis: 0.18,
  caseBased: 0.3,
  numerical: 0.15,
  derivation: 0.12,
};

export function computeWeightedTemperature(
  distribution: QuestionTypeDistribution,
  fallback = 0.15
): number {
  const entries = Object.entries(distribution).filter(([, weight]) => Number(weight) > 0) as Array<
    [keyof QuestionTypeDistribution, number]
  >;
  if (entries.length === 0) return fallback;

  const totalWeight = entries.reduce((sum, [, weight]) => sum + Number(weight), 0);
  if (totalWeight <= 0) return fallback;

  const weighted = entries.reduce((sum, [type, weight]) => {
    return sum + TEMPERATURE_BY_TYPE[type] * Number(weight);
  }, 0);

  return Math.max(0.05, Math.min(0.3, Number((weighted / totalWeight).toFixed(2))));
}
