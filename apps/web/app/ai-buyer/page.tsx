import type { Metadata } from "next";

import { AutonomousBuyer } from "./autonomous-buyer";

export const metadata: Metadata = {
  title: "Autonomous AI Buyer · StepUp Footwear",
  description:
    "Watch a separate machine client discover StepUp, choose a grounded shoe, prepare a bounded cart, and initiate Razorpay test checkout.",
};

export default function AutonomousBuyerPage() {
  return <AutonomousBuyer />;
}
