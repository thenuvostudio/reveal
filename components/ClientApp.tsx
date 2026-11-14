"use client";
import dynamic from "next/dynamic";

// The whole app lives in the browser (IndexedDB, File System Access, contenteditable), so skip server rendering.
const App = dynamic(() => import("./App"), { ssr: false });
export default function ClientApp() { return <App />; }
