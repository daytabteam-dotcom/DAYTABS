import type { ReactNode } from "react";
import { Component } from "react";
import { PanelCardSoft, PanelEyebrow, PanelTitle, PanelSubtitle } from "@/components/panel-system";

export class ErrorBoundary extends Component<
  { name?: string; children: ReactNode },
  { error: Error | null; componentStack: string }
> {
  state = { error: null as Error | null, componentStack: "" };

  static getDerivedStateFromError(error: unknown) {
    return { error: error instanceof Error ? error : new Error("Something went wrong") };
  }

  componentDidCatch(error: Error, info: { componentStack?: string }) {
    // eslint-disable-next-line no-console
    console.error(`[ErrorBoundary${this.props.name ? `:${this.props.name}` : ""}]`, error, info);
    this.setState({ componentStack: info.componentStack ?? "" });
  }

  render() {
    if (!this.state.error) return this.props.children;
    const includeDetails = Boolean(this.state.componentStack || this.state.error.stack);
    return (
      <PanelCardSoft className="border border-red-400/20 bg-red-500/10 p-6">
        <PanelEyebrow>Something broke</PanelEyebrow>
        <PanelTitle className="mt-2 text-2xl">This page failed to load</PanelTitle>
        <PanelSubtitle className="mt-3 max-w-3xl">
          {this.state.error.message}
        </PanelSubtitle>
        <p className="mt-4 text-sm text-white/60">Copy the details below and send them here.</p>
        {includeDetails ? (
          <pre className="mt-4 max-h-80 overflow-auto rounded-lg border border-white/10 bg-black/30 p-3 text-xs leading-5 text-white/70">
            {this.state.error.stack ? `${this.state.error.stack}\n\n` : ""}
            {this.state.componentStack ? `React component stack:${this.state.componentStack}` : ""}
          </pre>
        ) : null}
      </PanelCardSoft>
    );
  }
}
