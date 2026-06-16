"use client";

import { useEffect, useState } from "react";
import { api, QuoteRow, Briefing } from "@/lib/api";
import AddTickerForm from "@/components/invest/AddTickerForm";
import Watchlist from "@/components/invest/Watchlist";
import BriefingCard from "@/components/invest/BriefingCard";

export default function InvestPage() {
  const [rows, setRows] = useState<QuoteRow[]>([]);
  const [briefing, setBriefing] = useState<Briefing | null>(null);

  useEffect(() => {
    api.invest.watchlist().then(setRows).catch(console.error);
    api.invest.latestBriefing().then(setBriefing).catch(console.error);
  }, []);

  function handleAdded(row: QuoteRow) {
    setRows((prev) => {
      if (prev.find((r) => r.ticker === row.ticker)) return prev;
      return [...prev, row];
    });
  }

  function handleDeleted(ticker: string) {
    setRows((prev) => prev.filter((r) => r.ticker !== ticker));
  }

  return (
    <div>
      <h1 className="text-xl font-semibold text-text mb-6">Investment Research</h1>
      <AddTickerForm onAdded={handleAdded} />
      <Watchlist rows={rows} onDeleted={handleDeleted} />
      <BriefingCard initial={briefing} />
    </div>
  );
}
