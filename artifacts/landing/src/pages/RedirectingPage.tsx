import { useEffect } from "react";
import { getWakePageUrl } from "@/lib/runtime";

export default function RedirectingPage() {
  useEffect(() => {
    const token = new URLSearchParams(window.location.search).get("token");
    const destination = getWakePageUrl(token || undefined);
    window.location.replace(destination);
  }, []);

  return null;
}
