import { makeHealthReport } from "@shoppilot/domain";

export const dynamic = "force-dynamic";

export function GET(): Response {
  return Response.json(makeHealthReport("web"));
}
