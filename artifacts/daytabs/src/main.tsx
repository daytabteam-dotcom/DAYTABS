import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { installApiBaseFetchShim } from "./lib/runtime";

installApiBaseFetchShim();

createRoot(document.getElementById("root")!).render(<App />);
