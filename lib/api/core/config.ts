const DEFAULT_MD_API_BASE_URL = "https://api-dev2.materialdepot.in/apiV1";
const DEFAULT_KYLAS_API_BASE_URL = "https://api.kylas.io/v1";

export const MD_API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL || process.env.API_BASE_URL || DEFAULT_MD_API_BASE_URL;

export const KYLAS_API_BASE_URL =
  process.env.KYLAS_API_BASE_URL || DEFAULT_KYLAS_API_BASE_URL;
