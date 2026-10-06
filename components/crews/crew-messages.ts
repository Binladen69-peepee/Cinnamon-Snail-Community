/**
 * The sentences behind the codes crew actions redirect with. One table, so
 * the crew page, the crews list and Connect say the same thing.
 */
const ERRORS: Record<string, string> = {
  "not-found": "That crew could not be found.",
  "not-member": "Only members of this crew can open its chat.",
  archived: "This crew has been archived. Its chat is kept for the people who were in it.",
  "not-optional": "You can’t join this crew yourself — members are placed in it automatically.",
  automatic:
    "You’re in this crew automatically, so you can’t leave it. You can leave its chat from the chat’s menu.",
  inactive: "Your account can’t do that right now.",
  busy: "That was a lot of clicks at once. Give it a moment and try again.",
  failed: "That didn’t work. Try again in a moment.",
};

export function crewMessage(params: {
  error?: string;
  joined?: string;
  left?: string;
}): { tone: "danger" | "success"; text: string } | null {
  if (params.error) {
    return { tone: "danger", text: ERRORS[params.error] ?? ERRORS.failed! };
  }
  if (params.joined) return { tone: "success", text: "You joined the crew. Say hello in its chat." };
  if (params.left) return { tone: "success", text: "You left the crew." };
  return null;
}
