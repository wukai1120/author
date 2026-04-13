import { NextResponse } from 'next/server';

const isCloudBaseConfigured = Boolean(
  process.env.NEXT_PUBLIC_CLOUDBASE_ENV_ID && process.env.NEXT_PUBLIC_CLOUDBASE_ACCESS_KEY
);

export function middleware(request) {
  if (!isCloudBaseConfigured) {
    return NextResponse.json(
      { error: 'CloudBase not configured' },
      { status: 503 }
    );
  }

  const isSignedIn = request.cookies.get('author-auth')?.value === '1';
  if (!isSignedIn) {
    return NextResponse.json(
      { error: 'Authentication required' },
      { status: 401 }
    );
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/api/ai/:path*', '/api/storage'],
};
