import { clerkMiddleware } from "@clerk/nextjs/server";
import { NextResponse, type NextRequest, type NextFetchEvent } from "next/server";
import { accountAuthConfigured, accountOrigins } from "./server/authConfig";

export default function proxy(request: NextRequest, event: NextFetchEvent) {
  if (!accountAuthConfigured()) return NextResponse.next();
  // Pages and API handlers perform their own checks; this verifies session context.
  return clerkMiddleware({ authorizedParties: accountOrigins() })(request, event);
}

export const config = {
  matcher: ["/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|txt|xml)).*)", "/api/(.*)"],
};
