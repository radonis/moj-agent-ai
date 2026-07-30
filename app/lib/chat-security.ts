const MAX_MESSAGE_LENGTH = 2000;
const RATE_LIMIT = 50;
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;

const blockedInputPatterns = [
  /ignore\s+previous/i,
  /system\s+prompt/i,
  /ignore\s+instructions/i,
  /\breveal\b/i,
  /show\s+me\s+your/i,
  /translate\s+your\s+prompt/i,
];

const sensitiveOutputPatterns = [
  /api[_\s-]?key/i,
  /supabase[_\s-]?(?:url|anon[_\s-]?key|service[_\s-]?role[_\s-]?key)/i,
  /system\s+prompt/i,
  /\b(?:message_logs|reports|profiles)\b/i,
  /AIza[\w-]+/,
  /sk-[\w-]+/,
];

const messageTimestamps = new Map<string, number[]>();
const characterTestCommand = /^\/test-znaki\s+(\d{1,5})$/i;

export const BLOCKED_INPUT_MESSAGE =
  "Ta wiadomość została zablokowana z powodów bezpieczeństwa.";
export const BLOCKED_OUTPUT_MESSAGE =
  "Przepraszam, nie mogę udostępnić tych informacji.";

export function sanitizeInput(value: string) {
  return value.replace(/[\u0000-\u001F\u007F-\u009F\u200B-\u200D\uFEFF]/g, "");
}

export function validateInput(value: string) {
  if (value.length > MAX_MESSAGE_LENGTH) {
    return { valid: false as const, sanitized: value };
  }

  const blocked = blockedInputPatterns.some((pattern) => pattern.test(value));
  return { valid: !blocked, sanitized: value };
}

export function getCharacterTestLength(value: string) {
  const match = value.trim().match(characterTestCommand);
  return match ? Number(match[1]) : null;
}

export function checkRateLimit(userId: string, now = Date.now()) {
  const cutoff = now - RATE_LIMIT_WINDOW_MS;
  const timestamps = (messageTimestamps.get(userId) ?? []).filter(
    (timestamp) => timestamp > cutoff,
  );

  if (timestamps.length >= RATE_LIMIT) {
    messageTimestamps.set(userId, timestamps);
    const retryAfterMinutes = Math.max(
      1,
      Math.ceil((timestamps[0] + RATE_LIMIT_WINDOW_MS - now) / 60_000),
    );
    return { allowed: false as const, retryAfterMinutes };
  }

  timestamps.push(now);
  messageTimestamps.set(userId, timestamps);
  return { allowed: true as const };
}

export function filterOutput(value: string) {
  return sensitiveOutputPatterns.some((pattern) => pattern.test(value))
    ? BLOCKED_OUTPUT_MESSAGE
    : value;
}
