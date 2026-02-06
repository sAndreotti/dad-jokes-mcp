import { useState, useEffect } from "react";
import { useWidget, WidgetMetadata, McpUseProvider } from "mcp-use/react";
import { AppsSDKUIProvider } from "@openai/apps-sdk-ui/components/AppsSDKUIProvider";
import { Link } from "react-router";
import "../styles.css";

import { propSchema, DadJokeProps } from "./types";
import { UI_COPY, EMPTY_STATE } from "./constants";


export const widgetMetadata: WidgetMetadata = {
  description: "Fetch and display a random dad joke to lighten the mood",
  props: propSchema,
  metadata: {
    csp: {
      connectDomains: ["https://icanhazdadjoke.com"],
      resourceDomains: [],
    },
  },
};

const DadJokeWidget: React.FC = () => {
  const { props, isPending, callTool, theme } = useWidget<DadJokeProps>();
  const [data, setData] = useState<DadJokeProps>({ ...EMPTY_STATE, ...props });
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [liked, setLiked] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (props?.joke) {
      setData({ ...EMPTY_STATE, ...props });
      setLiked(false);
      setCopied(false);
    }
  }, [props?.joke]);

  const handleGetJoke = async () => {
    setError(null);
    setIsLoading(true);
    setLiked(false);
    setCopied(false);
    try {
      const response = await callTool("get-dad-joke", {});
      const structured = (response as any).structuredContent;
      const responseProps = (response as any)._meta?.["mcp-use/props"];
      const base = { ...(responseProps ?? {}), ...(structured ?? {}) };
      const textContent = response.content?.find((c: any) => c.type === "text");
      const rawText = textContent?.text ?? "";
      let jokeText = rawText;

      if (rawText.trim().startsWith("{")) {
        try {
          const parsed = JSON.parse(rawText);
          if (parsed?.joke) jokeText = parsed.joke;
          else if (parsed?._meta?.["mcp-use/props"]?.joke) {
            jokeText = parsed._meta["mcp-use/props"].joke;
          }
        } catch { }
      }

      setData({
        id: base?.id ?? "",
        joke: base?.joke ?? jokeText,
      });
    } catch (err) {
      setError(UI_COPY.error);
      setData(EMPTY_STATE);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCopy = () => {
    if (!data.joke) return;
    navigator.clipboard.writeText(data.joke);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <McpUseProvider debugger viewControls autoSize>
      <AppsSDKUIProvider linkComponent={Link}>
        <div className="relative bg-surface-elevated border border-default rounded-3xl p-8 flex flex-col items-center text-center transition-all duration-300">

          <div className="mb-6">
            <h2 className="text-secondary text-sm font-semibold uppercase tracking-widest">{UI_COPY.subtitle}</h2>
          </div>

          <div className="min-h-[120px] flex items-center justify-center w-full">
            {isPending || isLoading ? (
              <div className="animate-pulse flex flex-col items-center">
                <div className="h-4 bg-default/10 rounded w-3/4 mb-3"></div>
                <div className="h-4 bg-default/10 rounded w-1/2"></div>
              </div>
            ) : data.joke ? (
              <div className="relative group">
                <p className="text-default text-2xl font-serif leading-relaxed italic relative z-10 px-4">
                  “{data.joke}”
                </p>
              </div>
            ) : (
              <p className="text-secondary italic">{UI_COPY.empty}</p>
            )}
          </div>

          {error ? <span className="text-danger text-sm mt-4">{error}</span> : null}

          <div className="mt-10 flex items-center gap-4 w-full justify-center">

            <button
              className={`p-3 rounded-full transition-all duration-200 ${liked ? 'bg-red-50 text-red-500 scale-110' : 'bg-surface hover:bg-surface-elevated text-secondary hover:text-default border border-default'}`}
              onClick={() => setLiked(!liked)}
              disabled={!data.joke || isLoading}
              title="Like this joke"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill={liked ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z" />
              </svg>
            </button>

            <button
              className={`rounded-full px-8 py-3 text-sm font-semibold hover:opacity-90 transition-opacity disabled:opacity-50 shadow-lg hover:shadow-xl active:scale-95 transform duration-200`}
              onClick={handleGetJoke}
              disabled={isLoading}
            >
              {isLoading ? UI_COPY.loading : UI_COPY.cta}
            </button>

            <button
              className={`p-3 rounded-full transition-all duration-200 ${copied ? 'bg-green-50 text-green-600' : 'bg-surface hover:bg-surface-elevated text-secondary hover:text-default border border-default'}`}
              onClick={handleCopy}
              disabled={!data.joke || isLoading}
              title="Copy to clipboard"
            >
              {copied ? (
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M20 6 9 17l-5-5" />
                </svg>
              ) : (
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect width="14" height="14" x="8" y="8" rx="2" ry="2" /><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
                </svg>
              )}
            </button>

          </div>
        </div>
      </AppsSDKUIProvider>
    </McpUseProvider>
  );

};

export default DadJokeWidget;
