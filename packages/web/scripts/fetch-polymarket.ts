/**
 * Fetch top Polymarket events at build time
 * Run: bun scripts/fetch-polymarket.ts
 */

const POLYMARKET_API = "https://gamma-api.polymarket.com/events?order=volume&ascending=false&active=true&closed=false&limit=5";

interface PolymarketEvent {
  id: string;
  title: string;
  volume: number;
}

async function fetchPolymarketEvents(): Promise<PolymarketEvent[]> {
  const res = await fetch(POLYMARKET_API);
  const data = await res.json();

  return data.map((e: any) => ({
    id: e.id,
    title: e.title,
    volume: e.volume,
  }));
}

async function main() {
  console.log("Fetching Polymarket events...");

  try {
    const events = await fetchPolymarketEvents();
    const output = JSON.stringify(events, null, 2);

    const outPath = new URL("../src/data/polymarket-events.json", import.meta.url);
    await Bun.write(outPath, output);

    console.log(`Wrote ${events.length} events to src/data/polymarket-events.json`);
    events.forEach((e) => console.log(`  - ${e.title}`));
  } catch (err) {
    console.error("Failed to fetch:", err);
    process.exit(1);
  }
}

main();
