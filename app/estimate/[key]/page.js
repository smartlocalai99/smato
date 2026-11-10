import { notFound } from "next/navigation";
import EstimateView from "@/components/estimate/EstimateView";
import { getEstimate, isEstimateKey } from "@/lib/estimateData";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Auto campaign · smato",
  robots: { index: false, follow: false },
};

// A shareable, read-only view for a client: the live fleet plus the autos
// still planned. Reachable only through its secret link (ESTIMATE_LINK_KEY)
// and linked from nowhere in the admin.
export default async function EstimatePage({ params }) {
  if (!isEstimateKey(params.key)) notFound();
  const estimate = await getEstimate();
  return <EstimateView initial={estimate} linkKey={params.key} />;
}
