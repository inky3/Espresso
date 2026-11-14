import {
  RIN_ASSET_CATALOG,
  type RinEnvironmentId,
  type RinExpressionId,
  type RinOutfitId,
  type RinPoseId,
} from "./character-assets";
import type { PoseId as RinReactionPoseId } from "./scene";

export const RIN_EXPRESSIONS = Object.keys(RIN_ASSET_CATALOG.expressions) as RinExpressionId[];
export const RIN_OUTFITS = Object.keys(RIN_ASSET_CATALOG.outfits) as RinOutfitId[];
export const RIN_POSES = Object.keys(RIN_ASSET_CATALOG.poses) as RinPoseId[];
export const RIN_ENVIRONMENTS = Object.keys(RIN_ASSET_CATALOG.environments) as RinEnvironmentId[];

export type RinCharacterState = {
  expression: RinExpressionId;
  pose: RinPoseId;
  reactionPose: RinReactionPoseId | null;
  outfit: RinOutfitId;
  environment: RinEnvironmentId;
  mode: "automatic" | "manual";
  reason: string;
};

export type RinManualOverrides = {
  expression?: RinExpressionId;
  outfit?: RinOutfitId;
  pose?: RinPoseId;
  environment?: RinEnvironmentId;
};

export function isRinExpression(value: unknown): value is RinExpressionId {
  return typeof value === "string" && value in RIN_ASSET_CATALOG.expressions;
}
export function isRinOutfit(value: unknown): value is RinOutfitId {
  return typeof value === "string" && value in RIN_ASSET_CATALOG.outfits;
}
export function isRinPose(value: unknown): value is RinPoseId {
  return typeof value === "string" && value in RIN_ASSET_CATALOG.poses;
}
export function isRinEnvironment(value: unknown): value is RinEnvironmentId {
  return typeof value === "string" && value in RIN_ASSET_CATALOG.environments;
}

export function deriveRinState(
  userText: string,
  _replyText: string,
  overrides: RinManualOverrides = {},
): RinCharacterState {
  // React to what the user actually said. Rin's own reply must not trigger her emotion.
  const context = userText.toLowerCase();
  let expression: RinExpressionId = "neutral";
  let expressionReason = "Default conversational state";
  let reactionPose: RinReactionPoseId | null = null;

  if (/(^|\b)(hello|hi|hey|good morning|good afternoon|good evening)(\b|$)|สวัสดี|หวัดดี/i.test(context)) {
    expression = "smile";
    reactionPose = "wave";
    expressionReason = "Greeting";
  } else if (/(embarrass|awkward|shy|fluster|blush|เขิน|อาย)/i.test(context)) {
    expression = "embarrassed";
    reactionPose = "cheeks";
    expressionReason = "Embarrassed or shy tone";
  } else if (/(not alright|not okay|not ok|feel(?:ing)? (?:down|sad|low|bad)|i'?m (?:tired|exhausted|sad|stressed|worried|anxious)|i am (?:a little tired|a bit tired|feeling tired|tired|exhausted|sad|stressed|worried|anxious)|worr(y|ied)|sad|stress(?:ed)?|anxious|afraid|เหนื่อย|เครียด|กังวล|เสียใจ|ไม่ไหว|ไม่โอเค|ไม่สบายใจ)/i.test(context)) {
    expression = "concerned";
    reactionPose = "hands";
    expressionReason = "Supportive response to the user's difficult moment";
  } else if (/(confus(?:ed|ing)|don't understand|do not understand|not sure what|งง|ไม่เข้าใจ)/i.test(context)) {
    expression = "curious";
    reactionPose = "chin";
    expressionReason = "The user signals confusion";
  } else if (/(surpris|unexpected|really\?|no way|จริงเหรอ|ตกใจ)/i.test(context)) {
    expression = "surprised";
    expressionReason = "Surprising conversational moment";
  } else if (/(that's great|that is great|awesome|fantastic|wonderful|amazing|so happy|ดีมาก|มีความสุข)/i.test(context)) {
    expression = "happy";
    reactionPose = "cheer";
    expressionReason = "The user shares genuine excitement";
  } else if (/(thank|glad|love that|haha|lol|ดีใจ|ขอบคุณ|เยี่ยม|555)/i.test(context)) {
    expression = "smile";
    expressionReason = "Positive conversational tone";
  } else if (/(why|how|think|consider|plan|explain|compare|ทำไม|อย่างไร|วางแผน|วิเคราะห์)/i.test(context)) {
    expression = "thinking";
    expressionReason = "Reflective or problem-solving conversation";
  } else if (/(tease|joke|funny|playful|แซว|ตลก|ล้อเล่น)/i.test(context)) {
    expression = "curious";
    expressionReason = "Lighthearted conversational tone";
  } else if (/(sleep|bed|good night|ง่วง|นอน|ฝันดี)/i.test(context)) {
    expression = "sleepy";
    expressionReason = "Late-night or sleepy conversation";
  }

  let outfit: RinOutfitId = "casual";
  let outfitReason = "Everyday companion mode";
  if (/(meeting|office|work|study|เรียน|ทำงาน|ประชุม|อ่านหนังสือ)/i.test(context)) {
    outfit = "work"; outfitReason = "Work or study context";
  } else if (/(gym|workout|exercise|run|cycle|ออกกำลัง|ฟิตเนส|วิ่ง|ปั่นจักรยาน)/i.test(context)) {
    outfit = "sporty"; outfitReason = "Active or workout context";
  } else if (/(sleep|bedtime|good night|ง่วง|เข้านอน|ฝันดี)/i.test(context)) {
    outfit = "sleepwear"; outfitReason = "Night-time context";
  } else if (/(home|relax|rest|sofa|พักผ่อน|อยู่บ้าน|ชิล)/i.test(context)) {
    outfit = "homewear"; outfitReason = "Relaxed at-home context";
  }

  let pose: RinPoseId = "seated";
  if (/(work|office|coding|ทำงาน)/i.test(context)) pose = "working";
  else if (/(study|read|เรียน|อ่าน)/i.test(context)) pose = "studying";
  else if (/(hello|hi|welcome|สวัสดี|ยินดีต้อนรับ)/i.test(context)) pose = "greeting";
  else if (/(sleep|bed|good night|นอน|ฝันดี)/i.test(context)) pose = "lying";
  else if (/(relax|rest|พักผ่อน|ชิล)/i.test(context)) pose = "relaxing";
  else if (/(talk|chat|conversation|คุย|พูดคุย)/i.test(context)) pose = "leaning";

  let environment: RinEnvironmentId = "workspace";
  if (/(bedroom|bed|sleep|นอน|ห้องนอน)/i.test(context)) environment = "bedroom";
  else if (/(cafe|coffee shop|กาแฟ|คาเฟ่)/i.test(context)) environment = "cafe";
  else if (/(living room|sofa|พักผ่อน|ห้องนั่งเล่น)/i.test(context)) environment = "living";

  const hasOverrides = Object.values(overrides).some(Boolean);
  return {
    expression: overrides.expression ?? expression,
    pose: overrides.pose ?? pose,
    reactionPose: overrides.pose ? null : reactionPose,
    outfit: overrides.outfit ?? outfit,
    environment: overrides.environment ?? environment,
    mode: hasOverrides ? "manual" : "automatic",
    reason: [
      overrides.expression ? "Expression manually selected" : expressionReason,
      overrides.outfit ? "Outfit manually selected" : outfitReason,
      overrides.pose ? "Pose manually selected" : "",
      overrides.environment ? "Environment manually selected" : "",
    ].filter(Boolean).join("; "),
  };
}
