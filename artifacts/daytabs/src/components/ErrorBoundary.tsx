import type { ReactNode } from "react";
import { Component } from "react";
import { PanelCardSoft, PanelEyebrow, PanelTitle, PanelSubtitle } from "@/components/panel-system";

export class ErrorBoundary extends Component<
  { name?: string; children: ReactNode },
  { error: Error | null }
> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: unknown) {
    return { error: error instanceof Error ? error : new Error("Something went wrong") };
  }

  componentDidCatch(error: Error, info: { componentStack?: string }) {
    // eslint-disable-next-line no-console
    console.error(`[ErrorBoundary${this.props.name ? `:${this.props.name}` : ""}]`, error, info);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <PanelCardSoft className="border border-red-400/20 bg-red-500/10 p-6">
        <PanelEyebrow>Something broke</PanelEyebrow>
        <PanelTitle className="mt-2 text-2xl">This page failed to load</PanelTitle>
        <PanelSubtitle className="mt-3 max-w-3xl">
          {this.state.error.message}
        </PanelSubtitle>
        <p className="mt-4 text-sm text-white/60">
          If this keeps happening, open the browser console and share the full stack trace.
        </p>
      </PanelCardSoft>
    );
  }
}

