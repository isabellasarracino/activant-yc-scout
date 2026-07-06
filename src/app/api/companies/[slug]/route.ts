import { NextResponse } from "next/server";
import { getDb } from "../../../../lib/db/client";
import { getCompanyBySlug } from "../../../../lib/db/repository";
import { serializeCompanyFull } from "../../../../lib/api/serialize";

/** Full detail for one company — the "click to expand" target for a compact card from GET /api/batches/[batch]. */
export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  try {
    const { slug } = await params;
    const db = getDb();
    const company = await getCompanyBySlug(db, slug);
    if (!company) {
      return NextResponse.json({ error: `No company found with slug "${slug}".` }, { status: 404 });
    }
    return NextResponse.json(serializeCompanyFull(company));
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Unknown error" }, { status: 500 });
  }
}
