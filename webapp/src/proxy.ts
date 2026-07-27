import { NextRequest, NextResponse } from "next/server";

// 社員管理画面と、その裏側で使う書き込み系APIだけを簡易パスワードで保護する。
// タッチパネル本体(出欠札ボード)と、そこから使う状態変更APIは対象外(誰でも操作できる)。
function needsAuth(pathname: string, method: string): boolean {
  if (pathname.startsWith("/admin")) return true;
  if (pathname === "/api/employees" && method === "POST") return true;
  if (/^\/api\/employees\/[^/]+$/.test(pathname) && ["PATCH", "DELETE"].includes(method)) {
    return true;
  }
  if (/^\/api\/employees\/[^/]+\/reorder$/.test(pathname)) return true;
  if (/^\/api\/employees\/[^/]+\/current-department$/.test(pathname)) return true;
  return false;
}

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (!needsAuth(pathname, request.method)) {
    return NextResponse.next();
  }

  const adminPassword = process.env.ADMIN_PASSWORD;
  if (!adminPassword) {
    return NextResponse.json(
      { error: "管理画面用のパスワード(ADMIN_PASSWORD)が設定されていません" },
      { status: 503 }
    );
  }

  const authHeader = request.headers.get("authorization");
  if (authHeader?.startsWith("Basic ")) {
    const decoded = atob(authHeader.slice("Basic ".length));
    const password = decoded.slice(decoded.indexOf(":") + 1);
    if (password === adminPassword) {
      return NextResponse.next();
    }
  }

  return new NextResponse("認証が必要です", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="KoeHaisha Admin"' },
  });
}

export const config = {
  matcher: ["/admin/:path*", "/api/employees", "/api/employees/:path*"],
};
