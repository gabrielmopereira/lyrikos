import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@repo/ui/components/card";
import type { Metadata } from "next";

import { searchTracks, type SearchResponse } from "@/lib/api";

import SearchResults from "./results";

const SEARCH_PAGE_LIMIT = 20;

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
    <div className="mx-auto flex min-h-0 w-full max-w-6xl flex-1 flex-col gap-4 p-4">
      <h1 className="font-serif text-5xl">
        Search results for <span className="text-primary">&quot;{trimmed}&quot;</span>
      </h1>

      <Card className="min-h-0 flex-1">
        <CardHeader className="flex h-max" data-divider>
          <CardTitle>Tracks</CardTitle>
          <CardDescription>
            1-20 of {result?.total}
            <span className="px-2">&bull;</span>
            Sorted by relevance
          </CardDescription>
        </CardHeader>

        <CardContent data-flush data-scroll>
          <SearchResults query={trimmed} result={result} />
        </CardContent>

        <CardFooter data-divider />
      </Card>
    </div>
  );
};

export { metadata };

export default Page;
