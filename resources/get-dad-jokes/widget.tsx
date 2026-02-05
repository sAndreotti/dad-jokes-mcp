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
    const { props, isPending, callTool } = useWidget<DadJokeProps>();
    const [data, setData] = useState<DadJokeProps>({...EMPTY_STATE, ...props});
useEffect(() => {
  if (props?.joke) {
    setData({ ...EMPTY_STATE, ...props });
  }
}, [props?.joke]);


    const [error, setError] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(false); 
    
const handleGetJoke = async () => {
  setError(null);
  setIsLoading(true);
  try {
    const response = await callTool("get-dad-joke", {});

    const structured = (response as any).structuredContent;
    const responseProps = (response as any)._meta?.["mcp-use/props"];
    const base = { ...(responseProps ?? {}), ...(structured ?? {}) };


    // 3) Fallback finale: usa content
    const textContent = response.content?.find((c) => c.type === "text");
    const rawText = textContent?.text ?? "";
    let jokeText = rawText;

    // Se il testo è JSON, estrai "joke"
    if (rawText.trim().startsWith("{")) {
      try {
        const parsed = JSON.parse(rawText);
        if (parsed?.joke) jokeText = parsed.joke;
        else if (parsed?._meta?.["mcp-use/props"]?.joke) {
          jokeText = parsed._meta["mcp-use/props"].joke;
        }
      } catch {}
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

    
    return (
    <McpUseProvider debugger viewControls autoSize>
      <AppsSDKUIProvider linkComponent={Link}>
        <div className="relative bg-surface-elevated border border-default rounded-3xl p-6">
          <h2 className="heading-xl">{UI_COPY.title}</h2>
          <p className="text-md mt-2">{UI_COPY.subtitle}</p>

          <div className="mt-4 flex items-center gap-3">
            <button
              className="rounded-full bg-info text-white px-5 py-2 text-sm font-semibold disabled:opacity-60"
              onClick={handleGetJoke}
              disabled={isLoading}
            >
              {isLoading ? UI_COPY.loading : UI_COPY.cta}
            </button>
            {error ? <span className="text-danger text-sm">{error}</span> : null}
          </div>

          <div className="mt-6">
            {isPending || isLoading ? (
              <p className="text-secondary">{UI_COPY.loading}</p>
            ) : data.joke ? (
              <>
                <p className="text-default text-md">{data.joke}</p>
              </>
            ) : (
              <p className="text-secondary">{UI_COPY.empty}</p>
            )}
          </div>
        </div>
      </AppsSDKUIProvider>
    </McpUseProvider>
    );

};

export default DadJokeWidget;
