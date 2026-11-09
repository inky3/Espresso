export const RIN_EXPRESSIONS = ["neutral", "warm", "thoughtful", "concerned", "playful"] as const;
export type RinExpression = typeof RIN_EXPRESSIONS[number];

export type RinCharacterState = {
  expression: RinExpression;
  pose: "relaxed" | "attentive";
  outfit: "signature-dark";
  environment: "private-studio";
  mode: "automatic" | "manual";
  reason: string;
};

export function isRinExpression(value: unknown): value is RinExpression {
  return typeof value === "string" && (RIN_EXPRESSIONS as readonly string[]).includes(value);
}

export function deriveRinState(userText: string, replyText: string, manualExpression?: RinExpression): RinCharacterState {
  if (manualExpression) {
    return {
      expression: manualExpression,
      pose: "relaxed",
      outfit: "signature-dark",
      environment: "private-studio",
      mode: "manual",
      reason: "Expression manually selected",
    };
  }

  const context = (userText + " " + replyText).toLowerCase();
  let expression: RinExpression = "neutral";
  let reason = "Default conversational state";

  if (/(thank|great|glad|excited|love that|haha|lol|ดีใจ|ขอบคุณ|เยี่ยม|555)/i.test(context)) {
    expression = "warm";
    reason = "Positive conversational tone";
  } else if (/(worr(y|ied)|sad|stress|anxious|afraid|เหนื่อย|เครียด|กังวล|เสียใจ)/i.test(context)) {
    expression = "concerned";
    reason = "Supportive response to a difficult topic";
  } else if (/(why|how|think|consider|plan|explain|compare|ทำไม|อย่างไร|วางแผน|วิเคราะห์)/i.test(context)) {
    expression = "thoughtful";
    reason = "Reflective or problem-solving conversation";
  } else if (/(tease|joke|funny|playful|แซว|ตลก|ล้อเล่น)/i.test(context)) {
    expression = "playful";
    reason = "Lighthearted conversational tone";
  }

  return {
    expression,
    pose: "relaxed",
    outfit: "signature-dark",
    environment: "private-studio",
    mode: "automatic",
    reason,
  };
}
