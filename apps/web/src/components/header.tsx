"use client";

import { Button } from "@repo/ui/components/button";
import {
  Combobox,
  ComboboxInput,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxItem,
  ComboboxList,
  useComboboxAnchor,
} from "@repo/ui/components/combobox";
import { InputGroupAddon } from "@repo/ui/components/input-group";
import { Search } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { KeyboardEvent } from "react";
import { useState } from "react";

import { useSearch } from "@/hooks/use-search";
import type { Track } from "@/lib/api";

const getEmptyMessage = (trimmedQuery: string, isLoading: boolean) => {
  if (trimmedQuery === "") {
    return "Type to search any song.";
  }

  if (isLoading) {
    return "Searching…";
  }

  return "No results.";
};

const Header = () => {
  const router = useRouter();
  const anchorRef = useComboboxAnchor();

  const [query, setQuery] = useState("");
  const { isLoading, results } = useSearch(query);

  const trimmedQuery = query.trim();
  const emptyMessage = getEmptyMessage(trimmedQuery, isLoading);
  const searchHref = trimmedQuery ? `/search?q=${encodeURIComponent(trimmedQuery)}` : null;

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "Enter" || !searchHref) {
      return;
    }

    event.preventDefault();
    router.push(searchHref);
  };

  return (
    <header className="flex w-full items-center justify-between p-4">
      <h1 className="text-2xl">lyrikos</h1>

      <Combobox
        filter={null}
        inputValue={query}
        items={results}
        itemToStringLabel={(item: Track) => item.title}
        onInputValueChange={(next, details) => {
          if (details.reason !== "input-change" && details.reason !== "clear-press") {
            return;
          }

          setQuery(next);
        }}
      >
        <ComboboxInput
          className="h-10 w-lg min-w-64 gap-1 rounded-full px-2"
          onKeyDown={handleKeyDown}
          placeholder="Search any song or artist"
          ref={anchorRef}
          showTrigger={false}
        >
          <InputGroupAddon align="inline-start">
            <Search size={14} />
          </InputGroupAddon>

          <InputGroupAddon align="inline-end">
            <div className="rounded-sm border border-input p-1">
              <p className="pt-px pr-px text-xs leading-3">⌘ K</p>
            </div>
          </InputGroupAddon>
        </ComboboxInput>

        <ComboboxContent anchor={anchorRef} sideOffset={10}>
          <ComboboxEmpty>{emptyMessage}</ComboboxEmpty>

          <ComboboxList>
            {results.map((item) => (
              <ComboboxItem
                key={item.deezerId}
                render={<Link href={`/songs/${item.deezerId}`} />}
                value={item}
              >
                <div
                  aria-hidden
                  className="size-8 shrink-0 rounded bg-muted bg-cover bg-center"
                  style={
                    item.albumCover ? { backgroundImage: `url(${item.albumCover})` } : undefined
                  }
                />

                <div className="flex min-w-0 flex-col">
                  <span className="truncate text-sm">{item.title}</span>
                  <span className="truncate text-xs text-muted-foreground">{item.artistName}</span>
                </div>
              </ComboboxItem>
            ))}

            {searchHref && results.length > 0 && (
              <ComboboxItem
                className="justify-center text-sm font-medium text-muted-foreground"
                key="see-more"
                render={<Link href={searchHref} />}
                value="see-more"
              >
                See more
              </ComboboxItem>
            )}
          </ComboboxList>
        </ComboboxContent>
      </Combobox>

      <Button disabled size="xl">
        Sign in
      </Button>
    </header>
  );
};

export default Header;
