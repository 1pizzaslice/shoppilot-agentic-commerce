import type { Metadata } from "next";
import { headers } from "next/headers";
import type { ReactNode } from "react";

import "./styles.css";

const siteTitle = "StepUp Footwear · powered by ShopPilot";
const siteDescription =
  "Find running, walking, training, trail and casual footwear matched to your size and budget with ShopPilot.";

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const rawHost =
    requestHeaders.get("x-forwarded-host") ??
    requestHeaders.get("host") ??
    "localhost:3000";
  const firstHost = rawHost.split(",")[0]?.trim() ?? "localhost:3000";
  const hostMatch = /^([a-z\d.-]+)(?::(\d{1,5}))?$/i.exec(firstHost);
  const forwardedPort = hostMatch?.[2];
  const portIsValid =
    forwardedPort === undefined ||
    (Number(forwardedPort) > 0 && Number(forwardedPort) <= 65_535);
  const host = hostMatch !== null && portIsValid ? firstHost : "localhost:3000";
  const forwardedProtocol = requestHeaders
    .get("x-forwarded-proto")
    ?.split(",")[0]
    ?.trim();
  const protocol =
    forwardedProtocol === "http" || forwardedProtocol === "https"
      ? forwardedProtocol
      : host.startsWith("localhost") || host.startsWith("127.0.0.1")
        ? "http"
        : "https";
  const metadataBase = new URL(`${protocol}://${host}`);

  return {
    metadataBase,
    title: siteTitle,
    description: siteDescription,
    openGraph: {
      title: siteTitle,
      description: siteDescription,
      images: [
        {
          url: "/og.png",
          width: 1200,
          height: 630,
          alt: "StepUp footwear powered by ShopPilot",
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: siteTitle,
      description: siteDescription,
      images: ["/og.png"],
    },
  };
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
