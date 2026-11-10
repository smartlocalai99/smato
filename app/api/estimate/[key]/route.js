import { NextResponse } from "next/server";
import { getEstimate, isEstimateKey } from "@/lib/estimateData";

export const dynamic = "force-dynamic";

// What the estimate page polls every 2 minutes. Served from the same
// server-side cache as the page, so polling adds no database reads.
export async function GET(_request, { params }) {
  if (!isEstimateKey(params.key)) return NextResponse.json({ error: "Not found." }, { status: 404 });
  try {
    return NextResponse.json(await getEstimate(), { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    return NextResponse.json({ error: err.message || "Couldn't load the fleet." }, { status: 500 });
  }
}
