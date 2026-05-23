import React from "react";
import { Badge } from "@/components/ui/badge";

export function CreditCostBadge({ cost }: { cost: number }) {
  return (
    <Badge className="border border-amber-400/20 bg-amber-500/10 text-amber-200">
      {cost} credits
    </Badge>
  );
}

