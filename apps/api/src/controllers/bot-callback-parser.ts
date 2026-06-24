export function parseMedicineSelectionCallbackData(callbackData) {
  const parts = String(callbackData ?? "").split(":");
  const sessionId = parts[1]?.trim() ?? "";
  const choiceId = parts.slice(2).join(":").trim();

  if (parts.length < 3 || parts[0] !== "ms" || !sessionId || !choiceId) {
    return {
      valid: false
    };
  }

  return {
    valid: true,
    sessionId,
    choiceId
  };
}
