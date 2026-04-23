import { useEffect } from "react";
import { getCoreAppUrl } from "@/lib/runtime";

export default function RedirectingPage() {
  useEffect(() => {
    const token = new URLSearchParams(window.location.search).get("token");
    window.location.replace(getCoreAppUrl(token || undefined));
  }, []);

  return null;
}
