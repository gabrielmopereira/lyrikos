import { CardContent, CardHeader, CardTitle } from "@repo/ui/components/card";

type PipelineStage = {
  description: string;
  label: string;
  slug: string;
  status: "pending" | "in-progress" | "completed" | "failed";
};

const PIPELINE_STAGES: Array<PipelineStage> = [
  {
    description: "Get track lyrics",
    label: "Lyrics",
    slug: "fetchLyrics",
    status: "pending",
  },
  {
    description: "Research track and lyrics context",
    label: "Research",
    slug: "research",
    status: "pending",
  },
  {
    description: "Translate lyrics",
    label: "Translate",
    slug: "translate",
    status: "pending",
  },
];

const PipelineViewer = () => (
  <>
    <CardHeader>
      <CardTitle>New Track</CardTitle>
    </CardHeader>

    <CardContent>
      {PIPELINE_STAGES.map((stage) => (
        <div key={stage.slug}>
          <p>{stage.label}</p>
          <p>{stage.description}</p>
          <p>{stage.status}</p>
        </div>
      ))}
    </CardContent>
  </>
);

export default PipelineViewer;
