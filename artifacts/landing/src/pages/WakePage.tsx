import { useEffect, useMemo } from "react";
import { getCoreAppUrl } from "@/lib/runtime";

export default function WakePage() {
  const params = useMemo(() => new URLSearchParams(window.location.search), []);
  const token = params.get("token") || undefined;
  const requestedTarget = params.get("target");
  const destination = requestedTarget || getCoreAppUrl(token);

  useEffect(() => {
    window.location.replace(destination);
  }, [destination]);

  return null;
}
