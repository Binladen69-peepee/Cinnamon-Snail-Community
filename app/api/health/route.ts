import { prisma } from "@/lib/db";

export async function GET() {
  const deadLetters = await prisma.billingEvent.count({
    where: { deadLetteredAt: { not: null } },
  });
  return Response.json({
    ok: true,
    service: "vegan-university",
    time: new Date().toISOString(),
    billing: { deadLetters },
  });
}
