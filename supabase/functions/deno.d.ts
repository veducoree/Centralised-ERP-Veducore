// Ambient type declarations for Deno runtime in Supabase Edge Functions
declare const Deno: {
  env: {
    get(key: string): string | undefined;
  };
  serve(handler: (req: Request) => Promise<Response> | Response): void;
  [key: string]: any;
};

declare module 'npm:@supabase/supabase-js@*' {
  export const createClient: any;
  export type SupabaseClient = any;
  export type User = any;
  export type Session = any;
}

declare module 'npm:*' {
  export const createClient: any;
  const anyExport: any;
  export default anyExport;
}
