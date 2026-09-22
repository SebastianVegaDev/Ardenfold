import createMiddleware from "next-intl/middleware";
import {
    applyResponseHeaders,
    authkit,
    handleAuthkitProxy,
    partitionAuthkitHeaders,
} from "@workos-inc/authkit-nextjs";
import { NextRequest } from "next/server";

import { routing } from "./i18n/routing";

const internationalize = createMiddleware(routing);
const protectedPath = /^\/(?:en|es)\/app(?:\/|$)/u;

export default async function proxy(request: NextRequest) {
    const authentication = await authkit(request, { eagerAuth: true });

    if (protectedPath.test(request.nextUrl.pathname) && !authentication.session.user) {
        const locale = request.nextUrl.pathname.split("/")[1];

        return handleAuthkitProxy(request, authentication.headers, {
            redirect: `/${locale}/sign-in`,
        });
    }

    if (request.nextUrl.pathname.startsWith("/auth/")) {
        return handleAuthkitProxy(request, authentication.headers);
    }

    const { requestHeaders, responseHeaders } = partitionAuthkitHeaders(
        request,
        authentication.headers,
    );
    const localizedRequest = new NextRequest(request, { headers: requestHeaders });

    return applyResponseHeaders(internationalize(localizedRequest), responseHeaders);
}

export const config = {
    matcher: ["/", "/(en|es)/:path*", "/((?!api|_next|_vercel|.*\\..*).*)"],
};
