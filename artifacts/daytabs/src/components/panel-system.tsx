import * as React from "react";
import { cn } from "@/lib/utils";

export function PanelPage({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("panel-page", className)} {...props} />;
}

export function PanelHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("panel-header", className)} {...props} />;
}

export function PanelEyebrow({ className, ...props }: React.HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn("panel-kicker", className)} {...props} />;
}

export function PanelTitle({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return <h1 className={cn("panel-title", className)} {...props} />;
}

export function PanelSubtitle({ className, ...props }: React.HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn("panel-subtitle", className)} {...props} />;
}

export function PanelCard({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("panel-card", className)} {...props} />;
}

export function PanelCardSoft({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("panel-card-soft", className)} {...props} />;
}

export function PanelCardStrong({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("panel-card-strong", className)} {...props} />;
}
