import { useEffect } from "react";
import { getCoreAppUrl } from "@/lib/runtime";

export default function RedirectingPage() {
  useEffect(() => {
    const token = new URLSearchParams(window.location.search).get("token");
    const destination = getCoreAppUrl(token || undefined);
    window.location.replace(destination);
  }, []);

  return null;
}
