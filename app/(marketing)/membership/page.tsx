export default function MembershipPage() {
  return (
    <article className="vu-gutter mx-auto max-w-3xl py-16">
      <p className="text-sm uppercase tracking-[0.18em] text-olive">Membership</p>
      <h1 className="mt-3 font-display text-5xl text-forest">
        A seat at the table, not a content drip.
      </h1>
      <p className="mt-6 text-lg text-muted">
        Membership unlocks the community, courses, events, and a personalized
        cooking roadmap. Billing is handled honestly: SamCart collects payment,
        and Vegan University keeps your access accurate.
      </p>
      <ul className="mt-10 space-y-4 text-ink">
        <li>Learn at a human pace, with lessons that lead to dinner.</li>
        <li>Meet people cooking the same plants in the same season.</li>
        <li>Cancel in the open — no dark patterns, no disappearing buttons.</li>
      </ul>
      <p className="mt-10 text-sm text-muted">
        Checkout still happens in SamCart. After purchase, access is granted
        here from entitlements — never by asking SamCart on each page load.
      </p>
    </article>
  );
}
