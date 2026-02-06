import { useEffect, useMemo, useState } from "react";
import { useWidget, WidgetMetadata, McpUseProvider } from "mcp-use/react";
import { AppsSDKUIProvider } from "@openai/apps-sdk-ui/components/AppsSDKUIProvider";
import { Link } from "react-router";
import "../styles.css";

import { propSchema, type MuscleWikiProps } from "./types";
import { UI_COPY } from "./constants";

export const widgetMetadata: WidgetMetadata = {
  description: "Browse MuscleWiki muscle groups and exercises",
  props: propSchema,
  metadata: {
    csp: {
      connectDomains: [],
      resourceDomains: ["https://musclewiki-api.p.rapidapi.com", "https://media.musclewiki.com"],
    },
  },
};

const MuscleWikiExercisesWidget: React.FC = () => {
  const { props, callTool } = useWidget<MuscleWikiProps>();
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<Array<Record<string, unknown>>>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [queryInput, setQueryInput] = useState(props?.query ?? "");
  const [lastQuery, setLastQuery] = useState("");
  const [selectedExercise, setSelectedExercise] = useState<Record<string, unknown> | null>(null);

  useEffect(() => {
    if (props?.query) {
      setQueryInput(props.query);
      runSearch(props.query);
    }
  }, [props?.query]);

  const runSearch = async (rawQuery: string) => {
    const normalized = rawQuery.trim();
    if (!normalized) return;

    setIsSearching(true);
    setError(null);
    setSelectedExercise(null);
    try {
      const toolPayload = {
        query: normalized,
        limit: 10,
      };

      console.log("[Widget] Calling tool with payload:", toolPayload);
      const response = await callTool("musclewiki-search-v3", toolPayload);
      const responsePayload = (response as any)?.result ?? response;

      // Recursive helper to find results array in nested structures
      const findResults = (data: any): Array<Record<string, unknown>> | null => {
        if (!data) return null;

        // Direct results array
        if (Array.isArray(data)) {
          if (data.length > 0 && typeof data[0] === 'object') return data;
          if (data.length === 0) return [];
        }

        // Check for 'results' properties
        if (Array.isArray(data?.results)) return data.results;
        if (Array.isArray(data?.structuredContent?.results)) return data.structuredContent.results;

        // Check for MCP 'content' array with text items
        if (Array.isArray(data?.content)) {
          for (const item of data.content) {
            if (item?.type === 'text' && typeof item?.text === 'string') {
              try {
                const parsed = JSON.parse(item.text);
                const found = findResults(parsed);
                if (found !== null) return found;
              } catch (e) { }
            }
          }
        }

        // If data itself is a string string, try to parse it
        if (typeof data === 'string' && data.trim().startsWith('{')) {
          try {
            const parsed = JSON.parse(data);
            const found = findResults(parsed);
            if (found !== null) return found;
          } catch (e) { }
        }

        return null;
      };

      const found = findResults(responsePayload);
      const dataResults = found || [];
      setResults(dataResults);
      setLastQuery(normalized);
    } catch (err) {
      const message = err instanceof Error ? err.message : UI_COPY.error;
      if (message.includes("Missing RapidAPI key")) {
        setError(UI_COPY.missingKey);
      } else {
        setError(message || UI_COPY.error);
      }
    } finally {
      setIsSearching(false);
    }
  };

  const getFirstString = (value: unknown): string => {
    if (typeof value === "string") return value;
    if (Array.isArray(value)) {
      const entry = value.find((item) => typeof item === "string");
      return typeof entry === "string" ? entry : "";
    }
    return "";
  };

  const getStringArray = (value: unknown): string[] => {
    if (Array.isArray(value)) {
      return value.filter((item) => typeof item === "string") as string[];
    }
    if (typeof value === "string") return [value];
    return [];
  };

  const getExerciseName = (exercise: Record<string, unknown>) => {
    return (
      getFirstString(exercise.name) ||
      getFirstString(exercise.title) ||
      getFirstString(exercise.exercise) ||
      "Untitled exercise"
    );
  };

  const getExerciseDescription = (exercise: Record<string, unknown>) => {
    const raw =
      getFirstString(exercise.description) ||
      getFirstString(exercise.instructions) ||
      getFirstString(exercise.notes) ||
      "";

    // Strip HTML tags if present (API typically returns HTML)
    const text = raw.replace(/<[^>]*>?/gm, '');

    if (text) return text;

    // Handle 'steps' array if present
    if (Array.isArray(exercise.steps)) {
      return exercise.steps.filter((s) => typeof s === 'string').join('\n');
    }

    return "";
  };

  const getExerciseImage = (exercise: Record<string, unknown>) => {
    const candidate =
      getFirstString(exercise.imageUrl) ||
      getFirstString(exercise.image_url) ||
      getFirstString(exercise.image) ||
      getFirstString(exercise.thumbnail) ||
      getFirstString(exercise.thumbnail_url) ||
      getFirstString(exercise.gif_url) ||
      getFirstString(exercise.video_url) ||
      getFirstString(exercise.url);

    getFirstString(exercise.gif_url) ||
      getFirstString(exercise.video_url) ||
      getFirstString(exercise.url);

    if (candidate && candidate.startsWith("http")) return candidate;

    // Check for videos array with og_image
    if (Array.isArray(exercise.videos) && exercise.videos.length > 0) {
      console.log('Checking videos for images:', exercise.videos);
      const firstVideo = exercise.videos[0];
      if (firstVideo && typeof firstVideo === 'object') {
        // Try to find a male/front video or just take the first one
        const bestVideo = exercise.videos.find((v: any) => v.gender === 'male' && v.angle === 'front') || firstVideo;
        const videoImage = (bestVideo as any)?.og_image;
        console.log('Selected video image:', videoImage);
        if (typeof videoImage === 'string' && videoImage.startsWith('http')) {
          // Use our local proxy to attach headers
          return `/api/image-proxy?url=${encodeURIComponent(videoImage)}`;
        }
      }
    }

    if (candidate && candidate.startsWith("http")) {
      // Use our local proxy to attach headers
      return `/api/image-proxy?url=${encodeURIComponent(candidate)}`;
    }

    return "";
  };

  const getExerciseMeta = (exercise: Record<string, unknown>) => {
    const muscles = [
      ...getStringArray(exercise.muscles),
      ...getStringArray(exercise.muscle_groups),
      ...getStringArray(exercise.primary_muscles),
      ...getStringArray(exercise.secondary_muscles),
      ...getStringArray(exercise.target),
      ...getStringArray(exercise.body_part),
    ];

    return {
      equipment: getFirstString(exercise.equipment) || getFirstString(exercise.category),
      level: getFirstString(exercise.level) || getFirstString(exercise.difficulty),
      muscles: Array.from(new Set(muscles)).filter(Boolean),
    };
  };

  const resultsLabel = useMemo(() => {
    return lastQuery ? `Showing results for "${lastQuery}"` : "";
  }, [lastQuery]);

  return (
    <McpUseProvider debugger viewControls autoSize>
      <AppsSDKUIProvider linkComponent={Link}>
        <div className="relative bg-surface-elevated border border-default rounded-3xl overflow-hidden flex flex-col min-h-[500px]">

          {/* Header Section */}
          <div className="p-6 pb-2">
            <h2 className="heading-xl">{UI_COPY.title}</h2>
            <p className="text-md mt-2 text-secondary">{UI_COPY.subtitle}</p>

            <div className="mt-6 flex gap-3">
              <input
                className="flex-1 rounded-full border border-default bg-surface px-5 py-3 text-sm focus:ring-2 focus:ring-info outline-none shadow-sm"
                placeholder={UI_COPY.searchPlaceholder}
                value={queryInput}
                onChange={(event) => setQueryInput(event.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && queryInput.trim()) {
                    setResults([]);
                    runSearch(queryInput);
                  }
                }}
              />
              <button
                className="rounded-full bg-black dark:bg-white text-white dark:text-black px-6 py-3 text-sm font-semibold hover:opacity-90 active:scale-95 transition-all shadow-md"
                type="button"
                onClick={() => {
                  if (queryInput.trim()) {
                    setResults([]);
                    runSearch(queryInput);
                  }
                }}
              >
                {UI_COPY.searchCta}
              </button>
            </div>

            {error && <p className="text-danger mt-4 text-sm bg-danger/10 p-3 rounded-lg">{error}</p>}

            {resultsLabel && !isSearching && !error && (
              <p className="text-sm text-secondary mt-4 ml-1">{resultsLabel}</p>
            )}
          </div>

          {/* Results Carousel Area */}
          <div className="flex-1 relative w-full overflow-hidden">
            {isSearching ? (
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="flex flex-col items-center gap-3">
                  <div className="w-8 h-8 border-4 border-default border-t-transparent rounded-full animate-spin"></div>
                  <p className="text-secondary text-sm">{UI_COPY.loadingResults}</p>
                </div>
              </div>
            ) : results.length > 0 ? (
              <div className="carousel-scroll-container flex gap-4 overflow-x-auto snap-x snap-mandatory px-6 py-4 pb-8 w-full h-full items-center [&::-webkit-scrollbar]:hidden">
                {results.map((exercise, index) => {
                  const name = getExerciseName(exercise);
                  const imageUrl = getExerciseImage(exercise);
                  const meta = getExerciseMeta(exercise);
                  const key = getFirstString(exercise.id) || `${name}-${index}`;

                  return (
                    <div
                      key={key}
                      className="carousel-item relative shrink-0 snap-center w-72 h-96 rounded-3xl overflow-hidden cursor-pointer shadow-lg hover:shadow-2xl hover:scale-[1.02] transition-all duration-300 group bg-surface"
                      onClick={() => setSelectedExercise(exercise)}
                    >
                      {/* Full Background Image */}
                      {imageUrl ? (
                        <img
                          src={imageUrl}
                          alt={name}
                          className="absolute inset-0 w-full h-full object-cover"
                          loading="lazy"
                        />
                      ) : (
                        <div className="absolute inset-0 bg-surface-elevated flex items-center justify-center">
                          <span className="text-secondary text-xs">No preview</span>
                        </div>
                      )}

                      {/* Gradient Overlay */}
                      <div className="absolute inset-0 bg-gradient-to-t from-black via-black/60 to-transparent group-hover:via-black/70 transition-all" />

                      {/* Content Overlay */}
                      <div className="absolute inset-0 p-5 flex flex-col justify-end text-white">
                        <div className="transform translate-y-2 group-hover:translate-y-0 transition-transform duration-300">
                          {meta.level && (
                            <span className="inline-block px-2 py-0.5 rounded-md bg-white/20 backdrop-blur-sm text-[10px] font-bold uppercase tracking-wider mb-2">
                              {meta.level}
                            </span>
                          )}
                          <h3 className="text-xl font-bold leading-tight mb-1 line-clamp-2 shadow-black drop-shadow-md !text-white">
                            {name}
                          </h3>
                          <p className="text-sm text-gray-300 line-clamp-1">
                            {meta.muscles[0] || "General"} • {meta.equipment || "Bodyweight"}
                          </p>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : !isSearching && lastQuery ? (
              <div className="flex flex-col items-center justify-center h-48 text-secondary">
                <p>{UI_COPY.emptyResults}</p>
                <button onClick={() => setQueryInput("")} className="mt-2 text-info hover:underline text-sm">Clear search</button>
              </div>
            ) : null}
          </div>

          {/* Details Modal / Overlay */}
          {selectedExercise && (
            <div className="absolute inset-0 z-50 bg-surface flex flex-col animate-in fade-in duration-200">
              <div className="flex items-center justify-between p-4 border-b border-default bg-surface/50">
                <h3 className="font-bold text-lg truncate pr-4">{getExerciseName(selectedExercise)}</h3>
                <button
                  onClick={() => setSelectedExercise(null)}
                  className="p-2 rounded-full hover:bg-default/10 transition-colors"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18" /><path d="m6 6 12 12" /></svg>
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-6">
                <div className="aspect-video w-full rounded-2xl overflow-hidden bg-black mb-6 shadow-md border border-default">
                  {getExerciseImage(selectedExercise) && (
                    <img
                      src={getExerciseImage(selectedExercise)}
                      alt={getExerciseName(selectedExercise)}
                      className="w-full h-full object-contain"
                    />
                  )}
                </div>

                <div className="space-y-6">
                  <div className="flex flex-wrap gap-2">
                    {getExerciseMeta(selectedExercise).muscles.map(m => (
                      <span key={m} className="px-3 py-1 rounded-full bg-info/10 text-info text-xs font-medium border border-info/20">
                        {m}
                      </span>
                    ))}
                    {getExerciseMeta(selectedExercise).level && (
                      <span className="px-3 py-1 rounded-full bg-warning/10 text-warning text-xs font-medium border border-warning/20">
                        {getExerciseMeta(selectedExercise).level}
                      </span>
                    )}
                  </div>

                  <div className="prose dark:prose-invert max-w-none">
                    <h4 className="text-sm font-semibold uppercase tracking-wider text-secondary mb-2">Instructions</h4>
                    <p className="text-default leading-relaxed whitespace-pre-line text-sm">
                      {getExerciseDescription(selectedExercise) || "No instructions provided."}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

        </div>
      </AppsSDKUIProvider>
    </McpUseProvider>
  );
};

export default MuscleWikiExercisesWidget;
