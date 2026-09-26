import { NextResponse, type NextRequest } from "next/server";
import { fromAcceptLanguage, isLang, LANG_COOKIE, LANG_HEADER } from "@/lib/lang";

// Resolves the page language once and hands it to server components as a request header.
// An explicit ?lang= is remembered in a cookie so the choice sticks across pages.
export function middleware(req: NextRequest) {
  const param = req.nextUrl.searchParams.get("lang");
  const cookie = req.cookies.get(LANG_COOKIE)?.value;
  const lang = isLang(param) ? param : isLang(cookie) ? cookie : fromAcceptLanguage(req.headers.get("accept-language"));

  const headers = new Headers(req.headers);
  headers.set(LANG_HEADER, lang);
  const res = NextResponse.next({ request: { headers } });
  if (isLang(param) && param !== cookie) {
    res.cookies.set(LANG_COOKIE, param, { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" });
  }
  return res;
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};
