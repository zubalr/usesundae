import type { SVGProps } from "react";

type IconName =
  | "agent"
  | "audit"
  | "check"
  | "chevron"
  | "desktop"
  | "focus"
  | "mobile"
  | "refresh"
  | "spark"
  | "undo";

export function Icon({ name, ...props }: SVGProps<SVGSVGElement> & { name: IconName }) {
  const common = {
    fill: "none",
    stroke: "currentColor",
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    strokeWidth: 1.8,
  };

  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" {...props} {...common}>
      {name === "agent" ? (
        <>
          <path d="M12 3v3M5.6 5.6l2.1 2.1M18.4 5.6l-2.1 2.1" />
          <rect x="4" y="8" width="16" height="12" rx="4" />
          <path d="M8 13h.01M16 13h.01M9 17h6" />
        </>
      ) : null}
      {name === "audit" ? (
        <>
          <circle cx="11" cy="11" r="6.5" />
          <path d="m16 16 4 4M11 8v6M8 11h6" />
        </>
      ) : null}
      {name === "check" ? <path d="m5 12 4 4L19 6" /> : null}
      {name === "chevron" ? <path d="m9 6 6 6-6 6" /> : null}
      {name === "desktop" ? (
        <>
          <rect x="3" y="4" width="18" height="13" rx="2" />
          <path d="M8 21h8M12 17v4" />
        </>
      ) : null}
      {name === "focus" ? (
        <>
          <path d="M8 3H5a2 2 0 0 0-2 2v3M16 3h3a2 2 0 0 1 2 2v3M8 21H5a2 2 0 0 1-2-2v-3M16 21h3a2 2 0 0 0 2-2v-3" />
          <circle cx="12" cy="12" r="3" />
        </>
      ) : null}
      {name === "mobile" ? (
        <>
          <rect x="7" y="2" width="10" height="20" rx="2.5" />
          <path d="M11 18h2" />
        </>
      ) : null}
      {name === "refresh" ? (
        <>
          <path d="M20 7v5h-5" />
          <path d="M4 17v-5h5" />
          <path d="M18.5 9A7 7 0 0 0 6 6.5L4 9M5.5 15A7 7 0 0 0 18 17.5l2-2.5" />
        </>
      ) : null}
      {name === "spark" ? (
        <>
          <path d="m12 3 1.4 4.6L18 9l-4.6 1.4L12 15l-1.4-4.6L6 9l4.6-1.4L12 3Z" />
          <path d="m18.5 15 .7 2.3 2.3.7-2.3.7-.7 2.3-.7-2.3-2.3-.7 2.3-.7.7-2.3Z" />
        </>
      ) : null}
      {name === "undo" ? (
        <>
          <path d="M9 7 4 12l5 5" />
          <path d="M5 12h8a6 6 0 0 1 6 6" />
        </>
      ) : null}
    </svg>
  );
}
