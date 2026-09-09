export function cancellationConfirmedHtml(input: {
  name: string;
  productName: string;
  accessNote: string;
}) {
  return `<p>Hi ${escapeHtml(input.name)},</p>
<p>SamCart confirmed the cancellation of <strong>${escapeHtml(input.productName)}</strong>.</p>
<p>${escapeHtml(input.accessNote)}</p>
<p>The kitchen will still be here if you want to come back.</p>`;
}

export function cancellationFailedHtml(input: { name: string; productName: string }) {
  return `<p>Hi ${escapeHtml(input.name)},</p>
<p>We could not cancel <strong>${escapeHtml(input.productName)}</strong> with SamCart yet. Your membership is still active. We have not marked it canceled on our side.</p>
<p>Please try again, or write to support if this keeps happening.</p>`;
}

export function reconciliationEmailHtml(input: {
  status: string;
  autoFixed: number;
  alerts: number;
  clean: boolean;
}) {
  const headline = input.clean
    ? "Nightly billing reconciliation is clean."
    : "Nightly billing reconciliation found drift.";
  return `<p>${headline}</p>
<p>Status: ${escapeHtml(input.status)}. Auto-fixed: ${input.autoFixed}. Alerts: ${input.alerts}.</p>
<p>This email is sent every day, including clean days.</p>`;
}

export function deletionRequestedHtml(input: { name: string; graceDays: number }) {
  return `<p>Hi ${escapeHtml(input.name)},</p>
<p>We received your account deletion request. If you have a paid membership, cancellation must be confirmed by SamCart before we can close the account.</p>
<p>After that, we keep a ${input.graceDays}-day grace period before personal data is purged.</p>`;
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
