'use client';

import type { RaiseStepState } from '../../../../lib/api/ops/escalation';
import { RaiseProgress } from '../types';

const STEPS: { key: "deal" | "ticket"; label: string; running: string; done: string }[] = [
  { key: "deal", label: "Deal in Kylas", running: "Finding the order's deal in Kylas…", done: "Deal ready in Kylas" },
  { key: "ticket", label: "Escalation ticket", running: "Creating the escalation ticket…", done: "Escalation ticket created" },
];

function StepIcon({ state }: { state: RaiseStepState }) {
  if (state === "done") {
    return (
      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-green-500 text-white">
        <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
        </svg>
      </span>
    );
  }
  if (state === "failed") {
    return (
      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-red-500 text-white text-xs font-bold">!</span>
    );
  }
  if (state === "running" || state === "retrying") {
    return (
      <span className={`flex h-6 w-6 items-center justify-center rounded-full ${state === "retrying" ? "bg-amber-100" : "bg-yellow-100"}`}>
        <svg className={`h-3.5 w-3.5 animate-spin ${state === "retrying" ? "text-amber-600" : "text-yellow-600"}`} fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
        </svg>
      </span>
    );
  }
  return <span className="h-6 w-6 rounded-full border-2 border-gray-200 bg-white" />;
}

function friendlyError(raw: string | null) {
  const text = (raw ?? "").toLowerCase();
  if (/429|rate limit|too many|redis|connect|timeout|timed out|503/.test(text)) {
    return "Kylas is busy right now. Wait a minute, then retry.";
  }
  if (/not found|404/.test(text)) {
    return "Kylas could not find this order's deal. Retry, or use Create Kylas Deal.";
  }
  return "Something went wrong at this step. Retry, or contact tech if it keeps failing.";
}

function stepText(step: typeof STEPS[number], state: RaiseStepState) {
  if (state === "done") return step.done;
  if (state === "running") return step.running;
  if (state === "retrying") return "Kylas is busy — retrying automatically…";
  if (state === "failed") return "Failed at this step";
  return "Waiting";
}

export function RaiseProgressView({ progress, onRetry }: {
  progress: RaiseProgress;
  onRetry: () => void;
}) {
  const reasons = progress.options.map((o) => o.name).join(", ");

  if (progress.status === "success") {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-green-100 bg-green-50 px-3 py-2">
        <StepIcon state="done" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-semibold text-gray-900">{reasons}</p>
          <p className="text-[11px] text-green-700">Escalation ticket created</p>
        </div>
      </div>
    );
  }

  return (
    <div className={`rounded-xl border bg-white p-3 ${progress.status === "failed" ? "border-red-200" : "border-gray-200"}`}>
      <p className="mb-3 truncate text-xs font-semibold text-gray-900">{reasons}</p>
      <ol className="space-y-0">
        {STEPS.map((step, i) => {
          const state = progress.steps[step.key];
          return (
            <li key={step.key} className="flex gap-3">
              <div className="flex flex-col items-center">
                <StepIcon state={state} />
                {i < STEPS.length - 1 && (
                  <span className={`my-1 w-0.5 flex-1 min-h-[18px] ${state === "done" ? "bg-green-300" : "bg-gray-200"}`} />
                )}
              </div>
              <div className="pb-3 min-w-0 flex-1">
                <p className="text-xs font-semibold text-gray-900">{step.label}</p>
                <p className={`text-xs ${state === "failed" ? "text-red-600" : state === "retrying" ? "text-amber-700" : "text-gray-500"}`}>
                  {stepText(step, state)}
                </p>
                {state === "failed" && (
                  <>
                    <p className="mt-1 text-xs text-gray-700">{friendlyError(progress.error)}</p>
                    {progress.error && (
                      <details className="mt-1">
                        <summary className="cursor-pointer text-[10px] text-gray-400">Technical details</summary>
                        <p className="mt-1 break-words text-[10px] text-gray-400">{progress.error}</p>
                      </details>
                    )}
                    <button
                      type="button"
                      onClick={onRetry}
                      className="mt-2 rounded-lg bg-gray-900 px-3 py-1.5 text-xs font-semibold text-yellow-400"
                    >
                      Retry from this step
                    </button>
                  </>
                )}
              </div>
            </li>
          );
        })}
      </ol>
      {progress.status === "slow" && (
        <p className="mt-1 text-xs text-gray-500">
          Still working on it in the background. Do not submit again — it will show in the Status tab.
        </p>
      )}
    </div>
  );
}
