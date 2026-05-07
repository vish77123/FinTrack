import { redirect } from "next/navigation";
import LoginClient from "./LoginClient";

/**
 * Server component wrapper for the login page.
 *
 * Zerodha Kite Connect redirects here after login when the developer console
 * has the redirect URL set to /login (instead of /api/zerodha/callback).
 * We detect the request_token and forward it to the real callback handler.
 */
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const params = await searchParams;
  const requestToken = params["request_token"];
  const status = params["status"];

  if (typeof requestToken === "string" && status === "success") {
    const qs = new URLSearchParams({ request_token: requestToken, status });
    redirect(`/api/zerodha/callback?${qs}`);
  }

  return <LoginClient />;
}
