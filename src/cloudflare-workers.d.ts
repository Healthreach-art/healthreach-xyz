declare module "cloudflare:workers" {
  interface R2ObjectBody {
    body: ReadableStream;
    httpMetadata?: { contentType?: string };
  }

  interface R2Bucket {
    get(key: string): Promise<R2ObjectBody | null>;
    put(
      key: string,
      value: ReadableStream | ArrayBuffer | ArrayBufferView | Blob | string,
      options?: { httpMetadata?: { contentType?: string } },
    ): Promise<unknown>;
    delete(key: string): Promise<void>;
  }

  export const env: {
    DOCUMENTS_BUCKET: R2Bucket;
    R2_URL_SIGNING_SECRET?: string;
  };
}
