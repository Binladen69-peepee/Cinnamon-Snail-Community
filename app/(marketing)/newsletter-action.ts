"use server";

export async function newsletterIntentAction(
  _prev: { message: string },
  formData: FormData,
): Promise<{ message: string }> {
  const email = String(formData.get("email") ?? "").trim();
  if (!email) {
    return { message: "Add an email if you want us to remember the request." };
  }
  return {
    message:
      "Noted locally in this session only — Kit is not configured, so we did not add you to a list. When email signup is live, it will run through Kit, not a fake form.",
  };
}
