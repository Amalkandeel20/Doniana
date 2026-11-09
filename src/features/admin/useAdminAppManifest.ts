import { useEffect } from "react";

// Lets the owner add the admin to her phone's home screen as its own app ("DONIANA", opens on
// /admin, no browser bar). Only the admin pages carry these tags, so customers who save the
// public site get the normal website instead.
const TAGS: [string, Record<string, string>][] = [
  ["link", { rel: "manifest", href: "/admin-app/manifest.webmanifest" }],
  ["link", { rel: "apple-touch-icon", href: "/admin-app/apple-touch-icon.png" }],
  ["meta", { name: "apple-mobile-web-app-capable", content: "yes" }],
  ["meta", { name: "mobile-web-app-capable", content: "yes" }],
  ["meta", { name: "apple-mobile-web-app-title", content: "DONIANA" }],
  ["meta", { name: "apple-mobile-web-app-status-bar-style", content: "default" }],
];

export function useAdminAppManifest() {
  useEffect(() => {
    const added = TAGS.map(([tag, attrs]) => {
      const el = document.createElement(tag);
      for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
      document.head.appendChild(el);
      return el;
    });
    return () => added.forEach((el) => el.remove());
  }, []);
}
