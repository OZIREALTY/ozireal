import * as React from "react";
import { HouseArt } from "@/components/public/house-art";

/**
 * The New Homes drawings as an SVG string (2026-11-18), for turning into a PNG for
 * email: mail clients do not show inline SVG. Walks the same React elements the website
 * renders, so the email picture is the website picture.
 */

const KEEP_CAMEL = new Set(["viewBox", "preserveAspectRatio"]);
const attr = (k: string) => (k === "className" ? "class" : KEEP_CAMEL.has(k) ? k : k.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`));
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function render(node: React.ReactNode): string {
  if (node == null || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return esc(String(node));
  if (Array.isArray(node)) return node.map(render).join("");
  if (!React.isValidElement(node)) return "";
  const el = node as React.ReactElement<Record<string, unknown>>;
  const { children, ...props } = el.props as { children?: React.ReactNode } & Record<string, unknown>;
  if (el.type === React.Fragment) return render(children);
  if (typeof el.type === "function") return render((el.type as (p: unknown) => React.ReactNode)(el.props));
  const attrs = Object.entries(props)
    .filter(([k, v]) => v != null && v !== false && k !== "key" && typeof v !== "function" && typeof v !== "object")
    .map(([k, v]) => ` ${attr(k)}="${esc(String(v))}"`)
    .join("");
  return `<${String(el.type)}${attrs}>${render(children)}</${String(el.type)}>`;
}

export const HOUSE_KINDS: Record<string, string> = {
  house: "House",
  "house-and-land": "House and land",
  townhouse: "Townhouse",
  apartment: "Apartment",
  warehouse: "Warehouse",
};

export function kindSlug(kind: string | null | undefined): string {
  const k = (kind ?? "").toLowerCase();
  if (k.includes("land")) return "house-and-land";
  if (k.includes("town") || k === "unit") return "townhouse";
  if (k.includes("apartment")) return "apartment";
  if (k.includes("warehouse") || k === "commercial") return "warehouse";
  return "house";
}

export function houseArtSvg(slug: string, index: number, width = 1200): string {
  const kind = HOUSE_KINDS[slug] ?? "House";
  const svg = render(HouseArt({ kind, index, label: `Illustration: a new ${kind.toLowerCase()}` }));
  return svg.replace("<svg ", `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${Math.round((width * 2) / 3)}" `);
}
