declare namespace Cloudflare {
  interface Env {
    DB?: D1Database;
    BUCKET?: R2Bucket;
    YACK_TRUST_SITES_AUTH?: string;
  }
}
