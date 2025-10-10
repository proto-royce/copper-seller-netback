import React, { useMemo, useState } from "react";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";

/**
 * Copper Cathodes – Offer Normalizer (Demo Prototype)
 * --------------------------------------------------
 * What this does:
 * - Shows multiple supplier offers for copper cathodes (different Incoterms, currencies, payment terms)
 * - One-click "Normalize" to a common basis (USD/mt, CIF Rotterdam, Cash at delivery)
 * - Compares each normalized offer vs. an LME Copper price (Δ %)
 * - Lets you tweak a few assumptions (FX, interest, logistics) and instantly re-run
 *
 * Notes:
 * - All data below is synthetic and for demonstration only.
 * - The normalization model is intentionally simple/transparent for presales demos.
 */

// -----------------------------
// Mock offers (synthetic)
// -----------------------------
const initialOffers = [
  {
    id: "O-001",
    supplier: "Andes Metals",
    origin: "Chile",
    incoterm: "FOB Antofagasta",
    currency: "USD",
    pricePerMt: 9380,
    quantityMt: 500,
    paymentTerms: "Net 30",
  },
  {
    id: "O-002",
    supplier: "Carioca Copper",
    origin: "Brazil",
    incoterm: "FOB Santos",
    currency: "USD",
    pricePerMt: 9300,
    quantityMt: 1000,
    paymentTerms: "LC at sight",
  },
  {
    id: "O-003",
    supplier: "Baltic Metals",
    origin: "Poland",
    incoterm: "CFR Rotterdam",
    currency: "EUR",
    pricePerMt: 8600, // EUR/mt
    quantityMt: 750,
    paymentTerms: "Net 90",
  },
  {
    id: "O-004",
    supplier: "Yangtze Copper",
    origin: "China",
    incoterm: "EXW Shanghai",
    currency: "CNY",
    pricePerMt: 68400, // CNY/mt
    quantityMt: 600,
    paymentTerms: "Advance 20% (T/T)",
  },
  {
    id: "O-005",
    supplier: "Rhein Refining",
    origin: "Germany",
    incoterm: "DDP Duisburg",
    currency: "EUR",
    pricePerMt: 9150, // EUR/mt (delivered inland)
    quantityMt: 400,
    paymentTerms: "Net 0 (cash)",
  },
];

// -----------------------------
// Assumptions & helpers
// -----------------------------
const defaultAssumptions = {
  baseMarket: "CIF Rotterdam",
  baseCurrency: "USD",
  lmePriceUsdMt: 9200, // Adjust live during demo
  fx: {
    EURUSD: 1.10, // 1 EUR = 1.10 USD
    CNYUSD: 0.14, // 1 CNY = 0.14 USD
  },
  finance: {
    annualInterestRate: 0.08, // 8% simple annual rate for time-value of money
    lcFeePct: 0.005, // 0.5% for LC at sight
    advanceDays: 30, // assume advance is paid ~30 days before shipment
  },
  logisticsToCIFRdam: {
    // Adjustment to convert listed Incoterm to CIF Rotterdam basis (USD/mt)
    // Positive number = add cost to reach CIF Rdam; Negative = subtract cost to strip extras beyond CIF.
    // These are deliberately simplified demo figures.
    "FOB Antofagasta": 95,
    "FOB Santos": 80,
    "FOB Callao": 90,
    "CFR Rotterdam": 0,
    "CIF Rotterdam": 0,
    "EXW Shanghai": 120, // inland + ocean to Rdam
    "DDP Duisburg": -35, // remove inland add-on beyond port (approx.)
  },
};

function toUSD(value, currency, fx) {
  if (currency === "USD") return value;
  if (currency === "EUR") return value * fx.EURUSD;
  if (currency === "CNY") return value * fx.CNYUSD;
  return value; // fallback
}

function pvAdjust(priceUsd, paymentTerms, { annualInterestRate, lcFeePct, advanceDays }) {
  // Normalize to "cash at delivery" (Net 0). We apply simple, transparent rules:
  // - Net X: present value discount over X days => PV = price / (1 + r * X/360)
  // - LC at sight: add LC fee % to price
  // - Advance 20% (T/T): buyer pays 20% earlier by ~advanceDays, so add financing cost on that portion
  const r = annualInterestRate;
  let normalized = priceUsd;

  const term = paymentTerms.toLowerCase();
  if (term.startsWith("net ")) {
    const days = parseInt(term.split(" ")[1], 10) || 0;
    normalized = priceUsd / (1 + r * (days / 360));
  } else if (term.includes("lc") && term.includes("sight")) {
    normalized = priceUsd * (1 + lcFeePct);
  } else if (term.includes("advance") && term.includes("20%")) {
    const portion = 0.2;
    normalized = priceUsd * (1 + r * (advanceDays / 360) * portion);
  } else if (term.includes("net 0")) {
    normalized = priceUsd;
  }

  return normalized;
}

function incotermAdjust(priceUsd, incoterm, logisticsMap) {
  const delta = logisticsMap[incoterm] ?? 0;
  return priceUsd + delta;
}

function normalizeOffer(offer, assumptions) {
  const usd = toUSD(offer.pricePerMt, offer.currency, assumptions.fx);
  const pv = pvAdjust(usd, offer.paymentTerms, assumptions.finance);
  const toCIF = incotermAdjust(pv, offer.incoterm, assumptions.logisticsToCIFRdam);
  const normalizedUsdMt = toCIF; // already per mt on CIF Rotterdam, USD
  const deltaUsd = normalizedUsdMt - assumptions.lmePriceUsdMt;
  const deltaPct = (deltaUsd / assumptions.lmePriceUsdMt) * 100;
  return { ...offer, priceUsd: usd, normalizedUsdMt, deltaUsd, deltaPct };
}

function prettyCurrency(value, currency) {
  return new Intl.NumberFormat(undefined, { style: "currency", currency }).format(value);
}

function prettyNumber(value, decimals = 0) {
  return new Intl.NumberFormat(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(value);
}

export default function App() {
  const [offers, setOffers] = useState(initialOffers);
  const [assumptions, setAssumptions] = useState(defaultAssumptions);
  const [showNormalized, setShowNormalized] = useState(false);

  const normalized = useMemo(() => offers.map((o) => normalizeOffer(o, assumptions)), [offers, assumptions]);

  const ranked = useMemo(() => {
    const arr = [...normalized];
    arr.sort((a, b) => a.normalizedUsdMt - b.normalizedUsdMt);
    return arr.map((o, i) => ({ ...o, rank: i + 1 }));
  }, [normalized]);

  const chartData = ranked.map((o) => ({ name: o.supplier, pct: Number(o.deltaPct.toFixed(2)) }));

  return (
    <div className="min-h-screen bg-neutral-50 text-neutral-900">
      <div className="max-w-7xl mx-auto p-6 space-y-6">
        <header className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold">Copper Cathodes – Offer Normalizer</h1>
            <p className="text-sm text-neutral-600 mt-1">Demo mit synthetischen Daten · Zielbasis: <span className="font-medium">{assumptions.baseMarket}</span> · Währung: <span className="font-medium">{assumptions.baseCurrency}</span></p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowNormalized((s) => !s)}
              className="px-4 py-2 rounded-2xl shadow border bg-white hover:bg-neutral-100"
            >
              {showNormalized ? "Zeige Originalpreise" : "Normalization ausführen"}
            </button>
          </div>
        </header>

        {/* Assumptions Panel */}
        <section className="grid md:grid-cols-3 gap-4">
          <div className="bg-white rounded-2xl p-4 shadow border">
            <h2 className="font-semibold mb-3">Markt- & Index-Annahme</h2>
            <label className="text-sm block mb-1">LME Copper (USD/mt)</label>
            <input
              type="number"
              className="w-full border rounded-xl px-3 py-2"
              value={assumptions.lmePriceUsdMt}
              onChange={(e) => setAssumptions((a) => ({ ...a, lmePriceUsdMt: Number(e.target.value) }))}
            />
            <p className="text-xs text-neutral-500 mt-2">Nur Demo: kein Live-Feed, bitte Zahl anpassen.</p>
          </div>

          <div className="bg-white rounded-2xl p-4 shadow border">
            <h2 className="font-semibold mb-3">FX-Annahmen</h2>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm block mb-1">EUR→USD</label>
                <input
                  type="number"
                  step="0.0001"
                  className="w-full border rounded-xl px-3 py-2"
                  value={assumptions.fx.EURUSD}
                  onChange={(e) => setAssumptions((a) => ({ ...a, fx: { ...a.fx, EURUSD: Number(e.target.value) } }))}
                />
              </div>
              <div>
                <label className="text-sm block mb-1">CNY→USD</label>
                <input
                  type="number"
                  step="0.0001"
                  className="w-full border rounded-xl px-3 py-2"
                  value={assumptions.fx.CNYUSD}
                  onChange={(e) => setAssumptions((a) => ({ ...a, fx: { ...a.fx, CNYUSD: Number(e.target.value) } }))}
                />
              </div>
            </div>
            <p className="text-xs text-neutral-500 mt-2">1 EUR = EUR→USD · 1 CNY = CNY→USD</p>
          </div>

          <div className="bg-white rounded-2xl p-4 shadow border">
            <h2 className="font-semibold mb-3">Finanzierungs-/Zahlungs-Annahmen</h2>
            <label className="text-sm block mb-1">Jahreszins r (dezimal)</label>
            <input
              type="number"
              step="0.001"
              className="w-full border rounded-xl px-3 py-2 mb-2"
              value={assumptions.finance.annualInterestRate}
              onChange={(e) => setAssumptions((a) => ({ ...a, finance: { ...a.finance, annualInterestRate: Number(e.target.value) } }))}
            />
            <label className="text-sm block mb-1">LC-Gebühr (Anteil)</label>
            <input
              type="number"
              step="0.0001"
              className="w-full border rounded-xl px-3 py-2 mb-2"
              value={assumptions.finance.lcFeePct}
              onChange={(e) => setAssumptions((a) => ({ ...a, finance: { ...a.finance, lcFeePct: Number(e.target.value) } }))}
            />
            <label className="text-sm block mb-1">Advance-Distanz (Tage)</label>
            <input
              type="number"
              className="w-full border rounded-xl px-3 py-2"
              value={assumptions.finance.advanceDays}
              onChange={(e) => setAssumptions((a) => ({ ...a, finance: { ...a.finance, advanceDays: Number(e.target.value) } }))}
            />
          </div>
        </section>

        {/* Table */}
        <section className="bg-white rounded-2xl p-4 shadow border">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold">Angebote</h2>
            <span className="text-sm text-neutral-600">Basis: {assumptions.baseMarket}, {assumptions.baseCurrency}/mt</span>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="text-left text-neutral-600">
                <tr>
                  <th className="py-2 pr-4">#</th>
                  <th className="py-2 pr-4">Supplier</th>
                  <th className="py-2 pr-4">Incoterm</th>
                  <th className="py-2 pr-4">Payment</th>
                  <th className="py-2 pr-4">Qty (mt)</th>
                  <th className="py-2 pr-4">Original</th>
                  <th className="py-2 pr-4">→ USD/mt</th>
                  {showNormalized && (
                    <>
                      <th className="py-2 pr-4">Norm (USD/mt)</th>
                      <th className="py-2 pr-4">Δ vs LME (USD)</th>
                      <th className="py-2 pr-4">Δ vs LME (%)</th>
                      <th className="py-2 pr-4">Rank</th>
                    </>
                  )}
                </tr>
              </thead>
              <tbody>
                {ranked.map((o) => (
                  <tr key={o.id} className={showNormalized && o.rank === 1 ? "bg-green-50" : ""}>
                    <td className="py-2 pr-4 font-mono text-xs">{o.id}</td>
                    <td className="py-2 pr-4">{o.supplier}</td>
                    <td className="py-2 pr-4">{o.incoterm}</td>
                    <td className="py-2 pr-4">{o.paymentTerms}</td>
                    <td className="py-2 pr-4">{prettyNumber(o.quantityMt)}</td>
                    <td className="py-2 pr-4">{prettyCurrency(o.pricePerMt, o.currency)}</td>
                    <td className="py-2 pr-4">{prettyCurrency(o.priceUsd, "USD")}</td>
                    {showNormalized && (
                      <>
                        <td className="py-2 pr-4 font-semibold">{prettyCurrency(o.normalizedUsdMt, "USD")}</td>
                        <td className={`py-2 pr-4 ${o.deltaUsd < 0 ? "text-green-700" : "text-red-700"}`}>{prettyCurrency(o.deltaUsd, "USD")}</td>
                        <td className={`py-2 pr-4 ${o.deltaPct < 0 ? "text-green-700" : "text-red-700"}`}>{o.deltaPct.toFixed(2)}%</td>
                        <td className="py-2 pr-4 font-semibold">{o.rank}</td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="text-xs text-neutral-500 mt-3">
            Vereinfachte Regeln: (1) FX-Konversion in USD, (2) Zahlungsbedingungen → Barzahlung am Lieferzeitpunkt, (3) Incoterms → CIF Rotterdam per fixem Zuschlag/Abschlag. Alle Zahlen demohaft.
          </p>
        </section>

        {/* Delta % vs LME chart */}
        {showNormalized && (
          <section className="bg-white rounded-2xl p-4 shadow border">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-semibold">Δ vs LME (%) – Normalisierte Angebote</h2>
              <span className="text-sm text-neutral-600">LME: {prettyCurrency(assumptions.lmePriceUsdMt, "USD")}/mt</span>
            </div>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData} margin={{ left: 10, right: 10, top: 10, bottom: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" interval={0} angle={0} height={40} />
                  <YAxis tickFormatter={(v) => `${v}%`} />
                  <Tooltip formatter={(v) => `${v}%`} />
                  <Line type="monotone" dataKey="pct" dot />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </section>
        )}

        {/* Legend / Explainer */}
        <section className="text-sm text-neutral-700">
          <details className="bg-white rounded-2xl p-4 shadow border">
            <summary className="cursor-pointer font-semibold">Wie wird normalisiert?</summary>
            <ol className="list-decimal ml-5 mt-2 space-y-1">
              <li><span className="font-medium">Währung:</span> Originalpreis → USD via FX (EUR→USD, CNY→USD).</li>
              <li><span className="font-medium">Zahlungsbedingung:</span> auf Barzahlung am Lieferzeitpunkt:
                <ul className="list-disc ml-5">
                  <li>Net X → PV: Preis / (1 + r · X/360)</li>
                  <li>LC at sight → +LC-Gebühr (z. B. 0,5%)</li>
                  <li>Advance 20% → +Zinskosten auf 20% für ~AdvanceDays</li>
                </ul>
              </li>
              <li><span className="font-medium">Incoterm:</span> Umrechnung auf CIF Rotterdam über feste Zu-/Abschläge (Demo-Werte).</li>
              <li><span className="font-medium">Vergleich zum LME:</span> Δ% = (Norm − LME) / LME.</li>
            </ol>
          </details>
        </section>
      </div>
    </div>
  );
}
