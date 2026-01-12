import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server"
import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"

// Define public routes that don't require authentication
const isPublicRoute = createRouteMatcher([
    "/",
    "/login(.*)",
    "/signup(.*)",
    "/api/(.*)",
])

export default clerkMiddleware(async (auth, request) => {
    const response = NextResponse.next()

    response.headers.set(
        "Content-Security-Policy",
        "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https: blob:; font-src 'self' data:; connect-src 'self' https:; frame-ancestors 'none';"
    )
    response.headers.set("X-Frame-Options", "DENY")
    response.headers.set("X-Content-Type-Options", "nosniff")
    response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin")
    response.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()")

    const url = request.nextUrl

    if (url.pathname.startsWith("/profile/") && url.pathname !== "/profile") {
        const profileId = url.pathname.split("/")[2]
        if (profileId && profileId.length === 36) {
            const ipAddress = request.headers.get("x-forwarded-for") || request.headers.get("x-real-ip") || "unknown"
            const rateLimitKey = `profile_view:${ipAddress}:${profileId}`
            response.headers.set("X-Rate-Limit-Key", rateLimitKey)
        }
    }

    // Protect all routes except public ones
    if (!isPublicRoute(request)) {
        await auth.protect()
    }

    return response
})

export const config = {
    matcher: [
        // Skip Next.js internals and all static files
        "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
        // Always run for API routes
        "/(api|trpc)(.*)",
    ],
}
