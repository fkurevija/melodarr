import { NextResponse, type NextRequest } from "next/server";
import { getBasePath } from "@/lib/navigation/base-path";

export function middleware(request: NextRequest) {
  const basePath = getBasePath();
  if (!basePath) {
    return NextResponse.next();
  }

  const { pathname } = request.nextUrl;

  if (pathname === basePath || pathname.startsWith(`${basePath}/`)) {
    const url = request.nextUrl.clone();
    url.pathname = pathname === basePath ? "/discover" : pathname.slice(basePath.length) || "/discover";
    return NextResponse.rewrite(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.png|apple-icon.png).*)"]
};
