/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Next only rewrites our own code for the browsers in package.json's
  // browserslist; packages arrive as published. Supabase's ship syntax (?.,
  // ??) that older Android WebViews — common on cheap TVs — can't parse,
  // and one unparseable chunk leaves the player blank. Rewrite them too.
  transpilePackages: [
    "@supabase/supabase-js",
    "@supabase/auth-js",
    "@supabase/functions-js",
    "@supabase/phoenix",
    "@supabase/postgrest-js",
    "@supabase/realtime-js",
    "@supabase/storage-js",
    "iceberg-js",
  ],
};

module.exports = nextConfig;
