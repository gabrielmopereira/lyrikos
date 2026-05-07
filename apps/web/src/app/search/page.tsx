import type { Metadata } from "next";

import SearchResults from "@/app/search/results";
import Header from "@/components/header";
import { searchTracks, type SearchResponse } from "@/lib/api";

const SEARCH_PAGE_LIMIT = 50;

const metadata: Metadata = {
  description: "Search results on Lyrikos",
  title: "Search",
};

type Props = {
  searchParams: Promise<{ q?: string }>;
};

const Page = async ({ searchParams }: Props) => {
  const { q = "" } = await searchParams;
  const trimmed = q.trim();

  let result: SearchResponse | null = null;

  if (trimmed) {
    try {
      result = await searchTracks(trimmed, SEARCH_PAGE_LIMIT);
    } catch {
      result = { data: [], total: 0 };
    }
  }

  return (
    <div>
      <Header />
      <SearchResults query={trimmed} result={result} />
    </div>
  );
};

export { metadata };

export default Page;
