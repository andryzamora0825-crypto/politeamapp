// Auth callback handled by Clerk - this route is no longer needed.
import { NextResponse } from "next/server";
export async function GET() {
  return NextResponse.redirect(new URL("/", process.env.NEXT_PUBLIC_CLERK_SIGN_IN_URL || "/"));
}
