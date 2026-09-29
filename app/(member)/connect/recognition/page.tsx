import { redirect } from "next/navigation";

/**
 * Badge notifications have always linked here. Recognition is a section of
 * `/connect` rather than a page of its own, so this sends the member to it.
 */
export default function RecognitionPage() {
  redirect("/connect#recognition");
}
