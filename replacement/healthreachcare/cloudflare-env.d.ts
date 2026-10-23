declare namespace Cloudflare {
  interface Env {
    HRC_DEMO_ENABLED?: string;
    DB?: D1Database;
    BUCKET?: R2Bucket;
  }
}
