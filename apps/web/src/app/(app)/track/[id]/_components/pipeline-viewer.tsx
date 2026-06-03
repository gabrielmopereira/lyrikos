"use client";

import { Alert, AlertDescription, AlertTitle } from "@repo/ui/components/alert";
import { TextType } from "@repo/ui/components/text-type";
import { useRouter } from "next/navigation";
import { startTransition, useCallback, useEffect, useMemo, useReducer, useRef } from "react";

import type { PipelineEvent } from "@/lib/api";
import { pipelineEventSchema } from "@/lib/api";

import { useLanguage } from "./language-provider";

const PIPELINE_PHASES = ["lyrics", "research", "translation"] as const;
const PHASE_ORDER: ReadonlyArray<PhaseKey> = ["lyrics", "research", "translation"];

const PIPELINE_STATUSES = ["started", "cached", "done", "skipped", "failed"] as const;
const TERMINAL_STATUSES = new Set<PhaseStatus>(["cached", "done", "skipped", "failed"]);

type PhaseKey = "lyrics" | "research" | "translation";
type PhaseStatus = "pending" | "running" | "cached" | "done" | "skipped" | "failed";

type PhaseError = { code: string; message: string };

type PhaseState = {
  error?: PhaseError;
  label: string;
  reason?: string;
  status: PhaseStatus;
};

type PipelineState = {
  error?: string;
  messages: Array<string>;
  overall: "running" | "complete" | "crashed";
  phases: Record<PhaseKey, PhaseState>;
};

const SEED_MESSAGE = "setting things up...";

const INITIAL_STATE: PipelineState = {
  messages: [SEED_MESSAGE],
  overall: "running",
  phases: {
    lyrics: { label: "Lyrics fetch", status: "pending" },
    research: { label: "Research track", status: "pending" },
    translation: { label: "Translation", status: "pending" },
  },
};

// Each event becomes one line in the ticker queue. Keep them short and lowercase
// to match the hero subtext styling.
const STARTED_MESSAGES: Record<PhaseKey, string> = {
  lyrics: "fetching lyrics",
  research: "researching track",
  translation: "translating track",
};

const CACHED_MESSAGES: Record<PhaseKey, string> = {
  lyrics: "lyrics found in cache",
  research: "research found in cache",
  translation: "translation found in cache",
};

const DONE_MESSAGES: Record<PhaseKey, string> = {
  lyrics: "lyrics found",
  research: "research complete",
  translation: "track translated",
};

const FAILED_MESSAGES: Record<PhaseKey, string> = {
  lyrics: "couldn't fetch lyrics",
  research: "couldn't research the track",
  translation: "couldn't translate",
};

const SKIP_MESSAGES: Record<string, string> = {
  languages_mutually_intelligible: "already in your language",
  lyrics_instrumental: "instrumental — nothing to translate",
  lyrics_not_found: "no lyrics to translate",
  no_translatable_content: "nothing to translate",
};

const eventToMessage = (event: PipelineEvent): string => {
  switch (event.status) {
    case "started": {
      return STARTED_MESSAGES[event.phase];
    }

    case "cached": {
      return CACHED_MESSAGES[event.phase];
    }

    case "done": {
      return DONE_MESSAGES[event.phase];
    }

    case "failed": {
      return FAILED_MESSAGES[event.phase];
    }

    case "skipped": {
      return (event.reason && SKIP_MESSAGES[event.reason]) || "step skipped";
    }

    default: {
      return "working";
    }
  }
};

const appendMessage = (messages: Array<string>, message: string): Array<string> =>
  messages.at(-1) === message ? messages : [...messages, message];

type Action =
  | { event: PipelineEvent; kind: "event" }
  | { kind: "crash"; message: string }
  | { kind: "reset" };

const reducer = (state: PipelineState, action: Action): PipelineState => {
  if (action.kind === "reset") {
    return INITIAL_STATE;
  }

  if (action.kind === "crash") {
    return {
      ...state,
      error: action.message,
      messages: appendMessage(state.messages, "something went wrong"),
      overall: "crashed",
    };
  }

  const { event } = action;

  const key = event.phase;
  const current = state.phases[key];

  const next: PhaseState = {
    ...current,
    error: event.error ?? current.error,
    reason: event.reason ?? current.reason,
    status: event.status === "started" ? "running" : event.status,
  };

  const phases = { ...state.phases, [key]: next };

  const allTerminal = PHASE_ORDER.every((k) => TERMINAL_STATUSES.has(phases[k].status));
  const becameComplete = allTerminal && state.overall === "running";

  let messages = appendMessage(state.messages, eventToMessage(event));

  if (becameComplete) {
    messages = appendMessage(messages, "refreshing");
  }

  return {
    ...state,
    messages,
    overall: allTerminal && state.overall !== "crashed" ? "complete" : state.overall,
    phases,
  };
};

type Props = {
  trackId: string;
};

const PipelineViewer = ({ trackId }: Props) => {
  const router = useRouter();
  const { target } = useLanguage();
  const [state, dispatch] = useReducer(reducer, INITIAL_STATE);
  const didRefreshRef = useRef(false);

  useEffect(() => {
    const baseUrl = process.env.NEXT_PUBLIC_API_URL;

    if (!baseUrl) {
      throw new Error("NEXT_PUBLIC_API_URL is not set");
    }

    // Start each run (mount, or a target-language change while mounted) from a
    // fresh queue so stale messages from a previous run don't carry over.
    dispatch({ kind: "reset" });
    didRefreshRef.current = false;

    const url = `${baseUrl}/api/v1/track/${encodeURIComponent(trackId)}/pipeline?lang=${encodeURIComponent(target.code)}`;
    const es = new EventSource(url, { withCredentials: true });

    const handleEvent = (raw: string) => {
      try {
        const parsed = pipelineEventSchema.safeParse(JSON.parse(raw));

        if (parsed.success) {
          dispatch({ event: parsed.data, kind: "event" });

          // Close on phase failure to suppress EventSource auto-reconnect,
          // which would otherwise re-trigger the pipeline a few seconds later.
          if (parsed.data.status === "failed") {
            es.close();
          }
        }
      } catch {
        // Malformed JSON — ignore this event.
      }
    };

    const listeners: Array<[string, (ev: MessageEvent) => void]> = [];

    for (const phase of PIPELINE_PHASES) {
      for (const status of PIPELINE_STATUSES) {
        const name = `${phase}:${status}`;
        const fn = (ev: MessageEvent) => handleEvent(ev.data);

        es.addEventListener(name, fn);
        listeners.push([name, fn]);
      }
    }

    const handleCrash = (ev: MessageEvent) => {
      let message = "Pipeline crashed unexpectedly.";

      try {
        const data: unknown = JSON.parse(ev.data);

        if (
          data !== null &&
          typeof data === "object" &&
          "message" in data &&
          typeof data.message === "string"
        ) {
          message = data.message;
        }
      } catch {
        // Use default message.
      }

      dispatch({ kind: "crash", message });
      es.close();
    };

    es.addEventListener("pipeline:crashed", handleCrash);
    listeners.push(["pipeline:crashed", handleCrash]);

    return () => {
      for (const [name, fn] of listeners) {
        es.removeEventListener(name, fn);
      }
      es.close();
    };
  }, [trackId, target.code]);

  const triggerRefresh = useCallback(() => {
    if (didRefreshRef.current) {
      return;
    }

    didRefreshRef.current = true;
    startTransition(() => {
      router.refresh();
    });
  }, [router]);

  // Refresh once the ticker has surfaced the final "refreshing" line, so the
  // whole narrative plays out before the finished view swaps in.
  const handleTickerComplete = useCallback(() => {
    if (state.overall === "complete") {
      triggerRefresh();
    }
  }, [state.overall, triggerRefresh]);

  // Safety net: refresh even if the ticker never reports it caught up.
  useEffect(() => {
    if (state.overall !== "complete") {
      return;
    }

    const timer = setTimeout(triggerRefresh, 8000);
    return () => clearTimeout(timer);
  }, [state.overall, triggerRefresh]);

  const failedPhases = useMemo(
    () => PHASE_ORDER.filter((k) => state.phases[k].status === "failed"),
    [state.phases],
  );

  const heroHeadline = state.overall === "crashed" ? "Try again." : "One moment.";

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="m-auto flex flex-col gap-8">
        <div className="flex flex-col items-center justify-center gap-6">
          <div className="flex flex-col gap-3">
            <h2 className="font-serif text-5xl leading-none font-medium tracking-tight text-foreground">
              {heroHeadline}
            </h2>

            <div className="flex items-baseline justify-center gap-1 font-mono text-xs tracking-widest text-marble-dim lowercase italic">
              <TextType
                deletingSpeed={20}
                key={target.code}
                loop={false}
                onComplete={handleTickerComplete}
                pauseDuration={1000}
                text={state.messages}
                typingSpeed={40}
              />
            </div>
          </div>
        </div>

        <div className="m-auto flex flex-wrap gap-3">
          {PHASE_ORDER.map((key, index) => {
            const { label, status } = state.phases[key];

            return (
              <div
                className="group flex items-center gap-3 rounded-full border border-primary/40 bg-neutral-600/20 px-5 py-3 transition-colors data-[status=cached]:border-secondary/40 data-[status=failed]:border-destructive data-[status=pending]:border-glass-border data-[status=pending]:bg-muted data-[status=running]:bg-primary"
                data-status={status}
                key={key}
              >
                <span className="size-2.5 rounded-full border border-primary bg-primary group-data-[status=cached]:border-secondary group-data-[status=cached]:bg-secondary group-data-[status=failed]:border-border group-data-[status=failed]:bg-destructive group-data-[status=pending]:border-muted-foreground group-data-[status=pending]:bg-muted group-data-[status=running]:animate-[pulse_1.5s_ease-in-out_infinite] group-data-[status=running]:border-black group-data-[status=running]:bg-black" />

                <span className="font-mono text-xs tracking-widest uppercase group-data-[status=failed]:text-destructive group-data-[status=pending]:text-muted-foreground group-data-[status=running]:text-black group-data-[status=skipped]:text-muted-foreground group-data-[status=skipped]:line-through">
                  0{index + 1} · {label}
                </span>
              </div>
            );
          })}
        </div>

        {failedPhases.map((key) => {
          const { error, label } = state.phases[key];

          return (
            <Alert key={key} variant="destructive">
              <AlertTitle>{label} failed</AlertTitle>
              <AlertDescription>{error?.message ?? "Something went wrong."}</AlertDescription>
            </Alert>
          );
        })}

        {state.overall === "crashed" && <Alert tone="warning">{state.error}</Alert>}
      </div>
    </div>
  );
};

export default PipelineViewer;
